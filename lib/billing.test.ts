import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerationJob } from "./generation-processor";
import type { Billing } from "./plans";

// Отдельная временная БД: db.ts читает DATA_DIR при первом обращении, поэтому
// переменную нужно выставить до импорта модуля.
const dataDir = mkdtempSync(join(tmpdir(), "razdevator-billing-"));
process.env.DATA_DIR = dataDir;

const db = await import("./db");
const { applyBilling } = await import("./generation-processor");
const sqlite = db.getDb();

// better-auth создаёт таблицу `user` сам; в тесте — минимальная версия нужных колонок.
sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);

function seed(id: string, generationsUsed = 0, balanceRub = 0) {
  sqlite
    .prepare(
      `INSERT INTO "user" ("id","plan","generationsUsed","balanceRub") VALUES (?,?,?,?)`,
    )
    .run(id, "free", generationsUsed, balanceRub);
}

function user(id: string) {
  return sqlite
    .prepare(`SELECT "generationsUsed","balanceRub" FROM "user" WHERE "id" = ?`)
    .get(id) as { generationsUsed: number; balanceRub: number };
}

function job(userId: string, billing: Billing): GenerationJob {
  return {
    generationId: `${userId}-gen`,
    userId,
    kind: "image",
    selections: {},
    keepFace: true,
    resolution: "1k",
    ratio: "3:4",
    billing,
    sourceDataUrl: "",
  } as unknown as GenerationJob;
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку в любом случае уберёт ОС
  }
});

test("getUserUsage возвращает баланс и счётчик", () => {
  seed("u-usage", 1, 300);
  const usage = db.getUserUsage("u-usage");
  assert.equal(usage?.generationsUsed, 1);
  assert.equal(usage?.balanceRub, 300);
});

test("addBalance пополняет баланс", () => {
  seed("u-add", 0, 0);
  db.addBalance("u-add", 2000);
  assert.equal(user("u-add").balanceRub, 2000);
});

test("deductBalance списывает сумму", () => {
  seed("u-deduct", 0, 500);
  assert.equal(db.deductBalance("u-deduct", 250), true);
  assert.equal(user("u-deduct").balanceRub, 250);
});

test("deductBalance не уводит баланс в минус", () => {
  seed("u-guard", 0, 100);
  assert.equal(db.deductBalance("u-guard", 250), false);
  assert.equal(user("u-guard").balanceRub, 100);
});

test("applyBilling (trial) увеличивает счётчик и не трогает баланс", () => {
  seed("u-trial", 0, 500);
  applyBilling(job("u-trial", { mode: "trial", units: 3, costRub: 0 }), 3);
  assert.deepEqual(user("u-trial"), { generationsUsed: 3, balanceRub: 500 });
});

test("applyBilling (balance) списывает деньги и не трогает счётчик", () => {
  seed("u-balance", 3, 500);
  applyBilling(job("u-balance", { mode: "balance", units: 0, costRub: 250 }), 1);
  assert.deepEqual(user("u-balance"), { generationsUsed: 3, balanceRub: 250 });
});

test("applyBilling (balance) при нехватке денег не уводит баланс в минус", () => {
  seed("u-poor", 3, 100);
  const original = console.error;
  console.error = () => {};
  try {
    applyBilling(job("u-poor", { mode: "balance", units: 0, costRub: 250 }), 1);
  } finally {
    console.error = original;
  }
  assert.equal(user("u-poor").balanceRub, 100);
});
