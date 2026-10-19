import { describe, expect, it, vi } from 'vitest';
import { createCache } from '../../server/cache';
import { fetchEdgarFilings, filingDocumentUrl, parseMutualFundTickers, parseSubmissions } from '../../server/filings/edgar';
import { createLimiter } from '../../server/limit';
import { filterGuardian } from '../../server/news/guardian';
import { parseYahooRss } from '../../server/news/yahoo';
import { parseAlphaQuote } from '../../server/quotes/alphavantage';
import { parseFinnhubQuote } from '../../server/quotes/finnhub';
import { selectQuoteProvider } from '../../server/quotes/select';
import { dispatch } from '../../server/router';
import { quotesPath } from '../../src/providers/client';

describe('providers', () => {
  it('selects a quote provider with Finnhub first', () => {
    expect(selectQuoteProvider({ FINNHUB_API_KEY: 'a', ALPHA_VANTAGE_API_KEY: 'b' })).toBe('finnhub');
    expect(selectQuoteProvider({ FINNHUB_API_KEY: ' ', ALPHA_VANTAGE_API_KEY: 'b' })).toBe('alphavantage');
    expect(selectQuoteProvider({})).toBe('none');
  });

  it('drops zero and non-USD quotes and Alpha Vantage notes', () => {
    expect(parseFinnhubQuote('AAPL', { c: 0, t: 0 })).toBeNull();
    expect(parseFinnhubQuote('AAPL', { c: 10, t: 10, currency: 'EUR' })).toBeNull();
    expect(parseFinnhubQuote('AAPL', { c: 10.5, pc: 10, t: 1_700_000_000 })?.price).toBe('10.5');
    expect(() => parseAlphaQuote('IBM', { Note: 'limit' })).toThrow(/limit/i);
    expect(() => parseAlphaQuote('IBM', { Information: 'limit' })).toThrow(/limit/i);
    expect(
      parseAlphaQuote('IBM', {
        'Global Quote': { '05. price': '10', '08. previous close': '9', '07. latest trading day': '2024-01-02', currency: 'EUR' },
      }),
    ).toBeNull();
    expect(parseAlphaQuote('IBM', { 'Global Quote': { '05. price': '232.14', '08. previous close': '234.12', '07. latest trading day': '2026-10-16' } })?.asOf).toBe(
      '2026-10-16T00:00:00.000Z',
    );
  });

  it('strips Yahoo markup and drops unsafe links', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title><b>Hello</b> AAPL</title><link>https://news.example/a</link><pubDate>Mon, 19 Oct 2026 08:13:45 +0000</pubDate><description>Plain</description></item><item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Mon, 19 Oct 2026 08:13:45 +0000</pubDate></item></channel></rss>`;
    const articles = parseYahooRss(xml, 'AAPL');
    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toBe('Hello AAPL');
    expect(articles[0]?.url).toBe('https://news.example/a');
  });

  it('filters Guardian hits that do not mention the company', () => {
    const kept = filterGuardian(
      [
        { webTitle: 'Apple Inc. raises prices', webUrl: 'https://www.theguardian.com/a', webPublicationDate: '2024-01-02T00:00:00Z', trailText: 'Markets' },
        { webTitle: 'Unrelated sports', webUrl: 'https://www.theguardian.com/b', webPublicationDate: '2024-01-02T00:00:00Z', trailText: 'Scores' },
      ],
      'AAPL',
      'Apple Inc.',
    );
    expect(kept).toHaveLength(1);
    const token = filterGuardian(
      [{ webTitle: 'Funds include AAPL today', webUrl: 'https://www.theguardian.com/c', webPublicationDate: '2024-01-02T00:00:00Z', trailText: '' }],
      'AAPL',
      null,
    );
    expect(token).toHaveLength(1);
    const longer = filterGuardian(
      [{ webTitle: 'BRK.BA is different', webUrl: 'https://www.theguardian.com/d', webPublicationDate: '2024-01-02T00:00:00Z', trailText: '' }],
      'BRK.B',
      null,
    );
    expect(longer).toHaveLength(0);
  });

  it('builds an EDGAR document URL and requires a user agent', async () => {
    expect(filingDocumentUrl(320193, '0000320193-24-000123', 'aapl-20240928.htm')).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm',
    );
    expect(parseMutualFundTickers({ fields: ['cik', 'seriesId', 'classId', 'symbol'], data: [[2110, 'S', 'C', 'LACAX']] }).get('LACAX')?.cik).toBe(2110);
    const parsed = parseSubmissions(
      {
        cik: 320193,
        name: 'Apple Inc.',
        exchanges: ['Nasdaq'],
        filings: {
          recent: {
            form: ['10-K'],
            filingDate: ['2024-11-01'],
            accessionNumber: ['0000320193-24-000123'],
            primaryDocument: ['aapl-20240928.htm'],
            primaryDocDescription: ['Annual report'],
          },
        },
      },
      'AAPL',
    );
    expect(parsed.articles[0]?.url).toContain('/320193/');
    const fetchImpl = vi.fn();
    const missing = await dispatch('GET', '/api/filings?symbol=AAPL', {
      env: {},
      fetchImpl,
      cache: createCache(),
      limiter: createLimiter(),
    });
    expect(missing.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const live = await fetchEdgarFilings(
      'AAPL',
      'colossalview test@example.com',
      async (input, init) => {
        calls.push({ url: String(input), headers: init?.headers });
        const url = String(input);
        if (url.endsWith('company_tickers.json')) {
          return new Response(JSON.stringify({ '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } }));
        }
        return new Response(JSON.stringify({ name: 'Apple Inc.', exchanges: ['Nasdaq'], filings: { recent: { form: [], filingDate: [], accessionNumber: [], primaryDocument: [] } } }));
      },
      () => undefined,
      () => undefined,
      () => true,
    );
    expect(live.companyName).toBe('Apple Inc.');
    expect(calls[0]?.headers).toMatchObject({ 'User-Agent': 'colossalview test@example.com', 'Accept-Encoding': 'gzip, deflate' });
    const unknown = await fetchEdgarFilings(
      'ZZZZ',
      'colossalview test@example.com',
      async (input) => {
        const url = String(input);
        if (url.includes('company_tickers_mf')) return new Response(JSON.stringify({ fields: ['cik', 'symbol'], data: [] }));
        return new Response(JSON.stringify({}));
      },
      () => undefined,
      () => undefined,
      () => true,
    );
    expect(unknown.notice).toBe('CIK_NOT_FOUND');
  });

  it('keeps quote URLs limited to symbols', () => {
    expect(quotesPath(['AAPL', 'MSFT'])).toBe('/api/quotes?symbols=AAPL,MSFT');
    expect(quotesPath(['AAPL'])).not.toMatch(/quantity|price|fee|note/i);
  });

  it('serves a cached quote without spending the provider limit', async () => {
    const cache = createCache();
    cache.set(
      'quote:alphavantage:AAPL',
      { symbol: 'AAPL', price: '10', previousClose: null, asOf: '2024-01-02T00:00:00.000Z', source: 'alphavantage' },
      60_000,
    );
    const limiter = createLimiter();
    expect(limiter.tryBoth('alphavantage-window', 1, 13_000, 'alphavantage-day', 1)).toBe(true);
    expect(limiter.tryBoth('alphavantage-window', 1, 13_000, 'alphavantage-day', 1)).toBe(false);
    const fetchImpl = vi.fn();
    const response = await dispatch('GET', '/api/quotes?symbols=AAPL', {
      env: { ALPHA_VANTAGE_API_KEY: 'secret' },
      fetchImpl,
      cache,
      limiter,
    });
    expect(response.status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((response.body as { quotes: Array<{ price: string }> }).quotes[0]?.price).toBe('10');
  });

  it('returns health with no providers configured', async () => {
    const response = await dispatch('GET', '/api/health', {
      env: {},
      fetchImpl: vi.fn(),
      cache: createCache(),
      limiter: createLimiter(),
    });
    expect(response.body).toEqual({ ok: true, providers: { quotes: 'none', yahoo: true, edgar: false, guardian: false } });
  });
});
