// src/db.js
import fs from "fs";
import pg from "pg";

export const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: fs.readFileSync("C:\\certs\\supabase-root-2021.pem", "ascii"),
    rejectUnauthorized: true,
  },
});