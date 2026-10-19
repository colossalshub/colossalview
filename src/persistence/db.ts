import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ArticleState, Portfolio, Quote, Settings, Transaction, WatchItem } from '../domain/types';
import { migrate } from './migrate';
import { DB_NAME, DB_VERSION } from './schema';

export interface ColossalDB extends DBSchema {
  meta: {
    key: string;
    value: { schemaVersion: number; engineVersion: number };
  };
  portfolios: {
    key: string;
    value: Portfolio;
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { byPortfolio: string; bySymbol: string; byExecutedAt: string };
  };
  quotes: {
    key: string;
    value: Quote;
  };
  watchlist: {
    key: string;
    value: WatchItem;
    indexes: { bySymbol: string };
  };
  articleStates: {
    key: string;
    value: ArticleState;
  };
  settings: {
    key: string;
    value: Settings;
  };
}

let opening: Promise<IDBPDatabase<ColossalDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ColossalDB>> {
  if (!opening) {
    opening = openDB<ColossalDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        migrate(db, oldVersion, transaction);
      },
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

export async function closeDb(): Promise<void> {
  if (!opening) return;
  const db = await opening;
  db.close();
  opening = null;
}
