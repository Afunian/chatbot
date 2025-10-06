// src/seed-smart.mjs
import { db } from "./db.js";

// get column metadata for a table
async function describe(table) {
  const { rows } = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`, [table]
  );
  return rows;
}
const has = (cols, name) => cols.some(c => c.column_name === name);

(async () => {
  // --- 1) Insert a source ---
  const sCols = await describe("sources");
  const sFields = [];
  const sValues = [];
  const sParams = [];
  let i = 1;

  // try common descriptive columns if they exist
  if (has(sCols, "name")) { sFields.push("name"); sValues.push(`$${i++}`); sParams.push("demo-source"); }
  if (has(sCols, "uri"))  { sFields.push("uri");  sValues.push(`$${i++}`); sParams.push("demo://uri"); }
  if (has(sCols, "url"))  { sFields.push("url");  sValues.push(`$${i++}`); sParams.push("https://example.test"); }
  if (has(sCols, "path")) { sFields.push("path"); sValues.push(`$${i++}`); sParams.push("/demo/path.txt"); }
  if (has(sCols, "type")) { sFields.push("type"); sValues.push(`$${i++}`); sParams.push("demo"); }

  // created_at if present — use now()
  if (has(sCols, "created_at")) { sFields.push("created_at"); sValues.push("now()"); }

  // Fallback: if we didn't set any user columns, try DEFAULT VALUES
  let srcRow;
  if (sFields.length === 0) {
    // This succeeds only if all NOT NULL columns in sources have defaults.
    // If it fails, add a column above that exists in your schema.
    ({ rows: [srcRow] } = await db.query(`INSERT INTO public.sources DEFAULT VALUES RETURNING id`));
  } else {
    const q = `INSERT INTO public.sources(${sFields.join(",")}) VALUES(${sValues.join(",")}) RETURNING id`;
    ({ rows: [srcRow] } = await db.query(q, sParams));
  }
  const sourceId = srcRow.id;
  console.log("Inserted source id:", sourceId);

  // --- 2) Insert a couple of chunks for that source (if cols exist) ---
  const cCols = await describe("chunks");
  const insertChunk = async (contentText) => {
    const f = [], v = [], p = []; let j = 1;
    if (has(cCols, "source_id")) { f.push("source_id"); v.push(`$${j++}`); p.push(sourceId); }
    if (has(cCols, "content"))   { f.push("content");   v.push(`$${j++}`); p.push(contentText); }
    if (has(cCols, "created_at")){ f.push("created_at");v.push("now()"); }
    if (f.length === 0) return; // nothing we can safely set
    await db.query(`INSERT INTO public.chunks(${f.join(",")}) VALUES(${v.join(",")})`, p);
  };
  await insertChunk("hello world");
  await insertChunk("lorem ipsum");

  // --- 3) Insert a source_event for that source (if cols exist) ---
  const eCols = await describe("source_events");
  const eF = [], eV = [], eP = []; let k = 1;
  if (has(eCols, "source_id")) { eF.push("source_id"); eV.push(`$${k++}`); eP.push(sourceId); }
  if (has(eCols, "event"))     { eF.push("event");     eV.push(`$${k++}`); eP.push("seeded"); }
  if (has(eCols, "created_at")){ eF.push("created_at");eV.push("now()"); }
  if (eF.length > 0) {
    await db.query(`INSERT INTO public.source_events(${eF.join(",")}) VALUES(${eV.join(",")})`, eP);
  }

  // --- 4) Report ---
  const counts = await db.query(`
    SELECT 'sources' AS t, COUNT(*)::int AS n FROM public.sources
    UNION ALL SELECT 'chunks', COUNT(*)::int FROM public.chunks
    UNION ALL SELECT 'source_events', COUNT(*)::int FROM public.source_events
  `);
  console.log("Counts after seed:", counts.rows);

  await db.end();
})().catch(async (e) => {
  console.error("Seed failed:", e.message);
  try { await db.end(); } catch {}
  process.exit(1);
});