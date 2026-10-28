import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpProviderConfig } from "./payment-provider";

const dataDir = mkdtempSync(join(tmpdir(), "razdevator-create-"));
process.env.DATA_DIR = dataDir;
// Только провайдеры из БД: Exenta в этом файле не нужна.
process.env.PAYMENTS_PUBLIC_KEY = "";
process.env.PAYMENTS_SECRET_KEY = "";

const db = await import("./db");
const { CASHERA_PRESET } = await import("./provider-presets");
const { sealSecret } = await import("./provider-secrets");
const { validateHttpProviderConfig } = await import("./payment-provider");
const {
  NoProviderError,
  ProviderChainError,
  createGatewayInvoice,
  createSiteInvoice,
} = await import("./payment-create");
const { setActiveProviderId, setFallbackEnabled } = await import(
  "./payment-settings"
);

const sqlite = db.getDb();
sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);
sqlite
  .prepare(
    `INSERT INTO "user" ("id","plan","generationsUsed","balanceRub") VALUES (?,?,?,?)`,
  )
  .run("u-1", "free", 0, 0);

function configFor(baseUrl: string): HttpProviderConfig {
  const validated = validateHttpProviderConfig({
    ...structuredClone(CASHERA_PRESET.config),
    baseUrl,
    secrets: { apiKey: "pk_test", apiSecret: "sk_test" },
  });
  if ("errors" in validated) throw new Error(JSON.stringify(validated.errors));
  return validated.config;
}

function createProvider(name: string, baseUrl: string): string {
  const row = db.createPaymentProvider({
    name,
    config: JSON.stringify({
      ...configFor(baseUrl),
      secrets: {
        apiKey: sealSecret("pk_test"),
        apiSecret: sealSecret("sk_test"),
      },
    }),
    enabled: true,
    sortOrder: 100,
  });
  return row.id;
}

const providerA = createProvider("Provider A", "https://a.example/api");
const providerB = createProvider("Provider B", "https://b.example/api");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function router(handler: (url: string) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

function latestPayment(): NonNullable<ReturnType<typeof db.getPayment>> {
  return sqlite
    .prepare(`SELECT * FROM "payment" ORDER BY "createdAt" DESC, "rowid" DESC LIMIT 1`)
    .get() as NonNullable<ReturnType<typeof db.getPayment>>;
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку уберёт ОС
  }
});

test("сайт: первый провайдер упал — счёт создаёт второй, providerId фиксируется", async () => {
  setActiveProviderId({ service: "site" }, providerA);
  setFallbackEnabled(true);
  const bodies: string[] = [];

  const result = await createSiteInvoice(
    {
      userId: "u-1",
      amountRub: 1000,
      creditRub: 1000,
      packId: null,
      buyerIp: null,
      siteUrl: "https://site.example",
    },
    {
      sleep: async () => {},
      fetch: router((url) => {
        if (url.startsWith("https://a.example")) {
          return new Response("provider down", { status: 500 });
        }
        bodies.push(url);
        return jsonResponse(
          {
            uuid: "u-b",
            status: "pending",
            payment_url: "https://pay.b.example/1",
          },
          201,
        );
      }),
    },
  );

  assert.equal(result.providerId, providerB);
  assert.equal(result.payment.providerId, providerB);
  assert.equal(result.payment.status, "PENDING");
  assert.equal(result.redirectUrl, "https://pay.b.example/1");
  assert.equal(bodies.length, 1);
});

test("сайт: фолбэк выключен — ошибка, платёж FAILED", async () => {
  setActiveProviderId({ service: "site" }, providerA);
  setFallbackEnabled(false);

  await assert.rejects(
    () =>
      createSiteInvoice(
        {
          userId: "u-1",
          amountRub: 500,
          creditRub: 500,
          packId: null,
          buyerIp: null,
          siteUrl: "https://site.example",
        },
        {
          sleep: async () => {},
          fetch: router(() => new Response("provider down", { status: 500 })),
        },
      ),
    (error) => error instanceof ProviderChainError,
  );

  assert.equal(latestPayment().status, "FAILED");
  setFallbackEnabled(true);
});

test("сайт: нет провайдеров — NoProviderError и черновик не создаётся", async () => {
  setActiveProviderId({ service: "site" }, null);
  db.setPaymentProviderEnabled(providerA, false);
  db.setPaymentProviderEnabled(providerB, false);
  const before = (
    sqlite.prepare(`SELECT COUNT(*) AS "count" FROM "payment"`).get() as {
      count: number;
    }
  ).count;

  await assert.rejects(
    () =>
      createSiteInvoice({
        userId: "u-1",
        amountRub: 500,
        creditRub: 500,
        packId: null,
        buyerIp: null,
        siteUrl: "https://site.example",
      }),
    (error) => error instanceof NoProviderError,
  );

  const after = (
    sqlite.prepare(`SELECT COUNT(*) AS "count" FROM "payment"`).get() as {
      count: number;
    }
  ).count;
  assert.equal(after, before);

  db.setPaymentProviderEnabled(providerA, true);
  db.setPaymentProviderEnabled(providerB, true);
});

test("шлюз: счёт создаётся, успех проводится и колбэк ставится в очередь", async () => {
  setActiveProviderId({ service: "site" }, providerB);

  const project = {
    id: "kazik",
    description: "Пополнение баланса Kazik",
    secret: "gw_secret",
    callbackUrl: "https://kazik.example/webhook",
    callbackSecret: "cb_secret",
    returnOrigins: ["https://kazik.example"],
  };

  const result = await createGatewayInvoice(
    {
      project,
      externalId: "order-1",
      externalUserId: "user-1",
      purpose: "deposit",
      method: "sbp",
      amountRub: 1000,
      returnUrl: "https://kazik.example/",
      buyerIp: null,
      siteUrl: "https://site.example",
    },
    {
      fetch: router(() =>
        jsonResponse(
          {
            uuid: "u-gw",
            status: "paid",
            payment_url: "https://pay.b.example/gw",
          },
          201,
        ),
      ),
    },
  );

  assert.equal(result.providerId, providerB);
  assert.equal(result.payment.status, "PAID");
  assert.equal(result.redirectUrl, "https://pay.b.example/gw");

  const callback = sqlite
    .prepare(`SELECT * FROM "gateway_outbox" WHERE "paymentId" = ?`)
    .get(result.payment.id) as { payload: string; status: string } | undefined;
  assert.ok(callback);
  const payload = JSON.parse(callback.payload) as { status: string };
  assert.equal(payload.status, "PAID");
});
