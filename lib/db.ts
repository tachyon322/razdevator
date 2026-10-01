/**
 * Прямой доступ к SQLite (`data/auth.db`, та же БД, что у better-auth).
 *
 * Таблицы `generation` / `generation_asset` / `payment` создаются идемпотентно в
 * `ensureSchema()`. Схема продублирована в `docker/schema.sql` для контейнера.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { Database as DatabaseType, Statement } from "better-sqlite3";

export type GenerationKind = "image" | "video";
export type GenerationStatus = "pending" | "processing" | "succeeded" | "failed";

export interface GenerationParams {
  selections?: Record<string, string | string[] | null>;
  keepFace?: boolean;
  ratio?: string;
  count?: number;
  resolution?: string;
  duration?: number;
  audio?: boolean;
  [key: string]: unknown;
}

export interface Generation {
  id: string;
  userId: string;
  kind: GenerationKind;
  status: GenerationStatus;
  model: string;
  prompt: string;
  params: GenerationParams;
  sourceKey: string | null;
  sourceContentType: string | null;
  providerRunId: string | null;
  costUsd: number | null;
  error: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationAsset {
  id: string;
  generationId: string;
  kind: "image" | "video";
  s3Key: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  position: number;
  createdAt: string;
}

export interface GenerationWithAssets extends Generation {
  assets: GenerationAsset[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "generation" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "userId"            TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind"              TEXT NOT NULL CHECK ("kind" IN ('image','video')),
  "status"            TEXT NOT NULL CHECK ("status" IN ('pending','processing','succeeded','failed')),
  "model"             TEXT NOT NULL,
  "prompt"            TEXT NOT NULL,
  "params"            TEXT NOT NULL,
  "sourceKey"         TEXT,
  "sourceContentType" TEXT,
  "providerRunId"     TEXT,
  "costUsd"           REAL,
  "error"             TEXT,
  "favorite"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TEXT NOT NULL,
  "updatedAt"         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "generation_asset" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "generationId" TEXT NOT NULL REFERENCES "generation"("id") ON DELETE CASCADE,
  "kind"         TEXT NOT NULL CHECK ("kind" IN ('image','video')),
  "s3Key"        TEXT NOT NULL,
  "contentType"  TEXT NOT NULL,
  "width"        INTEGER,
  "height"       INTEGER,
  "durationSec"  REAL,
  "position"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "generation_userId_createdAt_idx" ON "generation" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "generation_userId_favorite_createdAt_idx" ON "generation" ("userId", "createdAt" DESC) WHERE "favorite" = 1;
CREATE INDEX IF NOT EXISTS "generation_asset_generationId_idx" ON "generation_asset" ("generationId");

CREATE TABLE IF NOT EXISTS "payment" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "userId"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "providerUuid" TEXT UNIQUE,
  "amountRub"    INTEGER NOT NULL,
  "creditRub"    INTEGER,
  "packId"       TEXT,
  "status"       TEXT NOT NULL CHECK ("status" IN ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED')),
  "creditedAt"   TEXT,
  "createdAt"    TEXT NOT NULL,
  "updatedAt"    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "payment_userId_createdAt_idx" ON "payment" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "cashx_outbox" (
  "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
  "eventId"       TEXT NOT NULL UNIQUE,
  "payload"       TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','sent','dead')),
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TEXT NOT NULL,
  "lastError"     TEXT,
  "createdAt"     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "cashx_outbox_due_idx" ON "cashx_outbox" ("status", "nextAttemptAt");

CREATE TABLE IF NOT EXISTS "gateway_payment" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "projectId"      TEXT NOT NULL,
  "externalId"     TEXT NOT NULL,
  "externalUserId" TEXT,
  "purpose"        TEXT,
  "method"         TEXT,
  "amountRub"      INTEGER NOT NULL,
  "providerUuid"   TEXT UNIQUE,
  "redirectUrl"    TEXT,
  "returnUrl"      TEXT,
  "buyerIp"        TEXT,
  "status"         TEXT NOT NULL CHECK ("status" IN ('CREATED','PENDING','PAID','FAILED','CANCELED')),
  "paidAt"         TEXT,
  "createdAt"      TEXT NOT NULL,
  "updatedAt"      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_payment_project_external_idx" ON "gateway_payment" ("projectId", "externalId");
CREATE INDEX IF NOT EXISTS "gateway_payment_providerUuid_idx" ON "gateway_payment" ("providerUuid");

CREATE TABLE IF NOT EXISTS "gateway_outbox" (
  "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
  "eventId"       TEXT NOT NULL UNIQUE,
  "projectId"     TEXT NOT NULL,
  "paymentId"     TEXT NOT NULL,
  "payload"       TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','sent','dead')),
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TEXT NOT NULL,
  "lastError"     TEXT,
  "createdAt"     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "gateway_outbox_due_idx" ON "gateway_outbox" ("status", "nextAttemptAt");

CREATE TABLE IF NOT EXISTS "app_setting" (
  "key"       TEXT NOT NULL PRIMARY KEY,
  "value"     TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
`;

interface GenerationRow {
  id: string;
  userId: string;
  kind: GenerationKind;
  status: GenerationStatus;
  model: string;
  prompt: string;
  params: string;
  sourceKey: string | null;
  sourceContentType: string | null;
  providerRunId: string | null;
  costUsd: number | null;
  error: string | null;
  favorite: number;
  createdAt: string;
  updatedAt: string;
}

interface AssetRow {
  id: string;
  generationId: string;
  kind: "image" | "video";
  s3Key: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  position: number;
  createdAt: string;
}

let db: DatabaseType | null = null;
let schemaReady = false;
let staleChecked = false;

function databasePath(): string {
  const dataDir = process.env.DATA_DIR ?? "./data";
  return join(dataDir, "auth.db");
}

export function getDb(): DatabaseType {
  if (db) return db;
  mkdirSync(dirname(databasePath()), { recursive: true });
  db = new BetterSqlite3(databasePath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Один процесс — WAL + NORMAL безопасны и заметно быстрее на записи.
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -16000"); // ~16 МБ
  db.pragma("mmap_size = 67108864"); // 64 МБ
  db.pragma("temp_store = MEMORY");
  ensureUserBillingColumn(db);
  return db;
}

/**
 * better-auth 1.7 не добавляет новые additionalFields к уже созданной таблице
 * `user` автоматически и падает с ошибкой схемы. Идемпотентно добавляем колонку
 * баланса до первой проверки схемы better-auth. На чистой базе колонку создаст
 * сам better-auth — тогда этот код ничего не делает.
 */
function ensureUserBillingColumn(instance: DatabaseType): void {
  const columns = instance
    .prepare(`PRAGMA table_info("user")`)
    .all() as { name: string }[];
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "balanceRub")) return;
  instance.exec(`ALTER TABLE "user" ADD COLUMN "balanceRub" integer`);
}

/**
 * Колонки, добавленные в `payment` после первого релиза оплаты: сколько
 * зачислить (для пакетов больше оплаченного) и какой пакет куплен.
 * Только ADD COLUMN — существующие строки не меняются.
 */
function ensurePaymentColumns(instance: DatabaseType): void {
  const columns = new Set(
    (
      instance.prepare(`PRAGMA table_info("payment")`).all() as {
        name: string;
      }[]
    ).map((column) => column.name),
  );
  if (!columns.has("creditRub")) {
    instance.exec(`ALTER TABLE "payment" ADD COLUMN "creditRub" INTEGER`);
  }
  if (!columns.has("packId")) {
    instance.exec(`ALTER TABLE "payment" ADD COLUMN "packId" TEXT`);
  }
}

const statements = new Map<string, Statement>();
const MAX_STATEMENTS = 100;

/**
 * Готовит SQL и держит выражение в кеше. Ограничение размера важно для
 * динамических запросов (список ассетов с разным числом `?`).
 */
function stmt(sql: string): Statement {
  let prepared = statements.get(sql);
  if (!prepared) {
    if (statements.size >= MAX_STATEMENTS) {
      const oldest = statements.keys().next().value;
      if (oldest !== undefined) statements.delete(oldest);
    }
    prepared = getDb().prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

/** Создаёт таблицы при первом обращении (идемпотентно). */
export function ensureSchema(): void {
  if (schemaReady) return;
  const instance = getDb();
  instance.exec(SCHEMA);
  ensurePaymentColumns(instance);
  schemaReady = true;

  // Незавершённые задачи от прошлого процесса (старше 30 мин) помечаем
  // как прерванные — иначе они «висят» в статусе pending/processing.
  if (!staleChecked) {
    staleChecked = true;
    const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    instance
      .prepare(
        `UPDATE "generation"
            SET "status" = 'failed',
                "error" = COALESCE("error", 'Генерация прервана перезапуском сервера'),
                "updatedAt" = ?
          WHERE "status" IN ('pending','processing') AND "updatedAt" < ?`,
      )
      .run(new Date().toISOString(), threshold);
  }
}

function mapGeneration(row: GenerationRow): Generation {
  let params: GenerationParams = {};
  try {
    params = JSON.parse(row.params) as GenerationParams;
  } catch {
    params = {};
  }
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    model: row.model,
    prompt: row.prompt,
    params,
    sourceKey: row.sourceKey,
    sourceContentType: row.sourceContentType,
    providerRunId: row.providerRunId,
    costUsd: row.costUsd,
    error: row.error,
    favorite: row.favorite === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAsset(row: AssetRow): GenerationAsset {
  return {
    id: row.id,
    generationId: row.generationId,
    kind: row.kind,
    s3Key: row.s3Key,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    position: row.position,
    createdAt: row.createdAt,
  };
}

export interface CreateGenerationInput {
  userId: string;
  kind: GenerationKind;
  model: string;
  prompt?: string;
  params: GenerationParams;
  sourceKey?: string | null;
  sourceContentType?: string | null;
}

export function createGeneration(input: CreateGenerationInput): Generation {
  ensureSchema();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  stmt(
    `INSERT INTO "generation"
        ("id","userId","kind","status","model","prompt","params","sourceKey","sourceContentType","providerRunId","costUsd","error","favorite","createdAt","updatedAt")
       VALUES (@id,@userId,@kind,'pending',@model,@prompt,@params,@sourceKey,@sourceContentType,NULL,NULL,NULL,0,@createdAt,@updatedAt)`,
  ).run({
    id,
    userId: input.userId,
    kind: input.kind,
    model: input.model,
    prompt: input.prompt ?? "",
    params: JSON.stringify(input.params ?? {}),
    sourceKey: input.sourceKey ?? null,
    sourceContentType: input.sourceContentType ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getGeneration(id) as Generation;
}

export function getGeneration(id: string): GenerationWithAssets | null {
  ensureSchema();
  const row = stmt(`SELECT * FROM "generation" WHERE "id" = ?`).get(id) as
    | GenerationRow
    | undefined;
  if (!row) return null;
  const assets = stmt(
    `SELECT * FROM "generation_asset" WHERE "generationId" = ? ORDER BY "position" ASC, "createdAt" ASC`,
  ).all(id) as AssetRow[];
  return { ...mapGeneration(row), assets: assets.map(mapAsset) };
}

export interface ListGenerationsOptions {
  kind?: GenerationKind;
  favorite?: boolean;
  limit?: number;
  before?: { createdAt: string; id: string };
}

export function listGenerations(
  userId: string,
  options: ListGenerationsOptions = {},
): GenerationWithAssets[] {
  ensureSchema();
  const where: string[] = [`"userId" = @userId`];
  const params: Record<string, unknown> = { userId };
  if (options.kind) {
    where.push(`"kind" = @kind`);
    params.kind = options.kind;
  }
  if (options.favorite) {
    where.push(`"favorite" = 1`);
  }
  if (options.before) {
    where.push(
      `("createdAt" < @beforeCreatedAt OR ("createdAt" = @beforeCreatedAt AND "id" < @beforeId))`,
    );
    params.beforeCreatedAt = options.before.createdAt;
    params.beforeId = options.before.id;
  }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);

  const rows = stmt(
    `SELECT * FROM "generation" WHERE ${where.join(" AND ")} ORDER BY "createdAt" DESC, "id" DESC LIMIT @limit`,
  ).all({ ...params, limit }) as GenerationRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const assetRows = stmt(
    `SELECT * FROM "generation_asset" WHERE "generationId" IN (${placeholders}) ORDER BY "position" ASC, "createdAt" ASC`,
  ).all(...ids) as AssetRow[];

  const byGeneration = new Map<string, GenerationAsset[]>();
  for (const asset of assetRows) {
    const list = byGeneration.get(asset.generationId) ?? [];
    list.push(mapAsset(asset));
    byGeneration.set(asset.generationId, list);
  }

  return rows.map((row) => ({
    ...mapGeneration(row),
    assets: byGeneration.get(row.id) ?? [],
  }));
}

export interface UpdateGenerationPatch {
  status?: GenerationStatus;
  prompt?: string;
  providerRunId?: string | null;
  costUsd?: number | null;
  error?: string | null;
}

export function updateGeneration(
  id: string,
  patch: UpdateGenerationPatch,
): void {
  ensureSchema();
  const sets: string[] = [`"updatedAt" = @updatedAt`];
  const params: Record<string, unknown> = {
    id,
    updatedAt: new Date().toISOString(),
  };
  if (patch.status !== undefined) {
    sets.push(`"status" = @status`);
    params.status = patch.status;
  }
  if (patch.prompt !== undefined) {
    sets.push(`"prompt" = @prompt`);
    params.prompt = patch.prompt;
  }
  if (patch.providerRunId !== undefined) {
    sets.push(`"providerRunId" = @providerRunId`);
    params.providerRunId = patch.providerRunId;
  }
  if (patch.costUsd !== undefined) {
    sets.push(`"costUsd" = @costUsd`);
    params.costUsd = patch.costUsd;
  }
  if (patch.error !== undefined) {
    sets.push(`"error" = @error`);
    params.error = patch.error;
  }
  stmt(`UPDATE "generation" SET ${sets.join(", ")} WHERE "id" = @id`).run(
    params,
  );
}

export interface AddAssetInput {
  generationId: string;
  kind: "image" | "video";
  s3Key: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  position?: number;
}

export function addAsset(input: AddAssetInput): GenerationAsset {
  ensureSchema();
  const id = crypto.randomUUID();
  stmt(
    `INSERT INTO "generation_asset"
        ("id","generationId","kind","s3Key","contentType","width","height","durationSec","position","createdAt")
       VALUES (@id,@generationId,@kind,@s3Key,@contentType,@width,@height,@durationSec,@position,@createdAt)`,
  ).run({
    id,
    generationId: input.generationId,
    kind: input.kind,
    s3Key: input.s3Key,
    contentType: input.contentType,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSec: input.durationSec ?? null,
    position: input.position ?? 0,
    createdAt: new Date().toISOString(),
  });
  const row = stmt(`SELECT * FROM "generation_asset" WHERE "id" = ?`).get(
    id,
  ) as AssetRow;
  return mapAsset(row);
}

export function nextAssetPosition(generationId: string): number {
  ensureSchema();
  const row = stmt(
    `SELECT COUNT(*) AS "count" FROM "generation_asset" WHERE "generationId" = ?`,
  ).get(generationId) as { count: number };
  return row.count;
}

/** Удаляет генерацию и возвращает список S3-ключей для очистки. */
export function deleteGeneration(id: string): string[] {
  ensureSchema();
  const keys: string[] = [];
  const generation = stmt(
    `SELECT "sourceKey" FROM "generation" WHERE "id" = ?`,
  ).get(id) as { sourceKey: string | null } | undefined;
  if (generation?.sourceKey) keys.push(generation.sourceKey);

  const assets = stmt(
    `SELECT "s3Key" FROM "generation_asset" WHERE "generationId" = ?`,
  ).all(id) as { s3Key: string }[];
  for (const asset of assets) keys.push(asset.s3Key);

  stmt(`DELETE FROM "generation" WHERE "id" = ?`).run(id);
  return keys;
}

export function setFavorite(id: string, favorite: boolean): void {
  ensureSchema();
  stmt(
    `UPDATE "generation" SET "favorite" = ?, "updatedAt" = ? WHERE "id" = ?`,
  ).run(favorite ? 1 : 0, new Date().toISOString(), id);
}

export function incrementGenerationsUsed(userId: string, delta: number): void {
  if (delta <= 0) return;
  ensureSchema();
  stmt(
    `UPDATE "user" SET "generationsUsed" = COALESCE("generationsUsed", 0) + ? WHERE "id" = ?`,
  ).run(delta, userId);
}

export interface UserUsage {
  plan: string | null;
  generationsUsed: number | null;
  balanceRub: number | null;
}

/** Свежие счётчик генераций и баланс (в обход cookie-кеша сессии). */
export function getUserUsage(userId: string): UserUsage | null {
  ensureSchema();
  const row = stmt(
    `SELECT "plan", "generationsUsed", "balanceRub" FROM "user" WHERE "id" = ?`,
  ).get(userId) as UserUsage | undefined;
  return row ?? null;
}

/**
 * Списывает сумму с баланса. Возвращает false, если денег не хватило
 * (защита от гонок: два запроса не уйдут в минус).
 */
export function deductBalance(userId: string, amount: number): boolean {
  if (amount <= 0) return true;
  ensureSchema();
  const info = stmt(
    `UPDATE "user" SET "balanceRub" = COALESCE("balanceRub", 0) - ?
      WHERE "id" = ? AND COALESCE("balanceRub", 0) >= ?`,
  ).run(amount, userId, amount);
  return info.changes > 0;
}

/** Пополняет баланс. Используется для ручного зачисления и оплаты (см. creditPayment). */
export function addBalance(userId: string, amount: number): void {
  if (amount <= 0) return;
  ensureSchema();
  stmt(
    `UPDATE "user" SET "balanceRub" = COALESCE("balanceRub", 0) + ? WHERE "id" = ?`,
  ).run(amount, userId);
}

// --- Платежи (пополнение баланса через Exenta Pay) ---

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export interface Payment {
  id: string;
  userId: string;
  providerUuid: string | null;
  /** Сколько платит покупатель. */
  amountRub: number;
  /** Сколько зачислить на баланс; NULL у старых записей — значит amountRub. */
  creditRub: number | null;
  /** Купленный пакет (NULL — обычное пополнение). */
  packId: string | null;
  status: PaymentStatus;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Сумма к зачислению на баланс. */
export function paymentCreditRub(payment: Payment): number {
  return payment.creditRub ?? payment.amountRub;
}

export interface CreatePaymentInput {
  userId: string;
  amountRub: number;
  creditRub?: number;
  packId?: string | null;
}

/** Черновик платежа: создаётся до запроса к провайдеру, чтобы знать URL возврата. */
export function createPayment(input: CreatePaymentInput): Payment {
  ensureSchema();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  stmt(
    `INSERT INTO "payment" ("id","userId","providerUuid","amountRub","creditRub","packId","status","creditedAt","createdAt","updatedAt")
       VALUES (?,?,NULL,?,?,?,'CREATED',NULL,?,?)`,
  ).run(
    id,
    input.userId,
    input.amountRub,
    input.creditRub ?? input.amountRub,
    input.packId ?? null,
    now,
    now,
  );
  return getPayment(id) as Payment;
}

export function getPayment(id: string): Payment | null {
  ensureSchema();
  return (
    (stmt(`SELECT * FROM "payment" WHERE "id" = ?`).get(id) as
      | Payment
      | undefined) ?? null
  );
}

export function getPaymentByProviderUuid(uuid: string): Payment | null {
  ensureSchema();
  return (
    (stmt(`SELECT * FROM "payment" WHERE "providerUuid" = ?`).get(uuid) as
      | Payment
      | undefined) ?? null
  );
}

/** Сколько неоплаченных счетов пользователь создал с момента `since` (ISO). */
export function countOpenPayments(userId: string, since: string): number {
  ensureSchema();
  const row = stmt(
    `SELECT COUNT(*) AS "count" FROM "payment"
      WHERE "userId" = ? AND "status" IN ('CREATED','PENDING') AND "createdAt" >= ?`,
  ).get(userId, since) as { count: number };
  return row.count;
}

export function attachProviderPayment(
  id: string,
  providerUuid: string,
  status: Exclude<PaymentStatus, "SUCCESS">,
): void {
  ensureSchema();
  stmt(
    `UPDATE "payment" SET "providerUuid" = ?, "status" = ?, "updatedAt" = ? WHERE "id" = ?`,
  ).run(providerUuid, status, new Date().toISOString(), id);
}

/**
 * Обновляет статус неоплаченного платежа. Оплаченный (SUCCESS) не трогаем:
 * успех проводится только через creditPayment.
 */
export function setPaymentStatus(
  id: string,
  status: Exclude<PaymentStatus, "SUCCESS">,
): void {
  ensureSchema();
  stmt(
    `UPDATE "payment" SET "status" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" <> 'SUCCESS'`,
  ).run(status, new Date().toISOString(), id);
}

/**
 * Помечает платёж оплаченным и зачисляет сумму на баланс — в одной транзакции
 * и ровно один раз: вебхук и опрос статуса могут прийти одновременно.
 * Возвращает true, если зачисление произошло именно сейчас.
 */
export function creditPayment(
  id: string,
  onCredited?: (payment: Payment) => void,
): boolean {
  ensureSchema();
  const run = getDb().transaction((paymentId: string) => {
    const now = new Date().toISOString();
    const info = stmt(
      `UPDATE "payment" SET "status" = 'SUCCESS', "creditedAt" = ?, "updatedAt" = ?
        WHERE "id" = ? AND "creditedAt" IS NULL`,
    ).run(now, now, paymentId);
    if (info.changes === 0) return false;
    const payment = getPayment(paymentId) as Payment;
    addBalance(payment.userId, paymentCreditRub(payment));
    // В той же транзакции: зачисление и исходящее событие не расходятся.
    onCredited?.(payment);
    return true;
  });
  return run(id);
}

export interface CashxOutboxRow {
  id: number;
  eventId: string;
  payload: string;
  attempts: number;
}

/** Кладёт событие партнёрки в очередь. Повтор того же eventId игнорируется. */
export function enqueueCashxEvent(eventId: string, payload: unknown): void {
  ensureSchema();
  const now = new Date().toISOString();
  stmt(
    `INSERT OR IGNORE INTO "cashx_outbox" ("eventId", "payload", "nextAttemptAt", "createdAt")
     VALUES (?, ?, ?, ?)`,
  ).run(eventId, JSON.stringify(payload), now, now);
}

/**
 * События, которым пора уходить, строго по порядку постановки: если самое
 * раннее ещё ждёт повтора, более поздние (платёж) его не обгоняют.
 */
export function listDueCashxEvents(limit: number): CashxOutboxRow[] {
  ensureSchema();
  const now = new Date().toISOString();
  const pending = stmt(
    `SELECT "id", "eventId", "payload", "attempts", "nextAttemptAt" FROM "cashx_outbox"
      WHERE "status" = 'pending' ORDER BY "id" LIMIT ?`,
  ).all(limit) as (CashxOutboxRow & { nextAttemptAt: string })[];
  const due: CashxOutboxRow[] = [];
  for (const row of pending) {
    if (row.nextAttemptAt > now) break;
    due.push({
      id: row.id,
      eventId: row.eventId,
      payload: row.payload,
      attempts: row.attempts,
    });
  }
  return due;
}

export function markCashxEventSent(id: number): void {
  stmt(`UPDATE "cashx_outbox" SET "status" = 'sent', "lastError" = NULL WHERE "id" = ?`).run(id);
}

/** Откладывает повтор; при `dead` больше не пытаемся. */
export function markCashxEventFailed(
  id: number,
  error: string,
  nextAttemptAt: Date,
  dead: boolean,
): void {
  stmt(
    `UPDATE "cashx_outbox" SET "attempts" = "attempts" + 1, "lastError" = ?,
            "nextAttemptAt" = ?, "status" = ? WHERE "id" = ?`,
  ).run(error.slice(0, 500), nextAttemptAt.toISOString(), dead ? "dead" : "pending", id);
}

// --- Платёжный шлюз для внешних проектов (см. lib/gateway.ts) ---

export type GatewayPaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELED";

export interface GatewayPayment {
  id: string;
  projectId: string;
  /** Идентификатор платежа во внешнем проекте (ключ идемпотентности). */
  externalId: string;
  externalUserId: string | null;
  purpose: string | null;
  method: string | null;
  amountRub: number;
  /** uuid счёта в Exenta. */
  providerUuid: string | null;
  redirectUrl: string | null;
  /** Куда вернуть покупателя с нашей страницы возврата. */
  returnUrl: string | null;
  buyerIp: string | null;
  status: GatewayPaymentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGatewayPaymentInput {
  projectId: string;
  externalId: string;
  externalUserId?: string | null;
  purpose?: string | null;
  method?: string | null;
  amountRub: number;
  returnUrl?: string | null;
  buyerIp?: string | null;
}

/** Черновик счёта шлюза: создаётся до запроса к Exenta (нужен id для return-токена). */
export function createGatewayPayment(input: CreateGatewayPaymentInput): GatewayPayment {
  ensureSchema();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  stmt(
    `INSERT INTO "gateway_payment"
        ("id","projectId","externalId","externalUserId","purpose","method","amountRub","providerUuid","redirectUrl","returnUrl","buyerIp","status","paidAt","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?,'CREATED',NULL,?,?)`,
  ).run(
    id,
    input.projectId,
    input.externalId,
    input.externalUserId ?? null,
    input.purpose ?? null,
    input.method ?? null,
    input.amountRub,
    input.returnUrl ?? null,
    input.buyerIp ?? null,
    now,
    now,
  );
  return getGatewayPayment(id) as GatewayPayment;
}

export function getGatewayPayment(id: string): GatewayPayment | null {
  ensureSchema();
  return (
    (stmt(`SELECT * FROM "gateway_payment" WHERE "id" = ?`).get(id) as
      | GatewayPayment
      | undefined) ?? null
  );
}

/** Идемпотентность создания: повтор с тем же externalId возвращает тот же счёт. */
export function getGatewayPaymentByExternalId(
  projectId: string,
  externalId: string,
): GatewayPayment | null {
  ensureSchema();
  return (
    (stmt(
      `SELECT * FROM "gateway_payment" WHERE "projectId" = ? AND "externalId" = ?`,
    ).get(projectId, externalId) as GatewayPayment | undefined) ?? null
  );
}

export function getGatewayPaymentByProviderUuid(uuid: string): GatewayPayment | null {
  ensureSchema();
  return (
    (stmt(`SELECT * FROM "gateway_payment" WHERE "providerUuid" = ?`).get(uuid) as
      | GatewayPayment
      | undefined) ?? null
  );
}

/** Сколько незавершённых счетов проект создал с момента `since` (ISO). */
export function countOpenGatewayPayments(projectId: string, since: string): number {
  ensureSchema();
  const row = stmt(
    `SELECT COUNT(*) AS "count" FROM "gateway_payment"
      WHERE "projectId" = ? AND "status" IN ('CREATED','PENDING') AND "createdAt" >= ?`,
  ).get(projectId, since) as { count: number };
  return row.count;
}

export function attachGatewayProvider(
  id: string,
  providerUuid: string,
  redirectUrl: string,
  status: Exclude<GatewayPaymentStatus, "PAID"> = "PENDING",
): GatewayPayment {
  ensureSchema();
  stmt(
    `UPDATE "gateway_payment" SET "providerUuid" = ?, "redirectUrl" = ?, "status" = ?, "updatedAt" = ?
      WHERE "id" = ? AND "paidAt" IS NULL`,
  ).run(providerUuid, redirectUrl, status, new Date().toISOString(), id);
  return getGatewayPayment(id) as GatewayPayment;
}

/** Обновляет статус незавершённого счёта; оплаченный (PAID) не откатываем. */
export function setGatewayPaymentStatus(
  id: string,
  status: Exclude<GatewayPaymentStatus, "PAID">,
): void {
  ensureSchema();
  stmt(
    `UPDATE "gateway_payment" SET "status" = ?, "updatedAt" = ? WHERE "id" = ? AND "paidAt" IS NULL`,
  ).run(status, new Date().toISOString(), id);
}

/**
 * Помечает счёт оплаченным ровно один раз (вебхук и опрос статуса могут
 * прийти одновременно). Возвращает true, если переход случился именно сейчас.
 */
export function markGatewayPaid(id: string): boolean {
  ensureSchema();
  const now = new Date().toISOString();
  const info = stmt(
    `UPDATE "gateway_payment" SET "status" = 'PAID', "paidAt" = ?, "updatedAt" = ?
      WHERE "id" = ? AND "paidAt" IS NULL`,
  ).run(now, now, id);
  return info.changes > 0;
}

export interface GatewayOutboxRow {
  id: number;
  eventId: string;
  projectId: string;
  paymentId: string;
  payload: string;
  attempts: number;
}

/** Ставит колбэк проекта в очередь. Повтор того же eventId игнорируется. */
export function enqueueGatewayCallback(
  eventId: string,
  projectId: string,
  paymentId: string,
  payload: unknown,
): void {
  ensureSchema();
  const now = new Date().toISOString();
  stmt(
    `INSERT OR IGNORE INTO "gateway_outbox" ("eventId","projectId","paymentId","payload","nextAttemptAt","createdAt")
     VALUES (?,?,?,?,?,?)`,
  ).run(eventId, projectId, paymentId, JSON.stringify(payload), now, now);
}

/** Колбэки, которым пора уходить, строго по порядку постановки. */
export function listDueGatewayCallbacks(limit: number): GatewayOutboxRow[] {
  ensureSchema();
  const now = new Date().toISOString();
  const pending = stmt(
    `SELECT "id","eventId","projectId","paymentId","payload","attempts","nextAttemptAt" FROM "gateway_outbox"
      WHERE "status" = 'pending' ORDER BY "id" LIMIT ?`,
  ).all(limit) as (GatewayOutboxRow & { nextAttemptAt: string })[];
  const due: GatewayOutboxRow[] = [];
  for (const row of pending) {
    if (row.nextAttemptAt > now) break;
    due.push({
      id: row.id,
      eventId: row.eventId,
      projectId: row.projectId,
      paymentId: row.paymentId,
      payload: row.payload,
      attempts: row.attempts,
    });
  }
  return due;
}

export function markGatewayCallbackSent(id: number): void {
  ensureSchema();
  stmt(`UPDATE "gateway_outbox" SET "status" = 'sent', "lastError" = NULL WHERE "id" = ?`).run(id);
}

export function markGatewayCallbackFailed(
  id: number,
  error: string,
  nextAttemptAt: Date,
  dead: boolean,
): void {
  ensureSchema();
  stmt(
    `UPDATE "gateway_outbox" SET "attempts" = "attempts" + 1, "lastError" = ?,
            "nextAttemptAt" = ?, "status" = ? WHERE "id" = ?`,
  ).run(error.slice(0, 500), nextAttemptAt.toISOString(), dead ? "dead" : "pending", id);
}

// --- Настройки витрины (админка) ---

/** Все сохранённые настройки как `key → value`. Отсутствующие ключи — значения по умолчанию (см. lib/settings.ts). */
export function getAppSettings(): Record<string, string> {
  ensureSchema();
  const rows = stmt(`SELECT "key", "value" FROM "app_setting"`).all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setAppSetting(key: string, value: string): void {
  ensureSchema();
  stmt(
    `INSERT INTO "app_setting" ("key", "value", "updatedAt") VALUES (?, ?, ?)
       ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
  ).run(key, value, new Date().toISOString());
}

// --- Пользователи (админка) ---

export type AdminUserSort = "balance" | "created";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  balanceRub: number;
  generationsUsed: number;
  /** Сумма успешно оплаченных счетов (то, что пользователь заплатил, а не зачислено). */
  paidRub: number;
}

export interface AdminUsersSummary {
  total: number;
  totalBalanceRub: number;
  withBalance: number;
}

/** Условие поиска по email/имени. `%` и `_` в запросе экранируются. */
function adminUserFilter(search: string | null): { where: string; params: string[] } {
  const query = search?.trim();
  if (!query) return { where: "", params: [] };
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return {
    where: `WHERE u."email" LIKE ? ESCAPE '\\' OR u."name" LIKE ? ESCAPE '\\'`,
    params: [pattern, pattern],
  };
}

export function listUsersForAdmin(options: {
  search: string | null;
  sort: AdminUserSort;
  limit: number;
  offset: number;
}): AdminUserRow[] {
  ensureSchema();
  const { where, params } = adminUserFilter(options.search);
  const order =
    options.sort === "balance"
      ? `"balanceRub" DESC, u."createdAt" DESC`
      : `u."createdAt" DESC`;
  return stmt(
    `SELECT u."id", u."name", u."email", u."createdAt",
            COALESCE(u."balanceRub", 0) AS "balanceRub",
            COALESCE(u."generationsUsed", 0) AS "generationsUsed",
            COALESCE((SELECT SUM(p."amountRub") FROM "payment" p
                       WHERE p."userId" = u."id" AND p."status" = 'SUCCESS'), 0) AS "paidRub"
       FROM "user" u
       ${where}
      ORDER BY ${order}, u."id"
      LIMIT ? OFFSET ?`,
  ).all(...params, options.limit, options.offset) as AdminUserRow[];
}

export function countUsersForAdmin(search: string | null): number {
  ensureSchema();
  const { where, params } = adminUserFilter(search);
  const row = stmt(`SELECT COUNT(*) AS "count" FROM "user" u ${where}`).get(
    ...params,
  ) as { count: number };
  return row.count;
}

export function getUsersSummary(): AdminUsersSummary {
  ensureSchema();
  const row = stmt(
    `SELECT COUNT(*) AS "total",
            COALESCE(SUM(COALESCE("balanceRub", 0)), 0) AS "totalBalanceRub",
            COALESCE(SUM(CASE WHEN COALESCE("balanceRub", 0) > 0 THEN 1 ELSE 0 END), 0) AS "withBalance"
       FROM "user"`,
  ).get() as AdminUsersSummary;
  return row;
}
