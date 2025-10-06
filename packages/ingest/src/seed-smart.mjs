// src/seed-smart.mjs
import { db } from "./db.js";
import crypto from "node:crypto";

// describe columns for a table
async function describe(table) {
  const { rows } = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`, [table]
  );
  return rows;
}
const has = (cols, name) => cols.some(c => c.column_name === name);

// detect allowed values for source_events.event from the CHECK constraint
async function pickEventValue() {
  try {
    const { rows } = await db.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.source_events'::regclass
        AND conname  = 'source_events_event_check'
        AND contype  = 'c'
      LIMIT 1
    `);
    if (rows.length) {
      const def = rows[0].def || '';
      // Try to match:  CHECK (event IN ('a','b','c'))
      let m = def.match(/IN\s*\(([^)]+)\)/i);
      // Or: CHECK ((event = ANY (ARRAY['a'::text,'b'::text])))
      if (!m) m = def.match(/ARRAY\[(.+?)\]/i);
      if (m) {
        const list = m[1]
          .split(',')
          .map(s => s.replace(/::\w+/g,'').replace(/['"\s]/g,''))
          .filter(Boolean);
        if (list.length) return list[0]; // pick the first allowed value
      }
    }
  } catch {}
  return 'ingested'; // safe generic fallback
}

(async () => {
  const srcUrl = "https://example.test/";
  const srcDomain = "example.test";

  // ---------- 1) Upsert-ish source by URL ----------
  const sCols = await describe("sources");

  const sFields = [];
  const sValues = [];
  const sParams = [];
  let i = 1;

  if (has(sCols, "url"))    { sFields.push("url");    sValues.push(`$${i++}`); sParams.push(srcUrl); }
  if (has(sCols, "domain")) { sFields.push("domain"); sValues.push(`$${i++}`); sParams.push(srcDomain); }
  if (has(sCols, "name"))   { sFields.push("name");   sValues.push(`$${i++}`); sParams.push("demo-source"); }
  if (has(sCols, "type"))   { sFields.push("type");   sValues.push(`$${i++}`); sParams.push("demo"); }
  if (has(sCols, "path"))   { sFields.push("path");   sValues.push(`$${i++}`); sParams.push("/demo/path.txt"); }
  if (has(sCols, "created_at")) { sFields.push("created_at"); sValues.push("now()"); }
  if (has(sCols, "updated_at")) { sFields.push("updated_at"); sValues.push("now()"); }

  const conflictTarget = has(sCols, "url") ? "(url)" : "";
  const insertSql =
    `INSERT INTO public.sources(${sFields.join(",")})
     VALUES(${sValues.join(",")})
     ON CONFLICT ${conflictTarget} DO NOTHING
     RETURNING id`;

  let result = await db.query(insertSql, sParams);

  let sourceId;
  if (result.rows.length) {
    sourceId = result.rows[0].id;
  } else {
    if (has(sCols, "url")) {
      ({ rows: [ { id: sourceId } ] } =
        await db.query("SELECT id FROM public.sources WHERE url = $1 LIMIT 1", [srcUrl]));
    } else if (has(sCols, "domain")) {
      ({ rows: [ { id: sourceId } ] } =
        await db.query("SELECT id FROM public.sources WHERE domain = $1 LIMIT 1", [srcDomain]));
    } else {
      ({ rows: [ { id: sourceId } ] } =
        await db.query("INSERT INTO public.sources DEFAULT VALUES RETURNING id"));
    }
  }
  console.log("Using source id:", sourceId);

  // ---------- 2) Insert chunks with auto seq ----------
  const cCols = await describe("chunks");

  let nextSeq = 1;
  if (has(cCols, "seq")) {
    const { rows: [r] } = await db.query(
      "SELECT COALESCE(MAX(seq),0) AS m FROM public.chunks WHERE source_id = $1", [sourceId]
    );
    nextSeq = Number(r.m) + 1;
  }

  const insertChunk = async (contentText) => {
    const f = [], v = [], p = []; let j = 1;

    if (has(cCols, "source_id"))    { f.push("source_id");    v.push(`$${j++}`); p.push(sourceId); }

    // Support either/both column names for the text payload
    const hasText = has(cCols, "text");
    const hasContent = has(cCols, "content");
    if (hasText)    { f.push("text");    v.push(`$${j++}`); p.push(contentText); }
    if (hasContent) { f.push("content"); v.push(`$${j++}`); p.push(contentText); }

    if (has(cCols, "seq"))          { f.push("seq");          v.push(`$${j++}`); p.push(nextSeq++); }

    // Hash – support either content_sha1 or text_sha1 if present
    const sha1 = crypto.createHash("sha1").update(contentText,"utf8").digest("hex");
    if (has(cCols, "content_sha1")) { f.push("content_sha1"); v.push(`$${j++}`); p.push(sha1); }
    if (has(cCols, "text_sha1"))    { f.push("text_sha1");    v.push(`$${j++}`); p.push(sha1); }

    if (has(cCols, "created_at"))   { f.push("created_at");   v.push("now()"); }
    if (has(cCols, "updated_at"))   { f.push("updated_at");   v.push("now()"); }

    if (f.length === 0) return; // nothing to insert

    await db.query(`INSERT INTO public.chunks(${f.join(",")}) VALUES(${v.join(",")})`, p);
  };

  await insertChunk("hello world");
  await insertChunk("lorem ipsum");

  // ---------- 3) Add a source_event (respect CHECK + idempotent) ----------
  const eCols = await describe("source_events");
  const eventValue = await pickEventValue();

  if (has(eCols, "source_id") && has(eCols, "event")) {
    const fields = ["source_id", "event"];
    const values = ["$1", "$2"];
    const params = [sourceId, eventValue];

    if (has(eCols, "created_at")) { fields.push("created_at"); values.push("now()"); }
    if (has(eCols, "updated_at")) { fields.push("updated_at"); values.push("now()"); }

    await db.query(
      `INSERT INTO public.source_events(${fields.join(",")})
       SELECT ${values.join(",")}
       WHERE NOT EXISTS (
         SELECT 1 FROM public.source_events WHERE source_id = $1 AND event = $2
       )`,
      params
    );
  }

  // ---------- 4) Report ----------
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
