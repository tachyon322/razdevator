/**
 * Прямой доступ к SQLite (`data/auth.db`, та же БД, что у better-auth).
 *
 * Таблицы `generation` / `generation_asset` создаются идемпотентно в
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
  return db;
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
}

/** Свежие тариф и счётчик генераций (в обход cookie-кеша сессии). */
export function getUserUsage(userId: string): UserUsage | null {
  ensureSchema();
  const row = stmt(
    `SELECT "plan", "generationsUsed" FROM "user" WHERE "id" = ?`,
  ).get(userId) as UserUsage | undefined;
  return row ?? null;
}
