import type { IDBPDatabase, IDBPTransaction } from 'idb';
import { DEFAULT_SETTINGS, type ArticleState, type Portfolio, type Quote, type Settings, type Transaction, type WatchItem } from '../domain/types';
import type { ColossalDB } from './db';
import { getDb } from './db';
import {
  articleStateSchema,
  portfolioSchema,
  quoteSchema,
  settingsSchema,
  transactionSchema,
  watchSchema,
} from './schema';

type StoreName = 'portfolios' | 'transactions' | 'quotes' | 'watchlist' | 'articleStates' | 'settings';
type WriteTx = IDBPTransaction<ColossalDB, StoreName[], 'readwrite'>;

function parseList<T>(rows: unknown[], schema: { parse: (value: unknown) => T }): T[] {
  return rows.map((row) => schema.parse(row));
}

export async function listPortfolios(): Promise<Portfolio[]> {
  const db = await getDb();
  return parseList(await db.getAll('portfolios'), portfolioSchema);
}

export async function getPortfolio(): Promise<Portfolio | null> {
  const rows = await listPortfolios();
  return rows[0] ?? null;
}

export async function createPortfolio(portfolio: Portfolio): Promise<void> {
  const existing = await getPortfolio();
  if (existing) throw new Error('A portfolio already exists.');
  await savePortfolio(portfolio);
}

export async function savePortfolio(portfolio: Portfolio): Promise<void> {
  const parsed = portfolioSchema.parse(portfolio);
  const db = await getDb();
  await db.put('portfolios', parsed);
}

export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  return parseList(await db.getAll('transactions'), transactionSchema);
}

export async function listQuotes(): Promise<Quote[]> {
  const db = await getDb();
  return parseList(await db.getAll('quotes'), quoteSchema);
}

export async function listWatch(): Promise<WatchItem[]> {
  const db = await getDb();
  return parseList(await db.getAll('watchlist'), watchSchema);
}

export async function listArticleStates(): Promise<ArticleState[]> {
  const db = await getDb();
  return parseList(await db.getAll('articleStates'), articleStateSchema);
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const stored = await db.get('settings', 'singleton');
  if (!stored) {
    const defaults = settingsSchema.parse(DEFAULT_SETTINGS);
    await db.put('settings', defaults, 'singleton');
    return defaults;
  }
  return settingsSchema.parse(stored);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const parsed = settingsSchema.parse(settings);
  const db = await getDb();
  await db.put('settings', parsed, 'singleton');
}

export async function putQuote(quote: Quote): Promise<void> {
  const parsed = quoteSchema.parse(quote);
  const db = await getDb();
  await db.put('quotes', parsed);
}

export async function deleteQuote(symbol: string): Promise<void> {
  const db = await getDb();
  await db.delete('quotes', symbol);
}

export async function addWatch(item: WatchItem): Promise<'ok' | 'duplicate'> {
  const parsed = watchSchema.parse(item);
  const existing = await listWatch();
  if (existing.some((row) => row.symbol === parsed.symbol)) return 'duplicate';
  const db = await getDb();
  await db.put('watchlist', parsed);
  return 'ok';
}

export async function putWatch(item: WatchItem): Promise<void> {
  const parsed = watchSchema.parse(item);
  const db = await getDb();
  await db.put('watchlist', parsed);
}

export async function deleteWatch(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('watchlist', id);
}

export async function putArticleState(state: ArticleState): Promise<void> {
  const parsed = articleStateSchema.parse(state);
  const db = await getDb();
  await db.put('articleStates', parsed);
}

export async function deleteArticleState(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('articleStates', id);
}

async function rewrite(
  db: IDBPDatabase<ColossalDB>,
  stores: StoreName[],
  write: (tx: WriteTx) => Promise<void>,
): Promise<void> {
  const tx = db.transaction(stores, 'readwrite');
  await write(tx);
  await tx.done;
}

export async function savePortfolioAndTransactions(portfolio: Portfolio, transactions: Transaction[]): Promise<void> {
  const parsedPortfolio = portfolioSchema.parse(portfolio);
  const parsedTransactions = transactions.map((row) => transactionSchema.parse(row));
  const db = await getDb();
  await rewrite(db, ['portfolios', 'transactions'], async (tx) => {
    await tx.objectStore('portfolios').put(parsedPortfolio);
    await tx.objectStore('transactions').clear();
    for (const row of parsedTransactions) await tx.objectStore('transactions').put(row);
  });
}

export interface BookWrite {
  portfolio: Portfolio;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: WatchItem[];
  articleStates: ArticleState[] | null;
  settings: Settings | null;
}

export async function replaceBook(book: BookWrite): Promise<void> {
  const portfolio = portfolioSchema.parse(book.portfolio);
  const transactions = book.transactions.map((row) => transactionSchema.parse(row));
  const quotes = book.quotes.map((row) => quoteSchema.parse(row));
  const watchlist = book.watchlist.map((row) => watchSchema.parse(row));
  const articleStates = book.articleStates?.map((row) => articleStateSchema.parse(row)) ?? null;
  const settings = book.settings ? settingsSchema.parse(book.settings) : null;
  const stores: StoreName[] = ['portfolios', 'transactions', 'quotes', 'watchlist'];
  if (articleStates) stores.push('articleStates');
  if (settings) stores.push('settings');
  const db = await getDb();
  await rewrite(db, stores, async (tx) => {
    await tx.objectStore('portfolios').clear();
    await tx.objectStore('transactions').clear();
    await tx.objectStore('quotes').clear();
    await tx.objectStore('watchlist').clear();
    await tx.objectStore('portfolios').put(portfolio);
    for (const row of transactions) await tx.objectStore('transactions').put(row);
    for (const row of quotes) await tx.objectStore('quotes').put(row);
    for (const row of watchlist) await tx.objectStore('watchlist').put(row);
    if (articleStates) {
      await tx.objectStore('articleStates').clear();
      for (const row of articleStates) await tx.objectStore('articleStates').put(row);
    }
    if (settings) await tx.objectStore('settings').put(settings, 'singleton');
  });
}
