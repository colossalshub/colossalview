import { XMLParser } from 'fast-xml-parser';
import type { ArticleDraft } from '../../src/domain/types';
import { stripText, toIsoTimestamp, truncate } from '../text';

const parser = new XMLParser({
  ignoreAttributes: true,
  isArray: (name) => name === 'item',
});

function xmlText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => xmlText(item)).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => xmlText(item))
      .join(' ');
  }
  return '';
}

export function parseYahooRss(xml: string, symbol: string): ArticleDraft[] {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  const channel = (parsed as { rss?: { channel?: { item?: unknown[] } } }).rss?.channel;
  const items = channel?.item ?? [];
  const articles: ArticleDraft[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { title?: unknown; link?: unknown; pubDate?: unknown; description?: unknown };
    const title = stripText(xmlText(row.title));
    const link = xmlText(row.link).trim();
    const publishedAt = toIsoTimestamp(xmlText(row.pubDate));
    if (!title || !publishedAt || !/^https?:\/\//i.test(link)) continue;
    articles.push({
      source: 'yahoo-rss',
      title,
      url: link,
      publishedAt,
      summary: truncate(stripText(xmlText(row.description))),
      symbols: [symbol],
      filingType: null,
      accessionNumber: null,
    });
  }
  return articles;
}

export async function fetchYahooRss(symbol: string, fetchImpl: typeof fetch): Promise<ArticleDraft[]> {
  const urls = [
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
    `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (!response.ok) {
        lastError = new Error(String(response.status));
        continue;
      }
      return parseYahooRss(await response.text(), symbol);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Yahoo feed unavailable');
}
