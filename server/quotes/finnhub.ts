import { roundPriceInput } from '../../src/domain/money';
import { AdapterError } from '../http';
import type { NormalizedQuote } from './types';

export function parseFinnhubQuote(symbol: string, payload: unknown): NormalizedQuote | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { c?: unknown; pc?: unknown; t?: unknown; currency?: unknown };
  if (typeof body.currency === 'string' && body.currency.toUpperCase() !== 'USD') return null;
  const price = typeof body.c === 'number' ? body.c : Number.NaN;
  const time = typeof body.t === 'number' ? body.t : Number.NaN;
  if (!Number.isFinite(price) || price === 0 || !Number.isFinite(time) || time === 0) return null;
  const canonical = roundPriceInput(String(price));
  if (!canonical) return null;
  let previousClose: string | null = null;
  if (typeof body.pc === 'number' && body.pc > 0) previousClose = roundPriceInput(String(body.pc));
  return {
    symbol,
    price: canonical,
    previousClose,
    asOf: new Date(time * 1000).toISOString(),
    source: 'finnhub',
  };
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string, fetchImpl: typeof fetch): Promise<NormalizedQuote | null> {
  const url = new URL('https://finnhub.io/api/v1/quote');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('token', apiKey);
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new AdapterError('UPSTREAM_UNAVAILABLE', 'Finnhub could not be reached.');
  }
  if (response.status === 429) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'Finnhub rate limit reached.');
  if (!response.ok) throw new AdapterError('UPSTREAM_UNAVAILABLE', 'Finnhub returned an error.');
  const payload: unknown = await response.json();
  return parseFinnhubQuote(symbol, payload);
}
