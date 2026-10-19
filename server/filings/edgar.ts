import type { ArticleDraft } from '../../src/domain/types';
import { AdapterError } from '../http';

export interface EdgarHit {
  articles: ArticleDraft[];
  notice: 'CIK_NOT_FOUND' | null;
  companyName: string | null;
  exchange: string | null;
}

interface TickerHit {
  cik: number;
  title: string | null;
}

export function parseCompanyTickers(payload: unknown): Map<string, TickerHit> {
  const map = new Map<string, TickerHit>();
  if (!payload || typeof payload !== 'object') return map;
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    if (typeof row.ticker !== 'string' || typeof row.cik_str !== 'number') continue;
    map.set(row.ticker.toUpperCase(), { cik: row.cik_str, title: typeof row.title === 'string' ? row.title : null });
  }
  return map;
}

export function parseMutualFundTickers(payload: unknown): Map<string, TickerHit> {
  const map = new Map<string, TickerHit>();
  if (!payload || typeof payload !== 'object') return map;
  const body = payload as { fields?: unknown; data?: unknown };
  if (!Array.isArray(body.fields) || !Array.isArray(body.data)) return map;
  const fields = body.fields.map((field) => String(field));
  const cikIndex = fields.indexOf('cik');
  const symbolIndex = fields.indexOf('symbol');
  if (cikIndex < 0 || symbolIndex < 0) return map;
  for (const row of body.data) {
    if (!Array.isArray(row)) continue;
    const symbol = String(row[symbolIndex] ?? '').toUpperCase();
    const cik = Number(row[cikIndex]);
    if (!symbol || !Number.isFinite(cik)) continue;
    map.set(symbol, { cik, title: null });
  }
  return map;
}

export function filingDocumentUrl(cik: number, accession: string, primaryDocument: string): string {
  const cikInt = String(cik).replace(/^0+/, '') || '0';
  const accessionNoDashes = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDashes}/${primaryDocument}`;
}

export function parseSubmissions(payload: unknown, symbol: string): Omit<EdgarHit, 'notice'> {
  if (!payload || typeof payload !== 'object') {
    return { articles: [], companyName: null, exchange: null };
  }
  const body = payload as {
    name?: unknown;
    exchanges?: unknown;
    filings?: { recent?: Record<string, unknown[]> };
  };
  const companyName = typeof body.name === 'string' ? body.name : null;
  const exchange = Array.isArray(body.exchanges) && typeof body.exchanges[0] === 'string' ? body.exchanges[0] : null;
  const recent = body.filings?.recent;
  if (!recent) return { articles: [], companyName, exchange };
  const forms = recent.form ?? [];
  const rows: ArticleDraft[] = [];
  for (let index = 0; index < forms.length; index += 1) {
    const form = String(forms[index] ?? '');
    const filingDate = String(recent.filingDate?.[index] ?? '');
    const accession = String(recent.accessionNumber?.[index] ?? '');
    const primary = String(recent.primaryDocument?.[index] ?? '');
    const description = String(recent.primaryDocDescription?.[index] ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate) || !accession || !primary) continue;
    const cik = Number((body as { cik?: unknown }).cik ?? 0);
    rows.push({
      source: 'sec-edgar',
      title: description.trim() || form,
      url: filingDocumentUrl(cik, accession, primary),
      publishedAt: `${filingDate}T00:00:00.000Z`,
      summary: '',
      symbols: [symbol],
      filingType: form || null,
      accessionNumber: accession,
    });
  }
  rows.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  return { articles: rows.slice(0, 20), companyName, exchange };
}

export function secHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    'Accept-Encoding': 'gzip, deflate',
    Accept: 'application/json',
  };
}

async function secGet(url: string, userAgent: string, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: secHeaders(userAgent) });
  } catch {
    throw new AdapterError('UPSTREAM_UNAVAILABLE', 'SEC EDGAR could not be reached.');
  }
  if (response.status === 429) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'SEC rate limit reached.');
  if (!response.ok) throw new AdapterError('UPSTREAM_UNAVAILABLE', 'SEC EDGAR returned an error.');
  return response.json();
}

export async function lookupCompany(
  symbol: string,
  userAgent: string,
  fetchImpl: typeof fetch,
  cacheGet: <T>(key: string) => T | undefined,
  cacheSet: <T>(key: string, value: T, ttlMs: number) => void,
  allow: () => boolean,
): Promise<TickerHit | null> {
  let companies = cacheGet<Map<string, TickerHit>>('edgar:companies');
  if (!companies) {
    if (!allow()) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'SEC rate limit reached.');
    companies = parseCompanyTickers(await secGet('https://www.sec.gov/files/company_tickers.json', userAgent, fetchImpl));
    cacheSet('edgar:companies', companies, 24 * 60 * 60 * 1000);
  }
  const direct = companies.get(symbol);
  if (direct) return direct;
  let funds = cacheGet<Map<string, TickerHit>>('edgar:funds');
  if (!funds) {
    if (!allow()) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'SEC rate limit reached.');
    funds = parseMutualFundTickers(await secGet('https://www.sec.gov/files/company_tickers_mf.json', userAgent, fetchImpl));
    cacheSet('edgar:funds', funds, 24 * 60 * 60 * 1000);
  }
  return funds.get(symbol) ?? null;
}

export async function fetchEdgarFilings(
  symbol: string,
  userAgent: string,
  fetchImpl: typeof fetch,
  cacheGet: <T>(key: string) => T | undefined,
  cacheSet: <T>(key: string, value: T, ttlMs: number) => void,
  allow: () => boolean,
): Promise<EdgarHit> {
  const hit = await lookupCompany(symbol, userAgent, fetchImpl, cacheGet, cacheSet, allow);
  if (!hit) return { articles: [], notice: 'CIK_NOT_FOUND', companyName: null, exchange: null };
  const cacheKey = `edgar:submissions:${hit.cik}`;
  const cached = cacheGet<Omit<EdgarHit, 'notice'>>(cacheKey);
  if (cached) return { ...cached, notice: null };
  if (!allow()) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'SEC rate limit reached.');
  const padded = String(hit.cik).padStart(10, '0');
  const payload = await secGet(`https://data.sec.gov/submissions/CIK${padded}.json`, userAgent, fetchImpl);
  const parsed = parseSubmissions({ ...(payload as object), cik: hit.cik }, symbol);
  if (!parsed.companyName && hit.title) parsed.companyName = hit.title;
  cacheSet(cacheKey, parsed, 15 * 60 * 1000);
  return { ...parsed, notice: null };
}
