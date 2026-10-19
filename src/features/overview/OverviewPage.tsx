import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { concentration } from '../../domain/concentration';
import { decimalOf } from '../../domain/money';
import { openPositions } from '../../domain/positions';
import { quoteChange } from '../../domain/positions';
import { useStore } from '../../app/store';
import { formatTimestamp, isStale } from '../../app/time';
import { Disclosure, Money } from '../../app/ui';
import { loadHeadlines } from '../news/load';
import { relevance, sourceDisclaimer } from '../news/rank';
import type { Article } from '../../domain/types';

export function OverviewPage() {
  const store = useStore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [newsNotice, setNewsNotice] = useState<string | null>(null);
  const [newsRequested, setNewsRequested] = useState(false);

  useEffect(() => {
    if (!store.ready || !newsRequested) return;
    const enabled = store.settings.newsYahoo || store.settings.newsEdgar || store.settings.newsGuardian;
    if (!enabled) {
      setArticles([]);
      setNewsNotice('News sources are off. Enable one in Settings when you want headlines.');
      return;
    }
    let cancelled = false;
    void loadHeadlines({
      openSymbols: openPositions(store.snapshot).map((position) => position.symbol),
      watchSymbols: store.watchlist.map((item) => item.symbol),
      settings: store.settings,
      articleStates: store.articleStates,
    }).then((result) => {
      if (cancelled) return;
      setArticles(result.articles.slice(0, 4));
      setNewsNotice(result.notices[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [newsRequested, store.ready, store.settings, store.snapshot, store.watchlist, store.articleStates]);

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;
  if (store.error) return <main id="main"><p className="notice error">{store.error}</p></main>;

  const open = openPositions(store.snapshot);
  const report = concentration(store.snapshot, store.settings.concentrationThresholdPct);
  const quoted = open.filter((position) => position.unrealizedPl !== null);
  const ranked = [...quoted].sort((a, b) => decimalOf(b.unrealizedPl ?? '0').cmp(decimalOf(a.unrealizedPl ?? '0')));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const recent = [...store.transactions].sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1)).slice(0, 5);
  const stale = store.quotes.filter((quote) => isStale(quote.asOf));

  return (
    <main id="main">
      <h1>Overview</h1>
      {store.transactions.length === 0 ? (
        <section className="card">
          <h2>Your book is empty</h2>
          <p>Add a stock or ETF you already own, import a file, or open a labeled sample book from Settings.</p>
          <div className="cluster">
            <Link className="btn primary" to="/portfolio">
              Add a holding
            </Link>
            <Link className="btn" to="/settings">
              Import or load the sample
            </Link>
            <Link className="btn" to="/calculator">
              Size a position
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="metrics" aria-label="Portfolio totals">
            <div className="metric">
              <span>Market value</span>
              <strong data-testid="metric-market">
                <Money value={store.snapshot.totalMarketValue} />
              </strong>
              {!store.snapshot.marketValueComplete ? <span>Incomplete until every open position has a price.</span> : null}
            </div>
            <div className="metric">
              <span>Remaining cost basis</span>
              <strong><Money value={store.snapshot.totalRemainingBasis} /></strong>
            </div>
            <div className="metric">
              <span>Unrealized P/L</span>
              <strong data-testid="metric-unrealized"><Money value={store.snapshot.totalUnrealizedPl} signed /></strong>
            </div>
            <div className="metric">
              <span>Realized P/L</span>
              <strong><Money value={store.snapshot.totalRealizedPl} signed /></strong>
            </div>
            <div className="metric">
              <span>Open positions</span>
              <strong className="num">{open.length}</strong>
            </div>
          </section>
          <p className="muted">These totals are the market value of quoted holdings. Cash is not included, so this is not total account equity.</p>
          {report.warnings.length > 0 ? (
            <div className="notice" role="status">
              {report.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <h2>Holdings</h2>
          <table className="cards">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Market value</th>
                <th className="num">Unrealized</th>
                <th className="num">Realized</th>
              </tr>
            </thead>
            <tbody>
              {store.snapshot.positions.map((position) => (
                <tr key={position.symbol} data-testid={`position-${position.symbol}`}>
                  <td data-label="Symbol"><Link className="ticker" to={`/portfolio/${position.symbol}`}>{position.symbol}</Link></td>
                  <td className="num" data-label="Market value"><Money value={position.marketValue} /></td>
                  <td className="num" data-label="Unrealized" data-testid={`unrealized-${position.symbol}`}><Money value={position.unrealizedPl} signed /></td>
                  <td className="num" data-label="Realized" data-testid={`realized-${position.symbol}`}><Money value={position.realizedPl} signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Allocation</h2>
          {report.rows.length === 0 ? <p className="muted">Allocation needs at least one quoted open position.</p> : (
            <div>
              {report.rows.map((row) => (
                <p key={row.symbol}>
                  <span className="ticker">{row.symbol}</span> <span className="num">{row.weightPct}%</span>
                  <span className="bar" aria-hidden="true"><span style={{ width: `${row.weightPct}%` }} /></span>
                </p>
              ))}
            </div>
          )}
          <h2>Best and worst</h2>
          {best ? <p>Best unrealized result: <span className="ticker">{best.symbol}</span> <Money value={best.unrealizedPl} signed /></p> : <p className="muted">Best and worst need a quote.</p>}
          {worst && ranked.length > 1 ? <p>Worst unrealized result: <span className="ticker">{worst.symbol}</span> <Money value={worst.unrealizedPl} signed /></p> : null}
          <h2>Today</h2>
          {store.quotes.some((quote) => quote.previousClose) ? (
            store.quotes.map((quote) => {
              const change = quoteChange(quote.price, quote.previousClose);
              if (!change) return null;
              return <p key={quote.symbol}><span className="ticker">{quote.symbol}</span> {change.amount} ({change.percent}%) from the previous close.</p>;
            })
          ) : <p className="muted">Today&apos;s change is omitted until a quote includes a previous close.</p>}
        </>
      )}
      <h2>Watchlist</h2>
      {store.watchlist.length === 0 ? <p className="muted">No symbols are being watched.</p> : (
        <p>{store.watchlist.length} watched: {store.watchlist.map((item) => item.symbol).join(', ')}</p>
      )}
      <h2>Recent activity</h2>
      {recent.length === 0 ? <p className="muted">No transactions yet.</p> : (
        <ul>
          {recent.map((tx) => (
            <li key={tx.id}><span className="ticker">{tx.symbol}</span> {tx.type} {tx.quantity} @ {tx.price} on {formatTimestamp(tx.executedAt)}</li>
          ))}
        </ul>
      )}
      <h2>News for holdings</h2>
      <p className="muted">Headlines load only when you ask, so a visit here does not spend a provider quota.</p>
      <button type="button" onClick={() => setNewsRequested(true)}>Load headlines</button>
      {newsNotice ? <p className="muted">{newsNotice}</p> : null}
      {articles.map((article) => (
        <article className="headline" key={article.id}>
          <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
          <p className="muted">{relevance(article, open.map((position) => position.symbol), store.watchlist.map((item) => item.symbol))}</p>
          {sourceDisclaimer(article.source) ? <p className="muted">{sourceDisclaimer(article.source)}</p> : null}
        </article>
      ))}
      <h2>Data freshness</h2>
      {store.quotes.length === 0 ? <p className="muted">No prices are saved. Market value stays blank until you enter one or refresh a configured provider.</p> : (
        <ul>
          {store.quotes.map((quote) => (
            <li key={quote.symbol}>
              <span className="ticker">{quote.symbol}</span> {quote.price} from {quote.source}, as of {formatTimestamp(quote.asOf)}
              {isStale(quote.asOf) ? ' · stale' : ''}
              {quote.locked ? ' · manual lock' : ''}
            </li>
          ))}
        </ul>
      )}
      {stale.length > 0 ? <p className="muted">Stale means the saved timestamp is older than 24 hours. The price is still the last saved quote, not a live price.</p> : null}
      {store.replayError ? <p className="notice error">{store.replayError}</p> : null}
      <Disclosure />
    </main>
  );
}
