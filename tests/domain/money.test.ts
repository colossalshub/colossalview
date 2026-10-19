import { describe, expect, it } from 'vitest';
import { formatQuantity, formatUsd, parseFee, parsePrice, parseQuantity, roundTo } from '../../src/domain/money';
import Decimal from 'decimal.js';

describe('money', () => {
  it('rounds half up away from zero', () => {
    const cases: Array<[string, number, string]> = [
      ['1.005', 2, '1.01'],
      ['1.004', 2, '1.00'],
      ['-1.005', 2, '-1.01'],
      ['-1.225', 2, '-1.23'],
      ['0.5', 0, '1'],
      ['-0.5', 0, '-1'],
    ];
    for (const [input, scale, output] of cases) {
      const rounded = roundTo(new Decimal(input), scale);
      expect(scale === 0 ? rounded.toFixed(0) : rounded.toFixed(scale)).toBe(output);
    }
  });

  it('canonicalizes quantities and rejects exponents', () => {
    expect(parseQuantity('1.2300').ok && parseQuantity('1.2300')).toMatchObject({ ok: true, value: '1.23' });
    expect(parseQuantity('1.123456789').ok).toBe(false);
    expect(parseQuantity('1e2').ok).toBe(false);
    expect(parseQuantity('0').ok).toBe(false);
    expect(parsePrice('-1').ok).toBe(false);
    expect(parseFee('1.005')).toMatchObject({ ok: true, value: '1.01' });
    expect(parseFee('-0.01').ok).toBe(false);
  });

  it('formats grouped USD without Intl', () => {
    expect(formatUsd('314.00')).toBe('$314.00');
    expect(formatUsd('-1.01')).toBe('-$1.01');
    expect(formatUsd('1200.00')).toBe('$1,200.00');
    expect(formatUsd('-1200.50')).toBe('-$1,200.50');
    expect(formatQuantity('1.5')).toBe('1.5');
  });
});
