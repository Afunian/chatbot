// packages/ingest/src/index.ts
import 'win-ca/ssl';
import { crawl } from './crawl';
import { crawl, extractLinks } from './crawl';
import { ingestPage } from './ingest';
//import { ingestPage } from './ingest'; // comment this out if you haven't added ingest.ts yet

// --- Browser-like UA for friendlier treatment ---
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Fetch a sitemap (index or urlset) and return all <loc> URLs.
 * Follows one level of nested sitemaps if it’s a sitemapindex.
 */
async function urlsFromSitemap(sitemapUrl: string, ua = UA, depth = 0): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, { headers: { 'user-agent': ua } });
    if (!res.ok) return [];
    const xml = await res.text();
    const get = (re: RegExp) => Array.from(xml.matchAll(re), (m) => m[1].trim());

    // If this is a sitemap index, follow children one level
    if (/<sitemapindex[\s>]/i.test(xml) && depth < 1) {
      const kids = get(/<loc>\s*([^<]+?)\s*<\/loc>/gi);
      const nested = await Promise.all(kids.map((u) => urlsFromSitemap(u, ua, depth + 1)));
      return nested.flat();
    }

    // urlset
    return get(/<loc>\s*([^<]+?)\s*<\/loc>/gi);
  } catch {
    return [];
  }
}

/**
 * Discover sitemap URLs for a host:
 * 1) Parse robots.txt "Sitemap:" lines (if any)
 * 2) Try common fallbacks (/sitemap.xml, /sitemap_index.xml)
 */
async function discoverSitemapUrls(origin: string): Promise<string[]> {
  const candidates = new Set<string>();

  // Try robots.txt Sitemap entries
  try {
    const robots = new URL('/robots.txt', origin).toString();
    const res = await fetch(robots, { headers: { 'user-agent': UA } });
    if (res.ok) {
      const txt = await res.text();
      for (const m of txt.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) {
        candidates.add(m[1].trim());
      }
    }
  } catch {
    // ignore
  }

  // Common fallbacks
  for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
    candidates.add(new URL(path, origin).toString());
  }

  // Fetch each sitemap and aggregate URLs
  const all = await Promise.all(Array.from(candidates, (u) => urlsFromSitemap(u)));
  return Array.from(new Set(all.flat()));
}

async function urlsFromHtmlSitemap(pageUrl: string, origin = 'https://www.cda-adc.ca'): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': UA } });
    if (!res.ok) return [];
    const html = await res.text();

    // Reuse our crawler’s robust extractor (handles &amp;, relative URLs, <base>, etc.)
    const urls = extractLinks(html, pageUrl)
      .filter(u => u.startsWith(`${origin}/`))
      .filter(looksLikeHtml);

    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}

// ---------------------- MAIN ----------------------

console.log('\n▶ Starting DentistryGPT ingestion crawl...\n');

// 1) Pull sitemap URLs up front
const [oralMap, cdaXmlMap] = await Promise.all([
  discoverSitemapUrls('https://oralhealthbc.ca'),
  discoverSitemapUrls('https://www.cda-adc.ca'),   // XML discovery will be empty for CDA
]);

// NEW: scrape CDA’s HTML sitemap as a fallback
const cdaHtmlMap = await urlsFromHtmlSitemap('https://www.cda-adc.ca/en/sitemap.asp');

// 2) Keep same-origin HTML-like URLs only
const looksLikeHtml = (u: string) =>
  !/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip)(\?|$)/i.test(u);

// Combine + filter
const sitemapSeeds = [...oralMap, ...cdaXmlMap, ...cdaHtmlMap]
  .filter(u =>
    u.startsWith('https://oralhealthbc.ca/') ||
    u.startsWith('https://www.cda-adc.ca/')
  )
  .filter(looksLikeHtml);

// Optional: see counts
console.log(`Sitemap URLs: oralhealthbc=${oralMap.length}, cda-adc(xml)=${cdaXmlMap.length}, cda-adc(html)=${cdaHtmlMap.length}`);
// 3) Static seeds you know are good hubs
const staticSeeds = [
  'https://oralhealthbc.ca/',
  'https://oralhealthbc.ca/for-the-public/',
  'https://oralhealthbc.ca/practice-resources/',
  'https://www.cda-adc.ca/',
  'https://www.canada.ca/en/health-canada.html',
];

// 4) Final seed list (deduped)
const seeds = Array.from(new Set([...staticSeeds, ...sitemapSeeds]));

// Optional: see what you discovered
console.log(`Sitemap URLs: oralhealthbc=${oralMap.length}, cda-adc(xml)=${cdaXmlMap.length}, cda-adc(html)=${cdaHtmlMap.length}`);
console.log(`Total seeds after filtering: ${seeds.length}`);

const result = await crawl(
  seeds,
  async ({ url, html, depth }) => {
    console.log(`  ✓ [depth ${depth}] ${url} (${html.length.toLocaleString()} bytes)`);
    // If you created ingest.ts earlier, this stores the page → chunks → embeddings → DB
    try {
      await ingestPage(url, html);
    } catch (e: any) {
      console.error('  ✗ ingest failed:', url, '-', e?.message || e);
    }
  },
  {
    userAgent: UA,
    maxPages: 1000,
    maxDepth: 3,
    minDelayMs: 800,         // be polite; raise if needed
    sameOriginOnly: true,
    respectRobots: true,
    // Skip noisy routes
    excludePatterns: [
      /\/language_controller\.asp(?:\?|$)/i,
      /\/loginRedirect\.asp(?:\?|$)/i,
      /\/wp-json\//i,
      /\/login/i,
    ],
    // Skip assets
    urlFilter: looksLikeHtml,
    log: (m) => console.log(m),
  }
);

console.log(
  `\n▶ Done. Visited: ${result.visited}, Discovered: ${result.discovered}, Errors: ${result.errors.length}`
);
if (result.errors.length) {
  console.table(result.errors);
}