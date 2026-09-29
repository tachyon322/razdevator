import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerationJob } from "./generation-processor";

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

function job(userId: string, costRub: number): GenerationJob {
  return {
    generationId: `${userId}-gen`,
    userId,
    kind: "image",
    selections: {},
    keepFace: true,
    resolution: "1k",
    ratio: "3:4",
    costRub,
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

test("applyBilling списывает деньги с баланса и считает генерацию", () => {
  seed("u-balance", 0, 500);
  applyBilling(job("u-balance", 250));
  assert.deepEqual(user("u-balance"), { generationsUsed: 1, balanceRub: 250 });
});

test("applyBilling при нехватке денег не уводит баланс в минус", () => {
  seed("u-poor", 0, 100);
  const original = console.error;
  console.error = () => {};
  try {
    applyBilling(job("u-poor", 250));
  } finally {
    console.error = original;
  }
  assert.deepEqual(user("u-poor"), { generationsUsed: 1, balanceRub: 100 });
});

test("applyBilling без стоимости только считает генерацию", () => {
  seed("u-zero", 0, 0);
  applyBilling(job("u-zero", 0));
  assert.deepEqual(user("u-zero"), { generationsUsed: 1, balanceRub: 0 });
});
