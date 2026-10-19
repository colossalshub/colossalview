import { domainError, domainOk, type DomainResult } from './errors';
import { replayDetailed } from './fifo';
import { decimalOf, moneyString, parseFee, parsePrice, parseQuantity, roundTo } from './money';
import { canonicalizeSymbol } from './symbols';
import type { SellResult, Transaction } from './types';

export interface ProceedsPreview {
  gross: string;
  fee: string;
  net: string;
}

export function previewProceeds(input: {
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
}): DomainResult<ProceedsPreview> {
  const quantity = parseQuantity(input.quantity);
  if (!quantity.ok) return quantity;
  const price = parsePrice(input.price);
  if (!price.ok) return price;
  const fee = parseFee(input.fee);
  if (!fee.ok) return fee;
  const gross = roundTo(decimalOf(quantity.value).mul(decimalOf(price.value)), 2);
  const net = input.side === 'buy' ? gross.plus(decimalOf(fee.value)) : gross.minus(decimalOf(fee.value));
  return domainOk({
    gross: moneyString(gross),
    fee: fee.value,
    net: moneyString(net),
  });
}

export function previewBuy(input: { quantity: string; price: string; fee: string }): DomainResult<ProceedsPreview> {
  return previewProceeds({ side: 'buy', ...input });
}

export function previewSell(input: {
  transactions: readonly Transaction[];
  portfolioId: string;
  symbol: string;
  quantity: string;
  price: string;
  fee: string;
  executedAt: string;
  note?: string;
}): DomainResult<SellResult> {
  const symbol = canonicalizeSymbol(input.symbol);
  if (!symbol.ok) return symbol;
  const quantity = parseQuantity(input.quantity);
  if (!quantity.ok) return quantity;
  const price = parsePrice(input.price);
  if (!price.ok) return price;
  const fee = parseFee(input.fee);
  if (!fee.ok) return fee;
  const now = input.executedAt;
  let id = 'preview-sell';
  if (input.transactions.some((tx) => tx.id === id)) id = 'preview-sell-draft';
  const draft: Transaction = {
    id,
    portfolioId: input.portfolioId,
    symbol: symbol.value,
    type: 'sell',
    quantity: quantity.value,
    price: price.value,
    fee: fee.value,
    executedAt: now,
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
  };
  const replayed = replayDetailed([...input.transactions, draft], []);
  if (!replayed.ok) return replayed;
  const sell = replayed.value.sells.find((item) => item.transactionId === id);
  if (!sell) return domainError('BASIS_INVARIANT', 'The preview sell did not produce a result.');
  return domainOk(sell);
}
