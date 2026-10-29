/**
 * Готовые шаблоны провайдеров для формы админки. Это только данные: модуль
 * можно импортировать в клиентский компонент (типы стираются при сборке).
 *
 * Добавляя новую платёжку, достаточно положить сюда её конфиг — код движка
 * менять не нужно.
 */

import type { HttpProviderConfig } from "./payment-provider";

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  config: Omit<HttpProviderConfig, "secrets">;
}

/**
 * Cashera: H2H API, суммы в копейках, создание счёта и статус с `X-Api-Key`.
 * В кабинете Cashera не выдают `sk_` (секрет для `X-Secret`), поэтому вебхук
 * принимаем без проверки подписи, а статус/сумму перечитываем через API:
 * `trustBody:false`. Статусы pending/paid/canceled/failed/expired/refunded/
 * chargeback. Метод оплаты — NSPK (`sbp`).
 */
export const CASHERA_PRESET: ProviderPreset = {
  id: "cashera",
  name: "Cashera",
  description:
    "H2H-платежи NSPK. Нужен только API-ключ pk_ (X-Api-Key); вебхук без подписи — статус перечитывается через API.",
  config: {
    version: 1,
    baseUrl: "https://api.cashera.cash/api/v1",
    currency: "RUB",
    amountMultiplier: 100,
    descriptionMaxLength: 255,
    timeoutMs: 10000,
    retries: 2,
    merchantId: "",
    create: {
      method: "POST",
      path: "/integration/transactions",
      headers: {
        "X-Api-Key": "{{apiKey}}",
        "Content-Type": "application/json",
      },
      body: {
        amount: "{{amount}}",
        currency: "{{currency}}",
        payment_method: "{{paymentMethod}}",
        external_id: "{{externalId}}",
        description: "{{description}}",
        callback_url: "{{callbackUrl}}",
        success_url: "{{successUrl}}",
        fail_url: "{{failUrl}}",
      },
    },
    response: {
      uuid: ["uuid"],
      redirectUrl: ["payment_url"],
      status: ["status"],
    },
    status: {
      method: "GET",
      path: "/integration/transactions/{{uuid}}",
      headers: { "X-Api-Key": "{{apiKey}}" },
      uuid: ["uuid"],
      status: ["status"],
      amount: ["amount"],
      currency: ["currency"],
    },
    webhook: {
      // Cashera не выдаёт sk_ для X-Secret, поэтому подпись не проверяем.
      // Тело — только сигнал: статус, сумму и валюту перечитываем из API
      // по X-Api-Key (trustBody:false), подделать вебхук и зачислить
      // платёж нельзя.
      verify: { type: "none" },
      uuid: ["transaction.uuid"],
      status: ["transaction.status"],
      amount: ["transaction.amount"],
      currency: ["transaction.currency"],
      eventId: ["transaction.uuid", "transaction.status"],
      eventPath: "event",
      // Платёжные события Cashera; webhook.test, выплаты и подписки
      // подтверждаем 2xx и не разбираем.
      events: ["transaction.status_updated"],
      trustBody: false,
    },
    statusMap: {
      pending: "PENDING",
      paid: "SUCCESS",
      canceled: "CANCELLED",
      failed: "FAILED",
      expired: "CANCELLED",
      refunded: "IGNORE",
      chargeback: "IGNORE",
    },
  },
};

/**
 * Monee: H2H API v2. Каждый запрос подписывается `X-Sign` —
 * sha256(JSON с отсортированными ключами верхнего уровня + секрет).
 * Вебхук содержит `signature` в теле; сумму в вебхуке не проверяем
 * (там float в рублях), а перечитываем `/v2/order/info` с копейками.
 * Метод NSPK — `sbp`, магазин задаётся `shop_to`/`shop_uuid` (merchantId).
 */
export const MONEE_PRESET: ProviderPreset = {
  id: "monee",
  name: "Monee",
  description:
    "H2H-платежи NSPK (sbp). Нужны shop UUID и секретный ключ: запросы подписываются X-Sign, вебхук проверяется по signature.",
  config: {
    version: 1,
    baseUrl: "https://api.monee.pro/v2",
    currency: "RUB",
    amountMultiplier: 100,
    descriptionMaxLength: 255,
    timeoutMs: 10000,
    // У Monee нет idempotency-key: повтор создаёт второй счёт, поэтому
    // сетевые ошибки/5xx не повторяем.
    retries: 0,
    merchantId: "",
    create: {
      method: "POST",
      path: "/order/create",
      headers: { "Content-Type": "application/json" },
      body: {
        shop_to: "{{merchantId}}",
        amount: "{{amount}}",
        comment: "{{description}}",
        hook_url: "{{callbackUrl}}",
        expire: 15,
        method: "{{paymentMethod}}",
        success_url: "{{successUrl}}",
        custom_fields: { payment_id: "{{externalId}}" },
      },
    },
    signing: {
      type: "sha256-sorted-body",
      secret: "apiSecret",
      header: "X-Sign",
    },
    response: {
      uuid: ["data.uuid"],
      redirectUrl: ["data.url"],
      status: ["data.status"],
    },
    status: {
      method: "POST",
      path: "/order/info",
      headers: { "Content-Type": "application/json" },
      body: {
        shop_uuid: "{{merchantId}}",
        order_uuid: "{{uuid}}",
      },
      uuid: ["data.order_uuid"],
      status: ["data.status"],
      amount: ["data.amount"],
    },
    webhook: {
      verify: {
        type: "sha256-sorted-body",
        signaturePath: "signature",
        secret: "apiSecret",
      },
      uuid: ["invoice_id"],
      status: ["status"],
      eventId: ["invoice_id", "status"],
      merchantIdPath: "shop_id",
      // Сумма в вебхуке — float в рублях, а в /order/info — копейки;
      // доверяем только ответу info, он же проверяется по сумме платежа.
      trustBody: false,
    },
    statusMap: {
      WAITING: "PENDING",
      PAID: "SUCCESS",
      CANCELLED: "CANCELLED",
      EXPIRED: "CANCELLED",
      MANUAL_CHECK: "PENDING",
      // Вебхук Monee присылает не статус счёта, а признак успеха.
      success: "SUCCESS",
    },
  },
};

/**
 * ParityPay: H2H API v2. Касса определяется заголовками `X-ShopId` (shop
 * UUID) и `X-SecretKey` (секретный ключ №1), в теле `shop_id` не передаётся.
 * Суммы — decimal-рубли, поэтому `amountMultiplier=1` и `{{amountRub}}`.
 * Вебхук: заголовок `X-SIGNATURE` — HMAC-SHA256 по значениям полей в порядке
 * сортировки ключей, без разделителей; секрет — ключ №2 (в поле apiSecret).
 * Метод NSPK — `sbp`.
 */
export const PARITYPAY_PRESET: ProviderPreset = {
  id: "paritypay",
  name: "ParityPay",
  description:
    "H2H-платежи NSPK (sbp). merchantId — shop UUID; apiKey — секретный ключ №1 (X-SecretKey), apiSecret — секретный ключ №2 (подпись вебхука X-SIGNATURE).",
  config: {
    version: 1,
    baseUrl: "https://api.paritypay.net",
    currency: "RUB",
    amountMultiplier: 1,
    descriptionMaxLength: 255,
    timeoutMs: 10000,
    // order_id уникален в рамках кассы: повтор create вернёт 422, поэтому
    // сетевые ошибки и 5xx не повторяем.
    retries: 0,
    merchantId: "",
    create: {
      method: "POST",
      path: "/v2/invoice/create",
      headers: {
        "X-ShopId": "{{merchantId}}",
        "X-SecretKey": "{{apiKey}}",
        "Content-Type": "application/json",
      },
      body: {
        order_id: "{{externalId}}",
        amount: "{{amountRub}}",
        comment: "{{description}}",
        service: "{{paymentMethod}}",
        expire: 60,
        success_url: "{{successUrl}}",
        fail_url: "{{failUrl}}",
        callback_url: "{{callbackUrl}}",
      },
    },
    response: {
      uuid: ["id"],
      redirectUrl: ["link"],
      status: ["status"],
    },
    status: {
      method: "GET",
      path: "/v2/invoice/status?id={{uuid}}",
      headers: {
        "X-ShopId": "{{merchantId}}",
        "X-SecretKey": "{{apiKey}}",
      },
      uuid: ["id"],
      status: ["status"],
      amount: ["amount"],
    },
    webhook: {
      verify: {
        type: "hmac-sha256-sorted-values",
        header: "X-SIGNATURE",
        secret: "apiSecret",
        encodings: ["hex"],
      },
      uuid: ["id"],
      status: ["status"],
      amount: ["amount"],
      eventId: ["id", "status"],
      merchantIdPath: "shop_id",
      // Тело подписано ключом №2 и проверяется по shop_id; отдельный
      // запрос статуса не нужен.
      trustBody: true,
    },
    statusMap: {
      NEW: "PENDING",
      PAID: "SUCCESS",
      EXPIRED: "CANCELLED",
      ERROR: "FAILED",
      // REFUNDED приходит после возврата: баланс не меняем.
      REFUNDED: "IGNORE",
    },
  },
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  CASHERA_PRESET,
  MONEE_PRESET,
  PARITYPAY_PRESET,
];