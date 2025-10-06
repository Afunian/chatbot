import { db } from "./db.js";
const tables = await db.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema='public'
  ORDER BY 1`);
console.log("Tables:", tables.rows.map(r => r.table_name));

const counts = await db.query(`
  SELECT 'sources' AS t, COUNT(*)::int AS n FROM public.sources
  UNION ALL
  SELECT 'chunks', COUNT(*)::int FROM public.chunks
  UNION ALL
  SELECT 'source_events', COUNT(*)::int FROM public.source_events
`);
console.log("Counts:", counts.rows);
await db.end();

