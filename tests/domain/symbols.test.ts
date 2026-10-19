import { describe, expect, it } from 'vitest';
import { canonicalizeSymbol } from '../../src/domain/symbols';

describe('symbols', () => {
  it('canonicalizes tickers and rejects slashes', () => {
    expect(canonicalizeSymbol('aapl')).toMatchObject({ ok: true, value: 'AAPL' });
    expect(canonicalizeSymbol('BRK.B').ok).toBe(true);
    expect(canonicalizeSymbol('BF-B').ok).toBe(true);
    expect(canonicalizeSymbol('BRK/B').ok).toBe(false);
    expect(canonicalizeSymbol('').ok).toBe(false);
    expect(canonicalizeSymbol('has space').ok).toBe(false);
  });
});
