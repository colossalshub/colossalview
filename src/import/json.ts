import { replay } from '../domain/fifo';
import type { ArticleState, ImportBundle, ImportPreview, Portfolio, Quote, Settings, Transaction, WatchItem } from '../domain/types';
import { importBundleSchema } from '../persistence/schema';
import { blankPreview, type ImportFailure } from './types';

export interface PreparedImport {
  ok: true;
  bundle: ImportBundle;
  preview: ImportPreview;
  next: {
    portfolio: Portfolio;
    transactions: Transaction[];
    quotes: Quote[];
    watchlist: WatchItem[];
    articleStates: ArticleState[];
    settings: Settings | null;
  };
}

export interface CurrentBook {
  portfolio: Portfolio | null;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: WatchItem[];
  articleStates: ArticleState[];
  settings: Settings;
}

function fail(code: ImportFailure['code'], message: string, preview: ImportPreview): ImportFailure {
  return { ok: false, code, message, preview: { ...preview, errors: [...preview.errors, { path: code, message }] } };
}

function summarize(transactions: Transaction[], preview: ImportPreview, quotes: Quote[]): ImportPreview {
  const symbols = [...new Set(transactions.map((tx) => tx.symbol))].sort();
  const times = transactions.map((tx) => tx.executedAt).sort();
  const replayed = replay(transactions, quotes);
  return {
    ...preview,
    transactionCount: transactions.length,
    buyCount: transactions.filter((tx) => tx.type === 'buy').length,
    sellCount: transactions.filter((tx) => tx.type === 'sell').length,
    symbols,
    executedFrom: times[0] ?? null,
    executedTo: times[times.length - 1] ?? null,
    replayRealizedPl: replayed.ok ? replayed.value.totalRealizedPl : null,
    errors: replayed.ok ? preview.errors : [...preview.errors, { path: 'REPLAY_REJECTED', message: replayed.error.message }],
  };
}

export function prepareJsonImport(raw: unknown, current: CurrentBook, mode: 'replace' | 'merge'): PreparedImport | ImportFailure {
  const preview = blankPreview('json', mode);
  if (!raw || typeof raw !== 'object') {
    return fail('INVALID_BUNDLE', 'Import JSON must be an object.', preview);
  }
  const record = raw as { schemaVersion?: unknown };
  if (record.schemaVersion !== 1) {
    return fail('UNSUPPORTED_SCHEMA_VERSION', 'Only schema version 1 can be imported.', {
      ...preview,
      schemaVersion: typeof record.schemaVersion === 'number' ? record.schemaVersion : 0,
    });
  }
  const parsed = importBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail('INVALID_BUNDLE', issue?.message ?? 'Import JSON did not match the schema.', {
      ...preview,
      schemaVersion: 1,
      errors: parsed.error.issues.slice(0, 8).map((item) => ({ path: item.path.join('.'), message: item.message })),
    });
  }
  const bundle = parsed.data;
  preview.schemaVersion = 1;
  preview.portfolioName = bundle.portfolio.name;
  const warnings = [...preview.warnings];
  const ids = new Set<string>();
  const errors = [...preview.errors];
  for (const tx of bundle.transactions) {
    if (tx.portfolioId !== bundle.portfolio.id) {
      errors.push({ path: 'PORTFOLIO_ID_MISMATCH', message: `Transaction ${tx.id} does not belong to portfolio ${bundle.portfolio.id}.` });
    }
    if (ids.has(tx.id)) warnings.push(`Duplicate transaction id ${tx.id} inside the file.`);
    ids.add(tx.id);
  }
  const watchSymbols = new Set<string>();
  for (const item of bundle.watchlist) {
    if (watchSymbols.has(item.symbol)) errors.push({ path: item.symbol, message: `${item.symbol} is on the watchlist more than once.` });
    watchSymbols.add(item.symbol);
  }
  const quoteSymbols = new Set<string>();
  for (const quote of bundle.quotes) {
    if (quoteSymbols.has(quote.symbol)) errors.push({ path: quote.symbol, message: `${quote.symbol} has more than one quote.` });
    quoteSymbols.add(quote.symbol);
  }
  if (errors.length > 0) {
    return fail('INVALID_BUNDLE', errors[0]?.message ?? 'Import JSON did not match the book.', { ...preview, schemaVersion: 1, warnings, errors });
  }

  if (mode === 'merge' && current.portfolio && current.portfolio.id !== bundle.portfolio.id) {
    return fail('PORTFOLIO_ID_MISMATCH', 'This file belongs to a different portfolio. Use replace to switch books.', {
      ...preview,
      warnings,
    });
  }
  if (mode === 'merge') {
    for (const tx of bundle.transactions) {
      if (current.portfolio && tx.portfolioId !== current.portfolio.id) {
        return fail('PORTFOLIO_ID_MISMATCH', 'A transaction in the file uses a different portfolio id.', preview);
      }
      if (current.transactions.some((existing) => existing.id === tx.id)) {
        warnings.push(`Transaction ${tx.id} already exists and will be updated.`);
      }
    }
  }

  const transactions =
    mode === 'replace' || !current.portfolio
      ? bundle.transactions
      : mergeById(current.transactions, bundle.transactions);
  const quotes = mode === 'replace' || !current.portfolio ? bundle.quotes : mergeBy(current.quotes, bundle.quotes, (quote) => quote.symbol);
  const watchlist =
    mode === 'replace' || !current.portfolio
      ? bundle.watchlist
      : mergeBy(current.watchlist, bundle.watchlist, (item) => item.symbol);
  const articleStates =
    mode === 'replace' || !current.portfolio
      ? bundle.articleStates
      : mergeBy(current.articleStates, bundle.articleStates, (item) => item.id);
  const portfolio = mode === 'replace' || !current.portfolio ? bundle.portfolio : { ...current.portfolio, updatedAt: bundle.exportedAt };
  const summary = summarize(transactions, { ...preview, warnings }, quotes);
  if (summary.errors.length > 0) {
    return { ok: false, code: 'REPLAY_REJECTED', message: summary.errors[0]?.message ?? 'Replay rejected the book.', preview: summary };
  }
  return {
    ok: true,
    bundle,
    preview: summary,
    next: {
      portfolio,
      transactions,
      quotes,
      watchlist,
      articleStates,
      settings: bundle.settings,
    },
  };
}

function mergeById(current: Transaction[], incoming: Transaction[]): Transaction[] {
  const map = new Map(current.map((tx) => [tx.id, tx]));
  for (const tx of incoming) map.set(tx.id, tx);
  return [...map.values()];
}

function mergeBy<T>(current: T[], incoming: T[], key: (item: T) => string): T[] {
  const map = new Map(current.map((item) => [key(item), item]));
  for (const item of incoming) map.set(key(item), item);
  return [...map.values()];
}

export function buildExportBundle(book: CurrentBook, exportedAt: string): ImportBundle {
  if (!book.portfolio) {
    throw new Error('There is no portfolio to export.');
  }
  return {
    schemaVersion: 1,
    app: 'colossalview',
    exportedAt,
    portfolio: book.portfolio,
    transactions: book.transactions,
    quotes: book.quotes,
    watchlist: book.watchlist,
    settings: book.settings,
    articleStates: book.articleStates,
  };
}
