import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "razdevator-cashx-"));
process.env.DATA_DIR = dataDir;
process.env.CASHX_SYNC = "true";
process.env.CASHX_KEY_ID = "k";
process.env.CASHX_SECRET = "s";
process.env.CASHX_PREFIX = "razdevator";

const db = await import("./db");
const { enqueueAttribution, enqueueRevenue, processCashxOutbox, backoffMs } =
  await import("./cashx");
const sqlite = db.getDb();

sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);
sqlite.exec(`INSERT INTO "user" VALUES ('u1','free',0,0)`);
db.ensureSchema();

after(() => {
  sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
});

let payId = "";
const rows = () =>
  sqlite.prepare(`SELECT * FROM "cashx_outbox" ORDER BY id`).all() as {
    eventId: string;
    status: string;
    attempts: number;
    nextAttemptAt: string;
  }[];

test("регистрация без ref/click_token не создаёт событие", () => {
  enqueueAttribution("u1", null, null);
  assert.equal(rows().length, 0);
});

test("регистрация и оплата попадают в очередь, повтор дедуплицируется", () => {
  enqueueAttribution("u1", "PARTNER", "tok");
  enqueueAttribution("u1", "PARTNER", "tok");
  const pay = db.createPayment({ userId: "u1", amountRub: 2000, creditRub: 2500, packId: "start" });
  assert.equal(db.creditPayment(pay.id, (p) => enqueueRevenue(p)), true);
  assert.equal(db.creditPayment(pay.id, (p) => enqueueRevenue(p)), false);
  payId = pay.id;

  assert.deepEqual(
    rows().map((r) => r.eventId),
    ["razdevator-signup-u1", `razdevator-payment-${payId}`],
  );
  const revenue = JSON.parse(
    (sqlite.prepare(`SELECT payload FROM cashx_outbox WHERE eventId = ?`).get(`razdevator-payment-${payId}`) as { payload: string }).payload,
  );
  assert.equal(revenue.amount_kopecks, 200000); // оплачено, не бонусный creditRub
  assert.equal(revenue.type, "revenue.confirmed");
});

test("сбой Cashx откладывает событие и сохраняет порядок; потом доставляется", async () => {
  const sent: string[] = [];
  let down = true;
  const send = async (e: { event_id: string }) => {
    if (down) throw new Error("ECONNREFUSED");
    sent.push(e.event_id);
    return { status: "accepted" };
  };

  const first = await processCashxOutbox(send);
  assert.deepEqual(first, { sent: 0, failed: 1 });
  assert.equal(sent.length, 0);
  assert.equal(rows()[0].attempts, 1);
  assert.equal(rows()[1].attempts, 0, "платёж не обгоняет регистрацию");

  // backoff ещё не истёк — ничего не берём
  assert.deepEqual(await processCashxOutbox(send), { sent: 0, failed: 0 });

  sqlite.prepare(`UPDATE cashx_outbox SET nextAttemptAt = '2000-01-01T00:00:00.000Z'`).run();
  down = false;
  assert.deepEqual(await processCashxOutbox(send), { sent: 2, failed: 0 });
  assert.deepEqual(sent, ["razdevator-signup-u1", `razdevator-payment-${payId}`]);
  assert.ok(rows().every((r) => r.status === "sent"));
});

test("ignored от Cashx считается доставленным", async () => {
  enqueueAttribution("u2", "OTHER", null);
  const out = await processCashxOutbox(async () => ({ status: "ignored", reason: "no_attribution" }));
  assert.equal(out.sent, 1);
});

test("backoff растёт и ограничен часом", () => {
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(20), 3_600_000);
});
