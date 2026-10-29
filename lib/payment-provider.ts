/**
 * Платёжный провайдер: встроенный Exenta и универсальный HTTP-шаблон из админки.
 *
 * Универсальный провайдер описывается JSON-конфигом: куда и с какими
 * заголовками/телом слать создание счёта, как разобрать ответ, как проверить
 * и разобрать вебхук, как смапить статусы. Метод оплаты у всех один — NSPK
 * (СБП), в шаблоне доступна подстановка `{{paymentMethod}}` = "sbp".
 *
 * Модуль серверный: секреты и готовый конфиг не должны попадать в клиент.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentStatus } from "./db";
import { openSecret } from "./provider-secrets";
import {
  createInvoice as createExentaInvoice,
  fetchPaymentStatus as fetchExentaStatus,
  isPaymentStatus,
  unwrapData,
  verifyWebhookSignature,
  type ExentaDeps,
} from "./exenta";

/** Код NSPK/СБП в API Cashera. */
export const NSPK_PAYMENT_METHOD = "sbp";

export type ProviderMappedStatus = PaymentStatus | "IGNORE";

export interface HttpProviderConfig {
  version: 1;
  baseUrl: string;
  currency: string;
  amountMultiplier: number;
  descriptionMaxLength: number;
  timeoutMs: number;
  /** Сколько раз повторять сетевой запрос/5xx (0 — без повторов). */
  retries: number;
  /** UUID мерчанта/магазина; подставляется как {{merchantId}}. */
  merchantId: string;
  create: RequestTemplate;
  signing?: {
    /** sha256(JSON с отсортированными ключами верхнего уровня + секрет). */
    type: "sha256-sorted-body";
    secret: "apiKey" | "apiSecret";
    header: string;
  };
  response: {
    uuid: string[];
    redirectUrl: string[];
    status?: string[];
  };
  status: RequestTemplate & {
    uuid: string[];
    status: string[];
    amount?: string[];
    currency?: string[];
    fallback?: { method: "POST" | "GET"; path: string };
  };
  webhook: {
    verify:
      | {
          /**
           * Без проверки подписи (провайдер не выдаёт секрет вебхука).
           * Разрешён только вместе с `trustBody: false`: статус и сумму
           * перечитываем из API провайдера, поэтому подделка запроса не
           * может зачислить платёж.
           */
          type: "none";
        }
      | { type: "headers"; headers: { header: string; secret: "apiKey" | "apiSecret" }[] }
      | {
          type: "hmac-sha256";
          header: string;
          secret: "apiKey" | "apiSecret";
          encodings?: ("hex" | "base64")[];
          prefix?: string;
        }
      | {
          type: "sha256-sorted-body";
          /** Путь к подписи в теле (например, `signature`). */
          signaturePath: string;
          secret: "apiKey" | "apiSecret";
        }
      | {
          /**
           * HMAC-SHA256 по строке из значений тела: поля сортируются по
           * ключам, значения склеиваются без разделителей (ParityPay).
           */
          type: "hmac-sha256-sorted-values";
          header: string;
          secret: "apiKey" | "apiSecret";
          encodings?: ("hex" | "base64")[];
          prefix?: string;
        };
    uuid: string[];
    status: string[];
    amount?: string[];
    currency?: string[];
    eventId: string[];
    /** Путь к типу события (например, `event`); нужен для `events`. */
    eventPath?: string;
    /** Обрабатываем только эти события; остальные (webhook.test, выплаты) — 2xx. */
    events?: string[];
    /** Проверять shop_id/merchant id из тела; сравнение с config.merchantId. */
    merchantIdPath?: string;
    trustBody?: boolean;
  };
  statusMap: Record<string, ProviderMappedStatus>;
  secrets: { apiKey: string; apiSecret: string };
}

export interface RequestTemplate {
  method: "POST" | "GET";
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  bodyType?: "json" | "form";
}

export interface ResolvedProvider {
  id: string;
  name: string;
  kind: "exenta" | "http";
  source: "env" | "db";
  enabled: boolean;
  configured: boolean;
  sortOrder: number;
  config: HttpProviderConfig | null;
}

/** То, что можно отдавать в админку: без секретов и конфига. */
export type ProviderInfo = Omit<ResolvedProvider, "config">;

export interface ProviderInvoiceInput {
  amountRub: number;
  description: string;
  externalId: string;
  callbackUrl: string;
  successUrl: string;
  failUrl: string;
  buyerIp?: string | null;
  paymentMethod?: string;
}

export interface CreatedProviderInvoice {
  providerId: string;
  providerUuid: string;
  redirectUrl: string;
  status: PaymentStatus;
  rawStatus: string;
  amount?: string;
  currency?: string;
}

export interface ProviderStatusResult {
  providerUuid: string;
  status: PaymentStatus;
  rawStatus: string;
  amount?: string;
  currency?: string;
}

export interface ParsedWebhook {
  eventId: string;
  providerUuid: string;
  rawStatus: string;
  status: ProviderMappedStatus;
  amount?: string;
  currency?: string;
  payload: string;
}

export interface ProviderDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProviderAdapter {
  providerId: string;
  /** Доверять статусу из тела вебхука (true) или перечитывать из API (false). */
  trustBody: boolean;
  createInvoice(input: ProviderInvoiceInput): Promise<CreatedProviderInvoice>;
  fetchStatus(uuid: string): Promise<ProviderStatusResult>;
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  /** true — событие не про платёж (webhook.test, выплаты): ответить 2xx и не разбирать. */
  isIgnorableWebhook(rawBody: string): boolean;
  parseWebhook(rawBody: string): ParsedWebhook;
}

export class ProviderRequestError extends Error {
  readonly providerId: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    providerId: string,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.providerId = providerId;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export class ProviderWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderWebhookError";
  }
}

// --- Утилиты разбора ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Достаёт значение по пути `a.b.c` (числовые сегменты — индексы массивов). */
export function getJsonPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Первый непустой путь из списка. */
function firstPath(root: unknown, paths: string[] | undefined): unknown {
  if (!paths) return undefined;
  for (const path of paths) {
    const value = getJsonPath(root, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Приводит ссылку на оплату к абсолютному URL. Провайдеры иногда отдают
 * `pay.example.com/abc` без схемы (так в примере Cashera) или путь от своего
 * origin — иначе браузер увёл бы покупателя на наш домен.
 */
export function normalizeRedirectUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return trimmed;
    }
  }
  // Хост без схемы: pay.example.com/path
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// --- Подстановки в шаблон ---

type TemplateValues = Record<string, string | number | undefined>;
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const EXACT_PLACEHOLDER_RE = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/;

const KNOWN_PLACEHOLDERS = new Set([
  "apiKey",
  "apiSecret",
  "basicAuth",
  "amount",
  "amountRub",
  "currency",
  "paymentMethod",
  "externalId",
  "description",
  "callbackUrl",
  "successUrl",
  "failUrl",
  "buyerIp",
  "merchantId",
  "uuid",
]);

function collectPlaceholders(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(PLACEHOLDER_RE)) out.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, out);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) collectPlaceholders(item, out);
  }
  return out;
}

function interpolateString(value: string, values: TemplateValues): string {
  return value.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const replacement = values[key];
    return replacement === undefined ? "" : String(replacement);
  });
}

function interpolateValue(value: unknown, values: TemplateValues): unknown {
  if (typeof value === "string") {
    const exact = EXACT_PLACEHOLDER_RE.exec(value);
    if (exact) return values[exact[1]];
    return interpolateString(value, values);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => interpolateValue(item, values))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = interpolateValue(item, values);
      if (next !== undefined) result[key] = next;
    }
    return result;
  }
  return value;
}

function buildValues(
  config: HttpProviderConfig,
  input: ProviderInvoiceInput,
  uuid = "",
): TemplateValues {
  return {
    apiKey: config.secrets.apiKey,
    apiSecret: config.secrets.apiSecret,
    basicAuth: Buffer.from(
      `${config.secrets.apiKey}:${config.secrets.apiSecret}`,
    ).toString("base64"),
    amount: Math.round(input.amountRub * config.amountMultiplier),
    // Сумма в рублях с копейками — для API, которые принимают decimal
    // (ParityPay: amount = 1500.5). Округляем до двух знаков, чтобы в JSON
    // не попали хвосты float.
    amountRub: Math.round(input.amountRub * 100) / 100,
    currency: config.currency,
    paymentMethod: input.paymentMethod ?? NSPK_PAYMENT_METHOD,
    externalId: input.externalId,
    description: truncate(input.description, config.descriptionMaxLength),
    callbackUrl: input.callbackUrl,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    buyerIp: input.buyerIp ?? undefined,
    merchantId: config.merchantId,
    uuid,
  };
}

// --- Подпись JSON-тела (Monee и аналоги) ---

/** JSON с отсортированными ключами верхнего уровня — как ждёт подпись. */
function sortedTopLevelJson(value: unknown): string {
  if (!isRecord(value)) return JSON.stringify(value);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Сумма из ответа провайдера → копейки. `amountMultiplier` переводит рубли
 * в единицы провайдера при создании счёта; здесь делим обратно, чтобы
 * сравнивать всё в копейках. У Cashera/Monee суммы уже в копейках
 * (multiplier=100), у ParityPay — decimal-рубли (multiplier=1).
 */
function providerAmountToKopecks(raw: unknown, multiplier: number): string | undefined {
  const value = asString(raw);
  if (value === undefined) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return String(Math.round((numeric * 100) / multiplier));
}

/**
 * Строка для подписи ParityPay: значения полей тела в порядке сортировки
 * ключей, без разделителей. `null` превращается в пустую строку — так это
 * делает PHP-реализация провайдера.
 */
function sortedValuesPayload(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return Object.keys(body)
    .sort()
    .map((key) => signatureValue(body[key]))
    .join("");
}

function signatureValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

/** Копия JSON-объекта без поля по пути (для проверки подписи вебхука). */
function omitJsonPath(value: unknown, path: string): unknown {
  const parts = path.split(".");
  if (parts.length === 1) {
    if (!isRecord(value)) return value;
    const copy = { ...value };
    delete copy[parts[0]];
    return copy;
  }
  if (!isRecord(value)) return value;
  const [head, ...rest] = parts;
  return { ...value, [head]: omitJsonPath(value[head], rest.join(".")) };
}

// --- HTTP ---

interface BuiltRequest {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: string;
}

function flattenForm(value: unknown, prefix = "", out = new URLSearchParams()): URLSearchParams {
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      flattenForm(item, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) flattenForm(item, prefix, out);
  } else if (value !== undefined && value !== null) {
    out.append(prefix, String(value));
  }
  return out;
}

function buildRequest(
  config: HttpProviderConfig,
  template: RequestTemplate,
  values: TemplateValues,
): BuiltRequest {
  const rawPath = interpolateString(template.path, values);
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const url = new URL(`${config.baseUrl}${path}`).toString();

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(template.headers)) {
    headers[key] = interpolateString(value, values);
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "accept")) {
    headers.Accept = "application/json";
  }

  let body: string | undefined;
  if (template.body !== undefined && template.body !== null) {
    const interpolated = interpolateValue(template.body, values);
    if (template.bodyType === "form") {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      body = flattenForm(interpolated).toString();
    } else {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      if (config.signing?.type === "sha256-sorted-body") {
        // Подписываем ровно ту строку, которую отправляем: ключи верхнего
        // уровня отсортированы, без пробелов, слэши не экранируются.
        const canonical = sortedTopLevelJson(interpolated);
        body = canonical;
        headers[config.signing.header] = sha256Hex(
          canonical + config.secrets[config.signing.secret],
        );
      } else {
        body = JSON.stringify(interpolated);
      }
    }
  }

  return { url, method: template.method, headers, body };
}

function redactSecrets(text: string, config: HttpProviderConfig): string {
  let result = text;
  for (const secret of [config.secrets.apiKey, config.secrets.apiSecret]) {
    if (secret) result = result.split(secret).join("***");
  }
  return result.slice(0, 400);
}

async function readLimited(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 64_000 ? text.slice(0, 64_000) : text;
}

async function requestJson(
  provider: ResolvedProvider,
  request: BuiltRequest,
  config: HttpProviderConfig,
  deps: ProviderDeps,
  attempts = 3,
): Promise<unknown> {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(config.timeoutMs),
        cache: "no-store",
        redirect: "manual",
      });
      const text = await readLimited(response);

      if (response.status >= 300 && response.status < 400) {
        throw new ProviderRequestError(
          provider.id,
          `провайдер ответил редиректом ${response.status}`,
          { status: response.status, retryable: false },
        );
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new ProviderRequestError(
          provider.id,
          `HTTP ${response.status}: ${redactSecrets(text, config)}`,
          { status: response.status, retryable },
        );
        if (retryable && attempt < attempts - 1) {
          lastError = error;
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw error;
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new ProviderRequestError(
          provider.id,
          "провайдер вернул не JSON",
          { retryable: false },
        );
      }
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.retryable && attempt < attempts - 1) {
          lastError = error;
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw error;
      }
      const wrapped = new ProviderRequestError(
        provider.id,
        `сеть/таймаут: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
      if (attempt < attempts - 1) {
        lastError = wrapped;
        await sleep(300 * 2 ** attempt);
        continue;
      }
      throw wrapped;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ProviderRequestError(provider.id, "не удалось выполнить запрос");
}

// --- Валидация конфига ---

function validateHeaders(
  raw: unknown,
  field: string,
  errors: Record<string, string>,
): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) {
    errors[field] = "headers — объект";
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      errors[field] = "Все значения headers — строки";
      return undefined;
    }
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
      errors[field] = "headers не должны содержать переводы строк";
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

function validatePaths(
  raw: unknown,
  field: string,
  errors: Record<string, string>,
  required = true,
): string[] | undefined {
  if (raw === undefined || raw === null) {
    if (required) errors[field] = "Укажите хотя бы один путь";
    return undefined;
  }
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    errors[field] = "Ожидается непустой массив строковых путей";
    return undefined;
  }
  return raw.map((item) => (item as string).trim());
}

function validatePlaceholders(
  value: unknown,
  field: string,
  errors: Record<string, string>,
  options: { allowUuid: boolean; requireAny?: boolean },
): void {
  const placeholders = collectPlaceholders(value);
  for (const name of placeholders) {
    if (!KNOWN_PLACEHOLDERS.has(name)) {
      errors[field] = `Неизвестная подстановка {{${name}}}`;
    }
    if (!options.allowUuid && name === "uuid") {
      errors[field] = "{{uuid}} доступен только в status-запросе";
    }
  }
  if (options.requireAny && placeholders.size === 0) {
    errors[field] = "path должен содержать {{uuid}} или {{externalId}}";
  }
}

function validateRequestTemplate(
  raw: unknown,
  field: string,
  errors: Record<string, string>,
  options: { allowUuid: boolean; requirePlaceholder?: boolean },
): RequestTemplate | undefined {
  if (!isRecord(raw)) {
    errors[field] = "Ожидается объект запроса";
    return undefined;
  }
  const method = raw.method;
  if (method !== "POST" && method !== "GET") {
    errors[`${field}.method`] = "method — POST или GET";
  }
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  if (!path.startsWith("/") || path.includes("://") || path.includes("..")) {
    errors[`${field}.path`] = "path должен начинаться с / и не содержать ..";
  }
  validatePlaceholders(path, `${field}.path`, errors, {
    allowUuid: options.allowUuid,
  });

  const headers = validateHeaders(raw.headers, `${field}.headers`, errors);
  if (headers) {
    validatePlaceholders(headers, `${field}.headers`, errors, {
      allowUuid: options.allowUuid,
    });
  }

  let body: unknown;
  if (raw.body !== undefined && raw.body !== null) {
    if (method === "GET") {
      errors[`${field}.body`] = "GET-запрос не может иметь тело";
    }
    validatePlaceholders(raw.body, `${field}.body`, errors, {
      allowUuid: options.allowUuid,
    });
    body = raw.body;
  }

  if (options.requirePlaceholder) {
    const statusPlaceholders = collectPlaceholders({ path, body });
    if (
      !statusPlaceholders.has("uuid") &&
      !statusPlaceholders.has("externalId")
    ) {
      errors[`${field}.path`] =
        "path или body должны содержать {{uuid}} или {{externalId}}";
    }
  }

  const bodyType = raw.bodyType === "form" ? "form" : "json";
  if (raw.bodyType !== undefined && raw.bodyType !== "json" && raw.bodyType !== "form") {
    errors[`${field}.bodyType`] = "bodyType — json или form";
  }

  if (errors[field] || errors[`${field}.method`] || errors[`${field}.path`]) {
    return undefined;
  }
  return {
    method: method as "POST" | "GET",
    path,
    headers: headers ?? {},
    ...(body === undefined ? {} : { body }),
    bodyType,
  };
}

function validateVerify(
  raw: unknown,
  errors: Record<string, string>,
): HttpProviderConfig["webhook"]["verify"] | undefined {
  if (!isRecord(raw)) {
    errors["webhook.verify"] = "Ожидается объект проверки вебхука";
    return undefined;
  }
  if (raw.type === "none") {
    return { type: "none" };
  }
  if (raw.type === "headers") {
    if (!Array.isArray(raw.headers) || raw.headers.length === 0) {
      errors["webhook.verify.headers"] = "Укажите заголовки для сверки";
      return undefined;
    }
    const headers: { header: string; secret: "apiKey" | "apiSecret" }[] = [];
    for (const item of raw.headers) {
      if (
        !isRecord(item) ||
        typeof item.header !== "string" ||
        !item.header.trim() ||
        (item.secret !== "apiKey" && item.secret !== "apiSecret")
      ) {
        errors["webhook.verify.headers"] =
          "Каждый заголовок — { header, secret: apiKey|apiSecret }";
        return undefined;
      }
      headers.push({ header: item.header.trim(), secret: item.secret });
    }
    return { type: "headers", headers };
  }
  if (raw.type === "hmac-sha256") {
    if (typeof raw.header !== "string" || !raw.header.trim()) {
      errors["webhook.verify.header"] = "Укажите заголовок подписи";
    }
    if (raw.secret !== "apiKey" && raw.secret !== "apiSecret") {
      errors["webhook.verify.secret"] = "secret — apiKey или apiSecret";
    }
    let encodings: ("hex" | "base64")[] | undefined;
    if (raw.encodings !== undefined) {
      if (
        !Array.isArray(raw.encodings) ||
        raw.encodings.length === 0 ||
        !raw.encodings.every((item) => item === "hex" || item === "base64")
      ) {
        errors["webhook.verify.encodings"] = "encodings — hex и/или base64";
      } else {
        encodings = raw.encodings as ("hex" | "base64")[];
      }
    }
    if (raw.prefix !== undefined && typeof raw.prefix !== "string") {
      errors["webhook.verify.prefix"] = "prefix — строка";
    }
    if (errors["webhook.verify.header"] || errors["webhook.verify.secret"]) {
      return undefined;
    }
    return {
      type: "hmac-sha256",
      header: (raw.header as string).trim(),
      secret: raw.secret as "apiKey" | "apiSecret",
      ...(encodings ? { encodings } : {}),
      ...(typeof raw.prefix === "string" ? { prefix: raw.prefix } : {}),
    };
  }
  if (raw.type === "sha256-sorted-body") {
    if (typeof raw.signaturePath !== "string" || !raw.signaturePath.trim()) {
      errors["webhook.verify.signaturePath"] = "signaturePath — путь к полю подписи";
    }
    if (raw.secret !== "apiKey" && raw.secret !== "apiSecret") {
      errors["webhook.verify.secret"] = "secret — apiKey или apiSecret";
    }
    if (errors["webhook.verify.signaturePath"] || errors["webhook.verify.secret"]) {
      return undefined;
    }
    return {
      type: "sha256-sorted-body",
      signaturePath: (raw.signaturePath as string).trim(),
      secret: raw.secret as "apiKey" | "apiSecret",
    };
  }
  if (raw.type === "hmac-sha256-sorted-values") {
    if (typeof raw.header !== "string" || !raw.header.trim()) {
      errors["webhook.verify.header"] = "Укажите заголовок подписи";
    }
    if (raw.secret !== "apiKey" && raw.secret !== "apiSecret") {
      errors["webhook.verify.secret"] = "secret — apiKey или apiSecret";
    }
    let encodings: ("hex" | "base64")[] | undefined;
    if (raw.encodings !== undefined) {
      if (
        !Array.isArray(raw.encodings) ||
        raw.encodings.length === 0 ||
        !raw.encodings.every((item) => item === "hex" || item === "base64")
      ) {
        errors["webhook.verify.encodings"] = "encodings — hex и/или base64";
      } else {
        encodings = raw.encodings as ("hex" | "base64")[];
      }
    }
    if (raw.prefix !== undefined && typeof raw.prefix !== "string") {
      errors["webhook.verify.prefix"] = "prefix — строка";
    }
    if (errors["webhook.verify.header"] || errors["webhook.verify.secret"]) {
      return undefined;
    }
    return {
      type: "hmac-sha256-sorted-values",
      header: (raw.header as string).trim(),
      secret: raw.secret as "apiKey" | "apiSecret",
      ...(encodings ? { encodings } : {}),
      ...(typeof raw.prefix === "string" ? { prefix: raw.prefix } : {}),
    };
  }
  errors["webhook.verify.type"] =
    "type — none, headers, hmac-sha256, sha256-sorted-body или hmac-sha256-sorted-values";
  return undefined;
}

function validateStatusMap(
  raw: unknown,
  errors: Record<string, string>,
): Record<string, ProviderMappedStatus> | undefined {
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    errors.statusMap = "statusMap — непустой объект";
    return undefined;
  }
  const result: Record<string, ProviderMappedStatus> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      errors.statusMap = `statusMap.${key} — строка`;
      return undefined;
    }
    if (value !== "IGNORE" && !isPaymentStatus(value)) {
      errors.statusMap = `statusMap.${key}: неизвестный статус ${value}`;
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

export function validateHttpProviderConfig(
  raw: unknown,
): { config: HttpProviderConfig } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!isRecord(raw)) return { errors: { config: "Конфиг должен быть объектом" } };

  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && process.env.PAYMENT_PROVIDER_ALLOW_HTTP === "1")
    ) {
      errors.baseUrl =
        "baseUrl должен быть https:// (http — только при PAYMENT_PROVIDER_ALLOW_HTTP=1)";
    }
    if (url.username || url.password) errors.baseUrl = "baseUrl не должен содержать логин/пароль";
    if (url.hash) errors.baseUrl = "baseUrl не должен содержать #";
  } catch {
    errors.baseUrl = "baseUrl — некорректный URL";
  }

  const currency =
    typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.currency = "currency — три латинские буквы, например RUB";
  }

  const amountMultiplier = Number(raw.amountMultiplier);
  if (!Number.isInteger(amountMultiplier) || amountMultiplier <= 0) {
    errors.amountMultiplier = "amountMultiplier — целое положительное число";
  }

  const descriptionMaxLength =
    raw.descriptionMaxLength === undefined ? 255 : Number(raw.descriptionMaxLength);
  if (
    !Number.isInteger(descriptionMaxLength) ||
    descriptionMaxLength < 1 ||
    descriptionMaxLength > 1000
  ) {
    errors.descriptionMaxLength = "descriptionMaxLength — целое от 1 до 1000";
  }

  const timeoutMs = raw.timeoutMs === undefined ? 10_000 : Number(raw.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) {
    errors.timeoutMs = "timeoutMs — целое от 1000 до 60000";
  }

  const retries = raw.retries === undefined ? 2 : Number(raw.retries);
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
    errors.retries = "retries — целое от 0 до 5";
  }

  const merchantId =
    typeof raw.merchantId === "string" ? raw.merchantId.trim() : "";

  const create = validateRequestTemplate(raw.create, "create", errors, {
    allowUuid: false,
  });

  let signing: HttpProviderConfig["signing"];
  if (raw.signing !== undefined) {
    if (!isRecord(raw.signing)) {
      errors.signing = "signing — объект";
    } else {
      if (raw.signing.type !== "sha256-sorted-body") {
        errors["signing.type"] = "type — sha256-sorted-body";
      }
      if (raw.signing.secret !== "apiKey" && raw.signing.secret !== "apiSecret") {
        errors["signing.secret"] = "secret — apiKey или apiSecret";
      }
      if (
        typeof raw.signing.header !== "string" ||
        !raw.signing.header.trim()
      ) {
        errors["signing.header"] = "header — непустая строка";
      }
      if (create?.bodyType === "form") {
        errors.signing = "signing поддерживает только JSON-тело";
      }
      if (
        !errors.signing &&
        !errors["signing.type"] &&
        !errors["signing.secret"] &&
        !errors["signing.header"]
      ) {
        signing = {
          type: "sha256-sorted-body",
          secret: raw.signing.secret as "apiKey" | "apiSecret",
          header: (raw.signing.header as string).trim(),
        };
      }
    }
  }

  const responseRaw = isRecord(raw.response) ? raw.response : undefined;
  if (!responseRaw) errors.response = "Ожидается объект response";
  const responseUuid = validatePaths(responseRaw?.uuid, "response.uuid", errors);
  const responseRedirect = validatePaths(
    responseRaw?.redirectUrl,
    "response.redirectUrl",
    errors,
  );
  const responseStatus =
    responseRaw?.status === undefined
      ? undefined
      : validatePaths(responseRaw.status, "response.status", errors, false);

  const statusRaw = isRecord(raw.status) ? raw.status : undefined;
  if (!statusRaw) errors.status = "Ожидается объект status";
  const statusRequest = validateRequestTemplate(statusRaw, "status", errors, {
    allowUuid: true,
    requirePlaceholder: true,
  });
  const statusUuid = validatePaths(statusRaw?.uuid, "status.uuid", errors);
  const statusStatus = validatePaths(statusRaw?.status, "status.status", errors);
  const statusAmount = validatePaths(statusRaw?.amount, "status.amount", errors, false);
  const statusCurrency = validatePaths(
    statusRaw?.currency,
    "status.currency",
    errors,
    false,
  );
  let statusFallback: { method: "POST" | "GET"; path: string } | undefined;
  if (statusRaw?.fallback !== undefined) {
    if (
      !isRecord(statusRaw.fallback) ||
      (statusRaw.fallback.method !== "POST" && statusRaw.fallback.method !== "GET") ||
      typeof statusRaw.fallback.path !== "string" ||
      !statusRaw.fallback.path.trim().startsWith("/")
    ) {
      errors["status.fallback"] = "fallback — { method: POST|GET, path: /... }";
    } else {
      validatePlaceholders(statusRaw.fallback.path, "status.fallback.path", errors, {
        allowUuid: true,
      });
      statusFallback = {
        method: statusRaw.fallback.method,
        path: statusRaw.fallback.path.trim(),
      };
    }
  }

  const webhookRaw = isRecord(raw.webhook) ? raw.webhook : undefined;
  if (!webhookRaw) errors.webhook = "Ожидается объект webhook";
  const verify = validateVerify(webhookRaw?.verify, errors);
  const webhookUuid = validatePaths(webhookRaw?.uuid, "webhook.uuid", errors);
  const webhookStatus = validatePaths(webhookRaw?.status, "webhook.status", errors);
  const webhookAmount = validatePaths(webhookRaw?.amount, "webhook.amount", errors, false);
  const webhookCurrency = validatePaths(
    webhookRaw?.currency,
    "webhook.currency",
    errors,
    false,
  );
  const webhookEventId = validatePaths(webhookRaw?.eventId, "webhook.eventId", errors);
  let webhookEventPath: string | undefined;
  if (webhookRaw?.eventPath !== undefined) {
    if (typeof webhookRaw.eventPath !== "string" || !webhookRaw.eventPath.trim()) {
      errors["webhook.eventPath"] = "eventPath — непустая строка";
    } else {
      webhookEventPath = webhookRaw.eventPath.trim();
    }
  }
  let webhookEvents: string[] | undefined;
  if (webhookRaw?.events !== undefined) {
    if (
      !Array.isArray(webhookRaw.events) ||
      webhookRaw.events.length === 0 ||
      !webhookRaw.events.every(
        (event) => typeof event === "string" && event.trim() !== "",
      )
    ) {
      errors["webhook.events"] = "events — непустой массив строк";
    } else {
      webhookEvents = webhookRaw.events.map((event) => (event as string).trim());
    }
  }
  const trustBody =
    webhookRaw?.trustBody === undefined ? true : webhookRaw.trustBody === true;
  if (verify?.type === "none" && trustBody) {
    errors["webhook.trustBody"] =
      "verify.type=none требует trustBody:false: без подписи статус из тела не доверяем и перечитываем из API";
  }
  if (webhookEvents && !webhookEventPath) {
    errors["webhook.eventPath"] = "Для events нужен eventPath";
  }
  let webhookMerchantIdPath: string | undefined;
  if (webhookRaw?.merchantIdPath !== undefined) {
    if (
      typeof webhookRaw.merchantIdPath !== "string" ||
      !webhookRaw.merchantIdPath.trim()
    ) {
      errors["webhook.merchantIdPath"] = "merchantIdPath — непустая строка";
    } else {
      webhookMerchantIdPath = webhookRaw.merchantIdPath.trim();
    }
  }

  const statusMap = validateStatusMap(raw.statusMap, errors);

  // Секреты обязательны только там, где они реально используются: в шаблоне
  // запроса, подписи исходящего тела или проверке вебхука. Monee использует
  // только секрет (X-Sign), без публичного API-ключа.
  const usedPlaceholders = collectPlaceholders({
    create: raw.create,
    status: raw.status,
  });
  const needsApiKey =
    usedPlaceholders.has("apiKey") || usedPlaceholders.has("basicAuth");
  const needsApiSecret =
    usedPlaceholders.has("apiSecret") || usedPlaceholders.has("basicAuth");
  const usedMerchantId = usedPlaceholders.has("merchantId");

  const verifySecrets = { apiKey: false, apiSecret: false };
  if (verify) {
    if (verify.type === "headers") {
      for (const item of verify.headers) verifySecrets[item.secret] = true;
    } else if (verify.type !== "none") {
      verifySecrets[verify.secret] = true;
    }
  }
  if (signing) verifySecrets[signing.secret] = true;

  const secretsRaw = isRecord(raw.secrets) ? raw.secrets : {};
  const apiKey = typeof secretsRaw.apiKey === "string" ? secretsRaw.apiKey : "";
  const apiSecret =
    typeof secretsRaw.apiSecret === "string" ? secretsRaw.apiSecret : "";

  if ((needsApiKey || verifySecrets.apiKey) && !apiKey) {
    errors["secrets.apiKey"] =
      "Укажите ключ: он используется в шаблоне или проверке запроса";
  }
  if ((needsApiSecret || verifySecrets.apiSecret) && !apiSecret) {
    errors["secrets.apiSecret"] =
      "Укажите секрет: он используется в подписи запроса или вебхука";
  }
  if (usedMerchantId && !merchantId) {
    errors.merchantId = "Укажите merchantId (shop UUID) — он используется в шаблоне";
  }
  if (webhookMerchantIdPath && !merchantId) {
    errors.merchantId = "merchantId нужен для проверки shop_id в вебхуке";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    config: {
      version: 1,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      currency,
      amountMultiplier,
      descriptionMaxLength,
      timeoutMs,
      retries,
      merchantId,
      create: create as RequestTemplate,
      ...(signing ? { signing } : {}),
      response: {
        uuid: responseUuid as string[],
        redirectUrl: responseRedirect as string[],
        ...(responseStatus ? { status: responseStatus } : {}),
      },
      status: {
        ...(statusRequest as RequestTemplate),
        uuid: statusUuid as string[],
        status: statusStatus as string[],
        ...(statusAmount ? { amount: statusAmount } : {}),
        ...(statusCurrency ? { currency: statusCurrency } : {}),
        ...(statusFallback ? { fallback: statusFallback } : {}),
      },
      webhook: {
        verify: verify as HttpProviderConfig["webhook"]["verify"],
        uuid: webhookUuid as string[],
        status: webhookStatus as string[],
        ...(webhookAmount ? { amount: webhookAmount } : {}),
        ...(webhookCurrency ? { currency: webhookCurrency } : {}),
        eventId: webhookEventId as string[],
        ...(webhookEventPath ? { eventPath: webhookEventPath } : {}),
        ...(webhookEvents ? { events: webhookEvents } : {}),
        ...(webhookMerchantIdPath
          ? { merchantIdPath: webhookMerchantIdPath }
          : {}),
        trustBody,
      },
      statusMap: statusMap as Record<string, ProviderMappedStatus>,
      secrets: { apiKey, apiSecret },
    },
  };
}

/**
 * Разбирает сохранённый JSON: расшифровывает секреты и валидирует конфиг.
 * Возвращает ошибку, если ключ шифрования недоступен или конфиг битый.
 */
export function parseStoredConfig(
  raw: unknown,
): { config: HttpProviderConfig } | { error: string } {
  if (!isRecord(raw)) return { error: "Конфиг не объект" };
  const secretsRaw = isRecord(raw.secrets) ? raw.secrets : {};
  try {
    const apiKey = openSecret(
      typeof secretsRaw.apiKey === "string" ? secretsRaw.apiKey : "",
    );
    const apiSecret = openSecret(
      typeof secretsRaw.apiSecret === "string" ? secretsRaw.apiSecret : "",
    );
    const validated = validateHttpProviderConfig({
      ...raw,
      secrets: { apiKey, apiSecret },
    });
    if ("errors" in validated) {
      return { error: Object.values(validated.errors)[0] ?? "Некорректный конфиг" };
    }
    return validated;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isFinalProviderStatus(value: unknown): value is PaymentStatus {
  return isPaymentStatus(value);
}

function mapStatus(config: HttpProviderConfig, rawStatus: string): ProviderMappedStatus {
  return config.statusMap[rawStatus] ?? "IGNORE";
}

// --- HTTP-адаптер ---

function requireConfig(provider: ResolvedProvider): HttpProviderConfig {
  if (provider.kind !== "http" || !provider.config) {
    throw new ProviderRequestError(
      provider.id,
      "конфиг провайдера недоступен",
      { retryable: false },
    );
  }
  return provider.config;
}

function safeEqual(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Сверка HMAC-подписи с учётом `encodings`/`prefix` из конфига. */
function matchesSignature(
  verify: { encodings?: ("hex" | "base64")[]; prefix?: string },
  actual: string,
  digest: Buffer,
): boolean {
  let provided = actual;
  if (verify.prefix) {
    const prefix = verify.prefix;
    if (provided.toLowerCase().startsWith(prefix.toLowerCase())) {
      provided = provided.slice(prefix.length);
    }
  }
  return (verify.encodings ?? ["hex", "base64"]).some((encoding) =>
    safeEqual(
      digest.toString(encoding),
      encoding === "hex" ? provided.toLowerCase() : provided,
    ),
  );
}

function httpAdapter(provider: ResolvedProvider, deps: ProviderDeps): ProviderAdapter {
  const config = requireConfig(provider);

  return {
    providerId: provider.id,
    trustBody: config.webhook.trustBody ?? true,

    async createInvoice(input) {
      const values = buildValues(config, input);
      const request = buildRequest(config, config.create, values);
      const body = await requestJson(
        provider,
        request,
        config,
        deps,
        config.retries + 1,
      );
      const providerUuid = asString(firstPath(body, config.response.uuid));
      const rawRedirectUrl = asString(firstPath(body, config.response.redirectUrl));
      if (!providerUuid) {
        throw new ProviderRequestError(
          provider.id,
          `в ответе нет uuid (пути: ${config.response.uuid.join(", ")})`,
          { retryable: false },
        );
      }
      if (!rawRedirectUrl) {
        throw new ProviderRequestError(
          provider.id,
          `в ответе нет ссылки на оплату (пути: ${config.response.redirectUrl.join(", ")})`,
          { retryable: false },
        );
      }
      const redirectUrl = normalizeRedirectUrl(rawRedirectUrl, config.baseUrl);
      if (!isHttpUrl(redirectUrl)) {
        throw new ProviderRequestError(
          provider.id,
          `некорректная ссылка на оплату: ${rawRedirectUrl}`,
          { retryable: false },
        );
      }
      const rawStatus = asString(firstPath(body, config.response.status)) ?? "pending";
      const mapped = mapStatus(config, rawStatus);
      return {
        providerId: provider.id,
        providerUuid,
        redirectUrl,
        status: mapped === "IGNORE" ? "PENDING" : mapped,
        rawStatus,
        // Все суммы внутри приложения — в копейках, независимо от того,
        // в каких единицах считает провайдер.
        amount: String(Math.round(input.amountRub * 100)),
        currency: config.currency,
      };
    },

    async fetchStatus(uuid) {
      const values = buildValues(
        config,
        {
          amountRub: 0,
          description: "",
          externalId: "",
          callbackUrl: "",
          successUrl: "",
          failUrl: "",
        },
        uuid,
      );
      let body: unknown;
      try {
        body = await requestJson(
          provider,
          buildRequest(config, config.status, values),
          config,
          deps,
          config.retries + 1,
        );
      } catch (error) {
        if (!config.status.fallback) throw error;
        const fallback = config.status.fallback;
        body = await requestJson(
          provider,
          buildRequest(
            config,
            { method: fallback.method, path: fallback.path, headers: config.status.headers },
            values,
          ),
          config,
          deps,
          config.retries + 1,
        );
      }

      const rawStatus = asString(firstPath(body, config.status.status));
      if (!rawStatus) {
        throw new ProviderRequestError(
          provider.id,
          `в статусе нет поля со статусом (пути: ${config.status.status.join(", ")})`,
          { retryable: false },
        );
      }
      const mapped = mapStatus(config, rawStatus);
      if (mapped === "IGNORE") {
        throw new ProviderRequestError(
          provider.id,
          `неизвестный статус ${rawStatus}`,
          { retryable: false },
        );
      }
      return {
        providerUuid: asString(firstPath(body, config.status.uuid)) ?? uuid,
        status: mapped,
        rawStatus,
        amount: providerAmountToKopecks(
          firstPath(body, config.status.amount),
          config.amountMultiplier,
        ),
        currency:
          asString(firstPath(body, config.status.currency))?.toUpperCase() ??
          config.currency,
      };
    },

    verifyWebhook(headers, rawBody) {
      const verify = config.webhook.verify;
      let ok = false;

      if (verify.type === "none") {
        // Подписи нет: тело — только сигнал, статус перечитывается из API.
        ok = true;
      } else if (verify.type === "headers") {
        ok = verify.headers.every(({ header, secret }) =>
          safeEqual(config.secrets[secret], headers.get(header) ?? ""),
        );
      } else if (verify.type === "hmac-sha256") {
        const actual = (headers.get(verify.header) ?? "").trim();
        if (actual) {
          const digest = createHmac("sha256", config.secrets[verify.secret])
            .update(rawBody, "utf8")
            .digest();
          ok = matchesSignature(verify, actual, digest);
        }
      } else if (verify.type === "hmac-sha256-sorted-values") {
        // ParityPay: HMAC-SHA256 по значениям полей в порядке сортировки
        // ключей; подпись — в заголовке.
        const actual = (headers.get(verify.header) ?? "").trim();
        if (actual) {
          try {
            const payload = sortedValuesPayload(JSON.parse(rawBody) as unknown);
            if (payload !== null) {
              const digest = createHmac("sha256", config.secrets[verify.secret])
                .update(payload, "utf8")
                .digest();
              ok = matchesSignature(verify, actual, digest);
            }
          } catch {
            ok = false;
          }
        }
      } else {
        // Подпись лежит в теле: sha256(JSON без signature + секрет).
        try {
          const body = JSON.parse(rawBody) as unknown;
          const signature = asString(getJsonPath(body, verify.signaturePath));
          if (signature) {
            const expected = sha256Hex(
              sortedTopLevelJson(omitJsonPath(body, verify.signaturePath)) +
                config.secrets[verify.secret],
            );
            ok = safeEqual(expected, signature.toLowerCase());
          }
        } catch {
          ok = false;
        }
      }

      if (!ok) return false;

      // Дополнительно сверяем shop_id/merchant id, если он есть в теле.
      if (config.webhook.merchantIdPath && config.merchantId) {
        try {
          const body = JSON.parse(rawBody) as unknown;
          const shopId = asString(getJsonPath(body, config.webhook.merchantIdPath));
          if (shopId !== config.merchantId) return false;
        } catch {
          return false;
        }
      }

      return true;
    },

    isIgnorableWebhook(rawBody) {
      if (!config.webhook.eventPath || !config.webhook.events?.length) return false;
      try {
        const body = JSON.parse(rawBody) as unknown;
        const event = asString(getJsonPath(body, config.webhook.eventPath));
        if (!event) return false;
        return !config.webhook.events.includes(event);
      } catch {
        return false;
      }
    },

    parseWebhook(rawBody) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new ProviderWebhookError("Тело вебхука — не JSON");
      }
      const providerUuid = asString(firstPath(body, config.webhook.uuid));
      const rawStatus = asString(firstPath(body, config.webhook.status));
      if (!providerUuid) throw new ProviderWebhookError("В вебхуке нет uuid счёта");
      if (!rawStatus) throw new ProviderWebhookError("В вебхуке нет статуса");

      const eventIdParts = config.webhook.eventId
        .map((path) => asString(getJsonPath(body, path)))
        .filter((value): value is string => Boolean(value));
      return {
        eventId:
          eventIdParts.length > 0
            ? eventIdParts.join(":")
            : `${providerUuid}:${rawStatus}`,
        providerUuid,
        rawStatus,
        status: mapStatus(config, rawStatus),
        amount: providerAmountToKopecks(
          firstPath(body, config.webhook.amount),
          config.amountMultiplier,
        ),
        currency: asString(firstPath(body, config.webhook.currency))?.toUpperCase(),
        payload: rawBody.slice(0, 20_000),
      };
    },
  };
}

// --- Exenta ---

function exentaAdapter(provider: ResolvedProvider, deps: ProviderDeps): ProviderAdapter {
  const exentaDeps: ExentaDeps = { fetch: deps.fetch };

  return {
    providerId: provider.id,
    trustBody: false,

    async createInvoice(input) {
      const invoice = await createExentaInvoice(
        {
          amountRub: input.amountRub,
          description: input.description,
          buyerIp: input.buyerIp ?? null,
          successUrl: input.successUrl,
          failedUrl: input.failUrl,
        },
        exentaDeps,
      );
      return {
        providerId: provider.id,
        providerUuid: invoice.uuid,
        redirectUrl: invoice.redirectUrl,
        status: invoice.status,
        rawStatus: invoice.rawStatus ?? invoice.status,
        amount: invoice.amount,
        currency: invoice.currency ?? "RUB",
      };
    },

    async fetchStatus(uuid) {
      const result = await fetchExentaStatus(uuid, exentaDeps);
      return {
        providerUuid: result.uuid,
        status: result.status,
        rawStatus: result.rawStatus ?? result.status,
        amount: result.amount,
        currency: result.currency ?? "RUB",
      };
    },

    verifyWebhook(headers, rawBody) {
      const secret = process.env.PAYMENTS_WEBHOOK_SECRET ?? "";
      return verifyWebhookSignature(
        rawBody,
        headers.get("x-webhook-signature"),
        secret,
      );
    },

    isIgnorableWebhook() {
      return false;
    },

    parseWebhook(rawBody) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new ProviderWebhookError("Тело вебхука — не JSON");
      }
      const data = unwrapData(body) ?? {};
      const providerUuid = asString(data.paymentUuid ?? data.uuid);
      if (!providerUuid) throw new ProviderWebhookError("В вебхуке нет uuid счёта");
      const rawStatus = asString(data.status) ?? "UNKNOWN";
      return {
        eventId: `${providerUuid}:${rawStatus}`,
        providerUuid,
        rawStatus,
        status: isFinalProviderStatus(rawStatus) ? rawStatus : "PENDING",
        amount: asString(data.amount),
        currency: "RUB",
        payload: rawBody.slice(0, 20_000),
      };
    },
  };
}

/** Адаптер для конкретного провайдера: встроенный Exenta или HTTP-шаблон. */
export function getAdapter(
  provider: ResolvedProvider,
  deps: ProviderDeps = {},
): ProviderAdapter {
  return provider.kind === "exenta"
    ? exentaAdapter(provider, deps)
    : httpAdapter(provider, deps);
}
