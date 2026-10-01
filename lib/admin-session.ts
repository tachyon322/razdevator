/**
 * Вход в админку по паролю из `ADMIN_PASSWORD`.
 *
 * После верного пароля сервер выдаёт cookie `<exp>.<hmac>`. Ключ подписи
 * выводится из `BETTER_AUTH_SECRET` и самого пароля, поэтому смена
 * `ADMIN_PASSWORD` сразу аннулирует все выданные cookie. Сам пароль в браузере
 * не хранится.
 *
 * Модуль без зависимостей от Next — его подключают тесты.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

/** Пароль админки; `null` — админка выключена. */
export function adminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Сравнение за постоянное время: хеши одной длины, длина пароля не утекает. */
export function checkAdminPassword(input: string): boolean {
  const password = adminPassword();
  if (!password) return false;
  return timingSafeEqual(sha256(input), sha256(password));
}

function signingKey(password: string): Buffer {
  return sha256(`${process.env.BETTER_AUTH_SECRET ?? ""}\0admin\0${password}`);
}

function sign(payload: string, password: string): string {
  return createHmac("sha256", signingKey(password)).update(payload).digest("base64url");
}

export function createAdminToken(now = Date.now()): string {
  const password = adminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD не задан");
  const exp = String(Math.floor(now / 1000) + ADMIN_SESSION_TTL_SEC);
  return `${exp}.${sign(exp, password)}`;
}

export function verifyAdminToken(token: string | undefined, now = Date.now()): boolean {
  const password = adminPassword();
  if (!password || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 <= now) return false;
  const expected = Buffer.from(sign(exp, password));
  const actual = Buffer.from(token.slice(dot + 1));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Защита от перебора: 5 неверных попыток с IP → пауза 15 минут ---

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
/** Потолок записей, чтобы поток запросов с разных IP не раздувал память. */
const MAX_TRACKED_IPS = 10_000;

const failures = new Map<string, { count: number; resetAt: number }>();

function liveEntry(ip: string, now: number) {
  const entry = failures.get(ip);
  if (entry && entry.resetAt <= now) {
    failures.delete(ip);
    return undefined;
  }
  return entry;
}

/** Сколько миллисекунд ещё ждать; 0 — можно пробовать. */
export function loginBlockedFor(ip: string, now = Date.now()): number {
  const entry = liveEntry(ip, now);
  return entry && entry.count >= MAX_LOGIN_FAILURES ? entry.resetAt - now : 0;
}

export function registerLoginFailure(ip: string, now = Date.now()): void {
  const entry = liveEntry(ip, now);
  if (entry) {
    entry.count += 1;
    return;
  }
  if (failures.size >= MAX_TRACKED_IPS) {
    for (const [key, value] of failures) {
      if (value.resetAt <= now) failures.delete(key);
    }
    if (failures.size >= MAX_TRACKED_IPS) {
      const oldest = failures.keys().next().value;
      if (oldest !== undefined) failures.delete(oldest);
    }
  }
  failures.set(ip, { count: 1, resetAt: now + LOGIN_BLOCK_MS });
}

export function resetLoginFailures(ip: string): void {
  failures.delete(ip);
}
