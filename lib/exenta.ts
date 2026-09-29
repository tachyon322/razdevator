/**
 * Клиент Exenta Pay (H2H API v1): создание счёта, статус и проверка вебхука.
 *
 * Ключи — только на сервере: PAYMENTS_PUBLIC_KEY (pk_…), PAYMENTS_SECRET_KEY
 * (sk_…), PAYMENTS_WEBHOOK_SECRET (HMAC-подпись вебхуков).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentStatus } from "./db";

export class ExentaError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ExentaError";
    this.status = status;
  }
}

export interface ProviderPayment {
  uuid: string;
  /** Сумма в копейках (строка). */
  amount?: string;
  status: PaymentStatus;
  redirectUrl?: string;
}

const STATUSES: readonly PaymentStatus[] = [
  "CREATED",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
];

const TIMEOUT_MS = 15_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

/** База API без завершающего слэша. */
export function exentaBaseUrl(): string {
  return (process.env.PAYMENTS_BASE_URL ?? "https://exenta.pro/api/v1").replace(
    /\/+$/,
    "",
  );
}

/** Рубли → копейки строкой, как ждёт API: 1000 → "100000". */
export function rubToKopecks(rub: number): string {
  return String(Math.round(rub * 100));
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return STATUSES.includes(value as PaymentStatus);
}

function parsePayment(body: unknown): ProviderPayment {
  const data = body as Record<string, unknown> | null;
  const uuid = data?.uuid ?? data?.paymentUuid;
  if (typeof uuid !== "string" || !isPaymentStatus(data?.status)) {
    throw new ExentaError("Exenta вернула неожиданный ответ");
  }
  return {
    uuid,
    status: data.status,
    amount: typeof data.amount === "string" ? data.amount : undefined,
    redirectUrl:
      typeof data.redirectUrl === "string" ? data.redirectUrl : undefined,
  };
}

async function request(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ProviderPayment> {
  let res: Response;
  try {
    res = await fetch(`${exentaBaseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": requireEnv("PAYMENTS_PUBLIC_KEY"),
        "X-Api-Secret": requireEnv("PAYMENTS_SECRET_KEY"),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new ExentaError(
      `Exenta недоступна: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ExentaError(
      `Exenta ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`,
      res.status >= 500 ? 502 : res.status,
    );
  }
  try {
    return parsePayment(JSON.parse(text));
  } catch (error) {
    if (error instanceof ExentaError) throw error;
    throw new ExentaError("Exenta вернула не JSON");
  }
}

export interface CreateInvoiceInput {
  amountRub: number;
  description: string;
  buyerIp?: string | null;
  successUrl: string;
  failedUrl: string;
}

/** Создаёт счёт; покупателя нужно отправить на `redirectUrl`. */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<ProviderPayment & { redirectUrl: string }> {
  const payment = await request("POST", "/payments/h2h", {
    currencyCode: "RUB",
    amount: rubToKopecks(input.amountRub),
    description: input.description,
    ...(input.buyerIp ? { buyerIp: input.buyerIp } : {}),
    successUrl: input.successUrl,
    failedUrl: input.failedUrl,
  });
  if (!payment.redirectUrl) {
    throw new ExentaError("Exenta не вернула ссылку на оплату");
  }
  return { ...payment, redirectUrl: payment.redirectUrl };
}

/**
 * Актуальный статус счёта: просим провайдера обновить его (sync), а если
 * sync недоступен — читаем текущий.
 */
export async function fetchPaymentStatus(
  uuid: string,
): Promise<ProviderPayment> {
  const path = `/payments/${encodeURIComponent(uuid)}`;
  try {
    return await request("POST", `${path}/sync`);
  } catch (error) {
    console.warn("[exenta] sync не удался, читаю статус:", error);
    return request("GET", path);
  }
}

/**
 * Проверяет HMAC-SHA256 подпись вебхука по сырому телу. Формат подписи в
 * документации не уточнён, поэтому принимаем hex (в т.ч. с префиксом
 * `sha256=`) и base64.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const provided = signature.trim().replace(/^sha256=/i, "");
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();

  for (const encoding of ["hex", "base64"] as const) {
    const expected = Buffer.from(digest.toString(encoding), "utf8");
    const actual = Buffer.from(
      encoding === "hex" ? provided.toLowerCase() : provided,
      "utf8",
    );
    if (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    ) {
      return true;
    }
  }
  return false;
}
