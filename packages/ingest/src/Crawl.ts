// packages/ingest/src/crawl.ts

import robotsParser from 'robots-parser';

const HOST_ALIASES = new Map<string, string>([
  ['www.bccohp.ca', 'oralhealthbc.ca'],
  ['bccohp.ca',     'oralhealthbc.ca'],
]);

function aliasHost(u: URL) {
  const to = HOST_ALIASES.get(u.hostname);
  if (to) u.hostname = to;
}

export type CrawlHandler = (args: {
  url: string;
  html: string;
  response: Response;
  depth: number;
}) => Promise<void> | void;

export interface CrawlOptions {
  userAgent?: string;
  maxPages?: number;
  maxDepth?: number;
  sameOriginOnly?: boolean;
  respectRobots?: boolean;
  minDelayMs?: number;
  urlFilter?: (url: string) => boolean;
  excludePatterns?: RegExp[];
  allowedContentTypes?: RegExp;
  log?: (msg: string) => void;
}

const DEFAULTS = {
  userAgent: 'DentistryGPTCrawler',
  maxPages: 200,
  maxDepth: 3,
  sameOriginOnly: true,
  respectRobots: true,
  minDelayMs: 0,
  allowedContentTypes: /^text\/html\b/i
} as const;

type RobotsClient = ReturnType<typeof robotsParser> | null;
const robotsCache = new Map<string, Promise<RobotsClient>>();
const lastRequestAt = new Map<string, number>();

async function loadRobotsForOrigin(origin: string, ua: string, log?: (m: string) => void): Promise<RobotsClient> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;

  const robotsTxtUrl = new URL('/robots.txt', origin).toString();
  const p = (async () => {
    try {
      const res = await fetch(robotsTxtUrl, { redirect: 'follow', headers: { 'user-agent': ua } });
      if (!res.ok) {
        log?.(`[robots] ${origin} -> ${res.status} ${res.statusText} (no rules)`);
        return null;
      }
      const txt = await res.text();
      return txt.trim() ? robotsParser(robotsTxtUrl, txt) : null;
    } catch {
      return null;
    }
  })();

  robotsCache.set(origin, p);
  return p;
}

export async function canCrawl(targetUrl: string, userAgent = DEFAULTS.userAgent, log?: (m: string) => void): Promise<boolean> {
  const u = new URL(targetUrl);
  const robots = await loadRobotsForOrigin(u.origin, userAgent, log);
  if (!robots || !robots.isAllowed) return true;
  const allowed = robots.isAllowed(targetUrl, userAgent);
  return allowed !== false;
}

export async function getCrawlDelayMs(targetUrl: string, userAgent = DEFAULTS.userAgent, log?: (m: string) => void): Promise<number | null> {
  const u = new URL(targetUrl);
  const robots = await loadRobotsForOrigin(u.origin, userAgent, log);
  if (!robots || !robots.getCrawlDelay) return null;
  const seconds = robots.getCrawlDelay(userAgent);
  return typeof seconds === 'number' ? Math.max(0, Math.round(seconds * 1000)) : null;
}

export interface CrawlResult {
  visited: number;
  discovered: number;
  errors: Array<{ url: string; error: string }>;
}

export async function crawl(
  seeds: string[] | string,
  onPage: CrawlHandler,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const {
    userAgent,
    maxPages,
    maxDepth,
    sameOriginOnly,
    respectRobots,
    minDelayMs,
    allowedContentTypes
  } = { ...DEFAULTS, ...options };

  const urlFilter = options.urlFilter ?? (() => true);
  const excludePatterns = options.excludePatterns ?? [];
  const log = options.log ?? (() => {});

  const queue: Array<{ url: string; depth: number; seedOrigin: string }> = [];
  const seen = new Set<string>();

  const seedList = Array.isArray(seeds) ? seeds : [seeds];
  for (const s of seedList) {
    const norm = normalizeUrl(s);
    const origin = new URL(norm).origin;
    queue.push({ url: norm, depth: 0, seedOrigin: origin });
    seen.add(norm);
  }

  let visited = 0;
  let discovered = seedList.length;
  const errors: CrawlResult['errors'] = [];

  while (queue.length && visited < maxPages) {
    const { url, depth, seedOrigin } = queue.shift()!;
    const origin = new URL(url).origin;

    try {
      if (respectRobots) {
        const allowed = await canCrawl(url, userAgent, log);
        if (!allowed) {
          log(`[skip robots] ${url}`);
          continue;
        }
      }

      // polite pacing
      const robotsDelay = respectRobots ? (await getCrawlDelayMs(url, userAgent, log)) ?? 0 : 0;
      const delay = Math.max(minDelayMs, robotsDelay);
      if (delay > 0) {
        const last = lastRequestAt.get(origin) ?? 0;
        const waitMs = Math.max(0, last + delay - Date.now());
        if (waitMs > 0) await sleep(waitMs);
      }

      const res = await fetchWithRetry(url, {
        redirect: 'follow',
        headers: {
          'user-agent': userAgent,
          'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-language': 'en-CA,en;q=0.9'
        }
      });

      lastRequestAt.set(origin, Date.now());

      if (!res.ok) {
        errors.push({ url, error: `HTTP ${res.status}` });
        log(`[error] ${url} -> ${res.status} ${res.statusText}`);
        continue;
      }

      const ctype = res.headers.get('content-type') || '';
      if (!allowedContentTypes.test(ctype)) {
        log(`[skip non-HTML] ${url} (${ctype})`);
        continue;
      }

      const html = await res.text();
      await onPage({ url, html, response: res, depth });
      visited++;

      if (depth < maxDepth) {
        const base = findBaseHref(html) ?? res.url ?? url;
        const links = extractLinks(html, base);

        for (const next of links) {
          if (!isHttpHttps(next)) continue;
          if (sameOriginOnly && new URL(next).origin !== seedOrigin) continue;

          const normalized = normalizeUrl(next);
          if (sameOriginOnly && new URL(normalized).origin !== seedOrigin) continue;
          if (!urlFilter(normalized)) continue;
          if (excludePatterns.some((re) => re.test(normalized))) continue;

          if (!seen.has(normalized)) {
            seen.add(normalized);
            queue.push({ url: normalized, depth: depth + 1, seedOrigin });
            discovered++;
          }
        }
      }
    } catch (e: any) {
      const errCode = e?.code || e?.name || 'UnknownErr';
      const errMsg  = e?.message || String(e);
      const cause   = e?.cause ? (e.cause.code || e.cause.message || String(e.cause)) : '';  
      errors.push({ url, error: `${errCode}: ${errMsg}${cause ? ` [cause: ${cause}]` : ''}` });
      log(`[error] ${url} -> ${errCode}: ${errMsg}${cause ? ` [cause: ${cause}]` : ''}`);
    }
  }

  return { visited, discovered, errors };
}

// Utilities

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isHttpHttps(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(u: string): string {
  const url = new URL(u.trim());
  aliasHost(url);           // 👈 apply alias here
  url.hash = '';

  let path = url.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  url.pathname = path;

  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  return url.toString();
}

function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const baseInDoc = findBaseHref(html) ?? baseUrl;
  const base = new URL(baseInDoc, baseUrl).toString();

  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = decodeHtmlAttr(m[1] ?? m[2] ?? m[3] ?? '');
    if (!raw) continue;
    if (/^(mailto:|javascript:|tel:)/i.test(raw)) continue;

    try {
      const abs = new URL(raw, base).toString();
      if (!seen.has(abs)) {
        seen.add(abs);
        results.push(abs);
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return results;
}

function findBaseHref(html: string): string | null {
  const m = html.match(/<base\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  backoffMs = 600
): Promise<Response> {
  let lastErr: unknown = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init);
      // Retry on 429 or 5xx with backoff
      if (res.status >= 500 || res.status === 429) {
        if (i === retries) return res;
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : backoffMs * (i + 1);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i === retries) throw e;
      await sleep(backoffMs * (i + 1));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}