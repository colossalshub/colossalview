import { useEffect, useMemo, useState } from 'react';
import { openPositions } from '../../domain/positions';
import type { Article, ArticleSource } from '../../domain/types';
import { setArticleFlags } from '../../app/portfolioService';
import { useStore } from '../../app/store';
import { formatTimestamp } from '../../app/time';
import { loadHeadlines } from './load';
import { relevance } from './rank';

type Tab = 'for-you' | 'holdings' | 'watchlist' | 'macro' | 'filings' | 'saved';

const publishers: Record<ArticleSource, string> = {
  'yahoo-rss': 'Yahoo Finance',
  'sec-edgar': 'SEC EDGAR',
  guardian: 'The Guardian',
};

export function NewsPage() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('for-you');
  const [ticker, setTicker] = useState('');
  const [source, setSource] = useState<'all' | ArticleSource>('all');
  const [period, setPeriod] = useState<'all' | '1' | '7' | '30'>('all');
  const [articles, setArticles] = useState<Article[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSymbols = openPositions(store.snapshot).map((position) => position.symbol);
  const watchSymbols = store.watchlist.map((item) => item.symbol);

  useEffect(() => {
    if (!store.ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadHeadlines({
      openSymbols,
      watchSymbols,
      settings: store.settings,
      articleStates: store.articleStates,
    })
      .then((result) => {
        if (cancelled) return;
        setArticles(result.articles);
        setNotices(result.notices);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'News failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store.ready, store.settings, store.articleStates, store.snapshot, store.watchlist]);

  const visible = useMemo(() => {
    const now = Date.now();
    return articles.filter((article) => {
      if (tab === 'holdings' && !article.symbols.some((symbol) => openSymbols.includes(symbol))) return false;
      if (tab === 'watchlist' && !article.symbols.some((symbol) => watchSymbols.includes(symbol))) return false;
      if (tab === 'macro' && article.source !== 'guardian') return false;
      if (tab === 'filings' && article.source !== 'sec-edgar') return false;
      if (tab === 'saved' && !article.saved) return false;
      if (ticker && !article.symbols.includes(ticker.trim().toUpperCase())) return false;
      if (source !== 'all' && article.source !== source) return false;
      if (period !== 'all') {
        const age = now - new Date(article.publishedAt).getTime();
        if (age > Number(period) * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [articles, tab, ticker, source, period, openSymbols, watchSymbols]);

  if (!store.ready) return <main id="main"><p>Loading your book…</p></main>;
  const sourcesOff = !store.settings.newsYahoo && !store.settings.newsEdgar && !store.settings.newsGuardian;

  return (
    <main id="main">
      <h1>News</h1>
      <div className="cluster" role="tablist" aria-label="News categories">
        {([
          ['for-you', 'For you'],
          ['holdings', 'My holdings'],
          ['watchlist', 'Watchlist'],
          ['macro', 'Market and macro'],
          ['filings', 'Company filings'],
          ['saved', 'Saved articles'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">Ticker
          <input value={ticker} onChange={(event) => setTicker(event.target.value)} />
        </label>
        <label className="field">Source
          <select value={source} onChange={(event) => setSource(event.target.value as 'all' | ArticleSource)}>
            <option value="all">All sources</option>
            <option value="yahoo-rss">Yahoo Finance</option>
            <option value="sec-edgar">SEC EDGAR</option>
            <option value="guardian">The Guardian</option>
          </select>
        </label>
        <label className="field">Period
          <select value={period} onChange={(event) => setPeriod(event.target.value as 'all' | '1' | '7' | '30')}>
            <option value="all">Any time</option>
            <option value="1">Past day</option>
            <option value="7">Past week</option>
            <option value="30">Past 30 days</option>
          </select>
        </label>
        <button type="button" onClick={() => void store.refresh()}>Refresh</button>
      </div>
      {sourcesOff ? <p>News sources are off. Nothing is requested until you enable Yahoo, EDGAR, or The Guardian in Settings.</p> : null}
      {tab === 'macro' && !store.settings.newsGuardian ? <p className="muted">Market and macro headlines use The Guardian and stay empty while that source is off.</p> : null}
      {tab === 'filings' && !store.settings.newsEdgar ? <p className="muted">Company filings stay empty until SEC EDGAR is configured and enabled.</p> : null}
      {loading ? <p>Loading headlines…</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
      {notices.map((notice) => <p key={notice} className="muted">{notice}</p>)}
      {!loading && visible.length === 0 ? <p className="muted">No headlines in this view.</p> : null}
      {visible.map((article) => (
        <article className="headline card" key={article.id}>
          <h2>{article.title}</h2>
          <p className="muted">
            {publishers[article.source]} · published {formatTimestamp(article.publishedAt)}
            {article.symbols.length > 0 ? ` · ${article.symbols.join(', ')}` : ''}
            {article.filingType ? ` · ${article.filingType}` : ''}
          </p>
          {article.summary ? <p>{article.summary}</p> : null}
          <p>{relevance(article, openSymbols, watchSymbols)}</p>
          {article.source === 'yahoo-rss' ? <p className="muted">Unofficial Yahoo Finance headline feed. Not affiliated with Yahoo.</p> : null}
          {article.source === 'guardian' ? <p className="muted">Content via The Guardian Open Platform.</p> : null}
          <div className="cluster">
            <a href={article.url} target="_blank" rel="noreferrer" onClick={() => void setArticleFlags({ ...article, read: true }).then(store.refresh)}>
              Open original
            </a>
            <button type="button" onClick={() => void setArticleFlags({ ...article, saved: !article.saved }).then(store.refresh)}>
              {article.saved ? 'Unsave' : 'Save'}
            </button>
            <button type="button" onClick={() => void setArticleFlags({ ...article, read: !article.read }).then(store.refresh)}>
              {article.read ? 'Mark unread' : 'Mark read'}
            </button>
          </div>
        </article>
      ))}
    </main>
  );
}
