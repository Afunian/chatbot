// packages/ingest/src/index.ts
import { crawl } from './crawl';

// ✅ Use absolute URLs with protocol
const seeds = [
  'https://oralhealthbc.ca/',
  'https://oralhealthbc.ca/sitemap.xml',
  // add sections you care about:
  'https://oralhealthbc.ca/for-the-public/',
  'https://oralhealthbc.ca/practice-resources/',
  'https://www.cda-adc.ca/',
  'https://www.canada.ca/en/health-canada.html',
  // Add more sources as needed...
];

console.log('\n▶ Starting DentistryGPT ingestion crawl...\n');

const result = await crawl(
  seeds,
  async ({ url, html, depth }) => {
    // 👇 Replace this with your real ingest pipeline (parse → chunk → embed → upsert)
    console.log(`  ✓ [depth ${depth}] ${url} (${html.length.toLocaleString()} bytes)`);
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    maxPages: 200,         // raise as needed
    maxDepth: 2,           // raise if you want deeper link following
    minDelayMs: 700,       // polite pacing
    respectRobots: true,   // set false briefly if you need to debug skips
    sameOriginOnly: true,  // only follow links on the same origin as each seed
    // Skip binary/static assets
    urlFilter: (u) => !/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip)(\?|$)/i.test(u),
    // Extra noise to ignore
    excludePatterns: [/\/wp-json\//i],
    // 🔍 Surface reasons for skips/errors from crawl.ts
    log: (m) => console.log(m),
  }
);

console.log(`\n▶ Done. Visited: ${result.visited}, Discovered: ${result.discovered}, Errors: ${result.errors.length}`);
if (result.errors.length) {
  console.log('Errors:');
  console.table(result.errors);
}
