// packages/ingest/src/db.ts
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Strict TLS for Postgres:
 * - SUPABASE_DB_URL should include ?sslmode=verify-full
 * - PGSSLROOTCERT points to your CA bundle (e.g., C:\certs\pg-root-ca.pem)
 *   If PGSSLROOTCERT is not set, we fall back to C:\certs\pg-root-ca.pem on Windows,
 *   or ~/.postgresql/root.crt on other OSes if present.
 */

function resolveCaPath(): string | undefined {
  // 1) explicit env var (works everywhere)
  if (process.env.PGSSLROOTCERT && fs.existsSync(process.env.PGSSLROOTCERT)) {
    return process.env.PGSSLROOTCERT;
  }

  // 2) common Windows default (your setup)
  const winDefault = 'C:\\certs\\pg-root-ca.pem';
  if (process.platform === 'win32' && fs.existsSync(winDefault)) {
    return winDefault;
  }

  // 3) libpq default location on non-Windows: %APPDATA%\postgresql\root.crt (win)
  //    or ~/.postgresql/root.crt (posix). We’ll check both just in case.
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const posixRoot = path.join(home, '.postgresql', 'root.crt');
  if (home && fs.existsSync(posixRoot)) {
    return posixRoot;
  }

  // Nothing found; return undefined (connection will likely fail with verify-full)
  return undefined;
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is not set. Check your .env.');
}

const caPath = resolveCaPath();
if (!caPath) {
  console.warn('[db] WARNING: No CA file found. Set PGSSLROOTCERT or create C:\\certs\\pg-root-ca.pem');
}

const ssl =
  caPath
    ? {
        // Strict TLS: verify server cert against our CA and enforce hostname match
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: true,
      }
    : // Fallback: still enforce rejectUnauthorized if sslmode=verify-full in URL,
      // but without ca the handshake may fail (which is OK—it’s safer than disabling).
      { rejectUnauthorized: true };

export const pool = new Pool({
  connectionString, // include ?sslmode=verify-full in .env
  ssl,
});

// --- helpers you already had ---
export async function upsertSource(rec: {
  url: string; domain: string; title?: string; publisher?: string;
  published_at?: string | null; last_reviewed_at?: string | null;
  content_hash: string; raw_text: string; content_type?: string; lang?: string;
  robots_ok?: boolean; tos_ok?: boolean;
}) {
  const q = `
    insert into public.sources
    (url, domain, title, publisher, published_at, last_reviewed_at,
     content_hash, raw_text, content_type, lang, robots_ok, tos_ok, last_crawled_at, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,true),coalesce($12,true), now(), now())
    on conflict (url) do update set
      title = excluded.title,
      publisher = excluded.publisher,
      published_at = excluded.published_at,
      last_reviewed_at = excluded.last_reviewed_at,
      content_hash = excluded.content_hash,
      raw_text = excluded.raw_text,
      content_type = excluded.content_type,
      lang = excluded.lang,
      robots_ok = excluded.robots_ok,
      tos_ok = excluded.tos_ok,
      last_crawled_at = now(),
      updated_at = now()
    returning id;
  `;
  const vals = [
    rec.url, rec.domain, rec.title ?? null, rec.publisher ?? null,
    rec.published_at ?? null, rec.last_reviewed_at ?? null, rec.content_hash,
    rec.raw_text, rec.content_type ?? 'html', rec.lang ?? 'en-CA',
    rec.robots_ok, rec.tos_ok
  ];
  const { rows } = await pool.query(q, vals);
  return rows[0].id as string;
}

export async function insertChunks(
  source_id: string,
  chunks: { seq:number; text:string; char_start:number; char_end:number; embedding?: number[] }[]
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from public.chunks where source_id = $1', [source_id]);
    for (const c of chunks) {
      await client.query(
        'insert into public.chunks (source_id, seq, text, char_start, char_end, embedding) values ($1,$2,$3,$4,$5,$6)',
        [source_id, c.seq, c.text, c.char_start, c.char_end, c.embedding ?? null]
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function logEvent(source_id: string, event: string, meta: any = {}) {
  await pool.query(
    'insert into public.source_events (source_id, event, meta) values ($1,$2,$3)',
    [source_id, event, meta]
  );
}