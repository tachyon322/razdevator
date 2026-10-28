import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { CASHERA_PRESET, MONEE_PRESET, PARITYPAY_PRESET } from "./provider-presets";
import {
  NSPK_PAYMENT_METHOD,
  getAdapter,
  getJsonPath,
  normalizeRedirectUrl,
  validateHttpProviderConfig,
  type HttpProviderConfig,
  type ProviderInvoiceInput,
  type ResolvedProvider,
} from "./payment-provider";

const SECRETS = { apiKey: "pk_test", apiSecret: "sk_test" };

function rawPreset(): Record<string, unknown> {
  return structuredClone(CASHERA_PRESET.config) as unknown as Record<string, unknown>;
}

function casheraConfig(overrides: Record<string, unknown> = {}): HttpProviderConfig {
  const result = validateHttpProviderConfig({
    ...rawPreset(),
    ...overrides,
    secrets: SECRETS,
  });
  if ("errors" in result) {
    throw new Error(`Невалидный тестовый конфиг: ${JSON.stringify(result.errors)}`);
  }
  return result.config;
}

function provider(config: HttpProviderConfig, id = "cashera"): ResolvedProvider {
  return {
    id,
    name: "Cashera",
    kind: "http",
    source: "db",
    enabled: true,
    configured: true,
    sortOrder: 100,
    config,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INVOICE: ProviderInvoiceInput = {
  amountRub: 499,
  description: "Пополнение баланса",
  externalId: "pay-1",
  callbackUrl: "https://site.example/api/payments/webhook/cashera",
  successUrl: "https://site.example/pay/pay-1",
  failUrl: "https://site.example/pay/pay-1",
  buyerIp: "1.2.3.4",
};

test("getJsonPath: вложенные объекты и массивы", () => {
  const value = { data: { items: [{ uuid: "u-1" }], status: "paid" } };
  assert.equal(getJsonPath(value, "data.status"), "paid");
  assert.equal(getJsonPath(value, "data.items.0.uuid"), "u-1");
  assert.equal(getJsonPath(value, "data.missing"), undefined);
  assert.equal(getJsonPath(value, "data.items.5.uuid"), undefined);
  assert.equal(getJsonPath(null, "a.b"), undefined);
});

test("валидация Cashera-пресета проходит, метод — NSPK", () => {
  const config = casheraConfig();
  assert.equal(config.baseUrl, "https://api.cashera.cash/api/v1");
  assert.equal(config.amountMultiplier, 100);
  assert.equal(config.statusMap.paid, "SUCCESS");
  assert.equal(config.statusMap.refunded, "IGNORE");
  assert.equal(NSPK_PAYMENT_METHOD, "sbp");
});

test("валидация отклоняет пустые секреты, http и неизвестные подстановки", () => {
  const base = rawPreset();

  const noSecrets = validateHttpProviderConfig({
    ...base,
    secrets: { apiKey: "", apiSecret: "" },
  });
  assert.ok("errors" in noSecrets);

  const http = validateHttpProviderConfig({
    ...base,
    baseUrl: "http://localhost:1234",
    secrets: SECRETS,
  });
  assert.ok("errors" in http);

  const unknown = rawPreset();
  (unknown.create as Record<string, unknown>).body = {
    ...((unknown.create as Record<string, unknown>).body as Record<string, unknown>),
    bad: "{{nope}}",
  };
  const unknownResult = validateHttpProviderConfig({ ...unknown, secrets: SECRETS });
  assert.ok("errors" in unknownResult);

  const uuid = rawPreset();
  (uuid.create as Record<string, unknown>).body = {
    ...((uuid.create as Record<string, unknown>).body as Record<string, unknown>),
    uuid: "{{uuid}}",
  };
  const uuidResult = validateHttpProviderConfig({ ...uuid, secrets: SECRETS });
  assert.ok("errors" in uuidResult);

  const noRedirect = rawPreset();
  (noRedirect.response as Record<string, unknown>).redirectUrl = [];
  const noRedirectResult = validateHttpProviderConfig({
    ...noRedirect,
    secrets: SECRETS,
  });
  assert.ok("errors" in noRedirectResult);
});

test("http разрешён только при PAYMENT_PROVIDER_ALLOW_HTTP=1", () => {
  process.env.PAYMENT_PROVIDER_ALLOW_HTTP = "1";
  try {
    const result = validateHttpProviderConfig({
      ...rawPreset(),
      baseUrl: "http://localhost:1234",
      secrets: SECRETS,
    });
    assert.ok("config" in result);
  } finally {
    delete process.env.PAYMENT_PROVIDER_ALLOW_HTTP;
  }
});

test("normalizeRedirectUrl: абсолютные, host-only и относительные ссылки", () => {
  const base = "https://api.cashera.cash/api/v1";
  assert.equal(
    normalizeRedirectUrl("https://pay.cashera.cash/abc", base),
    "https://pay.cashera.cash/abc",
  );
  assert.equal(
    normalizeRedirectUrl("pay.cashera.cash/abc", base),
    "https://pay.cashera.cash/abc",
  );
  assert.equal(
    normalizeRedirectUrl("//pay.cashera.cash/abc", base),
    "https://pay.cashera.cash/abc",
  );
  assert.equal(
    normalizeRedirectUrl("/checkout/abc", base),
    "https://api.cashera.cash/checkout/abc",
  );
});

test("createInvoice: payment_url без схемы становится absolute", async () => {
  const adapter = getAdapter(provider(casheraConfig()), {
    fetch: async () =>
      jsonResponse(
        {
          uuid: "u-scheme",
          status: "pending",
          payment_url: "pay.cashera.cash/9b1f2c4e",
        },
        201,
      ),
  });
  const invoice = await adapter.createInvoice(INVOICE);
  assert.equal(invoice.redirectUrl, "https://pay.cashera.cash/9b1f2c4e");
});

test("createInvoice: Cashera получает NSPK-тело и корректные заголовки", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(provider(casheraConfig()), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(
        { uuid: "u-1", status: "pending", payment_url: "https://pay.example/1" },
        201,
      );
    },
  });

  const invoice = await adapter.createInvoice(INVOICE);
  assert.equal(invoice.providerUuid, "u-1");
  assert.equal(invoice.redirectUrl, "https://pay.example/1");
  assert.equal(invoice.status, "PENDING");
  assert.equal(invoice.rawStatus, "pending");
  assert.equal(invoice.amount, "49900");

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.cashera.cash/api/v1/integration/transactions",
  );
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Api-Key"], "pk_test");
  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.equal(body.amount, 49900);
  assert.equal(body.currency, "RUB");
  assert.equal(body.payment_method, "sbp");
  assert.equal(body.external_id, "pay-1");
  assert.equal(body.callback_url, INVOICE.callbackUrl);
  assert.equal(body.success_url, INVOICE.successUrl);
  assert.equal(body.fail_url, INVOICE.failUrl);
});

test("createInvoice: 5xx повторяется с тем же external_id", async () => {
  let calls = 0;
  const adapter = getAdapter(provider(casheraConfig()), {
    sleep: async () => {},
    fetch: async () => {
      calls++;
      if (calls === 1) return new Response("boom", { status: 502 });
      return jsonResponse(
        { uuid: "u-retry", status: "pending", payment_url: "https://pay.example/retry" },
        201,
      );
    },
  });
  const invoice = await adapter.createInvoice(INVOICE);
  assert.equal(invoice.providerUuid, "u-retry");
  assert.equal(calls, 2);
});

test("createInvoice: ошибка провайдера не маскируется", async () => {
  const adapter = getAdapter(provider(casheraConfig()), {
    sleep: async () => {},
    fetch: async () =>
      jsonResponse({ message: "bad key sk_test" }, 401),
  });
  await assert.rejects(() => adapter.createInvoice(INVOICE), /HTTP 401/);
});

test("fetchStatus: paid → SUCCESS, сумма и валюта сохраняются", async () => {
  const adapter = getAdapter(provider(casheraConfig()), {
    fetch: async () =>
      jsonResponse({
        uuid: "u-1",
        status: "paid",
        amount: 49900,
        currency: "RUB",
      }),
  });
  const status = await adapter.fetchStatus("u-1");
  assert.equal(status.status, "SUCCESS");
  assert.equal(status.rawStatus, "paid");
  assert.equal(status.amount, "49900");
  assert.equal(status.currency, "RUB");
});

test("вебхук Cashera: заголовки проверяются, событие разбирается", () => {
  const adapter = getAdapter(provider(casheraConfig()));
  const body = JSON.stringify({
    event: "transaction.status_updated",
    transaction: {
      uuid: "u-1",
      status: "paid",
      amount: 49900,
      currency: "RUB",
    },
  });

  assert.equal(
    adapter.verifyWebhook(
      new Headers({ "x-api-key": "pk_test", "x-secret": "sk_test" }),
      body,
    ),
    true,
  );
  assert.equal(
    adapter.verifyWebhook(
      new Headers({ "x-api-key": "pk_test", "x-secret": "wrong" }),
      body,
    ),
    false,
  );
  assert.equal(adapter.verifyWebhook(new Headers(), body), false);

  const parsed = adapter.parseWebhook(body);
  assert.equal(parsed.eventId, "u-1:paid");
  assert.equal(parsed.providerUuid, "u-1");
  assert.equal(parsed.status, "SUCCESS");
  assert.equal(parsed.amount, "49900");
  assert.equal(parsed.currency, "RUB");
});

test("вебхук Cashera: служебные события игнорируются, платёжные — нет", () => {
  const adapter = getAdapter(provider(casheraConfig()));
  assert.equal(
    adapter.isIgnorableWebhook(
      JSON.stringify({ event: "webhook.test", test: { sent_at: "now" } }),
    ),
    true,
  );
  assert.equal(
    adapter.isIgnorableWebhook(
      JSON.stringify({ event: "payout.status_updated", payout: { uuid: "p" } }),
    ),
    true,
  );
  assert.equal(
    adapter.isIgnorableWebhook(
      JSON.stringify({
        event: "transaction.status_updated",
        transaction: { uuid: "u-1", status: "paid" },
      }),
    ),
    false,
  );
  assert.equal(adapter.isIgnorableWebhook("{"), false);
});

test("вебхук с HMAC-подписью проверяется по сырому телу", () => {
  const base = casheraConfig();
  const config = casheraConfig({
    webhook: {
      ...base.webhook,
      verify: {
        type: "hmac-sha256",
        header: "x-signature",
        secret: "apiSecret",
        encodings: ["hex"],
      },
    },
  });
  const adapter = getAdapter(provider(config));
  const body = JSON.stringify({ transaction: { uuid: "u-1", status: "paid" } });
  const signature = createHmac("sha256", "sk_test").update(body).digest("hex");

  assert.equal(
    adapter.verifyWebhook(new Headers({ "x-signature": signature }), body),
    true,
  );
  assert.equal(
    adapter.verifyWebhook(new Headers({ "x-signature": "00" }), body),
    false,
  );
});

test("встроенная Exenta: parseWebhook и verifyWebhook", () => {
  process.env.PAYMENTS_WEBHOOK_SECRET = "whsec_test";
  try {
    const exenta: ResolvedProvider = {
      id: "exenta",
      name: "Exenta Pay",
      kind: "exenta",
      source: "env",
      enabled: true,
      configured: true,
      sortOrder: 0,
      config: null,
    };
    const adapter = getAdapter(exenta);
    assert.equal(adapter.trustBody, false);

    const body = JSON.stringify({
      success: true,
      data: { paymentUuid: "u-ex", status: "SUCCESS", amount: "100000" },
    });
    const signature = createHmac("sha256", "whsec_test").update(body).digest("hex");
    assert.equal(
      adapter.verifyWebhook(new Headers({ "x-webhook-signature": signature }), body),
      true,
    );

    const parsed = adapter.parseWebhook(body);
    assert.equal(parsed.eventId, "u-ex:SUCCESS");
    assert.equal(parsed.status, "SUCCESS");
    assert.equal(parsed.currency, "RUB");
  } finally {
    delete process.env.PAYMENTS_WEBHOOK_SECRET;
  }
});

// --- Monee: подпись исходящих запросов и вебхука ---

function moneeConfig(
  merchantId = "shop-uuid-1",
  retries = 0,
): HttpProviderConfig {
  const result = validateHttpProviderConfig({
    ...structuredClone(MONEE_PRESET.config),
    merchantId,
    retries,
    secrets: { apiKey: "", apiSecret: "monee_secret" },
  });
  if ("errors" in result) {
    throw new Error(`Невалидный Monee-конфиг: ${JSON.stringify(result.errors)}`);
  }
  return result.config;
}

function moneeProvider(config: HttpProviderConfig): ResolvedProvider {
  return {
    id: "monee",
    name: "Monee",
    kind: "http",
    source: "db",
    enabled: true,
    configured: true,
    sortOrder: 100,
    config,
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("Monee: пресет требует merchantId и секрет, публичный ключ не нужен", () => {
  const config = moneeConfig();
  assert.equal(config.merchantId, "shop-uuid-1");
  assert.equal(config.retries, 0);
  assert.equal(config.signing?.header, "X-Sign");
  assert.equal(config.secrets.apiKey, "");

  const noMerchant = validateHttpProviderConfig({
    ...structuredClone(MONEE_PRESET.config),
    merchantId: "",
    secrets: { apiKey: "", apiSecret: "monee_secret" },
  });
  assert.ok("errors" in noMerchant);
  assert.ok(noMerchant.errors.merchantId);

  const noSecret = validateHttpProviderConfig({
    ...structuredClone(MONEE_PRESET.config),
    merchantId: "shop-uuid-1",
    secrets: { apiKey: "", apiSecret: "" },
  });
  assert.ok("errors" in noSecret);
  assert.ok(noSecret.errors["secrets.apiSecret"]);
});

test("Monee: create подписывает тело X-Sign и отправляет NSPK", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(moneeProvider(moneeConfig()), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(
        {
          status: "success",
          data: {
            uuid: "m-order",
            status: "WAITING",
            amount: 49900,
            url: "https://pay.monee.pro/m-order",
          },
        },
        201,
      );
    },
  });

  const invoice = await adapter.createInvoice(INVOICE);
  assert.equal(invoice.providerUuid, "m-order");
  assert.equal(invoice.redirectUrl, "https://pay.monee.pro/m-order");
  assert.equal(invoice.status, "PENDING");
  assert.equal(invoice.rawStatus, "WAITING");

  assert.equal(calls[0].url, "https://api.monee.pro/v2/order/create");
  const bodyText = String(calls[0].init.body);
  const body = JSON.parse(bodyText) as Record<string, unknown>;
  assert.equal(body.shop_to, "shop-uuid-1");
  assert.equal(body.amount, 49900);
  assert.equal(body.method, "sbp");
  assert.equal(body.comment, INVOICE.description);
  assert.equal(body.hook_url, INVOICE.callbackUrl);
  assert.equal(body.success_url, INVOICE.successUrl);
  assert.deepEqual(body.custom_fields, { payment_id: INVOICE.externalId });

  // Ключи верхнего уровня отсортированы, подпись — sha256(тело + секрет).
  assert.deepEqual(Object.keys(body), [...Object.keys(body)].sort());
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Sign"], sha256Hex(`${bodyText}monee_secret`));
});

test("Monee: статус подписывает /order/info и разбирает PAID", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(moneeProvider(moneeConfig()), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        status: "success",
        data: {
          status: "PAID",
          order_uuid: "m-order",
          amount: 49900,
          payment_url: "https://pay.monee.pro/m-order",
        },
      });
    },
  });

  const status = await adapter.fetchStatus("m-order");
  assert.equal(status.status, "SUCCESS");
  assert.equal(status.rawStatus, "PAID");
  assert.equal(status.amount, "49900");
  assert.equal(status.currency, "RUB");

  assert.equal(calls[0].url, "https://api.monee.pro/v2/order/info");
  const bodyText = String(calls[0].init.body);
  assert.deepEqual(JSON.parse(bodyText), {
    shop_uuid: "shop-uuid-1",
    order_uuid: "m-order",
  });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Sign"], sha256Hex(`${bodyText}monee_secret`));
});

test("Monee: вебхук проверяет signature и shop_id", () => {
  const adapter = getAdapter(moneeProvider(moneeConfig()));
  assert.equal(adapter.trustBody, false);

  const payload = {
    status: "success",
    invoice_id: "m-order",
    shop_id: "shop-uuid-1",
    amount: 499,
    custom_fields: { payment_id: "pay-1" },
  };
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.keys(payload)
        .sort()
        .map((key) => [key, payload[key as keyof typeof payload]]),
    ),
  );
  const signature = sha256Hex(`${canonical}monee_secret`);
  const rawBody = JSON.stringify({ ...payload, signature });

  assert.equal(adapter.verifyWebhook(new Headers(), rawBody), true);

  const parsed = adapter.parseWebhook(rawBody);
  assert.equal(parsed.eventId, "m-order:success");
  assert.equal(parsed.providerUuid, "m-order");
  assert.equal(parsed.status, "SUCCESS");

  const wrongPayload = { ...payload, shop_id: "other-shop" };
  const wrongCanonical = JSON.stringify(
    Object.fromEntries(
      Object.keys(wrongPayload)
        .sort()
        .map((key) => [key, wrongPayload[key as keyof typeof wrongPayload]]),
    ),
  );
  const wrongRaw = JSON.stringify({
    ...wrongPayload,
    signature: sha256Hex(`${wrongCanonical}monee_secret`),
  });
  assert.equal(adapter.verifyWebhook(new Headers(), wrongRaw), false);
  assert.equal(
    adapter.verifyWebhook(new Headers(), rawBody.replace("success", "failed")),
    false,
  );
});

test("Monee: retries=0 не повторяет create при 5xx", async () => {
  let calls = 0;
  const adapter = getAdapter(moneeProvider(moneeConfig("shop-uuid-1", 0)), {
    sleep: async () => {},
    fetch: async () => {
      calls++;
      return new Response("down", { status: 500 });
    },
  });
  await assert.rejects(() => adapter.createInvoice(INVOICE), /HTTP 500/);
  assert.equal(calls, 1);
});

// --- ParityPay: decimal-рубли и подпись вебхука по значениям полей ---

const PARITYPAY_SECRETS = { apiKey: "pp_secret_1", apiSecret: "pp_secret_2" };

function parityPayConfig(overrides: Record<string, unknown> = {}): HttpProviderConfig {
  const result = validateHttpProviderConfig({
    ...structuredClone(PARITYPAY_PRESET.config),
    merchantId: "shop-uuid-1",
    ...overrides,
    secrets: PARITYPAY_SECRETS,
  });
  if ("errors" in result) {
    throw new Error(`Невалидный ParityPay-конфиг: ${JSON.stringify(result.errors)}`);
  }
  return result.config;
}

function parityPayProvider(config: HttpProviderConfig): ResolvedProvider {
  return {
    id: "paritypay",
    name: "ParityPay",
    kind: "http",
    source: "db",
    enabled: true,
    configured: true,
    sortOrder: 100,
    config,
  };
}

function parityPaySignature(
  payload: Record<string, unknown>,
  secret = PARITYPAY_SECRETS.apiSecret,
): string {
  const canonical = Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      if (value === null || value === undefined) return "";
      return typeof value === "string" ? value : String(value);
    })
    .join("");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

test("ParityPay: пресет требует merchantId и оба секрета, суммы в рублях", () => {
  const config = parityPayConfig();
  assert.equal(config.baseUrl, "https://api.paritypay.net");
  assert.equal(config.amountMultiplier, 1);
  assert.equal(config.merchantId, "shop-uuid-1");
  assert.equal(config.retries, 0);
  assert.equal(config.secrets.apiKey, "pp_secret_1");
  assert.equal(config.webhook.verify.type, "hmac-sha256-sorted-values");

  const noMerchant = validateHttpProviderConfig({
    ...structuredClone(PARITYPAY_PRESET.config),
    secrets: PARITYPAY_SECRETS,
  });
  assert.ok("errors" in noMerchant);
  assert.ok(noMerchant.errors.merchantId);

  const noKey = validateHttpProviderConfig({
    ...structuredClone(PARITYPAY_PRESET.config),
    merchantId: "shop-uuid-1",
    secrets: { apiKey: "", apiSecret: "pp_secret_2" },
  });
  assert.ok("errors" in noKey);
  assert.ok(noKey.errors["secrets.apiKey"]);

  const noWebhookSecret = validateHttpProviderConfig({
    ...structuredClone(PARITYPAY_PRESET.config),
    merchantId: "shop-uuid-1",
    secrets: { apiKey: "pp_secret_1", apiSecret: "" },
  });
  assert.ok("errors" in noWebhookSecret);
  assert.ok(noWebhookSecret.errors["secrets.apiSecret"]);
});

test("ParityPay: create шлёт заголовки кассы и сумму decimal-рублями", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(parityPayProvider(parityPayConfig()), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        id: "pp-1",
        order_id: "pay-1",
        shop_id: "shop-uuid-1",
        amount: 499,
        status: "NEW",
        link: "https://pay.paritypay.net/pp-1",
      });
    },
  });

  const invoice = await adapter.createInvoice(INVOICE);
  assert.equal(invoice.providerUuid, "pp-1");
  assert.equal(invoice.redirectUrl, "https://pay.paritypay.net/pp-1");
  assert.equal(invoice.status, "PENDING");
  assert.equal(invoice.rawStatus, "NEW");
  assert.equal(invoice.amount, "49900");

  assert.equal(calls[0].url, "https://api.paritypay.net/v2/invoice/create");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-ShopId"], "shop-uuid-1");
  assert.equal(headers["X-SecretKey"], "pp_secret_1");
  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.equal(body.order_id, "pay-1");
  assert.equal(body.amount, 499);
  assert.equal(body.service, "sbp");
  assert.equal(body.comment, INVOICE.description);
  assert.equal(body.expire, 60);
  assert.equal(body.callback_url, INVOICE.callbackUrl);
});

test("ParityPay: create сохраняет копейки для дробной суммы", async () => {
  const calls: RequestInit[] = [];
  const adapter = getAdapter(parityPayProvider(parityPayConfig()), {
    fetch: async (_url, init) => {
      calls.push(init ?? {});
      return jsonResponse({
        id: "pp-2",
        status: "NEW",
        link: "https://pay.paritypay.net/pp-2",
      });
    },
  });
  const invoice = await adapter.createInvoice({ ...INVOICE, amountRub: 1500.5 });
  assert.equal(invoice.amount, "150050");
  const body = JSON.parse(String(calls[0].body)) as Record<string, unknown>;
  assert.equal(body.amount, 1500.5);
});

test("ParityPay: статус запрашивается по id и рубли нормализуются в копейки", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(parityPayProvider(parityPayConfig()), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        id: "pp-1",
        status: "PAID",
        amount: 499,
        shop_id: "shop-uuid-1",
      });
    },
  });

  const status = await adapter.fetchStatus("pp-1");
  assert.equal(status.status, "SUCCESS");
  assert.equal(status.rawStatus, "PAID");
  assert.equal(status.amount, "49900");
  assert.equal(status.currency, "RUB");

  assert.equal(
    calls[0].url,
    "https://api.paritypay.net/v2/invoice/status?id=pp-1",
  );
  assert.equal(calls[0].init.method, "GET");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-ShopId"], "shop-uuid-1");
  assert.equal(headers["X-SecretKey"], "pp_secret_1");
});

test("ParityPay: вебхук проверяется HMAC по значениям полей и shop_id", () => {
  const adapter = getAdapter(parityPayProvider(parityPayConfig()));
  const payload = {
    id: "pp-1",
    order_id: "pay-1",
    shop_id: "shop-uuid-1",
    amount: "499.00",
    credited: 483.53,
    comment: null,
    service: "sbp",
    status: "PAID",
  };
  const rawBody = JSON.stringify(payload);
  const signature = parityPaySignature(payload);

  assert.equal(
    adapter.verifyWebhook(new Headers({ "X-SIGNATURE": signature }), rawBody),
    true,
  );
  assert.equal(
    adapter.verifyWebhook(new Headers({ "x-signature": signature }), rawBody),
    true,
  );
  assert.equal(
    adapter.verifyWebhook(new Headers({ "X-SIGNATURE": "00" }), rawBody),
    false,
  );

  const wrongShop = { ...payload, shop_id: "other-shop" };
  assert.equal(
    adapter.verifyWebhook(
      new Headers({ "X-SIGNATURE": parityPaySignature(wrongShop) }),
      JSON.stringify(wrongShop),
    ),
    false,
  );

  assert.equal(adapter.trustBody, true);
  const parsed = adapter.parseWebhook(rawBody);
  assert.equal(parsed.eventId, "pp-1:PAID");
  assert.equal(parsed.providerUuid, "pp-1");
  assert.equal(parsed.status, "SUCCESS");
  assert.equal(parsed.rawStatus, "PAID");
  assert.equal(parsed.amount, "49900");
});

test("ParityPay: REFUNDED игнорируется, остальные статусы мапятся", () => {
  const adapter = getAdapter(parityPayProvider(parityPayConfig()));
  const payload = {
    id: "pp-1",
    order_id: "pay-1",
    shop_id: "shop-uuid-1",
    amount: "499.00",
    status: "REFUNDED",
  };
  const rawBody = JSON.stringify(payload);
  assert.equal(
    adapter.verifyWebhook(
      new Headers({ "X-SIGNATURE": parityPaySignature(payload) }),
      rawBody,
    ),
    true,
  );
  const parsed = adapter.parseWebhook(rawBody);
  assert.equal(parsed.status, "IGNORE");
  assert.equal(parsed.eventId, "pp-1:REFUNDED");

  const config = parityPayConfig();
  assert.equal(config.statusMap.EXPIRED, "CANCELLED");
  assert.equal(config.statusMap.ERROR, "FAILED");
  assert.equal(config.statusMap.NEW, "PENDING");
});
