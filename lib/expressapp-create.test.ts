import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "razdevator-h2h-"));
process.env.DATA_DIR = dataDir;
process.env.PAYMENTS_PUBLIC_KEY = "";
process.env.PAYMENTS_SECRET_KEY = "";

const db = await import("./db");
const { EXPRESSAPP_PRESET } = await import("./provider-presets");
const { sealSecret } = await import("./provider-secrets");
const { NoProviderError, createGatewayInvoice, createSiteInvoice } = await import(
  "./payment-create"
);
const { setActiveProviderId } = await import("./payment-settings");
const { handleProviderWebhook } = await import("./payment-webhook");
const { parseRequisites } = await import("./payment-requisites");

const sqlite = db.getDb();
sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);
sqlite
  .prepare(`INSERT INTO "user" ("id","plan","generationsUsed","balanceRub") VALUES (?,?,?,?)`)
  .run("u-1", "free", 0, 0);

const providerId = db.createPaymentProvider({
  name: "ExpressApp",
  config: JSON.stringify({
    ...structuredClone(EXPRESSAPP_PRESET.config),
    secrets: { apiKey: sealSecret("key_test"), apiSecret: sealSecret("hook_token") },
  }),
  enabled: true,
  sortOrder: 100,
}).id;
setActiveProviderId({ service: "site" }, providerId);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let paymentCounter = 0;
/** Эмулирует ExpressApp: создание счёта и статус. */
function expressApp(statusRaw: () => string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/payment/h2h")) {
      paymentCounter += 1;
      return jsonResponse({
        status: "success",
        data: {
          payment_id: `ea-${paymentCounter}`,
          type: "qr-code",
          bank: "Т-Банк",
          credentials: PNG,
          account_owner_name: "Пётр П.",
          need_to_pay: "1000.00",
          comment: "",
          client_order_id: JSON.parse(String(init?.body)).clientOrderId,
        },
      });
    }
    const id = new URL(url).searchParams.get("id");
    return jsonResponse({
      payment_id: id,
      amount: "1000.00",
      paid_amount: statusRaw() === "PAID" ? "1000.00" : "0",
      currency: "rub",
      status: statusRaw(),
    });
  }) as typeof fetch;
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку уберёт ОС
  }
});

const project = {
  id: "kazik",
  description: "Пополнение баланса Kazik",
  secret: "gw_secret",
  callbackUrl: "https://kazik.example/webhook",
  callbackSecret: "cb_secret",
  returnOrigins: ["https://kazik.example"],
};

function gatewayInput(externalId: string, h2h?: boolean) {
  return {
    project,
    externalId,
    externalUserId: "user-1",
    purpose: "deposit",
    method: "sbp",
    amountRub: 1000,
    returnUrl: "https://kazik.example/",
    buyerIp: null,
    siteUrl: "https://site.example",
    h2h,
  };
}

test("шлюз без h2h: H2H-провайдер пропускается, счёт не создаётся", async () => {
  setActiveProviderId({ service: "project", projectId: "kazik" }, providerId);
  let calls = 0;
  await assert.rejects(
    () =>
      createGatewayInvoice(gatewayInput("order-skip"), {
        fetch: (async () => {
          calls += 1;
          return jsonResponse({});
        }) as typeof fetch,
      }),
    (error) => error instanceof NoProviderError,
  );
  assert.equal(calls, 0, "провайдеру не должно уходить ни одного запроса");
});

test("шлюз с h2h: реквизиты сохраняются, paymentUrl — наша страница", async () => {
  const result = await createGatewayInvoice(gatewayInput("order-h2h", true), {
    fetch: expressApp(() => "NEW"),
  });

  assert.equal(result.providerId, providerId);
  assert.equal(result.payment.status, "PENDING");
  assert.equal(result.redirectUrl, `https://site.example/pay/${result.payment.id}`);
  assert.equal(result.requisites?.kind, "image");
  assert.equal(result.requisites?.payAmount, "1000.00");

  const stored = db.getGatewayPayment(result.payment.id);
  assert.equal(parseRequisites(stored?.requisites)?.value, PNG);
});

test("сайт: реквизиты в ответе, вебхук с Bearer зачисляет ровно один раз", async () => {
  const site = await createSiteInvoice(
    {
      userId: "u-1",
      amountRub: 1000,
      creditRub: 1000,
      packId: null,
      buyerIp: null,
      siteUrl: "https://site.example",
    },
    { fetch: expressApp(() => "NEW") },
  );
  assert.equal(site.redirectUrl, `https://site.example/pay/${site.payment.id}`);
  assert.equal(site.requisites?.method, "qr-code");
  assert.equal(parseRequisites(db.getPayment(site.payment.id)?.requisites)?.bank, "Т-Банк");

  const hook = (token: string) =>
    new Request(`https://site.example/api/payments/webhook/${providerId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        payment_id: site.payment.providerUuid,
        status: "SUCCESS",
        amount: "1000.00",
      }),
    });

  const denied = await handleProviderWebhook(providerId, hook("wrong"), {
    fetch: expressApp(() => "PAID"),
  });
  assert.equal(denied.status, 401);
  assert.equal(db.getPayment(site.payment.id)?.status, "PENDING");

  const ok = await handleProviderWebhook(providerId, hook("hook_token"), {
    fetch: expressApp(() => "PAID"),
  });
  assert.equal(ok.status, 200);
  assert.equal(db.getPayment(site.payment.id)?.status, "SUCCESS");

  // Повтор вебхука баланс не удваивает.
  await handleProviderWebhook(providerId, hook("hook_token"), {
    fetch: expressApp(() => "PAID"),
  });
  const user = sqlite.prepare(`SELECT "balanceRub" FROM "user" WHERE "id" = 'u-1'`).get() as {
    balanceRub: number;
  };
  assert.equal(user.balanceRub, 1000);
});
