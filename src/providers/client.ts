import { canonicalizeSymbol } from '../domain/symbols';
import type { ArticleDraft } from '../domain/types';

export interface HealthResponse {
  ok: true;
  providers: {
    quotes: 'finnhub' | 'alphavantage' | 'none';
    yahoo: boolean;
    edgar: boolean;
    guardian: boolean;
  };
}

export interface QuotesResponse {
  provider: 'finnhub' | 'alphavantage';
  quotes: Array<{
    symbol: string;
    price: string;
    previousClose: string | null;
    asOf: string;
    source: 'finnhub' | 'alphavantage';
  }>;
  missing: string[];
  limited: string[];
}

export interface NewsResponse {
  source: 'yahoo-rss' | 'guardian';
  symbol: string;
  articles: ArticleDraft[];
  notice: string | null;
}

export interface FilingsResponse {
  source: 'sec-edgar';
  symbol: string;
  articles: ArticleDraft[];
  notice: 'CIK_NOT_FOUND' | null;
  companyName: string | null;
  exchange: string | null;
}

export function quotesPath(symbols: string[]): string {
  return `/api/quotes?symbols=${symbols.map((symbol) => encodeURIComponent(symbol)).join(',')}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const message = payload.error?.message ?? `Request failed (${response.status}).`;
    const error = new Error(message) as Error & { code?: string };
    if (payload.error?.code) error.code = payload.error.code;
    throw error;
  }
  return payload;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return readJson<HealthResponse>(response);
}

export async function fetchQuotes(symbols: string[]): Promise<QuotesResponse> {
  const cleaned = symbols.map((symbol) => {
    const parsed = canonicalizeSymbol(symbol);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  });
  const response = await fetch(quotesPath(cleaned));
  return readJson<QuotesResponse>(response);
}

export async function fetchYahoo(symbol: string): Promise<NewsResponse> {
  const response = await fetch(`/api/news/yahoo?symbol=${encodeURIComponent(symbol)}`);
  return readJson<NewsResponse>(response);
}

export async function fetchFilings(symbol: string): Promise<FilingsResponse> {
  const response = await fetch(`/api/filings?symbol=${encodeURIComponent(symbol)}`);
  return readJson<FilingsResponse>(response);
}

export async function fetchGuardian(symbol: string): Promise<NewsResponse> {
  const response = await fetch(`/api/news/guardian?symbol=${encodeURIComponent(symbol)}`);
  return readJson<NewsResponse>(response);
}
