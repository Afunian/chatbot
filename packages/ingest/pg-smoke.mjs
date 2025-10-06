import fs from "fs";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: fs.readFileSync("C:\\certs\\supabase-root-2021.pem","ascii"),
    rejectUnauthorized: true
  }
});

(async () => {
  await client.connect();
  const r = await client.query("select now()");
  console.log("PG ok:", r.rows[0]);
  await client.end();
})();
