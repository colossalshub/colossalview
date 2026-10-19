import type { IDBPDatabase } from 'idb';
import { ENGINE_VERSION, SCHEMA_VERSION } from '../domain/types';
import type { ColossalDB } from './db';

export function migrate(
  db: IDBPDatabase<ColossalDB>,
  oldVersion: number,
  transaction: { objectStore: (name: 'meta') => { put: (value: { schemaVersion: number; engineVersion: number }, key: string) => unknown } },
): void {
  if (oldVersion < 1) {
    db.createObjectStore('meta');
    db.createObjectStore('portfolios', { keyPath: 'id' });
    const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
    transactions.createIndex('byPortfolio', 'portfolioId');
    transactions.createIndex('bySymbol', 'symbol');
    transactions.createIndex('byExecutedAt', 'executedAt');
    db.createObjectStore('quotes', { keyPath: 'symbol' });
    const watchlist = db.createObjectStore('watchlist', { keyPath: 'id' });
    watchlist.createIndex('bySymbol', 'symbol', { unique: true });
    db.createObjectStore('articleStates', { keyPath: 'id' });
    db.createObjectStore('settings');
    transaction.objectStore('meta').put({ schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION }, 'engine');
  }
}
