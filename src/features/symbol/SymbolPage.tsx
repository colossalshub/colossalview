import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { positionBySymbol, quoteChange } from '../../domain/positions';
import { canonicalizeSymbol } from '../../domain/symbols';
import type { Article } from '../../domain/types';
import { useStore } from '../../app/store';
import { formatTimestamp, isStale, nowIso } from '../../app/time';
import { Money } from '../../app/ui';
import { saveManualQuote, unwatch, watchSymbol } from '../../app/portfolioService';
import { loadHeadlines } from '../news/load';
import { sourceDisclaimer } from '../news/rank';

export function SymbolPage() {
  const params = useParams();
  const store = useStore();
  const parsed = canonicalizeSymbol(params.symbol ?? '');
  const symbol = parsed.ok ? parsed.value : (params.symbol ?? '').toUpperCase();
  const position = positionBySymbol(store.snapshot, symbol);
  const quote = store.quotes.find((item) => item.symbol === symbol) ?? position?.quote ?? null;
  const watched = store.watchlist.find((item) => item.symbol === symbol) ?? null;
  const [articles, setArticles] = useState<Article[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [company, setCompany] = useState<string | null>(null);
  const [exchange, setExchange] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualPrice, setManualPrice] = useState(quote?.price ?? '');

  useEffect(() => {
    setManualPrice(quote?.price ?? '');
  }, [quote?.price]);

  useEffect(() => {
    if (!store.ready || !parsed.ok) return;
    const enabled = store.settings.newsYahoo || store.settings.newsEdgar || store.settings.newsGuardian;
    if (!enabled) {
      setArticles([]);
      setNotices(['News sources are off.']);
      return;
    }
    let cancelled = false;
    void loadHeadlines({
      openSymbols: position ? [symbol] : [],
      watchSymbols: watched ? [symbol] : [],
      settings: store.settings,
      articleStates: store.articleStates,
      onlySymbol: symbol,
    }).then((result) => {
      if (!cancelled) {
        setArticles(result.articles);
        setNotices(result.notices);
        const companyInfo = result.companies[symbol];
        setCompany(companyInfo?.companyName ?? null);
        setExchange(companyInfo?.exchange ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store.ready, store.settings, store.articleStates, symbol, parsed.ok, position, watched]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const result = await watchSymbol(symbol, note);
    if (!result.ok) setError(result.error.message);
    else {
      setError(null);
      await store.refresh();
    }
  }

  if (!parsed.ok) {
    return <main id="main"><h1>Symbol</h1><p className="notice error">{parsed.error.message}</p></main>;
  }

  const change = quote ? quoteChange(quote.price, quote.previousClose) : null;

  return (
    <main id="main">
      <h1 className="ticker">{symbol}</h1>
      {company ? <p>{company}{exchange ? ` · ${exchange}` : ''}</p> : <p className="muted">Company name is unavailable until SEC filings are enabled and a match exists.</p>}
      <p className="muted">{quote ? `Currency ${quote.currency}` : 'Currency is shown only when a USD quote is saved.'}</p>
      <section className="metrics">
        <div className="metric">
          <span>Latest saved price</span>
          <strong className="num">{quote ? quote.price : '—'}</strong>
          {quote ? <span>{quote.source} · {formatTimestamp(quote.asOf)}{isStale(quote.asOf) ? ' · stale' : ''}</span> : <span>No quote stored. Nothing here is a live market value.</span>}
        </div>
        {change ? <div className="metric"><span>Change vs previous close</span><strong className="num">{change.amount} ({change.percent}%)</strong></div> : null}
      </section>
      <h2>Your position</h2>
      {position && position.quantityOpen !== '0' ? (
        <p>
          You hold {position.quantityOpen} shares. Unrealized <Money value={position.unrealizedPl} signed />. Realized <Money value={position.realizedPl} signed />.{' '}
          <Link to={`/portfolio/${symbol}`}>Open the lot detail</Link>
        </p>
      ) : <p className="muted">This symbol is not an open position.</p>}
      <h2>Manual price</h2>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void saveManualQuote({ symbol, price: manualPrice, asOf: nowIso(), previousClose: '' }).then(async (result) => {
            if (!result.ok) setError(result.error.message);
            else {
              setError(null);
              await store.refresh();
            }
          });
        }}
      >
        <label className="field">Price in USD
          <input inputMode="decimal" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} required />
        </label>
        <button className="primary" type="submit">Save manual price</button>
      </form>
      <p className="muted">A saved manual price is locked. Unlock it on the position page before a live refresh can replace it. Live refresh includes watched symbols.</p>
      <h2>Watchlist</h2>
      {watched ? (
        <button type="button" onClick={() => void unwatch(watched.id).then(store.refresh)}>Remove from watchlist</button>
      ) : (
        <form className="form-grid" onSubmit={add}>
          <label className="field">Note
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button className="primary" type="submit">Add to watchlist</button>
        </form>
      )}
      {error ? <p className="notice error">{error}</p> : null}
      <p><Link to={`/portfolio?buy=${symbol}`}>Start a buy</Link> without creating a position until you save it.</p>
      <h2>Price history</h2>
      <p className="muted">A historical chart is unavailable. No licensed price-history series is configured.</p>
      <h2>Filings and headlines</h2>
      {notices.map((notice) => <p key={notice} className="muted">{notice}</p>)}
      {articles.length === 0 ? <p className="muted">No headlines loaded for this symbol.</p> : articles.map((article) => (
        <article key={article.id} className="headline">
          <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
          <p className="muted">{article.source} · published {formatTimestamp(article.publishedAt)}{article.filingType ? ` · ${article.filingType}` : ''}</p>
          {sourceDisclaimer(article.source) ? <p className="muted">{sourceDisclaimer(article.source)}</p> : null}
        </article>
      ))}
      <p className="muted">Fundamentals, earnings dates, analyst targets, and financial statements are omitted when this app does not have a source for them.</p>
    </main>
  );
}
