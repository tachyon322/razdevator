import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Отдельная временная БД: db.ts читает DATA_DIR при первом обращении.
const dataDir = mkdtempSync(join(tmpdir(), "razdevator-admin-"));
process.env.DATA_DIR = dataDir;
process.env.BETTER_AUTH_SECRET = "test-secret";
process.env.ADMIN_PASSWORD = "correct horse";

const db = await import("./db");
const session = await import("./admin-session");
const settings = await import("./settings");
const sqlite = db.getDb();

sqlite.exec(
  `CREATE TABLE "user" ("id" text primary key, "name" text, "email" text, "createdAt" text, "plan" text, "generationsUsed" integer, "balanceRub" integer)`,
);

function seedUser(id: string, email: string, createdAt: string, balanceRub: number | null) {
  sqlite
    .prepare(
      `INSERT INTO "user" ("id","name","email","createdAt","plan","generationsUsed","balanceRub") VALUES (?,?,?,?,?,?,?)`,
    )
    .run(id, id.toUpperCase(), email, createdAt, "free", 0, balanceRub);
}

// --- Пароль и cookie ---

test("пароль: верный проходит, неверный и пустой — нет", () => {
  assert.equal(session.checkAdminPassword("correct horse"), true);
  assert.equal(session.checkAdminPassword("correct hors"), false);
  assert.equal(session.checkAdminPassword(""), false);
});

test("cookie: своя подпись проходит, подделка и мусор — нет", () => {
  const now = Date.UTC(2026, 9, 1);
  const token = session.createAdminToken(now);
  assert.equal(session.verifyAdminToken(token, now), true);

  const [exp, sig] = token.split(".");
  const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.equal(session.verifyAdminToken(`${exp}.${flipped}`, now), false);
  // Продлить срок, не зная ключа, нельзя.
  assert.equal(session.verifyAdminToken(`${Number(exp) + 1}.${sig}`, now), false);
  assert.equal(session.verifyAdminToken(undefined, now), false);
  assert.equal(session.verifyAdminToken("garbage", now), false);
  assert.equal(session.verifyAdminToken(".abc", now), false);
});

test("cookie: истекает через 30 дней", () => {
  const now = Date.UTC(2026, 9, 1);
  const token = session.createAdminToken(now);
  const ttlMs = session.ADMIN_SESSION_TTL_SEC * 1000;
  assert.equal(session.verifyAdminToken(token, now + ttlMs - 1000), true);
  assert.equal(session.verifyAdminToken(token, now + ttlMs), false);
});

test("cookie: смена пароля аннулирует выданные, без пароля админки нет", () => {
  const now = Date.UTC(2026, 9, 1);
  const token = session.createAdminToken(now);
  try {
    process.env.ADMIN_PASSWORD = "new password";
    assert.equal(session.verifyAdminToken(token, now), false);
    process.env.ADMIN_PASSWORD = "";
    assert.equal(session.adminPassword(), null);
    assert.equal(session.verifyAdminToken(token, now), false);
    assert.equal(session.checkAdminPassword(""), false);
  } finally {
    process.env.ADMIN_PASSWORD = "correct horse";
  }
  assert.equal(session.verifyAdminToken(token, now), true);
});

test("перебор: после 5 ошибок пауза 15 минут, другой IP не задет", () => {
  const now = 1_000_000;
  const ip = "203.0.113.7";
  for (let i = 0; i < session.MAX_LOGIN_FAILURES; i++) {
    assert.equal(session.loginBlockedFor(ip, now), 0);
    session.registerLoginFailure(ip, now);
  }
  assert.ok(session.loginBlockedFor(ip, now) > 0);
  assert.equal(session.loginBlockedFor("203.0.113.8", now), 0);
  assert.equal(session.loginBlockedFor(ip, now + session.LOGIN_BLOCK_MS), 0);

  session.registerLoginFailure(ip, now);
  session.resetLoginFailures(ip);
  assert.equal(session.loginBlockedFor(ip, now), 0);
});

// --- Настройки витрины ---

test("настройки: по умолчанию — поведение до админки", () => {
  assert.deepEqual(settings.getSiteSettings(), settings.SETTING_DEFAULTS);
  assert.equal(settings.customTopUpVisible(settings.getSiteSettings()), true);
});

test("настройки: запись и чтение, серверная блокировка прячет суммы", () => {
  settings.setSiteSetting("showPerItemCards", false);
  assert.equal(settings.getSiteSettings().showPerItemCards, false);
  settings.setSiteSetting("showPerItemCards", true);
  assert.equal(settings.getSiteSettings().showPerItemCards, true);

  settings.setSiteSetting("blockCustomTopUp", true);
  const current = settings.getSiteSettings();
  assert.equal(current.showCustomTopUp, true);
  assert.equal(settings.customTopUpVisible(current), false);
  settings.setSiteSetting("blockCustomTopUp", false);

  settings.setSiteSetting("showCustomTopUp", false);
  assert.equal(settings.customTopUpVisible(settings.getSiteSettings()), false);
  settings.setSiteSetting("showCustomTopUp", true);
});

test("настройки: неизвестные ключи не принимаются", () => {
  assert.equal(settings.isSettingKey("showPerItemCards"), true);
  assert.equal(settings.isSettingKey("toString"), false);
  assert.equal(settings.isSettingKey("whatever"), false);
  assert.equal(settings.isSettingKey(null), false);
});

// --- Пользователи ---

test("пользователи: сводка, сортировка, поиск и оплаты", () => {
  seedUser("u1", "alice@example.com", "2026-09-01T00:00:00.000Z", 500);
  seedUser("u2", "user123ab@razdevator.local", "2026-09-03T00:00:00.000Z", null);
  seedUser("u3", "bob_100%@example.com", "2026-09-02T00:00:00.000Z", 1200);

  const paid = db.createPayment({ userId: "u1", amountRub: 2000, creditRub: 2500 });
  sqlite.prepare(`UPDATE "payment" SET "status" = 'SUCCESS' WHERE "id" = ?`).run(paid.id);
  db.createPayment({ userId: "u1", amountRub: 700 }); // не оплачен — не считается

  assert.deepEqual(db.getUsersSummary(), {
    total: 3,
    totalBalanceRub: 1700,
    withBalance: 2,
  });

  const byBalance = db.listUsersForAdmin({ search: null, sort: "balance", limit: 50, offset: 0 });
  assert.deepEqual(byBalance.map((u) => u.id), ["u3", "u1", "u2"]);
  assert.equal(byBalance[1].paidRub, 2000);
  assert.equal(byBalance[2].balanceRub, 0);

  const byDate = db.listUsersForAdmin({ search: null, sort: "created", limit: 50, offset: 0 });
  assert.deepEqual(byDate.map((u) => u.id), ["u2", "u3", "u1"]);

  const page2 = db.listUsersForAdmin({ search: null, sort: "created", limit: 2, offset: 2 });
  assert.deepEqual(page2.map((u) => u.id), ["u1"]);

  // `%` и `_` ищутся буквально, а не как шаблон.
  assert.deepEqual(
    db.listUsersForAdmin({ search: "100%", sort: "balance", limit: 50, offset: 0 }).map((u) => u.id),
    ["u3"],
  );
  assert.equal(db.countUsersForAdmin("_"), 1);
  assert.equal(db.countUsersForAdmin("example"), 2);
  assert.equal(db.countUsersForAdmin(null), 3);
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
