/**
 * Секреты HTTP-провайдеров хранятся в БД вместе с остальным конфигом.
 * При заданном `PAYMENTS_CONFIG_KEY` (32 байта: hex 64 символа или base64)
 * значение шифруется AES-256-GCM; без ключа — лежит как `plain:` с
 * предупреждением в лог. В интерфейс секреты не отдаются — только маска.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENC_PREFIX = "enc:v1:";
const PLAIN_PREFIX = "plain:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let warnedPlain = false;

/** Ключ шифрования из env; null — шифрование выключено. */
function configKey(): Buffer | null {
  const raw = process.env.PAYMENTS_CONFIG_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PAYMENTS_CONFIG_KEY должен быть 32 байта: 64 hex-символа или base64",
    );
  }
  return key;
}

export function hasConfigKey(): boolean {
  return configKey() !== null;
}

/** Шифрует секрет для хранения в `payment_provider.config`. */
export function sealSecret(value: string): string {
  if (!value) return "";
  const key = configKey();
  if (!key) {
    if (!warnedPlain) {
      warnedPlain = true;
      console.warn(
        "[payments] PAYMENTS_CONFIG_KEY не задан — секреты провайдеров хранятся в БД без шифрования",
      );
    }
    return `${PLAIN_PREFIX}${value}`;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

/** Расшифровывает секрет; понимает старый формат без префикса. */
export function openSecret(value: string): string {
  if (!value) return "";
  if (value.startsWith(PLAIN_PREFIX)) return value.slice(PLAIN_PREFIX.length);
  if (!value.startsWith(ENC_PREFIX)) return value;

  const key = configKey();
  if (!key) {
    throw new Error(
      "PAYMENTS_CONFIG_KEY не задан — не удаётся расшифровать секрет провайдера",
    );
  }

  const raw = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Повреждённый секрет провайдера");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Маска для админки: `pk_ab…cd`. Полное значение не покидает сервер. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
