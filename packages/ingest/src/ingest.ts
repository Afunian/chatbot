import 'win-ca/ssl';
import { htmlToText } from 'html-to-text';
import OpenAI from 'openai';
import { Client } from 'pg';
import { Pool } from "pg";
import fs from "node:fs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL!;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'; // 1536-dim

// DB client
const db = new Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
let dbReady: Promise<void> | null = null;
function ensureDb() { return dbReady ?? (dbReady = db.connect()); }
export const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: fs.readFileSync(process.env.PGSSLROOTCERT || "C:\\certs\\pg-root-ca.pem", "utf8"),
    rejectUnauthorized: true,
  },
});
// OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- helpers ---
function extractMeta(html: string) {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
  return { title };
}
function htmlToCleanText(html: string) {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'noscript', format: 'skip' },
    ],
    preserveNewlines: true,
  }).trim();
}
function chunkText(txt: string, charsPerChunk = 3200, overlap = 250) {
  const chunks: { content: string; idx: number }[] = [];
  let i = 0, idx = 0;
  while (i < txt.length) {
    const end = Math.min(txt.length, i + charsPerChunk);
    const slice = txt.slice(i, end).trim();
    if (slice) chunks.push({ content: slice, idx });
    idx++; i = end - overlap; if (i < 0) i = 0;
  }
  return chunks;
}
async function embedAll(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const r = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return r.data.map(d => d.embedding as number[]);
}
function vecLiteral(v: number[]) { return `[${v.join(',')}]`; }

// --- DB ops (match your migration) ---
async function upsertDocument(url: string, title: string | null, rawHtml: string, content: string) {
  await ensureDb();
  const sql = `
    INSERT INTO documents (url, title, raw_html, content)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title
    RETURNING id`;
  const { rows } = await db.query(sql, [url, title, rawHtml, content]);
  return rows[0].id as number;
}
async function insertChunk(docId: number, idx: number, content: string) {
  const { rows } = await db.query(
    `INSERT INTO chunks (document_id, chunk_index, content) VALUES ($1,$2,$3) RETURNING id`,
    [docId, idx, content]);
  return rows[0].id as number;
}
async function insertEmbedding(chunkId: number, emb: number[]) {
  await db.query(
    `INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES ($1, $2::vector)`,
    [chunkId, vecLiteral(emb)]
  );
}

// --- public API ---
export async function ingestPage(url: string, html: string) {
  const { title } = extractMeta(html);
  const text = htmlToCleanText(html);
  if (!text || text.length < 500) return; // skip tiny pages

  const docId = await upsertDocument(url, title, html, text);
  const chunks = chunkText(text);

  const batchSize = 16; // tune as needed
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embs = await embedAll(batch.map(b => b.content));
    for (let j = 0; j < batch.length; j++) {
      const chunkId = await insertChunk(docId, batch[i + j].idx, batch[i + j].content);
      await insertEmbedding(chunkId, embs[j]);
    }
  }
}