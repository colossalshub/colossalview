export type TransactionType = 'buy' | 'sell';

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: 'USD';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  symbol: string;
  type: TransactionType;
  quantity: string;
  price: string;
  fee: string;
  executedAt: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type QuoteSource = 'manual' | 'finnhub' | 'alphavantage';

export interface Quote {
  symbol: string;
  price: string;
  currency: 'USD';
  asOf: string;
  source: QuoteSource;
  previousClose: string | null;
  locked: boolean;
}

export type ArticleSource = 'yahoo-rss' | 'sec-edgar' | 'guardian';

export interface ArticleDraft {
  source: ArticleSource;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  symbols: string[];
  filingType: string | null;
  accessionNumber: string | null;
}

export interface Article extends ArticleDraft {
  id: string;
  saved: boolean;
  read: boolean;
}

export interface ArticleState {
  id: string;
  source: ArticleSource;
  url: string;
  title: string;
  publishedAt: string;
  summary: string;
  symbols: string[];
  filingType: string | null;
  accessionNumber: string | null;
  saved: boolean;
  read: boolean;
  updatedAt: string;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type QuoteMode = 'manual' | 'live';

export interface Settings {
  schemaVersion: 1;
  theme: ThemeSetting;
  concentrationThresholdPct: string;
  quoteMode: QuoteMode;
  newsYahoo: boolean;
  newsEdgar: boolean;
  newsGuardian: boolean;
}

export interface WatchItem {
  id: string;
  symbol: string;
  note: string;
  priority: boolean;
  createdAt: string;
}

export interface ImportBundle {
  schemaVersion: 1;
  app: 'colossalview';
  exportedAt: string;
  portfolio: Portfolio;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: WatchItem[];
  settings: Settings | null;
  articleStates: ArticleState[];
}

export interface OpenLot {
  lotId: string;
  symbol: string;
  acquiredAt: string;
  quantityOpen: string;
  remainingBasis: string;
}

export interface SellSlice {
  lotId: string;
  quantity: string;
  basisRemoved: string;
  feeAllocated: string;
}

export interface SellResult {
  transactionId: string;
  grossProceeds: string;
  fee: string;
  netProceeds: string;
  basisRemoved: string;
  realizedPl: string;
  slices: SellSlice[];
}

export interface PositionView {
  symbol: string;
  quantityOpen: string;
  remainingBasis: string;
  averageCost: string | null;
  lots: OpenLot[];
  realizedPl: string;
  quote: Quote | null;
  marketValue: string | null;
  unrealizedPl: string | null;
}

export interface PortfolioSnapshot {
  positions: PositionView[];
  totalRemainingBasis: string;
  totalRealizedPl: string;
  totalMarketValue: string | null;
  marketValueComplete: boolean;
  omittedOpenSymbols: string[];
  totalUnrealizedPl: string | null;
}

export interface ImportPreview {
  schemaVersion: number;
  format: 'json' | 'holdings-csv' | 'transactions-csv';
  mode: 'replace' | 'merge' | 'append';
  portfolioName: string;
  transactionCount: number;
  buyCount: number;
  sellCount: number;
  symbols: string[];
  executedFrom: string | null;
  executedTo: string | null;
  warnings: string[];
  errors: { path: string; message: string }[];
  replayRealizedPl: string | null;
}

export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = 1 as const;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  theme: 'system',
  concentrationThresholdPct: '25',
  quoteMode: 'manual',
  newsYahoo: false,
  newsEdgar: false,
  newsGuardian: false,
};
