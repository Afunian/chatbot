// src/migrate.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { config as dotenv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root from packages/ingest/src → up 3 levels
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Load env from repo root (.env) and allow current env to override if already set
dotenv({ path: path.join(projectRoot, ".env"), override: false });

// Default migrations dir = <repoRoot>/migrations (can override via env)
const defaultMigrationsDir = path.join(projectRoot, "migrations");
const migrationsDir = process.env.MIGRATIONS_DIR || defaultMigrationsDir;

// Allow: npm run migrate -- 001_init.sql  OR a full/relative path
const arg = process.argv[2] || "001_init.sql";

// If arg is an existing path (absolute or relative), use it directly; otherwise join with migrationsDir
const candidateDirect = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
const sqlPath = fs.existsSync(candidateDirect) ? candidateDirect : path.join(migrationsDir, arg);

if (!fs.existsSync(sqlPath)) {
  console.error(`❌ Migration not found: ${sqlPath}`);
  console.error(`   Tried: ${candidateDirect}`);
  console.error(`Tip A: npm run migrate -- 001_init.sql`);
  console.error(`Tip B: set MIGRATIONS_DIR env var (currently: ${migrationsDir})`);
  console.error(`Tip C: pass a full/relative path: npm run migrate -- ../../migrations/002_add_tables.sql`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

(async () => {
  try {
    console.log(`Running migration: ${sqlPath}`);
    await db.query(sql);
    console.log("✅ Migration complete");
  } catch (e) {
    console.error("❌ Migration failed:", e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();