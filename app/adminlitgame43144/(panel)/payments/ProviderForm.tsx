"use client";

import Link from "next/link";
import { useActionState, useState, type ChangeEvent, type ReactNode } from "react";
import { PROVIDER_PRESETS, type ProviderPreset } from "@/lib/provider-presets";
import { saveProvider } from "./actions";
import type { ProviderFormState, ProviderFormValues, SecretMasks } from "./types";

const INITIAL_STATE: ProviderFormState = { errors: {} };

const INPUT_BASE =
  "h-10 w-full rounded-tile border bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none";
const TEXTAREA_BASE =
  "w-full rounded-tile border bg-elevated p-3 font-mono text-xs leading-5 text-ink placeholder:text-faint focus:border-line-strong focus:outline-none";

function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${hasError ? "border-brand" : "border-line"}`;
}

function textareaClass(hasError: boolean): string {
  return `${TEXTAREA_BASE} ${hasError ? "border-brand" : "border-line"}`;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["flex flex-col gap-1.5", className ?? ""].join(" ")}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs leading-5 text-brand">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs leading-5 text-faint">{hint}</span>
      )}
    </label>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const JSON_FIELDS: {
  key: keyof ProviderFormValues;
  label: string;
  hint: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "createJson",
    label: "create — запрос создания счёта",
    hint: "method, path, headers, body. Подстановки: {{apiKey}}, {{apiSecret}}, {{amount}} (в единицах провайдера), {{amountRub}} (рубли с копейками), {{currency}}, {{externalId}}, {{description}}, {{callbackUrl}}, {{successUrl}}, {{failUrl}}, {{buyerIp}}, {{merchantId}}, {{paymentMethod}}.",
    placeholder:
      '{\n  "method": "POST",\n  "path": "/orders",\n  "headers": { "X-Api-Key": "{{apiKey}}" },\n  "body": {\n    "amount": "{{amount}}",\n    "external_id": "{{externalId}}",\n    "callback_url": "{{callbackUrl}}"\n  }\n}',
    rows: 11,
  },
  {
    key: "responseJson",
    label: "response — разбор ответа на создание счёта",
    hint: "Пути в JSON ответа: uuid и redirectUrl обязательны, status — если провайдер отдаёт его сразу.",
    placeholder:
      '{\n  "uuid": ["id"],\n  "redirectUrl": ["payment_url"],\n  "status": ["status"]\n}',
    rows: 7,
  },
  {
    key: "statusJson",
    label: "status — запрос статуса счёта",
    hint: "Тот же формат, что у create, плюс пути uuid/status/amount/currency в ответе. {{uuid}} подставляется из счёта.",
    placeholder:
      '{\n  "method": "GET",\n  "path": "/orders/{{uuid}}",\n  "headers": { "X-Api-Key": "{{apiKey}}" },\n  "uuid": ["id"],\n  "status": ["status"],\n  "amount": ["amount"],\n  "currency": ["currency"]\n}',
    rows: 11,
  },
  {
    key: "webhookJson",
    label: "webhook — проверка и разбор вебхука",
    hint: "verify.type: headers (сверка заголовков с секретом), hmac-sha256, sha256-sorted-body или hmac-sha256-sorted-values (значения полей в порядке ключей). trustBody: true — доверять статусу из тела. eventPath + events — обрабатывать только эти события, остальные (webhook.test, выплаты) подтверждать 2xx.",
    placeholder:
      '{\n  "verify": {\n    "type": "headers",\n    "headers": [{ "header": "x-api-key", "secret": "apiKey" }]\n  },\n  "uuid": ["order.id"],\n  "status": ["order.status"],\n  "eventId": ["order.id", "order.status"],\n  "eventPath": "event",\n  "events": ["order.status_updated"],\n  "trustBody": true\n}',
    rows: 11,
  },
  {
    key: "statusMapJson",
    label: "statusMap — статусы провайдера → наши",
    hint: "CREATED, PENDING, SUCCESS, FAILED, CANCELLED или IGNORE (возвраты и споры — баланс не меняем).",
    placeholder:
      '{\n  "pending": "PENDING",\n  "paid": "SUCCESS",\n  "failed": "FAILED",\n  "canceled": "CANCELLED",\n  "refunded": "IGNORE"\n}',
    rows: 9,
  },
];

/**
 * Форма HTTP-провайдера. Секретов в пропсах нет: только маски и флаг
 * «секрет задан». Поля контролируемые, поэтому ошибки Server Action не
 * сбрасывают введённые значения.
 */
export function ProviderForm({
  providerId,
  initial,
  initialEnabled,
  secretMasks,
}: {
  providerId: string | null;
  initial: ProviderFormValues;
  initialEnabled: boolean;
  secretMasks: SecretMasks;
}) {
  const [state, formAction, pending] = useActionState(saveProvider, INITIAL_STATE);
  const [values, setValues] = useState<ProviderFormValues>(initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [presetApplied, setPresetApplied] = useState<ProviderPreset | null>(null);

  const isEdit = providerId !== null;

  const errorFor = (key: string): string | undefined => {
    if (state.errors[key]) return state.errors[key];
    const nested = Object.keys(state.errors).find((name) => name.startsWith(`${key}.`));
    return nested ? state.errors[nested] : undefined;
  };

  const change =
    (key: keyof ProviderFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [key]: value }));
    };

  const applyPreset = (preset: ProviderPreset) => {
    setValues((current) => ({
      ...current,
      name: preset.name,
      baseUrl: preset.config.baseUrl,
      currency: preset.config.currency,
      amountMultiplier: String(preset.config.amountMultiplier),
      descriptionMaxLength: String(preset.config.descriptionMaxLength),
      timeoutMs: String(preset.config.timeoutMs),
      retries: String(preset.config.retries),
      merchantId: preset.config.merchantId,
      createJson: prettyJson(preset.config.create),
      responseJson: prettyJson(preset.config.response),
      statusJson: prettyJson(preset.config.status),
      webhookJson: prettyJson(preset.config.webhook),
      statusMapJson: prettyJson(preset.config.statusMap),
    }));
    setPresetApplied(preset);
  };

  return (
    <form action={formAction} className="mt-6 flex max-w-3xl flex-col gap-4">
      {providerId && <input type="hidden" name="id" value={providerId} />}

      {state.errors._form && (
        <p role="alert" className="rounded-card border border-line-strong bg-brand-soft p-4 text-sm text-ink">
          {state.errors._form}
        </p>
      )}

      <Section
        title="Основное"
        description="Название видно только в админке. Порядок задаёт место в резервной цепочке (меньше — раньше)."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-faint">Заполнить:</span>
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-panel-hover"
              >
                {preset.name}
              </button>
            ))}
          </div>
        }
      >
        {presetApplied && (
          <p className="mb-4 rounded-tile border border-line bg-elevated p-3 text-xs leading-5 text-muted">
            Подставлен шаблон <span className="font-medium text-ink">{presetApplied.name}</span>:
            name, baseUrl, currency, amountMultiplier, descriptionMaxLength, timeoutMs,
            retries и пять JSON-секций. {presetApplied.description} Секреты не заполняются —
            возьмите их в кабинете провайдера; для Monee и ParityPay дополнительно
            заполните merchantId (shop UUID).
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название" error={errorFor("name")}>
            <input
              name="name"
              value={values.name}
              onChange={change("name")}
              placeholder="Cashera"
              className={inputClass(Boolean(errorFor("name")))}
            />
          </Field>
          <Field
            label="Порядок (sortOrder)"
            hint="По умолчанию 100"
            error={errorFor("sortOrder")}
          >
            <input
              name="sortOrder"
              type="number"
              step="1"
              value={values.sortOrder}
              onChange={change("sortOrder")}
              className={inputClass(Boolean(errorFor("sortOrder")))}
            />
          </Field>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            name="enabled"
            type="checkbox"
            value="1"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[#e11d48]"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Провайдер включён</span>
            <span className="mt-0.5 block text-xs leading-5 text-faint">
              Выключенный провайдер остаётся в списке для сверки старых счетов, но не
              участвует в новых и его нельзя выбрать активным.
            </span>
          </span>
        </label>
      </Section>

      <Section
        title="Параметры конфига"
        description="Суммы уходят провайдеру в «сыром» виде: multiplier переводит рубли в копейки. {{amountRub}} — рубли с копейками (для ParityPay)."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            className="sm:col-span-2"
            label="baseUrl"
            hint="https://api.example.com/api/v1 — без завершающего слэша"
            error={errorFor("baseUrl")}
          >
            <input
              name="baseUrl"
              value={values.baseUrl}
              onChange={change("baseUrl")}
              placeholder="https://api.example.com/api/v1"
              className={inputClass(Boolean(errorFor("baseUrl")))}
            />
          </Field>
          <Field label="currency" hint="ISO-код: RUB" error={errorFor("currency")}>
            <input
              name="currency"
              value={values.currency}
              onChange={change("currency")}
              placeholder="RUB"
              className={inputClass(Boolean(errorFor("currency")))}
            />
          </Field>
          <Field
            label="amountMultiplier"
            hint="100 — копейки, 1 — рубли"
            error={errorFor("amountMultiplier")}
          >
            <input
              name="amountMultiplier"
              type="number"
              step="1"
              value={values.amountMultiplier}
              onChange={change("amountMultiplier")}
              className={inputClass(Boolean(errorFor("amountMultiplier")))}
            />
          </Field>
          <Field
            label="descriptionMaxLength"
            hint="1–1000, по умолчанию 255"
            error={errorFor("descriptionMaxLength")}
          >
            <input
              name="descriptionMaxLength"
              type="number"
              step="1"
              value={values.descriptionMaxLength}
              onChange={change("descriptionMaxLength")}
              className={inputClass(Boolean(errorFor("descriptionMaxLength")))}
            />
          </Field>
          <Field
            label="timeoutMs"
            hint="1000–60000, по умолчанию 10000"
            error={errorFor("timeoutMs")}
          >
            <input
              name="timeoutMs"
              type="number"
              step="500"
              value={values.timeoutMs}
              onChange={change("timeoutMs")}
              className={inputClass(Boolean(errorFor("timeoutMs")))}
            />
          </Field>
          <Field
            label="retries"
            hint="0–5. 0 — не повторять запрос (для провайдеров без идемпотентности)"
            error={errorFor("retries")}
          >
            <input
              name="retries"
              type="number"
              step="1"
              min="0"
              max="5"
              value={values.retries}
              onChange={change("retries")}
              className={inputClass(Boolean(errorFor("retries")))}
            />
          </Field>
          <Field
            className="sm:col-span-2"
            label="merchantId (shop UUID)"
            hint="Подставляется в шаблон как {{merchantId}}. Нужен Monee и ParityPay; у Cashera не используется."
            error={errorFor("merchantId")}
          >
            <input
              name="merchantId"
              value={values.merchantId}
              onChange={change("merchantId")}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={inputClass(Boolean(errorFor("merchantId")))}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Секреты"
        description={
          isEdit
            ? "Хранятся в БД зашифрованными. Пустое поле — оставить текущее значение; введите новое, только чтобы заменить."
            : "Хранятся в БД зашифрованными (при заданном PAYMENTS_CONFIG_KEY) и в клиент не отдаются."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="API-ключ (apiKey)"
            hint={
              secretMasks.apiKey
                ? `Сейчас задан: ${secretMasks.apiKey}`
                : "Нужен, если в шаблонах есть {{apiKey}} или {{basicAuth}}"
            }
            error={errorFor("secrets.apiKey")}
          >
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder={
                secretMasks.apiKey
                  ? `Оставьте пустым, чтобы сохранить (${secretMasks.apiKey})`
                  : "Укажите API-ключ"
              }
              className={inputClass(Boolean(errorFor("secrets.apiKey")))}
            />
          </Field>
          <Field
            label="API-секрет (apiSecret)"
            hint={
              secretMasks.apiSecret
                ? `Сейчас задан: ${secretMasks.apiSecret}`
                : "Нужен, если используется в подписи X-Sign или проверке вебхука"
            }
            error={errorFor("secrets.apiSecret")}
          >
            <input
              name="apiSecret"
              type="password"
              autoComplete="new-password"
              placeholder={
                secretMasks.apiSecret
                  ? `Оставьте пустым, чтобы сохранить (${secretMasks.apiSecret})`
                  : "Укажите API-секрет"
              }
              className={inputClass(Boolean(errorFor("secrets.apiSecret")))}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="JSON-секции"
        description="Шаблоны запросов и разбор ответов. Ошибки разбора и проверки показываются под нужным полем."
      >
        <div className="flex flex-col gap-4">
          {JSON_FIELDS.map((field) => {
            const error = errorFor(field.key.replace(/Json$/, ""));
            return (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                error={error}
              >
                <textarea
                  name={field.key}
                  rows={field.rows}
                  value={values[field.key]}
                  onChange={change(field.key)}
                  placeholder={field.placeholder}
                  spellCheck={false}
                  className={textareaClass(Boolean(error))}
                />
              </Field>
            );
          })}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Сохраняем…" : isEdit ? "Сохранить" : "Добавить провайдера"}
        </button>
        <Link
          href="/adminlitgame43144/payments"
          className="inline-flex h-11 items-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
