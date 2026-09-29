/**
 * Интеграция с партнёркой Cashx: события уходят через очередь `cashx_outbox`
 * (SQLite), а не «выстрелил и забыл» — недоступность Cashx не теряет комиссию.
 * Порядок: событие пишется в БД (для платежа — в той же транзакции, что и
 * зачисление), воркер доставляет с повторами; Cashx дедуплицирует по event_id.
 */
import {
  createCashxClient,
  type CashxClient,
  type EventInput,
  type EventKind,
} from "@cashx/sdk";
import {
  enqueueCashxEvent,
  listDueCashxEvents,
  markCashxEventFailed,
  markCashxEventSent,
  type Payment,
} from "./db";

const MAX_ATTEMPTS = 12;
const BATCH = 20;
const TICK_MS = 15_000;

export function cashxEnabled(): boolean {
  const sync = process.env.CASHX_SYNC;
  return (
    (sync === "true" || sync === "1") &&
    !!process.env.CASHX_KEY_ID &&
    !!process.env.CASHX_SECRET
  );
}

let client: CashxClient | null = null;

/** Повторы делает outbox, поэтому транспортных ретраев в клиенте нет. */
export function getCashxClient(): CashxClient {
  client ??= createCashxClient({
    baseUrl: process.env.CASHX_BASE_URL ?? "https://cashxpay.cc",
    keyId: process.env.CASHX_KEY_ID ?? "",
    secret: process.env.CASHX_SECRET ?? "",
    prefix: process.env.CASHX_PREFIX ?? "razdevator",
    enabled: cashxEnabled(),
    retryDelaysMs: [],
  });
  return client;
}

/** Регистрация игрока: без ref и click_token события нет. Ошибки не всплывают. */
export function enqueueAttribution(
  userId: string,
  ref?: string | null,
  clickToken?: string | null,
): void {
  if (!cashxEnabled()) return;
  try {
    const event = getCashxClient().events.attribution(
      userId,
      ref ?? undefined,
      clickToken ?? undefined,
    );
    if (event) enqueueCashxEvent(event.event_id, event);
  } catch (error) {
    console.error("[cashx] не удалось поставить регистрацию в очередь:", error);
  }
}

/**
 * Подтверждённая оплата. Вызывается внутри транзакции creditPayment, поэтому
 * исключение здесь откатило бы зачисление — ошибки глотаем.
 * Комиссия считается с оплаченной суммы, а не с бонусного `creditRub`.
 */
export function enqueueRevenue(payment: Payment, kind: EventKind = "deposit"): void {
  if (!cashxEnabled()) return;
  try {
    const event = getCashxClient().events.commission(
      payment.userId,
      payment.id,
      payment.amountRub * 100,
      new Date(),
      kind,
    );
    enqueueCashxEvent(event.event_id, event);
  } catch (error) {
    console.error("[cashx] не удалось поставить оплату в очередь:", error);
  }
}

/** Экспоненциальный backoff: 30с, 1м, 2м … до 1 часа. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 3_600_000);
}

/**
 * Один проход по очереди. При недоступности Cashx останавливаемся, чтобы не
 * нарушить порядок (регистрация раньше платежа).
 */
export async function processCashxOutbox(
  send: (event: EventInput) => Promise<{ status: string; reason?: string }> = (
    event,
  ) => getCashxClient().sendEvent(event),
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of listDueCashxEvents(BATCH)) {
    try {
      const result = await send(JSON.parse(row.payload) as EventInput);
      if (result.status === "ignored" && result.reason) {
        // Cashx обработал и отклонил (нет attribution, неизвестный код…): ретрай бессмыслен.
        console.warn(`[cashx] ${row.eventId} проигнорировано: ${result.reason}`);
      }
      markCashxEventSent(row.id);
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      markCashxEventFailed(
        row.id,
        error instanceof Error ? error.message : String(error),
        new Date(Date.now() + backoffMs(attempts)),
        dead,
      );
      if (dead) console.error(`[cashx] ${row.eventId} не доставлено, статус dead`);
      failed++;
      break;
    }
  }
  return { sent, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startCashxWorker(): void {
  if (timer || !cashxEnabled()) return;
  let running = false;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    processCashxOutbox()
      .catch((error) => console.error("[cashx] воркер:", error))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  timer.unref?.();
  console.info("[cashx] воркер очереди запущен");
}
