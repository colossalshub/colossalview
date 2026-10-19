import Decimal from 'decimal.js';
import { decimalOf, moneyString, roundTo } from './money';
import { openPositions } from './positions';
import type { PortfolioSnapshot } from './types';

export interface ConcentrationRow {
  symbol: string;
  marketValue: string;
  weightPct: string;
  above: boolean;
}

export interface ConcentrationReport {
  rows: ConcentrationRow[];
  warnings: string[];
  omittedCount: number;
  quotedTotal: string | null;
}

const THRESHOLD_RE = /^(?:100|[1-9]\d?)(?:\.\d?[1-9])?$/;

export function canonicalThreshold(raw: string): string | null {
  const text = raw.trim();
  if (!THRESHOLD_RE.test(text)) return null;
  const value = new Decimal(text);
  if (value.lt(1) || value.gt(100)) return null;
  return text;
}

export function parseThreshold(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  if ((text.split('.')[1]?.length ?? 0) > 2) return null;
  let value: Decimal;
  try {
    value = new Decimal(text);
  } catch {
    return null;
  }
  if (value.lt(1) || value.gt(100)) return null;
  const canonical = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return canonicalThreshold(canonical);
}

export function concentration(snapshot: PortfolioSnapshot, thresholdRaw: string): ConcentrationReport {
  const threshold = new Decimal(canonicalThreshold(thresholdRaw) ?? '25');
  const open = openPositions(snapshot).filter((position) => position.marketValue !== null);
  const quotedTotal = open.reduce((sum, position) => sum.plus(position.marketValue ?? '0'), new Decimal(0));
  const omittedCount = snapshot.omittedOpenSymbols.length;
  if (open.length === 0 || quotedTotal.lte(0)) {
    return {
      rows: [],
      warnings: omittedCount > 0 ? [omittedMessage(snapshot.omittedOpenSymbols)] : [],
      omittedCount,
      quotedTotal: null,
    };
  }

  const rows = open
    .map((position) => {
      const marketValue = decimalOf(position.marketValue ?? '0');
      const unrounded = marketValue.div(quotedTotal).mul(100);
      return {
        symbol: position.symbol,
        marketValue: position.marketValue ?? '0.00',
        weightPct: moneyString(roundTo(unrounded, 2)),
        above: unrounded.gte(threshold),
      };
    })
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));

  const warnings = rows
    .filter((row) => row.above)
    .map(
      (row) =>
        `${row.symbol} is ${row.weightPct}% of quoted market value, which is at or above your ${threshold.toString()}% concentration limit.`,
    );
  if (omittedCount > 0) warnings.push(omittedMessage(snapshot.omittedOpenSymbols));
  return { rows, warnings, omittedCount, quotedTotal: moneyString(quotedTotal) };
}

function omittedMessage(symbols: string[]): string {
  const count = symbols.length;
  const noun = count === 1 ? 'position was' : 'positions were';
  return `${count} open ${noun} omitted because ${count === 1 ? 'it has' : 'they have'} no quote: ${symbols.join(', ')}.`;
}
