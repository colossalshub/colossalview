import { replay, type ReplayDetail } from '../domain/fifo';
import { parseFee, parsePrice, parseQuantity } from '../domain/money';
import { canonicalizeSymbol } from '../domain/symbols';
import type { DomainResult } from '../domain/errors';
import { domainError, domainOk } from '../domain/errors';
import { assertTimestamp } from '../domain/fifo';
import type { Portfolio, PortfolioSnapshot, Quote, Transaction } from '../domain/types';
import { prepareJsonImport, type CurrentBook } from '../import/json';
import { prepareHoldingsCsv, prepareTransactionCsv } from '../import/holdings';
import {
  addWatch,
  deleteQuote,
  deleteWatch,
  getPortfolio,
  getSettings,
  listArticleStates,
  listQuotes,
  listTransactions,
  listWatch,
  putArticleState,
  putQuote,
  putWatch,
  replaceBook,
  savePortfolioAndTransactions,
  saveSettings,
  deleteArticleState,
} from '../persistence/repositories';
import { nowIso } from './time';

export interface TradeDraft {
  symbol: string;
  type: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
  executedAt: string;
  note: string;
}

async function book(): Promise<CurrentBook> {
  const [portfolio, transactions, quotes, watchlist, articleStates, settings] = await Promise.all([
    getPortfolio(),
    listTransactions(),
    listQuotes(),
    listWatch(),
    listArticleStates(),
    getSettings(),
  ]);
  return { portfolio, transactions, quotes, watchlist, articleStates, settings };
}

export async function loadWorkspace(): Promise<CurrentBook & { snapshot: PortfolioSnapshot; replayError: string | null }> {
  const current = await book();
  const replayed = replay(current.transactions, current.quotes);
  if (!replayed.ok) {
    const empty = replay([], []);
    if (!empty.ok) throw new Error(replayed.error.message);
    return { ...current, snapshot: empty.value, replayError: replayed.error.message };
  }
  return { ...current, snapshot: replayed.value, replayError: null };
}

function emptySnapshot(): PortfolioSnapshot {
  const replayed = replay([], []);
  if (!replayed.ok) throw new Error('Empty replay failed.');
  return replayed.value;
}

async function ensurePortfolio(existing: Portfolio | null, now: string): Promise<Portfolio> {
  if (existing) return { ...existing, updatedAt: now };
  return {
    id: crypto.randomUUID(),
    name: 'Portfolio',
    baseCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeDraft(draft: TradeDraft, portfolioId: string, id: string, createdAt: string): DomainResult<Transaction> {
  const symbol = canonicalizeSymbol(draft.symbol);
  if (!symbol.ok) return symbol;
  const quantity = parseQuantity(draft.quantity);
  if (!quantity.ok) return quantity;
  const price = parsePrice(draft.price);
  if (!price.ok) return price;
  const fee = parseFee(draft.fee.trim() === '' ? '0' : draft.fee);
  if (!fee.ok) return fee;
  const executedAt = assertTimestamp(draft.executedAt);
  if (!executedAt.ok) return executedAt;
  if (draft.note.length > 500) return domainError('INVALID_NOTE', 'Notes must be 500 characters or fewer.');
  if (draft.type !== 'buy' && draft.type !== 'sell') {
    return domainError('UNKNOWN_TRANSACTION_TYPE', 'Only buy and sell transactions are supported.');
  }
  return domainOk({
    id,
    portfolioId,
    symbol: symbol.value,
    type: draft.type,
    quantity: quantity.value,
    price: price.value,
    fee: fee.value,
    executedAt: executedAt.value,
    note: draft.note,
    createdAt,
    updatedAt: nowIso(),
  });
}

let writeTail: Promise<unknown> = Promise.resolve();

export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeTail.then(task, task);
  writeTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function commit(portfolio: Portfolio, transactions: Transaction[], quotes: Quote[]): Promise<DomainResult<PortfolioSnapshot>> {
  const replayed = replay(transactions, quotes);
  if (!replayed.ok) return replayed;
  await savePortfolioAndTransactions(portfolio, transactions);
  return domainOk(replayed.value);
}

export function addTrade(draft: TradeDraft): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const current = await book();
    const now = nowIso();
    const portfolio = await ensurePortfolio(current.portfolio, now);
    const tx = normalizeDraft(draft, portfolio.id, crypto.randomUUID(), now);
    if (!tx.ok) return tx;
    return commit(portfolio, [...current.transactions, tx.value], current.quotes);
  });
}

export function updateTrade(id: string, draft: TradeDraft): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const current = await book();
    if (!current.portfolio) return domainError('PORTFOLIO_MISMATCH', 'There is no portfolio to edit.');
    const existing = current.transactions.find((tx) => tx.id === id);
    if (!existing) return domainError('PORTFOLIO_MISMATCH', 'That transaction was not found.');
    const tx = normalizeDraft(draft, current.portfolio.id, id, existing.createdAt);
    if (!tx.ok) return tx;
    const next = current.transactions.map((item) => (item.id === id ? tx.value : item));
    return commit({ ...current.portfolio, updatedAt: nowIso() }, next, current.quotes);
  });
}

export function deleteTrade(id: string): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const current = await book();
    if (!current.portfolio) return domainError('PORTFOLIO_MISMATCH', 'There is no portfolio to edit.');
    const next = current.transactions.filter((tx) => tx.id !== id);
    if (next.length === current.transactions.length) return domainError('PORTFOLIO_MISMATCH', 'That transaction was not found.');
    return commit({ ...current.portfolio, updatedAt: nowIso() }, next, current.quotes);
  });
}

export function removeSymbol(symbol: string): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const current = await book();
    if (!current.portfolio) return domainError('PORTFOLIO_MISMATCH', 'There is no portfolio to edit.');
    const canonical = canonicalizeSymbol(symbol);
    if (!canonical.ok) return canonical;
    const next = current.transactions.filter((tx) => tx.symbol !== canonical.value);
    return commit({ ...current.portfolio, updatedAt: nowIso() }, next, current.quotes);
  });
}

export async function saveManualQuote(input: {
  symbol: string;
  price: string;
  asOf: string;
  previousClose: string;
}): Promise<DomainResult<Quote>> {
  const symbol = canonicalizeSymbol(input.symbol);
  if (!symbol.ok) return symbol;
  const price = parsePrice(input.price);
  if (!price.ok) return price;
  const asOf = assertTimestamp(input.asOf);
  if (!asOf.ok) return asOf;
  let previousClose: string | null = null;
  if (input.previousClose.trim() !== '') {
    const parsed = parsePrice(input.previousClose);
    if (!parsed.ok) return parsed;
    previousClose = parsed.value;
  }
  const quote: Quote = {
    symbol: symbol.value,
    price: price.value,
    currency: 'USD',
    asOf: asOf.value,
    source: 'manual',
    previousClose,
    locked: true,
  };
  await putQuote(quote);
  return domainOk(quote);
}

export async function clearManualQuote(symbol: string): Promise<void> {
  const canonical = canonicalizeSymbol(symbol);
  if (!canonical.ok) return;
  await deleteQuote(canonical.value);
}

export async function unlockQuote(symbol: string): Promise<void> {
  const canonical = canonicalizeSymbol(symbol);
  if (!canonical.ok) return;
  const quotes = await listQuotes();
  const quote = quotes.find((item) => item.symbol === canonical.value);
  if (!quote) return;
  await putQuote({ ...quote, locked: false });
}

export function symbolsForRefresh(symbols: string[], quotes: Quote[]): string[] {
  const locked = new Set(quotes.filter((quote) => quote.locked).map((quote) => quote.symbol));
  return symbols.filter((symbol) => !locked.has(symbol));
}

export async function storeLiveQuote(quote: {
  symbol: string;
  price: string;
  asOf: string;
  source: 'finnhub' | 'alphavantage';
  previousClose: string | null;
}): Promise<void> {
  const existing = (await listQuotes()).find((item) => item.symbol === quote.symbol);
  if (existing?.locked) return;
  await putQuote({
    symbol: quote.symbol,
    price: quote.price,
    currency: 'USD',
    asOf: quote.asOf,
    source: quote.source,
    previousClose: quote.previousClose,
    locked: false,
  });
}

export async function watchSymbol(symbol: string, note: string): Promise<DomainResult<void>> {
  const canonical = canonicalizeSymbol(symbol);
  if (!canonical.ok) return canonical;
  if (note.length > 500) return domainError('INVALID_NOTE', 'Notes must be 500 characters or fewer.');
  const result = await addWatch({
    id: crypto.randomUUID(),
    symbol: canonical.value,
    note,
    priority: false,
    createdAt: nowIso(),
  });
  if (result === 'duplicate') return domainError('INVALID_SYMBOL', `${canonical.value} is already on the watchlist.`);
  return domainOk(undefined);
}

export async function setWatchPriority(id: string, priority: boolean): Promise<void> {
  const items = await listWatch();
  const item = items.find((row) => row.id === id);
  if (!item) return;
  await putWatch({ ...item, priority });
}

export async function unwatch(id: string): Promise<void> {
  await deleteWatch(id);
}

export async function updateSettings(settings: CurrentBook['settings']): Promise<void> {
  await saveSettings(settings);
  if (settings.theme === 'system') localStorage.removeItem('colossalview.theme');
  else localStorage.setItem('colossalview.theme', settings.theme);
}

export async function setArticleFlags(state: Omit<import('../domain/types').ArticleState, 'updatedAt'>): Promise<void> {
  if (!state.saved && !state.read) {
    await deleteArticleState(state.id);
    return;
  }
  await putArticleState({ ...state, updatedAt: nowIso() });
}

export function importPrepared(next: {
  portfolio: Portfolio;
  transactions: Transaction[];
  quotes: Quote[];
  watchlist: CurrentBook['watchlist'];
  articleStates: CurrentBook['articleStates'];
  settings: CurrentBook['settings'] | null;
}): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const replayed = replay(next.transactions, next.quotes);
    if (!replayed.ok) return replayed;
    await replaceBook({
      portfolio: next.portfolio,
      transactions: next.transactions,
      quotes: next.quotes,
      watchlist: next.watchlist,
      articleStates: next.articleStates,
      settings: next.settings,
    });
    return domainOk(replayed.value);
  });
}

export async function previewJson(raw: unknown, mode: 'replace' | 'merge') {
  return prepareJsonImport(raw, await book(), mode);
}

export async function previewTransactionsCsv(text: string) {
  const current = await book();
  const portfolio = await ensurePortfolio(current.portfolio, nowIso());
  const prepared = prepareTransactionCsv(text, current.transactions, portfolio);
  if (!prepared.ok) return prepared;
  return { ...prepared, portfolio };
}

export async function previewHoldingsImport(text: string) {
  const current = await book();
  return prepareHoldingsCsv(text, current.transactions, current.portfolio);
}

export function applyTransactionList(portfolio: Portfolio, transactions: Transaction[]): Promise<DomainResult<PortfolioSnapshot>> {
  return enqueueWrite(async () => {
    const quotes = await listQuotes();
    return commit(portfolio, transactions, quotes);
  });
}

export type { ReplayDetail };
export { emptySnapshot };
