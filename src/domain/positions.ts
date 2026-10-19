import { decimalOf, moneyString, roundTo } from './money';
import type { PortfolioSnapshot, PositionView } from './types';

export function openPositions(snapshot: PortfolioSnapshot): PositionView[] {
  return snapshot.positions.filter((position) => decimalOf(position.quantityOpen).gt(0));
}

export function positionBySymbol(snapshot: PortfolioSnapshot, symbol: string): PositionView | null {
  return snapshot.positions.find((position) => position.symbol === symbol) ?? null;
}

export function quoteChange(price: string, previousClose: string | null): { amount: string; percent: string } | null {
  if (!previousClose) return null;
  const previous = decimalOf(previousClose);
  const current = decimalOf(price);
  if (previous.lte(0)) return null;
  const amount = current.minus(previous);
  const percent = amount.div(previous).mul(100);
  return { amount: moneyString(amount), percent: moneyString(roundTo(percent, 2)) };
}
