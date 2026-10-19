import { describe, expect, it } from 'vitest';
import { concentration } from '../../src/domain/concentration';
import { replay } from '../../src/domain/fifo';
import { previewBuy } from '../../src/domain/preview';
import { sizePosition, type SizingInput } from '../../src/domain/sizing';
import { DEMO_QUOTES, DEMO_TRANSACTIONS } from '../../src/demo/dataset';
import type { Quote, Transaction } from '../../src/domain/types';

const base: SizingInput = {
  accountEquity: '10000',
  entryPrice: '100',
  stopPrice: '95',
  riskMode: 'percent',
  riskPercent: '1',
  riskAmount: '',
  fee: '0',
  targetPrice: '110',
  currentPrice: '',
  precision: 0,
  maxPositionPct: '',
};

describe('sizing and concentration', () => {
  it('sizes the worked long example', () => {
    const result = sizePosition(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      riskBudget: '100.00',
      riskPerShare: '5',
      riskBasedQuantity: '20',
      quantity: '20',
      positionValue: '2000.00',
      positionPct: '20.00',
      estimatedLoss: '100.00',
      potentialProfit: '200.00',
      rewardToRisk: '2',
      cashRemaining: '8000.00',
      bindingConstraint: 'risk',
    });
    expect(JSON.stringify(result.value)).not.toContain('NaN');
    expect(JSON.stringify(result.value)).not.toContain('Infinity');
  });

  it('rejects invalid stops, capital, and zero risk', () => {
    expect(sizePosition({ ...base, stopPrice: '100' }).ok).toBe(false);
    expect(sizePosition({ ...base, accountEquity: '-5' }).ok).toBe(false);
    expect(sizePosition({ ...base, entryPrice: '0' }).ok).toBe(false);
    expect(sizePosition({ ...base, riskPercent: '0' }).ok).toBe(false);
  });

  it('floors fractional sizes and cash constraints', () => {
    const fractional = sizePosition({
      ...base,
      accountEquity: '100000',
      entryPrice: '30',
      stopPrice: '0.01',
      riskPercent: '1',
      precision: 2,
      targetPrice: '',
    });
    expect(fractional.ok).toBe(true);
    if (!fractional.ok) return;
    expect(fractional.value.riskBasedQuantity).toBe('33.34');
    const cash = sizePosition({ ...base, accountEquity: '1000', entryPrice: '100', stopPrice: '50', riskPercent: '100', fee: '50', targetPrice: '' });
    expect(cash.ok && cash.value.quantity).toBe('9');
    expect(cash.ok && cash.value.bindingConstraint).toBe('cash');
    const tight = sizePosition({ ...base, accountEquity: '10.005', entryPrice: '10.005', stopPrice: '5', riskPercent: '100', fee: '0', targetPrice: '' });
    expect(tight.ok).toBe(true);
    if (!tight.ok) return;
    expect(tight.value.cashRemaining.startsWith('-')).toBe(false);
    expect(tight.value.quantity).toBe('0');
  });

  it('previews buy cost', () => {
    const preview = previewBuy({ quantity: '12', price: '130', fee: '1.00' });
    expect(preview.ok && preview.value.net).toBe('1561.00');
  });

  it('warns at 100 percent and not below an unrounded threshold', () => {
    const demo = replay(DEMO_TRANSACTIONS, DEMO_QUOTES);
    expect(demo.ok).toBe(true);
    if (!demo.ok) return;
    const report = concentration(demo.value, '25');
    expect(report.warnings.join(' ')).toMatch(/AAPL/);
    expect(report.warnings.join(' ')).toMatch(/1 open position was omitted/);
    const below = synthetic(24995, 75005);
    const quiet = concentration(below, '25');
    expect(quiet.rows[0]?.weightPct).toBe('25.00');
    expect(quiet.rows[0]?.above).toBe(false);
    const empty = replay([], []);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(concentration(empty.value, '25').rows).toEqual([]);
  });
});

function synthetic(first: number, second: number) {
  const at = '2024-01-15T15:00:00.000Z';
  const tx = (id: string, symbol: string, quantity: string): Transaction => ({
    id,
    portfolioId: 'p',
    symbol,
    type: 'buy',
    quantity,
    price: '1',
    fee: '0.00',
    executedAt: at,
    note: '',
    createdAt: at,
    updatedAt: at,
  });
  const quote = (symbol: string): Quote => ({
    symbol,
    price: '1',
    currency: 'USD',
    asOf: at,
    source: 'manual',
    previousClose: null,
    locked: true,
  });
  const replayed = replay(
    [tx('a', 'AAA', String(first)), tx('b', 'BBB', String(second))],
    [quote('AAA'), quote('BBB')],
  );
  if (!replayed.ok) throw new Error('synthetic replay failed');
  return replayed.value;
}
