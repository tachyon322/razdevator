"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  createPaymentProvider,
  getPaymentProviderRow,
  setPaymentProviderEnabled,
  updatePaymentProvider,
} from "@/lib/db";
import { listGatewayProjectIds } from "@/lib/gateway";
import {
  validateHttpProviderConfig,
  type HttpProviderConfig,
} from "@/lib/payment-provider";
import { listAvailableProviders } from "@/lib/payment-provider-registry";
import {
  setActiveProviderId,
  setFallbackEnabled,
  type PaymentScope,
} from "@/lib/payment-settings";
import { sealSecret } from "@/lib/provider-secrets";
import type { ProviderFormState } from "./types";

const PAYMENTS_PATH = "/adminlitgame43144/payments";

/** Пять JSON-секций формы: имя поля → ключ валидатора и конфига. */
const JSON_SECTIONS = [
  { formKey: "createJson", configKey: "create" },
  { formKey: "responseJson", configKey: "response" },
  { formKey: "statusJson", configKey: "status" },
  { formKey: "webhookJson", configKey: "webhook" },
  { formKey: "statusMapJson", configKey: "statusMap" },
] as const;

interface SealedSecrets {
  apiKey: string;
  apiSecret: string;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Число из текстового поля; пусто — undefined, чтобы сработали дефолты валидатора. */
function numeric(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  if (raw === "") return undefined;
  return Number(raw);
}

function parseSection(
  formData: FormData,
  formKey: string,
  configKey: string,
  errors: Record<string, string>,
): unknown {
  const raw = text(formData, formKey);
  if (!raw) {
    errors[configKey] = "Заполните JSON-секцию или нажмите пресет";
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    errors[configKey] = "Некорректный JSON";
    return undefined;
  }
}

/**
 * Запечатанные секреты из текущей строки БД. Расшифровка не нужна: пустое
 * поле формы означает «оставить как есть», поэтому возвращаем sealed-строки.
 */
function sealedSecrets(config: string | undefined): SealedSecrets {
  const empty: SealedSecrets = { apiKey: "", apiSecret: "" };
  if (!config) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(config);
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return empty;
  }

  const secrets = (parsed as Record<string, unknown>).secrets;
  if (secrets === null || typeof secrets !== "object" || Array.isArray(secrets)) {
    return empty;
  }
  const record = secrets as Record<string, unknown>;
  return {
    apiKey: typeof record.apiKey === "string" ? record.apiKey : "",
    apiSecret: typeof record.apiSecret === "string" ? record.apiSecret : "",
  };
}

function parseScope(raw: string): PaymentScope | null {
  if (raw === "site") return { service: "site" };
  if (!raw.startsWith("project:")) return null;
  const projectId = raw.slice("project:".length).trim();
  if (!projectId || !listGatewayProjectIds().includes(projectId)) return null;
  return { service: "project", projectId };
}

/**
 * Создание и редактирование HTTP-провайдера. Пять JSON-секций собираются в
 * единый конфиг, проверяются validateHttpProviderConfig, секреты
 * запечатываются sealSecret. Пустые apiKey/apiSecret при редактировании
 * сохраняют прежние sealed-значения из БД.
 */
export async function saveProvider(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  await requireAdmin();

  const errors: Record<string, string> = {};
  const id = text(formData, "id");
  const existing = id ? getPaymentProviderRow(id) : null;
  if (id && !existing) {
    return { errors: { _form: "Провайдер не найден. Обновите страницу." } };
  }

  const name = text(formData, "name");
  if (!name) errors.name = "Укажите название";

  const sortOrderRaw = text(formData, "sortOrder");
  const sortOrder = sortOrderRaw === "" ? 100 : Number(sortOrderRaw);
  if (!Number.isInteger(sortOrder)) errors.sortOrder = "Порядок — целое число";

  const sections: Record<string, unknown> = {};
  for (const section of JSON_SECTIONS) {
    sections[section.configKey] = parseSection(
      formData,
      section.formKey,
      section.configKey,
      errors,
    );
  }

  const apiKeyInput = text(formData, "apiKey");
  const apiSecretInput = text(formData, "apiSecret");
  const stored = sealedSecrets(existing?.config);

  const candidate = {
    version: 1,
    baseUrl: text(formData, "baseUrl"),
    currency: text(formData, "currency"),
    amountMultiplier: numeric(formData, "amountMultiplier"),
    descriptionMaxLength: numeric(formData, "descriptionMaxLength"),
    timeoutMs: numeric(formData, "timeoutMs"),
    retries: numeric(formData, "retries"),
    merchantId: text(formData, "merchantId"),
    create: sections.create,
    response: sections.response,
    status: sections.status,
    webhook: sections.webhook,
    statusMap: sections.statusMap,
    secrets: {
      apiKey: apiKeyInput || stored.apiKey,
      apiSecret: apiSecretInput || stored.apiSecret,
    },
  };

  const validated = validateHttpProviderConfig(candidate);
  if ("errors" in validated) {
    // Свои ошибки (JSON/название/порядок) важнее общих сообщений валидатора.
    return { errors: { ...validated.errors, ...errors } };
  }
  if (Object.keys(errors).length > 0) return { errors };

  let sealedApiKey: string;
  let sealedApiSecret: string;
  try {
    sealedApiKey = apiKeyInput ? sealSecret(apiKeyInput) : stored.apiKey;
    sealedApiSecret = apiSecretInput ? sealSecret(apiSecretInput) : stored.apiSecret;
  } catch {
    return {
      errors: {
        _form: "Не удалось зашифровать секреты. Проверьте PAYMENTS_CONFIG_KEY в env (32 байта: hex или base64).",
      },
    };
  }

  const config: HttpProviderConfig = {
    ...validated.config,
    // Запечатанные значения уже не секреты в открытом виде, поэтому их можно
    // класть в JSON как есть — расшифрует только parseStoredConfig.
    secrets: { apiKey: sealedApiKey, apiSecret: sealedApiSecret },
  };

  const payload = {
    name,
    config: JSON.stringify(config),
    enabled: formData.get("enabled") === "1",
    sortOrder,
  };

  if (existing) {
    updatePaymentProvider(existing.id, payload);
  } else {
    createPaymentProvider(payload);
  }

  revalidatePath(PAYMENTS_PATH);
  redirect(PAYMENTS_PATH);
}

/** Выбор активного провайдера для сайта или проекта; пустая строка — сброс. */
export async function setActiveProvider(formData: FormData): Promise<void> {
  await requireAdmin();

  const scope = parseScope(text(formData, "scope"));
  if (!scope) {
    revalidatePath(PAYMENTS_PATH);
    redirect(PAYMENTS_PATH);
  }

  const providerId = text(formData, "providerId");
  if (
    providerId &&
    !listAvailableProviders().some((provider) => provider.id === providerId)
  ) {
    // Выключенный или сломанный провайдер активным не станет; молча
    // возвращаемся на страницу, где видно предупреждение.
    revalidatePath(PAYMENTS_PATH);
    redirect(PAYMENTS_PATH);
  }

  setActiveProviderId(scope, providerId || null);
  revalidatePath(PAYMENTS_PATH);
  redirect(PAYMENTS_PATH);
}

/** Тумблер резервной цепочки: "1" — пробовать следующих, "0" — только активный. */
export async function updateFallback(formData: FormData): Promise<void> {
  await requireAdmin();
  setFallbackEnabled(text(formData, "value") === "1");
  revalidatePath(PAYMENTS_PATH);
}

/** Включение/выключение провайдера. Exenta живёт в env — её не трогаем. */
export async function toggleProvider(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = text(formData, "id");
  const row = id ? getPaymentProviderRow(id) : null;
  if (!row) return;

  setPaymentProviderEnabled(row.id, text(formData, "enabled") === "1");
  revalidatePath(PAYMENTS_PATH);
}
