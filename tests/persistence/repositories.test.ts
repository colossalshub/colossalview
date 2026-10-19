import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_QUOTES, DEMO_TRANSACTIONS } from '../../src/demo/dataset';
import { replay } from '../../src/domain/fifo';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { loadDemoBook } from '../../src/app/loadDemo';
import { addTrade, updateTrade } from '../../src/app/portfolioService';
import { closeDb, getDb } from '../../src/persistence/db';
import { createPortfolio, getSettings, listTransactions } from '../../src/persistence/repositories';
import { transactionSchema } from '../../src/persistence/schema';

afterEach(async () => {
  await closeDb();
  await deleteDB('colossalview');
});

describe('persistence', () => {
  it('round-trips the demo book and replays it after reopen', async () => {
    await loadDemoBook();
    await closeDb();
    const transactions = await listTransactions();
    expect(transactions).toHaveLength(4);
    const snapshot = replay(transactions, DEMO_QUOTES);
    expect(snapshot.ok && snapshot.value.totalRealizedPl).toBe('314.00');
    const raw = await getDb();
    expect(await raw.count('transactions')).toBe(4);
  });

  it('rejects a numeric quantity and a second portfolio', async () => {
    const sample = DEMO_TRANSACTIONS[0];
    expect(sample).toBeTruthy();
    expect(() => transactionSchema.parse({ ...sample, quantity: 10 })).toThrow();
    await createPortfolio({
      id: 'one',
      name: 'Portfolio',
      baseCurrency: 'USD',
      createdAt: '2024-01-15T15:00:00.000Z',
      updatedAt: '2024-01-15T15:00:00.000Z',
    });
    await expect(
      createPortfolio({
        id: 'two',
        name: 'Other',
        baseCurrency: 'USD',
        createdAt: '2024-01-15T15:00:00.000Z',
        updatedAt: '2024-01-15T15:00:00.000Z',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('writes default settings and does not insert the demo on open', async () => {
    await getDb();
    expect(await listTransactions()).toEqual([]);
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects an edit that would oversell and keeps the old row', async () => {
    await loadDemoBook();
    const result = await updateTrade('demo-tx-aapl-buy-1', {
      symbol: 'AAPL',
      type: 'buy',
      quantity: '1',
      price: '100',
      fee: '5.00',
      executedAt: '2024-01-15T15:00:00.000Z',
      note: '',
    });
    expect(result.ok).toBe(false);
    const rows = await listTransactions();
    expect(rows.find((row) => row.id === 'demo-tx-aapl-buy-1')?.quantity).toBe('10');
  });

  it('keeps both buys when two saves overlap', async () => {
    await Promise.all([
      addTrade({ symbol: 'AAPL', type: 'buy', quantity: '1', price: '10', fee: '0', executedAt: '2024-01-15T15:00:00.000Z', note: '' }),
      addTrade({ symbol: 'MSFT', type: 'buy', quantity: '1', price: '20', fee: '0', executedAt: '2024-01-16T15:00:00.000Z', note: '' }),
    ]);
    const symbols = (await listTransactions()).map((tx) => tx.symbol).sort();
    expect(symbols).toEqual(['AAPL', 'MSFT']);
  });
});
