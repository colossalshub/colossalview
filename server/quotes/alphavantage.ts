import { roundPriceInput } from '../../src/domain/money';
import { AdapterError } from '../http';
import type { NormalizedQuote } from './types';

export function parseAlphaQuote(symbol: string, payload: unknown): NormalizedQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { Note?: unknown; Information?: unknown; 'Global Quote'?: Record<string, unknown> };
  if (typeof body.Note === 'string' || typeof body.Information === 'string') {
    throw new AdapterError('UPSTREAM_RATE_LIMIT', 'Alpha Vantage limit reached. The free tier allows 25 requests per day.');
  }
  const quote = body['Global Quote'];
  if (!quote) return null;
  const currency = quote.currency ?? quote['09. currency'];
  if (typeof currency === 'string' && currency.toUpperCase() !== 'USD') return null;
  const price = roundPriceInput(String(quote['05. price'] ?? ''));
  if (!price) return null;
  const previous = roundPriceInput(String(quote['08. previous close'] ?? ''));
  const day = String(quote['07. latest trading day'] ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return {
    symbol,
    price,
    previousClose: previous,
    asOf: `${day}T00:00:00.000Z`,
    source: 'alphavantage',
  };
}

export async function fetchAlphaQuote(symbol: string, apiKey: string, fetchImpl: typeof fetch): Promise<NormalizedQuote | null> {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'GLOBAL_QUOTE');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new AdapterError('UPSTREAM_UNAVAILABLE', 'Alpha Vantage could not be reached.');
  }
  if (response.status === 429) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'Alpha Vantage rate limit reached.');
  if (!response.ok) throw new AdapterError('UPSTREAM_UNAVAILABLE', 'Alpha Vantage returned an error.');
  const payload: unknown = await response.json();
  return parseAlphaQuote(symbol, payload);
}
