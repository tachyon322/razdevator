/**
 * Очередь колбэков внешним проектам: успех оплаты не должен потеряться, если
 * проект недоступен. Устроена как `cashx_outbox` — колбэк пишется в БД в
 * момент смены статуса, воркер доставляет с повторами. URL и секрет проекта
 * читаются из env в момент отправки, поэтому секреты не лежат в базе.
 */
import {
  listDueGatewayCallbacks,
  markGatewayCallbackFailed,
  markGatewayCallbackSent,
  type GatewayOutboxRow,
} from "./db";
import { getGatewayProject, listGatewayProjectIds } from "./gateway";

const MAX_ATTEMPTS = 12;
const BATCH = 20;
const TICK_MS = 15_000;
const CALLBACK_TIMEOUT_MS = 15_000;

/** Экспоненциальный backoff: 30с, 1м, 2м … до 1 часа. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 3_600_000);
}

/** Включён ли шлюз: без проектов в GATEWAY_PROJECTS воркер не нужен. */
export function gatewayEnabled(): boolean {
  return listGatewayProjectIds().length > 0;
}

/** POST колбэка проекта: тело — статус платежа в терминах проекта (kazik). */
async function sendGatewayCallback(row: GatewayOutboxRow): Promise<void> {
  const project = getGatewayProject(row.projectId);
  if (!project) throw new Error(`Проект ${row.projectId} не настроен`);
  if (!project.callbackUrl) {
    throw new Error(`Не задан GATEWAY_*_CALLBACK_URL для проекта ${row.projectId}`);
  }

  let res: Response;
  try {
    res = await fetch(project.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${project.callbackSecret}`,
      },
      body: row.payload,
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `колбэк ${row.eventId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `колбэк ${row.eventId}: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
}

/**
 * Один проход по очереди. При ошибке доставки останавливаемся, чтобы не
 * нарушить порядок (сначала несостоявшийся, потом остальные).
 */
export async function processGatewayOutbox(
  send: (row: GatewayOutboxRow) => Promise<void> = sendGatewayCallback,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of listDueGatewayCallbacks(BATCH)) {
    try {
      await send(row);
      markGatewayCallbackSent(row.id);
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);
      markGatewayCallbackFailed(
        row.id,
        message,
        new Date(Date.now() + backoffMs(attempts)),
        dead,
      );
      if (dead) {
        console.error(
          `[gateway] ${row.eventId} не доставлено за ${MAX_ATTEMPTS} попыток, статус dead: ${message}`,
        );
      } else {
        console.warn(`[gateway] ${row.eventId} отложено: ${message}`);
      }
      failed++;
      break;
    }
  }
  return { sent, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startGatewayWorker(): void {
  if (timer || !gatewayEnabled()) return;
  let running = false;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    processGatewayOutbox()
      .catch((error) => console.error("[gateway] воркер:", error))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  timer.unref?.();
  console.info("[gateway] воркер очереди колбэков запущен");
}
