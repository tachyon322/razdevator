import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Отдельная временная БД: db.ts читает DATA_DIR при первом обращении.
const dataDir = mkdtempSync(join(tmpdir(), "razdevator-gateway-"));
process.env.DATA_DIR = dataDir;
process.env.GATEWAY_PROJECTS = "kazik";
process.env.GATEWAY_KAZIK_SECRET = "gw_secret_test";
process.env.GATEWAY_KAZIK_CALLBACK_URL = "https://kazik.example/webhook";
process.env.GATEWAY_KAZIK_CALLBACK_SECRET = "cb_secret_test";
process.env.GATEWAY_KAZIK_RETURN_ORIGINS = "https://kazik.example";

const db = await import("./db");
const {
  allowedReturnOrigin,
  getGatewayProject,
  returnToken,
  signGatewayBody,
  verifyGatewayRequest,
  verifyReturnToken,
} = await import("./gateway");
const { applyGatewayProviderStatus, gatewayStatusFromProvider } = await import(
  "./gateway-payments"
);
const { processGatewayOutbox } = await import("./gateway-outbox");

type GatewayPayment = ReturnType<typeof db.createGatewayPayment>;

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // временную папку в любом случае уберёт ОС
  }
});

function project() {
  const value = getGatewayProject("kazik");
  assert.ok(value, "проект kazik должен быть настроен в env");
  return value;
}

function signedHeaders(
  body: string,
  projectId = "kazik",
  secret = "gw_secret_test",
): Headers {
  const timestamp = String(Date.now());
  return new Headers({
    "x-gateway-project": projectId,
    "x-gateway-timestamp": timestamp,
    "x-gateway-signature": signGatewayBody(secret, timestamp, body),
  });
}

function newGatewayPayment(externalId: string, amountRub = 1000): GatewayPayment {
  return db.createGatewayPayment({
    projectId: "kazik",
    externalId,
    externalUserId: "user-1",
    purpose: "deposit",
    method: "sbp",
    amountRub,
    returnUrl: "https://kazik.example/",
    buyerIp: "1.2.3.4",
  });
}

function callbacks() {
  return db.getDb().prepare(`SELECT * FROM "gateway_outbox" ORDER BY "id"`).all() as {
    eventId: string;
    projectId: string;
    payload: string;
    status: string;
    attempts: number;
  }[];
}

test("конфиг проекта читается из env, неизвестный проект отклоняется", () => {
  const value = project();
  assert.equal(value.id, "kazik");
  assert.equal(value.callbackUrl, "https://kazik.example/webhook");
  assert.equal(value.callbackSecret, "cb_secret_test");
  assert.deepEqual(value.returnOrigins, ["https://kazik.example"]);
  assert.equal(getGatewayProject("other"), null);
});

test("подпись запроса: валидная принимается, чужая и просроченная — нет", () => {
  const body = JSON.stringify({ externalId: "p-1" });
  const value = project();

  assert.equal(verifyGatewayRequest(value, signedHeaders(body), body), true);

  const foreign = signedHeaders(body, "kazik", "wrong_secret");
  assert.equal(verifyGatewayRequest(value, foreign, body), false);

  const staleTs = String(Date.now() - 10 * 60 * 1000);
  const stale = new Headers({
    "x-gateway-timestamp": staleTs,
    "x-gateway-signature": signGatewayBody("gw_secret_test", staleTs, body),
  });
  assert.equal(verifyGatewayRequest(value, stale, body), false);

  assert.equal(verifyGatewayRequest(value, new Headers(), body), false);
});

test("токен страницы возврата привязан к счёту и секрету проекта", () => {
  const token = returnToken("gw_secret_test", "pay-1");
  assert.equal(token.length, 24, "токен в ссылке должен быть коротким");
  assert.equal(verifyReturnToken("gw_secret_test", "pay-1", token), true);
  assert.equal(verifyReturnToken("gw_secret_test", "pay-2", token), false);
  assert.equal(verifyReturnToken("other_secret", "pay-1", token), false);
  assert.equal(verifyReturnToken("gw_secret_test", "pay-1", null), false);

  // Ссылки в уже выставленных счетах несут прежний длинный токен.
  const legacy = createHmac("sha256", "gw_secret_test")
    .update("return.pay-1", "utf8")
    .digest("hex");
  assert.equal(verifyReturnToken("gw_secret_test", "pay-1", legacy), true);
  assert.equal(verifyReturnToken("other_secret", "pay-1", legacy), false);
});

test("возврат покупателя разрешён только на домены проекта", () => {
  const value = project();
  assert.equal(
    allowedReturnOrigin(value, "https://kazik.example/wallet"),
    "https://kazik.example/wallet",
  );
  assert.equal(allowedReturnOrigin(value, "https://kazik.example"), "https://kazik.example/");
  assert.equal(allowedReturnOrigin(value, "https://evil.example/"), null);
  assert.equal(allowedReturnOrigin(value, "javascript:alert(1)"), null);
  assert.equal(allowedReturnOrigin(value, null), null);
});

test("статусы Exenta маппятся в статусы шлюза", () => {
  assert.equal(gatewayStatusFromProvider("SUCCESS"), "PAID");
  assert.equal(gatewayStatusFromProvider("CANCELLED"), "CANCELED");
  assert.equal(gatewayStatusFromProvider("FAILED"), "FAILED");
  assert.equal(gatewayStatusFromProvider("PENDING"), "PENDING");
  assert.equal(gatewayStatusFromProvider("CREATED"), "PENDING");
});

test("оплата: зачисление идемпотентно, колбэк ставится один раз", () => {
  const payment = newGatewayPayment("p-paid", 2000);
  const attached = db.attachGatewayProvider(payment.id, "uuid-paid", "https://qr.example/1");
  assert.equal(attached.status, "PENDING");

  const paid = applyGatewayProviderStatus(attached, {
    uuid: "uuid-paid",
    status: "SUCCESS",
    amount: "200000",
  });
  assert.equal(paid.status, "PAID");
  assert.ok(paid.paidAt);

  // Повторная доставка вебхука ничего не меняет и не дублирует колбэк.
  const again = applyGatewayProviderStatus(paid, {
    uuid: "uuid-paid",
    status: "SUCCESS",
    amount: "200000",
  });
  assert.equal(again.status, "PAID");
  assert.equal(again.paidAt, paid.paidAt);

  const rows = callbacks().filter((row) => row.eventId.includes(payment.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "pending");
  assert.deepEqual(JSON.parse(rows[0].payload), {
    payment_id: payment.id,
    client_order_id: "p-paid",
    amount: "2000",
    currency: "rub",
    status: "PAID",
    project: "kazik",
    purpose: "deposit",
  });
});

test("расхождение суммы не зачисляет счёт", () => {
  const payment = newGatewayPayment("p-mismatch", 1000);
  const attached = db.attachGatewayProvider(payment.id, "uuid-mismatch", "https://qr.example/2");
  const result = applyGatewayProviderStatus(attached, {
    uuid: "uuid-mismatch",
    status: "SUCCESS",
    amount: "1",
  });
  assert.equal(result.status, "PENDING");
  assert.equal(result.paidAt, null);
  assert.equal(callbacks().some((row) => row.eventId.includes(payment.id)), false);
});

test("неуспех: статус не откатывает оплаченный счёт и шлёт колбэк", () => {
  const failed = newGatewayPayment("p-failed", 500);
  const attachedFailed = db.attachGatewayProvider(failed.id, "uuid-failed", "https://qr.example/3");
  const afterFail = applyGatewayProviderStatus(attachedFailed, {
    uuid: "uuid-failed",
    status: "CANCELLED",
  });
  assert.equal(afterFail.status, "CANCELED");
  const payload = JSON.parse(
    callbacks().find((row) => row.eventId.includes(failed.id))!.payload,
  ) as { status: string };
  assert.equal(payload.status, "CANCELED");

  const paid = newGatewayPayment("p-no-downgrade", 500);
  const attachedPaid = db.attachGatewayProvider(paid.id, "uuid-no-downgrade", "https://qr.example/4");
  const paidRow = applyGatewayProviderStatus(attachedPaid, {
    uuid: "uuid-no-downgrade",
    status: "SUCCESS",
    amount: "50000",
  });
  assert.equal(paidRow.status, "PAID");

  const afterCancel = applyGatewayProviderStatus(paidRow, {
    uuid: "uuid-no-downgrade",
    status: "CANCELLED",
  });
  assert.equal(afterCancel.status, "PAID");
  assert.equal(afterCancel.paidAt, paidRow.paidAt);
});

test("чужой uuid провайдера отклоняется", () => {
  const payment = newGatewayPayment("p-foreign-uuid", 300);
  const attached = db.attachGatewayProvider(payment.id, "uuid-own", "https://qr.example/5");
  assert.throws(() =>
    applyGatewayProviderStatus(attached, { uuid: "uuid-other", status: "SUCCESS" }),
  );
});

test("идемпотентность по externalId: повтор возвращает тот же счёт", () => {
  const payment = newGatewayPayment("p-idempotent", 300);
  const same = db.getGatewayPaymentByExternalId("kazik", "p-idempotent");
  assert.equal(same?.id, payment.id);
  assert.equal(db.getGatewayPaymentByExternalId("other", "p-idempotent"), null);
});

test("воркер очереди: успешная доставка и повтор при ошибке", async () => {
  // Сначала разгребаем колбэки предыдущих тестов, чтобы дальше порядок был
  // предсказуемым (воркер останавливается на первой ошибке).
  const drained = await processGatewayOutbox(async () => {});
  assert.equal(drained.failed, 0);
  assert.equal(
    callbacks().filter((row) => row.status !== "sent").length,
    0,
    "все колбэки предыдущих тестов должны быть доставлены",
  );

  const retryPayment = newGatewayPayment("p-retry", 300);
  const retryAttached = db.attachGatewayProvider(
    retryPayment.id,
    "uuid-retry",
    "https://qr.example/7",
  );
  applyGatewayProviderStatus(retryAttached, {
    uuid: "uuid-retry",
    status: "CANCELLED",
  });

  const delivered: string[] = [];
  const failedRun = await processGatewayOutbox(async (row) => {
    delivered.push(row.eventId);
    throw new Error("kazik недоступен");
  });
  assert.equal(failedRun.failed, 1);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].includes(retryPayment.id), true);

  const failedRow = callbacks().find((row) => row.eventId.includes(retryPayment.id))!;
  assert.equal(failedRow.status, "pending");
  assert.equal(failedRow.attempts, 1);
});
