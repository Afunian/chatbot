const { Client } = require("pg");
const fs = require("fs");

const ca = fs.readFileSync("C:\\certs\\supabase-root.crt", "utf8"); // <— use this exact file
const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL,   // includes ?sslmode=verify-full
  ssl: { ca, rejectUnauthorized: true },
});

c.connect()
 .then(async () => {
   const r = await c.query("select version() as v, current_setting('ssl') as ssl");
   console.log("Node PG TLS: OK", r.rows[0]);
   await c.end();
 })
 .catch(e => {
   console.error("Node PG TLS: FAIL", e.message);
   process.exit(1);
 });
