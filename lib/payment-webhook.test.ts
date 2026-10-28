import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "razdevator-webhook-"));
process.env.DATA_DIR = dataDir;
process.env.PAYMENTS_PUBLIC_KEY = "";
process.env.PAYMENTS_SECRET_KEY = "";

const db = await import("./db");
const { CASHERA_PRESET, MONEE_PRESET, PARITYPAY_PRESET } = await import("./provider-presets");
const { sealSecret } = await import("./provider-secrets");
const { validateHttpProviderConfig } = await import("./payment-provider");
const { handleProviderWebhook } = await import("./payment-webhook");

const sqlite = db.getDb();
sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);
sqlite
  .prepare(
    `INSERT INTO "user" ("id","plan","generationsUsed","balanceRub") VALUES (?,?,?,?)`,
  )
  .run("u-1", "free", 0, 0);

const validated = validateHttpProviderConfig({
  ...structuredClone(CASHERA_PRESET.config),
  secrets: { apiKey: "pk_test", apiSecret: "sk_test" },
});
if ("errors" in validated) throw new Error(JSON.stringify(validated.errors));
const provider = db.createPaymentProvider({
  name: "Cashera",
  config: JSON.stringify({
    ...validated.config,
    secrets: {
      apiKey: sealSecret("pk_test"),
      apiSecret: sealSecret("sk_test"),
    },
  }),
  enabled: true,
  sortOrder: 100,
});

const moneeValidated = validateHttpProviderConfig({
  ...structuredClone(MONEE_PRESET.config),
  merchantId: "monee-shop",
  secrets: { apiKey: "", apiSecret: "monee_secret" },
});
if ("errors" in moneeValidated) {
  throw new Error(JSON.stringify(moneeValidated.errors));
}
const moneeProvider = db.createPaymentProvider({
  name: "Monee",
  config: JSON.stringify({
    ...moneeValidated.config,
    secrets: {
      apiKey: "",
      apiSecret: sealSecret("monee_secret"),
    },
  }),
  enabled: true,
  sortOrder: 100,
});

const parityPayValidated = validateHttpProviderConfig({
  ...structuredClone(PARITYPAY_PRESET.config),
  merchantId: "parity-shop",
  secrets: { apiKey: "parity_key_1", apiSecret: "parity_key_2" },
});
if ("errors" in parityPayValidated) {
  throw new Error(JSON.stringify(parityPayValidated.errors));
}
const parityPayProvider = db.createPaymentProvider({
  name: "ParityPay",
  config: JSON.stringify({
    ...parityPayValidated.config,
    secrets: {
      apiKey: sealSecret("parity_key_1"),
      apiSecret: sealSecret("parity_key_2"),
    },
  }),
  enabled: true,
  sortOrder: 100,
});

const GOOD_HEADERS = { "x-api-key": "pk_test", "x-secret": "sk_test" };

function webhookBody(
  uuid: string,
  status: string,
  amount = 100000,
  currency = "RUB",
): string {
  return JSON.stringify({
    event: "transaction.status_updated",
    transaction: { uuid, status, amount, currency },
  });
}

function post(body: string, headers: Record<string, string> = GOOD_HEADERS) {
  return handleProviderWebhook(
    provider.id,
    new Request(`https://site.example/api/payments/webhook/${provider.id}`, {
      method: "POST",
      headers,
      body,
    }),
  );
}

function balance(): number {
  return db.getUserUsage("u-1")?.balanceRub ?? 0;
}

function payment(uuid: string, status: "PENDING" | "CANCELLED" = "PENDING") {
  const created = db.createPayment({ userId: "u-1", amountRub: 1000 });
  db.attachProviderPayment(created.id, {
    providerId: provider.id,
    providerUuid: uuid,
    status,
    providerStatus: status.toLowerCase(),
  });
  return db.getPayment(created.id)!;
}

function events(paymentId: string) {
  return sqlite
    .prepare(`SELECT * FROM "payment_event" WHERE "paymentId" = ? ORDER BY "id"`)
    .all(paymentId) as { mappedStatus: string; rawStatus: string }[];
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку уберёт ОС
  }
});

test("paid: зачисление ровно один раз, повтор — 200 без начисления", async () => {
  const row = payment("u-paid");
  const body = webhookBody("u-paid", "paid");

  const first = await post(body);
  assert.equal(first.status, 200);
  const paid = db.getPayment(row.id)!;
  assert.equal(paid.status, "SUCCESS");
  assert.ok(paid.creditedAt);
  assert.equal(balance(), 1000);
  assert.equal(events(row.id).length, 1);
  assert.equal(events(row.id)[0].mappedStatus, "SUCCESS");

  const second = await post(body);
  assert.equal(second.status, 200);
  assert.equal(balance(), 1000);
  assert.equal(events(row.id).length, 1);
});

test("неверная подпись — 401, статус не меняется", async () => {
  const row = payment("u-bad-signature");
  const response = await post(webhookBody("u-bad-signature", "paid"), {
    "x-api-key": "pk_test",
    "x-secret": "wrong",
  });
  assert.equal(response.status, 401);
  assert.equal(db.getPayment(row.id)?.status, "PENDING");
  assert.equal(balance(), 1000);
});

test("сумма не совпала — 200 без начисления, событие MISMATCH", async () => {
  const row = payment("u-mismatch");
  const response = await post(webhookBody("u-mismatch", "paid", 1));
  assert.equal(response.status, 200);
  assert.equal(db.getPayment(row.id)?.status, "PENDING");
  assert.equal(balance(), 1000);
  assert.equal(events(row.id)[0].mappedStatus, "MISMATCH");
});

test("поздний paid после canceled зачисляется", async () => {
  const row = payment("u-late", "CANCELLED");
  assert.equal(db.getPayment(row.id)?.status, "CANCELLED");

  const response = await post(webhookBody("u-late", "paid"));
  assert.equal(response.status, 200);
  assert.equal(db.getPayment(row.id)?.status, "SUCCESS");
  assert.equal(balance(), 2000);
});

test("refunded после paid: баланс и статус не трогаем, событие IGNORE", async () => {
  const row = payment("u-refund");
  await post(webhookBody("u-refund", "paid"));
  assert.equal(db.getPayment(row.id)?.status, "SUCCESS");
  assert.equal(balance(), 3000);

  const response = await post(webhookBody("u-refund", "refunded"));
  assert.equal(response.status, 200);
  assert.equal(db.getPayment(row.id)?.status, "SUCCESS");
  assert.equal(balance(), 3000);
  const all = events(row.id);
  assert.equal(all.at(-1)?.mappedStatus, "IGNORE");
});

test("служебные события (webhook.test, выплаты) — 200 без записей", async () => {
  const before = sqlite
    .prepare(`SELECT COUNT(*) AS "count" FROM "payment_event"`)
    .get() as { count: number };

  const testEvent = await post(
    JSON.stringify({ event: "webhook.test", test: { sent_at: "now" } }),
  );
  assert.equal(testEvent.status, 200);

  const payoutEvent = await post(
    JSON.stringify({ event: "payout.status_updated", payout: { uuid: "p-1" } }),
  );
  assert.equal(payoutEvent.status, 200);

  const after = sqlite
    .prepare(`SELECT COUNT(*) AS "count" FROM "payment_event"`)
    .get() as { count: number };
  assert.equal(after.count, before.count);
});

test("неизвестный uuid — 200 и без записей", async () => {
  const before = sqlite
    .prepare(`SELECT COUNT(*) AS "count" FROM "payment_event"`)
    .get() as { count: number };
  const response = await post(webhookBody("u-unknown", "paid"));
  assert.equal(response.status, 200);
  const after = sqlite
    .prepare(`SELECT COUNT(*) AS "count" FROM "payment_event"`)
    .get() as { count: number };
  assert.equal(after.count, before.count);
});

test("счёт шлюза: paid помечает PAID и ставит колбэк", async () => {
  const gateway = db.createGatewayPayment({
    projectId: "kazik",
    externalId: "order-gw",
    amountRub: 1000,
    returnUrl: "https://kazik.example/",
  });
  db.attachGatewayProvider(gateway.id, {
    providerId: provider.id,
    providerUuid: "u-gw",
    redirectUrl: "https://pay.example/gw",
    status: "PENDING",
    providerStatus: "pending",
  });

  const response = await post(webhookBody("u-gw", "paid"));
  assert.equal(response.status, 200);
  const paid = db.getGatewayPayment(gateway.id)!;
  assert.equal(paid.status, "PAID");
  assert.ok(paid.paidAt);

  const callback = sqlite
    .prepare(`SELECT * FROM "gateway_outbox" WHERE "paymentId" = ?`)
    .get(gateway.id) as { payload: string } | undefined;
  assert.ok(callback);
  assert.equal((JSON.parse(callback.payload) as { status: string }).status, "PAID");
});

function moneeSignature(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.keys(payload)
        .sort()
        .map((key) => [key, payload[key]]),
    ),
  );
  return createHash("sha256")
    .update(`${canonical}monee_secret`)
    .digest("hex");
}

test("Monee: подписанный вебхук проводит платёж через /order/info", async () => {
  const created = db.createPayment({ userId: "u-1", amountRub: 1000 });
  db.attachProviderPayment(created.id, {
    providerId: moneeProvider.id,
    providerUuid: "m-order",
    status: "PENDING",
    providerStatus: "WAITING",
  });

  const payload = {
    status: "success",
    invoice_id: "m-order",
    shop_id: "monee-shop",
    amount: 1000,
    custom_fields: { payment_id: created.id },
  };
  const rawBody = JSON.stringify({ ...payload, signature: moneeSignature(payload) });
  const before = balance();

  const response = await handleProviderWebhook(
    moneeProvider.id,
    new Request(`https://site.example/api/payments/webhook/${moneeProvider.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    }),
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              status: "PAID",
              order_uuid: "m-order",
              amount: 100000,
              payment_url: "https://pay.monee.pro/m-order",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );

  assert.equal(response.status, 200);
  const paid = db.getPayment(created.id)!;
  assert.equal(paid.status, "SUCCESS");
  assert.ok(paid.creditedAt);
  assert.equal(balance(), before + 1000);

  // Повтор не должен даже ходить в /order/info.
  const again = await handleProviderWebhook(
    moneeProvider.id,
    new Request(`https://site.example/api/payments/webhook/${moneeProvider.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    }),
    {
      fetch: async () => {
        throw new Error("повторный вебхук не должен дергать API");
      },
    },
  );
  assert.equal(again.status, 200);
  assert.equal(balance(), before + 1000);
});

function parityPaySignature(payload: Record<string, unknown>): string {
  const canonical = Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      if (value === null || value === undefined) return "";
      return typeof value === "string" ? value : String(value);
    })
    .join("");
  return createHmac("sha256", "parity_key_2").update(canonical).digest("hex");
}

test("ParityPay: подписанный вебхук с рублёвой суммой зачисляет платёж", async () => {
  const created = db.createPayment({ userId: "u-1", amountRub: 1000 });
  db.attachProviderPayment(created.id, {
    providerId: parityPayProvider.id,
    providerUuid: "pp-order",
    status: "PENDING",
    providerStatus: "NEW",
  });

  const payload = {
    id: "pp-order",
    order_id: created.id,
    shop_id: "parity-shop",
    amount: "1000.00",
    credited: 970.5,
    comment: null,
    service: "sbp",
    status: "PAID",
  };
  const rawBody = JSON.stringify(payload);
  const signature = parityPaySignature(payload);
  const before = balance();

  const response = await handleProviderWebhook(
    parityPayProvider.id,
    new Request(`https://site.example/api/payments/webhook/${parityPayProvider.id}`, {
      method: "POST",
      headers: { "X-SIGNATURE": signature },
      body: rawBody,
    }),
  );
  assert.equal(response.status, 200);
  const paid = db.getPayment(created.id)!;
  assert.equal(paid.status, "SUCCESS");
  assert.equal(balance(), before + 1000);
});

test("ParityPay: сумма в вебхуке сверяется в копейках", async () => {
  const created = db.createPayment({ userId: "u-1", amountRub: 1000 });
  db.attachProviderPayment(created.id, {
    providerId: parityPayProvider.id,
    providerUuid: "pp-wrong-amount",
    status: "PENDING",
    providerStatus: "NEW",
  });
  const payload = {
    id: "pp-wrong-amount",
    shop_id: "parity-shop",
    amount: "999.00",
    status: "PAID",
  };
  const before = balance();
  const response = await handleProviderWebhook(
    parityPayProvider.id,
    new Request(`https://site.example/api/payments/webhook/${parityPayProvider.id}`, {
      method: "POST",
      headers: { "X-SIGNATURE": parityPaySignature(payload) },
      body: JSON.stringify(payload),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(db.getPayment(created.id)?.status, "PENDING");
  assert.equal(balance(), before);
  const event = sqlite
    .prepare(`SELECT "mappedStatus" FROM "payment_event" WHERE "paymentId" = ?`)
    .get(created.id) as { mappedStatus: string } | undefined;
  assert.equal(event?.mappedStatus, "MISMATCH");
});
