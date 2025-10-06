// C:\dentistrygpt\packages\ingest\db.js
import fs from "fs";
import pg from "pg";
const dsn = process.env.SUPABASE_DB_URL;
const urlObj = new URL(dsn);
const sniHost = process.env.PG_SNI_HOST || urlObj.hostname;
export const db = new pg.Pool({
  connectionString: dsn,
  ssl: {
    ca: caPem,
    rejectUnauthorized: true,
    servername: sniHost, // <-- important
  },
});
