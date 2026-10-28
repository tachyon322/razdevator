/**
 * Серверные помощники формы провайдера: превращают строку `payment_provider`
 * в значения полей. Секреты в клиент не отдаются — только маски
 * (`pk_ab…cd`), поэтому модуль нельзя импортировать из клиентских компонентов:
 * он читает provider-secrets с node:crypto.
 */

import type { PaymentProviderRow } from "@/lib/db";
import { maskSecret, openSecret } from "@/lib/provider-secrets";
import type { ProviderFormValues, SecretMasks } from "./types";

/** Черновик нового провайдера: разумные значения по умолчанию. */
export const NEW_PROVIDER_VALUES: ProviderFormValues = {
  name: "",
  sortOrder: "100",
  baseUrl: "",
  currency: "RUB",
  amountMultiplier: "100",
  descriptionMaxLength: "255",
  timeoutMs: "10000",
  retries: "2",
  merchantId: "",
  createJson: "",
  responseJson: "",
  statusJson: "",
  webhookJson: "",
  statusMapJson: "",
};

export interface StoredProviderForm {
  values: ProviderFormValues;
  enabled: boolean;
  masks: SecretMasks;
}

function pretty(value: unknown): string {
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2) ?? "";
}

function numberString(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Маска секрета: значение расшифровываем только на сервере и сразу сокращаем. */
function maskOf(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return maskSecret(openSecret(value));
  } catch {
    // Ключ шифрования недоступен или значение повреждено — говорим только,
    // что секрет задан.
    return "задан";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Значения формы для существующей строки. Берём только простые поля и
 * JSON-секции; `secrets` из конфига никогда не попадают в значения — вместо
 * них возвращаются маски.
 */
export function storedProviderForm(row: PaymentProviderRow): StoredProviderForm {
  let config: Record<string, unknown> = {};
  try {
    config = record(JSON.parse(row.config) as unknown);
  } catch {
    // Битая строка: останутся значения по умолчанию, админ заполнит заново.
  }
  const secrets = record(config.secrets);

  return {
    values: {
      name: row.name,
      sortOrder: String(row.sortOrder),
      baseUrl: stringValue(config.baseUrl),
      currency: stringValue(config.currency, "RUB"),
      amountMultiplier: numberString(config.amountMultiplier, "100"),
      descriptionMaxLength: numberString(config.descriptionMaxLength, "255"),
      timeoutMs: numberString(config.timeoutMs, "10000"),
      retries: numberString(config.retries, "2"),
      merchantId: stringValue(config.merchantId),
      createJson: pretty(config.create),
      responseJson: pretty(config.response),
      statusJson: pretty(config.status),
      webhookJson: pretty(config.webhook),
      statusMapJson: pretty(config.statusMap),
    },
    enabled: row.enabled === 1,
    masks: {
      apiKey: maskOf(secrets.apiKey),
      apiSecret: maskOf(secrets.apiSecret),
    },
  };
}
