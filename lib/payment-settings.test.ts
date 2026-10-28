import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "razdevator-providers-"));
process.env.DATA_DIR = dataDir;
process.env.PAYMENTS_PUBLIC_KEY = "pk_env";
process.env.PAYMENTS_SECRET_KEY = "sk_env";

const db = await import("./db");
const { CASHERA_PRESET } = await import("./provider-presets");
const { sealSecret } = await import("./provider-secrets");
const { validateHttpProviderConfig } = await import("./payment-provider");
const {
  fallbackEnabled,
  getActiveProviderId,
  getEffectiveProvider,
  resolveProviderChain,
  setActiveProviderId,
  setFallbackEnabled,
} = await import("./payment-settings");

const sqlite = db.getDb();
sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);

function storeCashera(): string {
  const validated = validateHttpProviderConfig({
    ...structuredClone(CASHERA_PRESET.config),
    secrets: { apiKey: "pk_test", apiSecret: "sk_test" },
  });
  if ("errors" in validated) throw new Error(JSON.stringify(validated.errors));
  const row = db.createPaymentProvider({
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
  return row.id;
}

const casheraId = storeCashera();

beforeEach(() => {
  db.setAppSetting("payment.provider.site", "");
  db.setAppSetting("payment.provider.project.kazik", "");
  db.setAppSetting("payment.fallback", "1");
  db.setPaymentProviderEnabled(casheraId, true);
  process.env.PAYMENTS_PUBLIC_KEY = "pk_env";
  process.env.PAYMENTS_SECRET_KEY = "sk_env";
});

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку уберёт ОС
  }
});

test("по умолчанию Exenta первая, Cashera — резерв", () => {
  const chain = resolveProviderChain({ service: "site" });
  assert.deepEqual(
    chain.providers.map((provider) => provider.id),
    ["exenta", casheraId],
  );
  assert.equal(chain.activeId, null);
  assert.equal(chain.activeAvailable, true);
});

test("активный провайдер идёт первым, остальные — резерв", () => {
  setActiveProviderId({ service: "site" }, casheraId);
  const chain = resolveProviderChain({ service: "site" });
  assert.deepEqual(
    chain.providers.map((provider) => provider.id),
    [casheraId, "exenta"],
  );
  assert.equal(chain.activeId, casheraId);
  assert.equal(chain.activeAvailable, true);
});

test("фолбэк выключен — остаётся только активный", () => {
  setActiveProviderId({ service: "site" }, casheraId);
  setFallbackEnabled(false);
  assert.equal(fallbackEnabled(), false);
  const chain = resolveProviderChain({ service: "site" });
  assert.deepEqual(chain.providers.map((provider) => provider.id), [casheraId]);
});

test("проект наследует сайт, но может выбрать своего", () => {
  setActiveProviderId({ service: "site" }, casheraId);
  assert.equal(
    getActiveProviderId({ service: "project", projectId: "kazik" }),
    casheraId,
  );
  assert.equal(
    getEffectiveProvider({ service: "project", projectId: "kazik" }).inherited,
    true,
  );

  setActiveProviderId({ service: "project", projectId: "kazik" }, "exenta");
  assert.equal(
    getActiveProviderId({ service: "project", projectId: "kazik" }),
    "exenta",
  );
  const chain = resolveProviderChain({ service: "project", projectId: "kazik" });
  assert.deepEqual(
    chain.providers.map((provider) => provider.id),
    ["exenta", casheraId],
  );
  assert.equal(
    getEffectiveProvider({ service: "project", projectId: "kazik" }).inherited,
    false,
  );
});

test("выключенный активный: с фолбэком — первый доступный, без — пустая цепочка", () => {
  setActiveProviderId({ service: "site" }, casheraId);
  db.setPaymentProviderEnabled(casheraId, false);

  const fallbackChain = resolveProviderChain({ service: "site" });
  assert.deepEqual(
    fallbackChain.providers.map((provider) => provider.id),
    ["exenta"],
  );
  assert.equal(fallbackChain.activeAvailable, false);

  setFallbackEnabled(false);
  const strictChain = resolveProviderChain({ service: "site" });
  assert.deepEqual(strictChain.providers, []);
});

test("если провайдеров нет — пустая цепочка", () => {
  process.env.PAYMENTS_PUBLIC_KEY = "";
  process.env.PAYMENTS_SECRET_KEY = "";
  db.setPaymentProviderEnabled(casheraId, false);

  const chain = resolveProviderChain({ service: "site" });
  assert.deepEqual(chain.providers, []);
});
