/**
 * Платёжный шлюз для внешних проектов: внешняя система (kazik) создаёт счёт,
 * покупатель платит на нашей стороне (Exenta Pay), результат уходит обратно
 * подписанным колбэком. Живёт рядом с внутренними платежами neuromatic и не
 * трогает таблицу `payment`.
 *
 * Конфиг проекта берётся из env по имени: `GATEWAY_PROJECTS=kazik` включает
 * проект, дальше читаются `GATEWAY_KAZIK_SECRET`, `GATEWAY_KAZIK_CALLBACK_URL`,
 * `GATEWAY_KAZIK_CALLBACK_SECRET`, `GATEWAY_KAZIK_RETURN_ORIGINS`,
 * `GATEWAY_KAZIK_DESCRIPTION`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface GatewayProject {
  id: string;
  /** Назначение платежа, которое увидит покупатель в банке. */
  description: string;
  /** Секрет подписи входящих запросов проекта. */
  secret: string;
  /** Куда шлём колбэк об оплате. */
  callbackUrl: string;
  /** Bearer-токен колбэка. */
  callbackSecret: string;
  /** Разрешённые origin'ы, куда можно вернуть покупателя. */
  returnOrigins: string[];
}

/** Допустимое расхождение времени в подписи запроса. */
const REQUEST_TTL_MS = 5 * 60 * 1000;

function envKey(projectId: string, suffix: string): string {
  return `GATEWAY_${projectId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_${suffix}`;
}

/** Проекты, включённые в этой сборке (`GATEWAY_PROJECTS=kazik,other`). */
export function listGatewayProjectIds(): string[] {
  return (process.env.GATEWAY_PROJECTS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getGatewayProject(id: string): GatewayProject | null {
  if (!id || !listGatewayProjectIds().includes(id)) return null;
  const secret = process.env[envKey(id, "SECRET")] ?? "";
  if (!secret) return null;
  return {
    id,
    description: process.env[envKey(id, "DESCRIPTION")] ?? "Пополнение баланса",
    secret,
    callbackUrl: process.env[envKey(id, "CALLBACK_URL")] ?? "",
    callbackSecret: process.env[envKey(id, "CALLBACK_SECRET")] ?? "",
    returnOrigins: (process.env[envKey(id, "RETURN_ORIGINS")] ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  };
}

/** Подпись запроса/колбэка: HMAC-SHA256 по строке `${timestamp}.${rawBody}`. */
export function signGatewayBody(
  secret: string,
  timestamp: string | number,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

/** Проверяет подпись входящего запроса от проекта (ключи: ts + тело). */
export function verifyGatewayRequest(
  project: GatewayProject,
  headers: Headers,
  rawBody: string,
): boolean {
  const timestamp = headers.get("x-gateway-timestamp") ?? "";
  const signature = (headers.get("x-gateway-signature") ?? "").trim().toLowerCase();
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REQUEST_TTL_MS) return false;

  return safeEqual(signGatewayBody(project.secret, timestamp, rawBody), signature);
}

/**
 * Токен страницы возврата: у счёта в Exenta только наш домен, а страница
 * `/pay/<id>` доступна без авторизации — токен не даёт читать статусы чужих
 * платежей по угаданному uuid. Короткий (hex, 96 бит), чтобы ссылка выглядела
 * как обычная платёжная, а не как подписанный технический редирект.
 */
const RETURN_TOKEN_LENGTH = 24;

export function returnToken(secret: string, paymentId: string): string {
  return createHmac("sha256", secret)
    .update(`return.${paymentId}`, "utf8")
    .digest("hex")
    .slice(0, RETURN_TOKEN_LENGTH);
}

/** Токен прежнего формата (64 hex): ссылки в уже выставленных счетах. */
function legacyReturnToken(secret: string, paymentId: string): string {
  return createHmac("sha256", secret)
    .update(`return.${paymentId}`, "utf8")
    .digest("hex");
}

export function verifyReturnToken(
  secret: string,
  paymentId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const provided = token.trim().toLowerCase();
  return (
    safeEqual(returnToken(secret, paymentId), provided) ||
    safeEqual(legacyReturnToken(secret, paymentId), provided)
  );
}

/**
 * Проверяет, что возвращать покупателя можно только на домен проекта.
 * Возвращает нормализованный URL или null, если origin не в allowlist.
 */
export function allowedReturnOrigin(
  project: GatewayProject,
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const origin = parsed.origin.toLowerCase();
  if (!project.returnOrigins.some((allowed) => allowed.toLowerCase() === origin)) {
    return null;
  }
  return `${parsed.origin}${parsed.pathname || "/"}`;
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
