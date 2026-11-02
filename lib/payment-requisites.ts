/**
 * Реквизиты H2H-платежа: провайдер отдаёт не ссылку на свою страницу, а то,
 * что нужно показать покупателю у нас (QR-картинку, ссылку СБП, номер карты
 * или телефона). Модуль без зависимостей от Node — его можно импортировать и
 * в клиентские компоненты.
 */

export type RequisitesKind = "image" | "link" | "text";

export interface PaymentRequisites {
  /** Метод провайдера: qr-code, sbp, card, nspk… */
  method: string;
  /**
   * image — `value` это data URL картинки (QR);
   * link — https-ссылка, которую можно открыть кнопкой;
   * text — номер карты/телефона/счёта: показываем и даём скопировать.
   */
  kind: RequisitesKind;
  value: string;
  bank?: string;
  owner?: string;
  /** Точная сумма перевода, как её назвал провайдер (может отличаться от счёта). */
  payAmount?: string;
  comment?: string;
}

const MAX_IMAGE_LENGTH = 400_000;
const MAX_TEXT_LENGTH = 300;
const IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function clean(value: unknown, max = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

/** Определяет вид реквизита; null — значение небезопасно или пустое. */
export function classifyCredentials(
  raw: string,
): { kind: RequisitesKind; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^data:/i.test(trimmed)) {
    // В <img src> пускаем только растровые картинки в base64 (без SVG и html).
    return trimmed.length <= MAX_IMAGE_LENGTH && IMAGE_RE.test(trimmed)
      ? { kind: "image", value: trimmed }
      : null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return { kind: "link", value: url.toString() };
      }
    } catch {
      return null;
    }
    return null;
  }
  const text = clean(trimmed);
  return text ? { kind: "text", value: text } : null;
}

export function buildRequisites(input: {
  method?: unknown;
  credentials: unknown;
  bank?: unknown;
  owner?: unknown;
  payAmount?: unknown;
  comment?: unknown;
}): PaymentRequisites | null {
  const credentials = clean(input.credentials, MAX_IMAGE_LENGTH);
  if (!credentials) return null;
  const classified = classifyCredentials(credentials);
  if (!classified) return null;
  const bank = clean(input.bank);
  const owner = clean(input.owner);
  const payAmount = clean(input.payAmount, 32);
  const comment = clean(input.comment);
  return {
    method: clean(input.method, 32) ?? "unknown",
    ...classified,
    ...(bank ? { bank } : {}),
    ...(owner ? { owner } : {}),
    ...(payAmount ? { payAmount } : {}),
    ...(comment ? { comment } : {}),
  };
}

export function serializeRequisites(
  requisites: PaymentRequisites | null | undefined,
): string | null {
  return requisites ? JSON.stringify(requisites) : null;
}

/** Разбор из БД; битое или чужое значение превращается в null. */
export function parseRequisites(raw: unknown): PaymentRequisites | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return buildRequisites({
      method: data.method,
      credentials: data.value,
      bank: data.bank,
      owner: data.owner,
      payAmount: data.payAmount,
      comment: data.comment,
    });
  } catch {
    return null;
  }
}
