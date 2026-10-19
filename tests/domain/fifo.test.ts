import { describe, expect, it } from 'vitest';
import { DEMO_QUOTES, DEMO_TRANSACTIONS } from '../../src/demo/dataset';
import { replay, replayDetailed } from '../../src/domain/fifo';
import { previewSell } from '../../src/domain/preview';
import type { Quote, Transaction } from '../../src/domain/types';

const portfolioId = 'book';
const at = '2024-01-15T15:00:00.000Z';

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'quantity' | 'price'>): Transaction {
  return {
    portfolioId,
    symbol: 'AAPL',
    fee: '0.00',
    executedAt: at,
    note: '',
    createdAt: at,
    updatedAt: at,
    ...partial,
  };
}

describe('fifo', () => {
  it('matches the demo snapshot', () => {
    const result = replay(DEMO_TRANSACTIONS, DEMO_QUOTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const aapl = result.value.positions.find((position) => position.symbol === 'AAPL');
    const vti = result.value.positions.find((position) => position.symbol === 'VTI');
    expect(aapl).toMatchObject({
      quantityOpen: '8',
      remainingBasis: '960',
      averageCost: '120.00',
      marketValue: '1200.00',
      unrealizedPl: '240.00',
      realizedPl: '314.00',
    });
    expect(vti).toMatchObject({
      quantityOpen: '5',
      remainingBasis: '1000',
      marketValue: null,
      unrealizedPl: null,
      realizedPl: '0.00',
    });
    expect(result.value.totalRemainingBasis).toBe('1960.00');
    expect(result.value.totalRealizedPl).toBe('314.00');
    expect(result.value.totalMarketValue).toBe('1200.00');
    expect(result.value.marketValueComplete).toBe(false);
    expect(result.value.omittedOpenSymbols).toEqual(['VTI']);
    expect(result.value.totalUnrealizedPl).toBeNull();
  });

  it('allocates the demo sell fee and does not mutate inputs', () => {
    const original = DEMO_TRANSACTIONS.map((item) => item.id);
    const detailed = replayDetailed(DEMO_TRANSACTIONS, DEMO_QUOTES);
    expect(DEMO_TRANSACTIONS.map((item) => item.id)).toEqual(original);
    expect(detailed.ok).toBe(true);
    if (!detailed.ok) return;
    const sell = detailed.value.sells[0];
    expect(sell?.realizedPl).toBe('314.00');
    expect(sell?.slices.map((slice) => slice.feeAllocated)).toEqual(['0.83', '0.17']);
  });

  it('keeps dust basis exact on the final close', () => {
    const buys = [tx({ id: 'b', type: 'buy', quantity: '3', price: '1', fee: '0.01' })];
    const first = replayDetailed(
      [...buys, tx({ id: 's1', type: 'sell', quantity: '1', price: '1', executedAt: '2024-02-01T15:00:00.000Z' })],
      [],
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.sells[0]?.basisRemoved).toBe('1.00');
    expect(first.value.sells[0]?.realizedPl).toBe('0.00');
    expect(first.value.snapshot.positions[0]?.remainingBasis).toBe('2.00666667');
    const second = replayDetailed(
      [
        ...buys,
        tx({ id: 's1', type: 'sell', quantity: '1', price: '1', executedAt: '2024-02-01T15:00:00.000Z' }),
        tx({ id: 's2', type: 'sell', quantity: '2', price: '1', executedAt: '2024-03-01T15:00:00.000Z' }),
      ],
      [],
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const removed = second.value.sells.map((sell) => sell.slices.map((slice) => slice.basisRemoved)).flat();
    expect(removed).toEqual(['1.00333333', '2.00666667']);
  });

  it('applies a same-timestamp buy before a sell whose id sorts first', () => {
    const result = replay(
      [
        tx({ id: 'a', type: 'sell', quantity: '1', price: '2' }),
        tx({ id: 'b', type: 'buy', quantity: '1', price: '1' }),
      ],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.positions[0]?.quantityOpen).toBe('0');
  });

  it('rejects an oversell and duplicate ids', () => {
    const oversell = replay([tx({ id: 'b', type: 'buy', quantity: '1', price: '1' }), tx({ id: 's', type: 'sell', quantity: '2', price: '1', executedAt: '2024-02-01T15:00:00.000Z' })], []);
    expect(oversell.ok).toBe(false);
    if (oversell.ok) return;
    expect(oversell.error.code).toBe('SELL_EXCEEDS_OPEN_QUANTITY');
    expect(oversell.error.message).toContain('2');
    expect(oversell.error.message).toContain('1');
    const duplicate = replay([tx({ id: 'b', type: 'buy', quantity: '1', price: '1' }), tx({ id: 'b', type: 'buy', quantity: '1', price: '2' })], []);
    expect(duplicate.ok).toBe(false);
  });

  it('does not invent a market value when the quote is missing, and still values a stale quote', () => {
    const transactions = [tx({ id: 'b', type: 'buy', quantity: '2', price: '10', fee: '0.00' })];
    const missing = replay(transactions, []);
    expect(missing.ok && missing.value.positions[0]?.marketValue).toBeNull();
    expect(missing.ok && missing.value.totalUnrealizedPl).toBeNull();
    const stale: Quote = {
      symbol: 'AAPL',
      price: '12',
      currency: 'USD',
      asOf: '2020-01-01T00:00:00.000Z',
      source: 'manual',
      previousClose: null,
      locked: true,
    };
    const valued = replay(transactions, [stale]);
    expect(valued.ok && valued.value.positions[0]?.marketValue).toBe('24.00');
    expect(valued.ok && valued.value.totalUnrealizedPl).toBe('4.00');
  });

  it('supports fractional quantities and a flat position average of null', () => {
    const result = replay(
      [
        tx({ id: 'b', type: 'buy', quantity: '0.5', price: '10', fee: '0.00' }),
        tx({ id: 's', type: 'sell', quantity: '0.5', price: '12', fee: '0.00', executedAt: '2024-02-01T15:00:00.000Z' }),
      ],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.positions[0]?.quantityOpen).toBe('0');
    expect(result.value.positions[0]?.averageCost).toBeNull();
    expect(result.value.totalUnrealizedPl).toBe('0.00');
  });

  it('previews the demo sell without the recorded sale', () => {
    const before = DEMO_TRANSACTIONS.filter((item) => item.id !== 'demo-tx-aapl-sell-1');
    const preview = previewSell({
      transactions: before,
      portfolioId: 'demo-portfolio',
      symbol: 'AAPL',
      quantity: '12',
      price: '130',
      fee: '1.00',
      executedAt: '2024-11-01T15:00:00.000Z',
    });
    expect(preview.ok && preview.value.realizedPl).toBe('314.00');
    expect(DEMO_TRANSACTIONS).toHaveLength(4);
    const tooMany = previewSell({
      transactions: DEMO_TRANSACTIONS,
      portfolioId: 'demo-portfolio',
      symbol: 'AAPL',
      quantity: '9',
      price: '130',
      fee: '0.00',
      executedAt: '2024-12-01T15:00:00.000Z',
    });
    expect(tooMany.ok).toBe(false);
  });
});
