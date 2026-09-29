import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Отдельная временная БД: db.ts читает DATA_DIR при первом обращении.
const dataDir = mkdtempSync(join(tmpdir(), "razdevator-payments-"));
process.env.DATA_DIR = dataDir;

const db = await import("./db");
const { parsePayment, rubToKopecks, verifyWebhookSignature } = await import(
  "./exenta"
);
const { applyProviderStatus } = await import("./payments");
const sqlite = db.getDb();

sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);

function seed(id: string, balanceRub = 0) {
  sqlite
    .prepare(`INSERT INTO "user" ("id","plan","generationsUsed","balanceRub") VALUES (?,?,?,?)`)
    .run(id, "free", 0, balanceRub);
}

function balance(id: string): number {
  return db.getUserUsage(id)?.balanceRub ?? 0;
}

function pendingPayment(userId: string, amountRub: number, uuid: string) {
  const payment = db.createPayment(userId, amountRub);
  db.attachProviderPayment(payment.id, uuid, "PENDING");
  return db.getPayment(payment.id)!;
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку в любом случае уберёт ОС
  }
});

test("rubToKopecks переводит рубли в копейки строкой", () => {
  assert.equal(rubToKopecks(1000), "100000");
  assert.equal(rubToKopecks(300), "30000");
});

test("parsePayment разбирает ответ в обёртке data (как отвечает живой API)", () => {
  const payment = parsePayment({
    success: true,
    data: {
      id: 14914,
      uuid: "98d6bad0-452f-4351-bc18-51e498085fb5",
      amount: "30000",
      status: "PENDING",
      redirectUrl: "https://qr.nspk.ru/AD101028KN4N4NCC8TL8AP6SAC0UF8CI",
    },
  });
  assert.equal(payment.uuid, "98d6bad0-452f-4351-bc18-51e498085fb5");
  assert.equal(payment.status, "PENDING");
  assert.equal(payment.amount, "30000");
  assert.equal(payment.redirectUrl, "https://qr.nspk.ru/AD101028KN4N4NCC8TL8AP6SAC0UF8CI");
});

test("parsePayment принимает и плоский ответ из документации", () => {
  const payment = parsePayment({ uuid: "u-1", status: "SUCCESS", amount: "100000" });
  assert.equal(payment.uuid, "u-1");
  assert.equal(payment.status, "SUCCESS");
  assert.throws(() => parsePayment({ success: true, data: { status: "WAT" } }));
});

test("verifyWebhookSignature принимает hex и base64, отклоняет чужую подпись", () => {
  const body = JSON.stringify({ paymentUuid: "abc", status: "SUCCESS" });
  const secret = "whsec_test";
  const digest = createHmac("sha256", secret).update(body).digest();

  assert.equal(verifyWebhookSignature(body, digest.toString("hex"), secret), true);
  assert.equal(
    verifyWebhookSignature(body, `sha256=${digest.toString("hex").toUpperCase()}`, secret),
    true,
  );
  assert.equal(verifyWebhookSignature(body, digest.toString("base64"), secret), true);
  assert.equal(verifyWebhookSignature(body, digest.toString("hex"), "other"), false);
  assert.equal(verifyWebhookSignature(`${body} `, digest.toString("hex"), secret), false);
  assert.equal(verifyWebhookSignature(body, null, secret), false);
});

test("успешный платёж зачисляется ровно один раз", () => {
  seed("u-pay", 100);
  const payment = pendingPayment("u-pay", 1000, "uuid-once");
  const provider = { uuid: "uuid-once", status: "SUCCESS" as const, amount: "100000" };

  const updated = applyProviderStatus(payment, provider);
  assert.equal(updated.status, "SUCCESS");
  assert.ok(updated.creditedAt);
  assert.equal(balance("u-pay"), 1100);

  // Повтор вебхука / опроса с устаревшей записью не удваивает зачисление.
  applyProviderStatus(payment, provider);
  applyProviderStatus(updated, provider);
  assert.equal(balance("u-pay"), 1100);
});

test("расхождение суммы — не зачисляем", () => {
  seed("u-mismatch", 0);
  const payment = pendingPayment("u-mismatch", 1000, "uuid-mismatch");
  const updated = applyProviderStatus(payment, {
    uuid: "uuid-mismatch",
    status: "SUCCESS",
    amount: "1000000",
  });
  assert.equal(updated.status, "PENDING");
  assert.equal(balance("u-mismatch"), 0);
});

test("неуспешные статусы не трогают баланс и не перетирают SUCCESS", () => {
  seed("u-fail", 0);
  const payment = pendingPayment("u-fail", 500, "uuid-fail");
  const cancelled = applyProviderStatus(payment, { uuid: "uuid-fail", status: "CANCELLED" });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(balance("u-fail"), 0);

  const paid = applyProviderStatus(cancelled, { uuid: "uuid-fail", status: "SUCCESS" });
  assert.equal(paid.status, "SUCCESS");
  assert.equal(balance("u-fail"), 500);

  db.setPaymentStatus(paid.id, "FAILED");
  assert.equal(db.getPayment(paid.id)?.status, "SUCCESS");
});

test("чужой uuid провайдера отклоняется", () => {
  seed("u-uuid", 0);
  const payment = pendingPayment("u-uuid", 500, "uuid-mine");
  assert.throws(() =>
    applyProviderStatus(payment, { uuid: "uuid-other", status: "SUCCESS" }),
  );
  assert.equal(balance("u-uuid"), 0);
});

test("countOpenPayments считает только неоплаченные счета в окне", () => {
  seed("u-open", 0);
  const since = new Date(Date.now() - 60_000).toISOString();
  pendingPayment("u-open", 300, "uuid-open-1");
  const failed = db.createPayment("u-open", 300);
  db.setPaymentStatus(failed.id, "FAILED");
  db.createPayment("u-open", 300);
  assert.equal(db.countOpenPayments("u-open", since), 2);
});
