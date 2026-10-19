import Decimal from 'decimal.js';
import { domainError, domainOk, type DomainResult } from './errors';
import {
  assertCanonicalFee,
  assertCanonicalPrice,
  assertCanonicalQuantity,
  basisString,
  decimalOf,
  moneyString,
  quantityString,
  roundTo,
} from './money';
import { isCanonicalSymbol } from './symbols';
import type { OpenLot, PortfolioSnapshot, PositionView, Quote, SellResult, SellSlice, Transaction } from './types';

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

interface MutableLot {
  lotId: string;
  symbol: string;
  acquiredAt: string;
  quantityOpen: Decimal;
  remainingBasis: Decimal;
}

export function assertTimestamp(value: string): DomainResult<string> {
  if (!TIMESTAMP_RE.test(value)) {
    return domainError('INVALID_TIMESTAMP', 'Use a UTC timestamp like 2024-01-15T15:00:00.000Z.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    return domainError('INVALID_TIMESTAMP', 'That timestamp is not a real UTC time.');
  }
  return domainOk(value);
}

export function assertNote(value: string): DomainResult<string> {
  if (typeof value !== 'string' || value.length > 500) {
    return domainError('INVALID_NOTE', 'Notes must be 500 characters or fewer.');
  }
  return domainOk(value);
}

export interface ReplayDetail {
  snapshot: PortfolioSnapshot;
  sells: SellResult[];
}

function validateTransaction(tx: Transaction): DomainResult<Transaction> {
  if (tx.type !== 'buy' && tx.type !== 'sell') {
    return domainError('UNKNOWN_TRANSACTION_TYPE', 'Only buy and sell transactions are supported.');
  }
  if (!isCanonicalSymbol(tx.symbol)) {
    return domainError('INVALID_SYMBOL', `Invalid symbol ${tx.symbol}.`);
  }
  const quantity = assertCanonicalQuantity(tx.quantity);
  if (!quantity.ok) return quantity;
  const price = assertCanonicalPrice(tx.price);
  if (!price.ok) return price;
  const fee = assertCanonicalFee(tx.fee);
  if (!fee.ok) return fee;
  const executedAt = assertTimestamp(tx.executedAt);
  if (!executedAt.ok) return executedAt;
  const note = assertNote(tx.note);
  if (!note.ok) return note;
  if (!tx.id || !tx.portfolioId) {
    return domainError('PORTFOLIO_MISMATCH', 'Each transaction needs an id and a portfolio id.');
  }
  return domainOk(tx);
}

function quoteFor(symbol: string, quotes: readonly Quote[]): Quote | null {
  let found: Quote | null = null;
  for (const quote of quotes) {
    if (quote.symbol !== symbol || quote.currency !== 'USD') continue;
    if (!assertCanonicalPrice(quote.price).ok) continue;
    if (quote.previousClose !== null && !assertCanonicalPrice(quote.previousClose).ok) continue;
    found = quote;
  }
  return found;
}

export function replayDetailed(
  transactions: readonly Transaction[],
  quotes: readonly Quote[],
): DomainResult<ReplayDetail> {
  const ids = new Set<string>();
  let portfolioId: string | null = null;
  for (const tx of transactions) {
    const valid = validateTransaction(tx);
    if (!valid.ok) return valid;
    if (ids.has(tx.id)) {
      return domainError('DUPLICATE_TRANSACTION_ID', `Duplicate transaction id ${tx.id}.`);
    }
    ids.add(tx.id);
    if (portfolioId === null) portfolioId = tx.portfolioId;
    else if (portfolioId !== tx.portfolioId) {
      return domainError('PORTFOLIO_MISMATCH', 'All transactions must belong to the same portfolio.');
    }
  }

  const sorted = [...transactions].sort((a, b) => {
    if (a.executedAt < b.executedAt) return -1;
    if (a.executedAt > b.executedAt) return 1;
    if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const lots = new Map<string, MutableLot[]>();
  const realized = new Map<string, Decimal>();
  const seen = new Set<string>();
  const sells: SellResult[] = [];

  for (const tx of sorted) {
    seen.add(tx.symbol);
    const quantity = decimalOf(tx.quantity);
    const price = decimalOf(tx.price);
    const fee = decimalOf(tx.fee);
    const book = lots.get(tx.symbol) ?? [];

    if (tx.type === 'buy') {
      book.push({
        lotId: tx.id,
        symbol: tx.symbol,
        acquiredAt: tx.executedAt,
        quantityOpen: quantity,
        remainingBasis: roundTo(quantity.mul(price).plus(fee), 8),
      });
      lots.set(tx.symbol, book);
      continue;
    }

    const open = book.reduce((sum, lot) => sum.plus(lot.quantityOpen), new Decimal(0));
    if (quantity.gt(open)) {
      return domainError(
        'SELL_EXCEEDS_OPEN_QUANTITY',
        `Sell quantity ${quantityString(quantity)} exceeds open quantity ${quantityString(open)}.`,
      );
    }

    let still = quantity;
    const slices: SellSlice[] = [];
    const basisPieces: Decimal[] = [];
    for (const lot of book) {
      if (still.lte(0)) break;
      if (lot.quantityOpen.lte(0)) continue;
      const taken = Decimal.min(lot.quantityOpen, still);
      const basisRemoved = taken.eq(lot.quantityOpen)
        ? lot.remainingBasis
        : roundTo(lot.remainingBasis.mul(taken).div(lot.quantityOpen), 8);
      const nextBasis = lot.remainingBasis.minus(basisRemoved);
      const nextQty = lot.quantityOpen.minus(taken);
      if (nextBasis.lt(0) || nextQty.lt(0) || (nextQty.eq(0) && !nextBasis.eq(0))) {
        return domainError('BASIS_INVARIANT', 'Lot basis became inconsistent. This is a calculation defect.');
      }
      lot.quantityOpen = nextQty;
      lot.remainingBasis = nextBasis;
      still = still.minus(taken);
      basisPieces.push(basisRemoved);
      slices.push({
        lotId: lot.lotId,
        quantity: quantityString(taken),
        basisRemoved: basisString(basisRemoved),
        feeAllocated: '0.00',
      });
    }

    let allocated = new Decimal(0);
    slices.forEach((slice, index) => {
      if (index === slices.length - 1) {
        slice.feeAllocated = moneyString(fee.minus(allocated));
        return;
      }
      const raw = roundTo(fee.mul(decimalOf(slice.quantity)).div(quantity), 2);
      const remainingFee = fee.minus(allocated);
      const clamped = Decimal.min(Decimal.max(raw, 0), remainingFee);
      slice.feeAllocated = moneyString(clamped);
      allocated = allocated.plus(clamped);
    });

    const gross = roundTo(quantity.mul(price), 2);
    const net = gross.minus(fee);
    const basisReport = roundTo(
      basisPieces.reduce((sum, piece) => sum.plus(piece), new Decimal(0)),
      2,
    );
    const realizedPl = net.minus(basisReport);
    realized.set(tx.symbol, (realized.get(tx.symbol) ?? new Decimal(0)).plus(realizedPl));
    sells.push({
      transactionId: tx.id,
      grossProceeds: moneyString(gross),
      fee: moneyString(fee),
      netProceeds: moneyString(net),
      basisRemoved: moneyString(basisReport),
      realizedPl: moneyString(realizedPl),
      slices,
    });
    lots.set(
      tx.symbol,
      book.filter((lot) => lot.quantityOpen.gt(0)),
    );
  }

  const positions: PositionView[] = [...seen].sort().map((symbol) => {
    const openLots = lots.get(symbol) ?? [];
    const quantityOpen = openLots.reduce((sum, lot) => sum.plus(lot.quantityOpen), new Decimal(0));
    const remainingBasis = openLots.reduce((sum, lot) => sum.plus(lot.remainingBasis), new Decimal(0));
    const quote = quoteFor(symbol, quotes);
    const marketValue = quote ? roundTo(quantityOpen.mul(decimalOf(quote.price)), 2) : null;
    const basisReport = roundTo(remainingBasis, 2);
    const unrealized = marketValue === null ? null : marketValue.minus(basisReport);
    const viewLots: OpenLot[] = openLots.map((lot) => ({
      lotId: lot.lotId,
      symbol: lot.symbol,
      acquiredAt: lot.acquiredAt,
      quantityOpen: quantityString(lot.quantityOpen),
      remainingBasis: basisString(lot.remainingBasis),
    }));
    return {
      symbol,
      quantityOpen: quantityString(quantityOpen),
      remainingBasis: basisString(remainingBasis),
      averageCost: quantityOpen.gt(0) ? moneyString(roundTo(remainingBasis.div(quantityOpen), 2)) : null,
      lots: viewLots,
      realizedPl: moneyString(realized.get(symbol) ?? new Decimal(0)),
      quote,
      marketValue: marketValue === null ? null : moneyString(marketValue),
      unrealizedPl: unrealized === null ? null : moneyString(unrealized),
    };
  });

  const openPositions = positions.filter((position) => decimalOf(position.quantityOpen).gt(0));
  const omittedOpenSymbols = openPositions.filter((position) => position.quote === null).map((position) => position.symbol);
  const quoted = positions.filter((position) => position.marketValue !== null);
  const totalMarket = quoted.reduce((sum, position) => sum.plus(position.marketValue ?? '0'), new Decimal(0));
  const everyOpenQuoted = omittedOpenSymbols.length === 0;
  const unrealizedParts = openPositions.map((position) => position.unrealizedPl);

  return domainOk({
    sells,
    snapshot: {
      positions,
      totalRemainingBasis: moneyString(
        openPositions.reduce((sum, position) => sum.plus(decimalOf(position.remainingBasis)), new Decimal(0)),
      ),
      totalRealizedPl: moneyString([...realized.values()].reduce((sum, value) => sum.plus(value), new Decimal(0))),
      totalMarketValue: quoted.length === 0 ? null : moneyString(totalMarket),
      marketValueComplete: everyOpenQuoted,
      omittedOpenSymbols,
      totalUnrealizedPl:
        everyOpenQuoted && unrealizedParts.every((part) => part !== null)
          ? moneyString(unrealizedParts.reduce((sum, part) => sum.plus(part ?? '0'), new Decimal(0)))
          : null,
    },
  });
}

export function replay(
  transactions: readonly Transaction[],
  quotes: readonly Quote[],
): DomainResult<PortfolioSnapshot> {
  const detailed = replayDetailed(transactions, quotes);
  if (!detailed.ok) return detailed;
  return domainOk(detailed.value.snapshot);
}
