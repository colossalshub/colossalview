import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { replay } from '../domain/fifo';
import type { ArticleState, Portfolio, PortfolioSnapshot, Quote, Settings, Transaction, WatchItem } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { loadWorkspace } from './portfolioService';

interface StoreValue {
  ready: boolean;
  error: string | null;
  replayError: string | null;
  portfolio: Portfolio | null;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: WatchItem[];
  settings: Settings;
  articleStates: ArticleState[];
  snapshot: PortfolioSnapshot;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const emptySnapshot = replay([], []);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [articleStates, setArticleStates] = useState<ArticleState[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot>(emptySnapshot.ok ? emptySnapshot.value : {
    positions: [],
    totalRemainingBasis: '0.00',
    totalRealizedPl: '0.00',
    totalMarketValue: null,
    marketValueComplete: true,
    omittedOpenSymbols: [],
    totalUnrealizedPl: '0.00',
  });

  const refresh = useCallback(async () => {
    try {
      const next = await loadWorkspace();
      setPortfolio(next.portfolio);
      setTransactions(next.transactions);
      setQuotes(next.quotes);
      setWatchlist(next.watchlist);
      setSettings(next.settings);
      setArticleStates(next.articleStates);
      setSnapshot(next.snapshot);
      setReplayError(next.replayError);
      setError(null);
      const root = document.documentElement;
      if (next.settings.theme === 'system') {
        root.removeAttribute('data-theme');
        localStorage.removeItem('colossalview.theme');
      } else {
        root.setAttribute('data-theme', next.settings.theme);
        localStorage.setItem('colossalview.theme', next.settings.theme);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The book could not be loaded.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ready,
      error,
      replayError,
      portfolio,
      transactions,
      quotes,
      watchlist,
      settings,
      articleStates,
      snapshot,
      refresh,
    }),
    [ready, error, replayError, portfolio, transactions, quotes, watchlist, settings, articleStates, snapshot, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('The portfolio store is missing.');
  return value;
}
