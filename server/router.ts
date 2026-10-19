import { canonicalizeSymbol } from '../src/domain/symbols';
import type { TtlCache } from './cache';
import { nonEmpty } from './env';
import { fetchEdgarFilings } from './filings/edgar';
import { AdapterError, jsonError } from './http';
import type { Limiter } from './limit';
import { fetchGuardian } from './news/guardian';
import { fetchYahooRss } from './news/yahoo';
import { fetchAlphaQuote } from './quotes/alphavantage';
import { fetchFinnhubQuote } from './quotes/finnhub';
import { selectQuoteProvider } from './quotes/select';
import type { NormalizedQuote } from './quotes/types';

export interface DispatchDeps {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  cache: TtlCache;
  limiter: Limiter;
}

export async function dispatch(
  method: string,
  rawUrl: string,
  deps: DispatchDeps,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(rawUrl, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) return { status: 404, body: jsonError('NOT_FOUND', 'Not found.') };
  if (method !== 'GET') return { status: 405, body: jsonError('METHOD_NOT_ALLOWED', 'Only GET is supported.') };
  if (url.pathname === '/api/health') {
    return {
      status: 200,
      body: {
        ok: true,
        providers: {
          quotes: selectQuoteProvider(deps.env),
          yahoo: true,
          edgar: nonEmpty(deps.env.SEC_USER_AGENT) !== null,
          guardian: nonEmpty(deps.env.GUARDIAN_API_KEY) !== null,
        },
      },
    };
  }
  if (url.pathname === '/api/quotes') return quotes(url, deps);
  if (url.pathname === '/api/news/yahoo') return yahoo(url, deps);
  if (url.pathname === '/api/filings') return filings(url, deps);
  if (url.pathname === '/api/news/guardian') return guardian(url, deps);
  return { status: 404, body: jsonError('NOT_FOUND', 'Unknown API route.') };
}

function oneSymbol(url: URL): { ok: true; symbol: string } | { ok: false; status: number; body: unknown } {
  const parsed = canonicalizeSymbol(url.searchParams.get('symbol') ?? '');
  if (!parsed.ok) return { ok: false, status: 400, body: jsonError('INVALID_SYMBOL', parsed.error.message) };
  return { ok: true, symbol: parsed.value };
}

async function quotes(url: URL, deps: DispatchDeps): Promise<{ status: number; body: unknown }> {
  const provider = selectQuoteProvider(deps.env);
  if (provider === 'none') {
    return { status: 503, body: jsonError('PROVIDER_NOT_CONFIGURED', 'Set FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY on the server.') };
  }
  const raw = (url.searchParams.get('symbols') ?? '').split(',').map((symbol) => symbol.trim()).filter(Boolean);
  if (raw.length === 0) return { status: 400, body: jsonError('INVALID_SYMBOL', 'Provide at least one symbol.') };
  if (raw.length > 30) return { status: 400, body: jsonError('TOO_MANY_SYMBOLS', 'Request at most 30 symbols.') };
  const symbols: string[] = [];
  for (const item of raw) {
    const parsed = canonicalizeSymbol(item);
    if (!parsed.ok) return { status: 400, body: jsonError('INVALID_SYMBOL', parsed.error.message) };
    symbols.push(parsed.value);
  }
  const found: NormalizedQuote[] = [];
  const missing: string[] = [];
  const limited: string[] = [];
  let blocked = false;
  for (const symbol of symbols) {
    const cacheKey = `quote:${provider}:${symbol}`;
    const cached = deps.cache.get<NormalizedQuote>(cacheKey);
    if (cached) {
      found.push(cached);
      continue;
    }
    if (blocked) {
      limited.push(symbol);
      continue;
    }
    const allowed =
      provider === 'finnhub'
        ? deps.limiter.tryWindow('finnhub', 60, 60_000)
        : deps.limiter.tryBoth('alphavantage-window', 1, 13_000, 'alphavantage-day', 25);
    if (!allowed) {
      if (found.length === 0 && missing.length === 0) {
        return { status: 429, body: jsonError('UPSTREAM_RATE_LIMIT', 'Quote provider rate limit reached before any symbol was fetched.') };
      }
      blocked = true;
      limited.push(symbol);
      continue;
    }
    try {
      const quote =
        provider === 'finnhub'
          ? await fetchFinnhubQuote(symbol, nonEmpty(deps.env.FINNHUB_API_KEY) ?? '', deps.fetchImpl)
          : await fetchAlphaQuote(symbol, nonEmpty(deps.env.ALPHA_VANTAGE_API_KEY) ?? '', deps.fetchImpl);
      if (quote) {
        deps.cache.set(cacheKey, quote, provider === 'finnhub' ? 60_000 : 6 * 60 * 60 * 1000);
        found.push(quote);
      } else {
        missing.push(symbol);
      }
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'UPSTREAM_RATE_LIMIT') {
        if (provider === 'alphavantage') deps.limiter.exhaustDaily('alphavantage-day');
        if (found.length === 0) return { status: 429, body: jsonError(error.code, error.message) };
        blocked = true;
        limited.push(symbol);
        continue;
      }
      if (found.length === 0 && missing.length === 0) {
        const message = error instanceof Error ? error.message : 'Quote provider failed.';
        return { status: 502, body: jsonError('UPSTREAM_UNAVAILABLE', message) };
      }
      missing.push(symbol);
    }
  }
  return { status: 200, body: { provider, quotes: found, missing, limited } };
}

async function yahoo(url: URL, deps: DispatchDeps): Promise<{ status: number; body: unknown }> {
  const symbol = oneSymbol(url);
  if (!symbol.ok) return symbol;
  const cacheKey = `yahoo:${symbol.symbol}`;
  const cached = deps.cache.get<{ articles: unknown[]; notice: string | null }>(cacheKey);
  if (cached) return { status: 200, body: { source: 'yahoo-rss', symbol: symbol.symbol, ...cached } };
  const release = deps.limiter.tryFlight('yahoo', 2);
  if (!release) return { status: 429, body: jsonError('UPSTREAM_RATE_LIMIT', 'Yahoo feed is busy. Try again in a moment.') };
  try {
    const articles = await fetchYahooRss(symbol.symbol, deps.fetchImpl);
    const payload = { articles, notice: null };
    deps.cache.set(cacheKey, payload, 15 * 60 * 1000);
    return { status: 200, body: { source: 'yahoo-rss', symbol: symbol.symbol, ...payload } };
  } catch {
    const payload = { articles: [], notice: 'YAHOO_FEED_UNAVAILABLE' };
    deps.cache.set(cacheKey, payload, 15 * 60 * 1000);
    return { status: 200, body: { source: 'yahoo-rss', symbol: symbol.symbol, ...payload } };
  } finally {
    release();
  }
}

async function filings(url: URL, deps: DispatchDeps): Promise<{ status: number; body: unknown }> {
  const userAgent = nonEmpty(deps.env.SEC_USER_AGENT);
  if (!userAgent) {
    return { status: 503, body: jsonError('SEC_USER_AGENT_REQUIRED', 'Set SEC_USER_AGENT on the server before requesting filings.') };
  }
  const symbol = oneSymbol(url);
  if (!symbol.ok) return symbol;
  try {
    const result = await fetchEdgarFilings(
      symbol.symbol,
      userAgent,
      deps.fetchImpl,
      (key) => deps.cache.get(key),
      (key, value, ttl) => deps.cache.set(key, value, ttl),
      () => deps.limiter.tryWindow('sec', 8, 1000),
    );
    return { status: 200, body: { source: 'sec-edgar', symbol: symbol.symbol, ...result } };
  } catch (error) {
    if (error instanceof AdapterError) return { status: error.code === 'UPSTREAM_RATE_LIMIT' ? 429 : 502, body: jsonError(error.code, error.message) };
    return { status: 502, body: jsonError('UPSTREAM_UNAVAILABLE', 'SEC EDGAR failed.') };
  }
}

async function guardian(url: URL, deps: DispatchDeps): Promise<{ status: number; body: unknown }> {
  const apiKey = nonEmpty(deps.env.GUARDIAN_API_KEY);
  if (!apiKey) return { status: 503, body: jsonError('PROVIDER_NOT_CONFIGURED', 'Set GUARDIAN_API_KEY on the server.') };
  const symbol = oneSymbol(url);
  if (!symbol.ok) return symbol;
  const cacheKey = `guardian:${symbol.symbol}`;
  const cached = deps.cache.get<{ articles: unknown[]; notice: null }>(cacheKey);
  if (cached) return { status: 200, body: { source: 'guardian', symbol: symbol.symbol, ...cached } };
  if (!deps.limiter.tryBoth('guardian-window', 1, 1000, 'guardian-day', 500)) {
    return { status: 429, body: jsonError('UPSTREAM_RATE_LIMIT', 'Guardian rate limit reached. The free developer tier is 1 request per second and 500 per day.') };
  }
  const companies = deps.cache.get<Map<string, { title: string | null }>>('edgar:companies');
  const companyName = companies?.get(symbol.symbol)?.title ?? null;
  try {
    const articles = await fetchGuardian(symbol.symbol, companyName, apiKey, deps.fetchImpl);
    const payload = { articles, notice: null };
    deps.cache.set(cacheKey, payload, 15 * 60 * 1000);
    return { status: 200, body: { source: 'guardian', symbol: symbol.symbol, ...payload } };
  } catch (error) {
    if (error instanceof AdapterError) return { status: error.code === 'UPSTREAM_RATE_LIMIT' ? 429 : 502, body: jsonError(error.code, error.message) };
    return { status: 502, body: jsonError('UPSTREAM_UNAVAILABLE', 'The Guardian failed.') };
  }
}
