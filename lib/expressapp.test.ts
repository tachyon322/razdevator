import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPRESSAPP_PRESET } from "./provider-presets";
import {
  getAdapter,
  validateHttpProviderConfig,
  type HttpProviderConfig,
  type ProviderInvoiceInput,
  type ResolvedProvider,
} from "./payment-provider";
import { classifyCredentials, parseRequisites } from "./payment-requisites";

const SECRETS = { apiKey: "key_test", apiSecret: "hook_token" };
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Вариант «реквизиты в ответе» (QR/номер вместо ссылки) — поддерживается движком, но не пресетом. */
const REQUISITES_RESPONSE = {
  uuid: ["data.payment_id"],
  status: ["data.status"],
  requisites: {
    credentials: ["data.credentials"],
    type: ["data.type"],
    bank: ["data.bank"],
    owner: ["data.account_owner_name"],
    payAmount: ["data.need_to_pay"],
    comment: ["data.comment"],
  },
};

function requisitesConfig(): HttpProviderConfig {
  return config((raw) => {
    raw.response = structuredClone(REQUISITES_RESPONSE);
    ((raw.create as Record<string, unknown>).body as Record<string, unknown>).method = "qr-code";
  });
}

function config(mutate?: (raw: Record<string, unknown>) => void): HttpProviderConfig {
  const raw = structuredClone(EXPRESSAPP_PRESET.config) as unknown as Record<string, unknown>;
  mutate?.(raw);
  const result = validateHttpProviderConfig({ ...raw, secrets: SECRETS });
  if ("errors" in result) throw new Error(JSON.stringify(result.errors));
  return result.config;
}

function provider(cfg: HttpProviderConfig): ResolvedProvider {
  return {
    id: "expressapp",
    name: "ExpressApp",
    kind: "http",
    source: "db",
    enabled: true,
    configured: true,
    sortOrder: 100,
    config: cfg,
  };
}

const INVOICE: ProviderInvoiceInput = {
  amountRub: 499,
  description: "Пополнение баланса",
  externalId: "pay-1",
  callbackUrl: "https://site.example/api/payments/webhook/expressapp",
  successUrl: "https://site.example/pay/pay-1",
  failUrl: "https://site.example/pay/pay-1",
  buyerIp: "1.2.3.4",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREATED = {
  status: "success",
  data: {
    payment_id: "7f1c0d52-0000-4000-8000-000000000001",
    type: "qr-code",
    bank: "Сбербанк",
    credentials: PNG,
    account_owner_name: "Иван И.",
    need_to_pay: "499.00",
    comment: "",
    client_order_id: "pay-1",
  },
  error: null,
  message: null,
};

test("ExpressApp: пресет валиден, оплата — редирект на ссылку из credentials", () => {
  const cfg = config();
  assert.equal(cfg.baseUrl, "https://api.expressapp.info");
  assert.deepEqual(cfg.response.redirectUrl, ["data.credentials"]);
  assert.equal(cfg.response.requisites, undefined);
  assert.equal(cfg.webhook.trustBody, false);

  // Без реквизитов и без ссылки конфиг бессмысленен.
  const result = validateHttpProviderConfig({
    ...structuredClone(EXPRESSAPP_PRESET.config),
    response: { uuid: ["data.payment_id"] },
    secrets: SECRETS,
  });
  assert.ok("errors" in result);
});

const NSPK_LINK = "https://qr.nspk.ru/AS1A0012345678901234567890123456?type=01&bank=100000000111&sum=49900&cur=RUB";

test("ExpressApp: создание счёта — ссылка НСПК из credentials становится redirectUrl", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(provider(config()), {
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        ...CREATED,
        data: { ...CREATED.data, type: "nspk", credentials: NSPK_LINK },
      });
    }) as typeof fetch,
  });

  const invoice = await adapter.createInvoice(INVOICE);

  assert.equal(calls[0].url, "https://api.expressapp.info/v1/payment/h2h");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer key_test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    amount: "499.00",
    currency: "rub",
    method: "nspk",
    clientOrderId: "pay-1",
    webhook: "https://site.example/api/payments/webhook/expressapp",
  });
  assert.equal(invoice.providerUuid, CREATED.data.payment_id);
  assert.equal(invoice.redirectUrl, NSPK_LINK);
  assert.equal(invoice.requisites, null);
  assert.equal(invoice.amount, "49900");

  // Не ссылка (QR-картинка, номер карты) редиректом быть не может.
  const notLink = getAdapter(provider(config()), {
    fetch: (async () => jsonResponse(CREATED)) as typeof fetch,
  });
  await assert.rejects(() => notLink.createInvoice(INVOICE), /некорректная ссылка/);
});

test("ExpressApp (вариант с реквизитами): создание счёта — запрос и разбор реквизитов", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = getAdapter(provider(requisitesConfig()), {
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(CREATED);
    }) as typeof fetch,
  });

  const invoice = await adapter.createInvoice(INVOICE);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.expressapp.info/v1/payment/h2h");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer key_test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    amount: "499.00",
    currency: "rub",
    method: "qr-code",
    clientOrderId: "pay-1",
    webhook: "https://site.example/api/payments/webhook/expressapp",
  });

  assert.equal(invoice.providerUuid, CREATED.data.payment_id);
  assert.equal(invoice.redirectUrl, "");
  assert.equal(invoice.status, "PENDING");
  assert.equal(invoice.amount, "49900");
  assert.deepEqual(invoice.requisites, {
    method: "qr-code",
    kind: "image",
    value: PNG,
    bank: "Сбербанк",
    owner: "Иван И.",
    payAmount: "499.00",
  });
});

test("ExpressApp: ошибка в теле 200 попадает в сообщение, реквизиты обязательны", async () => {
  const failing = getAdapter(provider(requisitesConfig()), {
    fetch: (async () =>
      jsonResponse({ status: "error", data: null, message: "Нет доступных реквизитов" })) as typeof fetch,
  });
  await assert.rejects(
    () => failing.createInvoice(INVOICE),
    /Нет доступных реквизитов/,
  );

  const noCredentials = getAdapter(provider(requisitesConfig()), {
    fetch: (async () =>
      jsonResponse({ status: "success", data: { payment_id: "p-1", credentials: "" } })) as typeof fetch,
  });
  await assert.rejects(() => noCredentials.createInvoice(INVOICE), /нет корректных реквизитов/);
});

test("реквизиты: безопасные виды и отказ от опасных значений", () => {
  assert.equal(classifyCredentials(PNG)?.kind, "image");
  assert.equal(classifyCredentials("data:image/svg+xml;base64,PHN2Zz4=")?.kind, undefined);
  assert.equal(classifyCredentials("data:text/html;base64,PGgxPg==")?.kind, undefined);
  assert.equal(classifyCredentials("https://qr.nspk.ru/abc")?.kind, "link");
  assert.equal(classifyCredentials("2200 7007 1234 5678")?.kind, "text");
  assert.equal(classifyCredentials("   "), null);
  // Битое значение из БД не ломает страницу.
  assert.equal(parseRequisites("{не json"), null);
  assert.equal(parseRequisites(null), null);
});

test("ExpressApp: вебхук — Bearer-токен и перечитывание статуса", () => {
  const adapter = getAdapter(provider(config()), {});
  const body = JSON.stringify({ payment_id: "p-1", status: "SUCCESS", amount: "499.00" });

  assert.equal(adapter.verifyWebhook(new Headers({ authorization: "Bearer hook_token" }), body), true);
  assert.equal(adapter.verifyWebhook(new Headers({ authorization: "bearer hook_token" }), body), true);
  assert.equal(adapter.verifyWebhook(new Headers({ authorization: "Bearer wrong" }), body), false);
  assert.equal(adapter.verifyWebhook(new Headers({ authorization: "hook_token" }), body), false);
  assert.equal(adapter.verifyWebhook(new Headers(), body), false);

  const parsed = adapter.parseWebhook(body);
  assert.equal(parsed.providerUuid, "p-1");
  assert.equal(parsed.status, "SUCCESS");
  // Сумму из вебхука не сверяем: статус и сумму перечитываем из API.
  assert.equal(parsed.amount, undefined);
  assert.equal(adapter.trustBody, false);
});

test("ExpressApp: статус — плоский ответ, суммы в копейки, CONFIRMED не оплата", async () => {
  const answers: Record<string, unknown> = {
    PAID: { payment_id: "p-1", amount: "499.00", paid_amount: "499.00", currency: "rub", status: "PAID" },
    CONFIRMED: { payment_id: "p-1", amount: "499.00", paid_amount: "0", currency: "rub", status: "CONFIRMED" },
    EXPIRED: { payment_id: "p-1", amount: "499.00", paid_amount: "0", currency: "rub", status: "EXPIRED" },
  };
  for (const [raw, expected] of [
    ["PAID", "SUCCESS"],
    ["CONFIRMED", "PENDING"],
    ["EXPIRED", "CANCELLED"],
  ] as const) {
    let requested = "";
    const adapter = getAdapter(provider(config()), {
      fetch: (async (url: RequestInfo | URL) => {
        requested = String(url);
        return jsonResponse(answers[raw]);
      }) as typeof fetch,
    });
    const status = await adapter.fetchStatus("p-1");
    assert.equal(requested, "https://api.expressapp.info/v1/payment/status?id=p-1");
    assert.equal(status.status, expected);
    assert.equal(status.rawStatus, raw);
    assert.equal(status.amount, "49900");
    assert.equal(status.currency, "RUB");
  }
});
