import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? "./data";
const dbPath = join(dataDir, "auth.db");

mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
db.close();

console.log(`[init-db] схема готова: ${dbPath}`);
