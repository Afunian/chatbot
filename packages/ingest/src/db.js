// src/db.js
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { config as dotenv } from "dotenv";

// Load repo-root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
dotenv({ path: path.join(projectRoot, ".env"), override: true });

// Decide which CA path to use
const candidates = [
  process.env.SSL_CA_PEM_PATH,
  process.env.NODE_EXTRA_CA_CERTS,
  "C:\\\\certs\\\\supabase-root-2021.pem",
].filter(Boolean);

const caPath = candidates.find(p => {
  try { return fs.existsSync(p); } catch { return false; }
});

if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ SUPABASE_DB_URL is not set. Put it in C:\\dentistrygpt\\.env");
  process.exit(1);
}

if (!caPath) {
  console.error("❌ No CA file found. Set SSL_CA_PEM_PATH in .env or place the PEM at C:\\certs\\supabase-root-2021.pem");
  process.exit(1);
}

const caPem = fs.readFileSync(caPath, "utf8");
console.log(`[db] Using CA: ${caPath}`);

export const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: caPem,
    rejectUnauthorized: true,
  },
});

