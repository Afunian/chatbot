// src/db.js
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { config as dotenv } from "dotenv";

// Load repo-root .env (…/packages/ingest/src -> up 3 levels)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
dotenv({ path: path.join(projectRoot, ".env"), override: true });

// --- DSN + SNI ---
const dsn = process.env.SUPABASE_DB_URL;
if (!dsn) {
  console.error("❌ SUPABASE_DB_URL is not set. Put it in C:\\dentistrygpt\\.env or in GitHub Actions secret.");
  process.exit(1);
}
let urlObj;
try {
  urlObj = new URL(dsn);
} catch (e) {
  console.error("❌ Invalid SUPABASE_DB_URL:", e.message);
  process.exit(1);
}
// Keep SNI on the real hostname even if we connect to an IPv4 address
const sniHost = process.env.PG_SNI_HOST || urlObj.hostname;

// If CI provides an IPv4 override, replace only the hostname in the DSN
let effectiveDsn = dsn;
if (process.env.PG_HOST_OVERRIDE) {
  const u = new URL(dsn);
  u.hostname = process.env.PG_HOST_OVERRIDE;
  effectiveDsn = u.toString();
}

// --- CA file discovery (Linux CI + Windows local) ---
const candidates = [
  process.env.SSL_CA_PEM_PATH,
  process.env.NODE_EXTRA_CA_CERTS,
  "/tmp/certs/supabase-root-2021.pem",     // GitHub Actions (ubuntu-latest)
  "C:\\certs\\supabase-root-2021.pem",     // Your Windows dev box
].filter(Boolean);

const caPath = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!caPath) {
  console.error("❌ No CA file found. Set SSL_CA_PEM_PATH or place the PEM at C:\\certs\\supabase-root-2021.pem (CI writes /tmp/certs/...).");
  process.exit(1);
}
const caPem = fs.readFileSync(caPath, "utf8");
console.log(`[db] Using CA: ${caPath}`);
console.log(`[db] TLS SNI: ${sniHost}`);

export const db = new pg.Pool({
  connectionString: effectiveDsn,
  ssl: {
    ca: caPem,
    rejectUnauthorized: true,
    servername: sniHost,   // validate cert against real hostname
  },
});
