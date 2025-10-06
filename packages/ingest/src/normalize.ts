import * as cheerio from 'cheerio';
import crypto from 'node:crypto';

export function extractMain(html: string) {
  const $ = cheerio.load(html);
  const title = $("meta[property='og:title']").attr('content') || $('title').text().trim();
  const main = $('main').text().trim() || $('article').text().trim() || $('body').text().trim();
  const clean = normalizeText(main);
  const content_hash = crypto.createHash('sha256').update(clean).digest('hex');
  return { title, text: clean, content_hash };
}

export function normalizeText(s: string) {
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function chunkBySentences(text: string, target = 1000, overlap = 120) {
  const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let buf = '';
  let pos = 0;
  const spans: Array<{ start: number; end: number }> = [];

  for (const s of sents) {
    if ((buf + ' ' + s).length > target) {
      const end = pos + buf.length;
      chunks.push(buf.trim());
      spans.push({ start: pos, end });
      pos = end - Math.min(overlap, buf.length);
      buf = s;
    } else {
      buf += ' ' + s;
    }
  }
  if (buf.trim()) {
    const end = pos + buf.length;
    chunks.push(buf.trim());
    spans.push({ start: pos, end });
  }
  return { chunks, spans };
}
