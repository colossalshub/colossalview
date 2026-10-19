import Decimal from 'decimal.js';
import { decimalOf, moneyString, parseFee, parsePrice, quantityString, roundTo } from './money';

export type SizingErrorCode =
  | 'INVALID_EQUITY'
  | 'INVALID_PRICE'
  | 'STOP_NOT_BELOW_ENTRY'
  | 'INVALID_RISK'
  | 'INVALID_FEE'
  | 'INVALID_TARGET'
  | 'INVALID_CURRENT'
  | 'INVALID_PRECISION';

export interface SizingError {
  code: SizingErrorCode;
  message: string;
}

export type SizingResult =
  | { ok: true; value: PositionSize }
  | { ok: false; error: SizingError };

export interface PositionSize {
  side: 'long';
  riskBudget: string;
  riskPerShare: string;
  riskBasedQuantity: string;
  quantity: string;
  positionValue: string;
  positionPct: string;
  estimatedLoss: string;
  potentialProfit: string | null;
  rewardToRisk: string | null;
  cashRemaining: string;
  bindingConstraint: 'risk' | 'cash' | 'concentration';
  notes: string[];
}

export interface SizingInput {
  accountEquity: string;
  entryPrice: string;
  stopPrice: string;
  riskMode: 'percent' | 'fixed';
  riskPercent: string;
  riskAmount: string;
  fee: string;
  targetPrice: string;
  currentPrice: string;
  precision: number;
  maxPositionPct: string;
}

function fail(code: SizingErrorCode, message: string): SizingResult {
  return { ok: false, error: { code, message } };
}

function floorTo(value: Decimal, places: number): Decimal {
  const scale = new Decimal(10).pow(places);
  return value.mul(scale).floor().div(scale);
}

function ratioString(value: Decimal): string {
  let text = roundTo(value, 4).toFixed(4);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text;
}

export function sizePosition(input: SizingInput): SizingResult {
  const equityParsed = parsePrice(input.accountEquity);
  if (!equityParsed.ok) {
    return fail('INVALID_EQUITY', 'Account equity must be greater than 0.');
  }
  const entryParsed = parsePrice(input.entryPrice);
  if (!entryParsed.ok) return fail('INVALID_PRICE', 'Entry price must be greater than 0.');
  const stopParsed = parsePrice(input.stopPrice);
  if (!stopParsed.ok) return fail('INVALID_PRICE', 'Stop-loss price must be greater than 0.');
  const feeParsed = input.fee.trim() === '' ? { ok: true as const, value: '0.00' } : parseFee(input.fee);
  if (!feeParsed.ok) return fail('INVALID_FEE', feeParsed.error.message);
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 8) {
    return fail('INVALID_PRECISION', 'Quantity precision must be a whole number from 0 through 8.');
  }

  const equity = decimalOf(equityParsed.value);
  const entry = decimalOf(entryParsed.value);
  const stop = decimalOf(stopParsed.value);
  const fee = decimalOf(feeParsed.value);
  const riskPerShare = entry.minus(stop);
  if (riskPerShare.lte(0)) {
    return fail('STOP_NOT_BELOW_ENTRY', 'For a long position, the stop-loss must be below the entry price.');
  }

  let riskBudget: Decimal;
  if (input.riskMode === 'fixed') {
    const fixed = parsePrice(input.riskAmount);
    if (!fixed.ok) return fail('INVALID_RISK', 'Fixed risk must be greater than 0.');
    riskBudget = decimalOf(fixed.value);
  } else {
    const percent = parsePrice(input.riskPercent);
    if (!percent.ok) return fail('INVALID_RISK', 'Risk percentage must be greater than 0 and at most 100.');
    if (decimalOf(percent.value).gt(100)) {
      return fail('INVALID_RISK', 'Risk percentage must be greater than 0 and at most 100.');
    }
    riskBudget = roundTo(equity.mul(decimalOf(percent.value)).div(100), 2);
  }
  if (riskBudget.lte(0)) return fail('INVALID_RISK', 'Risk budget must be greater than 0.');

  let target: Decimal | null = null;
  if (input.targetPrice.trim() !== '') {
    const parsed = parsePrice(input.targetPrice);
    if (!parsed.ok) return fail('INVALID_TARGET', 'Target price must be greater than 0 when it is provided.');
    target = decimalOf(parsed.value);
  }
  let current: Decimal | null = null;
  if (input.currentPrice.trim() !== '') {
    const parsed = parsePrice(input.currentPrice);
    if (!parsed.ok) return fail('INVALID_CURRENT', 'Current price must be greater than 0 when it is provided.');
    current = decimalOf(parsed.value);
  }

  const notes: string[] = ['Long positions only. Short sales, borrow fees, and margin are not modeled.'];
  if (current) {
    notes.push('Current price is used only as context. Size is based on the entry and stop you entered.');
  }
  const riskBased = floorTo(riskBudget.div(riskPerShare), input.precision);
  let quantity = riskBased;
  let binding: PositionSize['bindingConstraint'] = 'risk';

  const cashForShares = equity.minus(fee);
  const cashQty = cashForShares.gt(0) ? floorTo(cashForShares.div(entry), input.precision) : new Decimal(0);
  if (cashQty.lt(quantity)) {
    quantity = cashQty;
    binding = 'cash';
    notes.push('Quantity was reduced so the entry cost plus fee stays within account equity.');
  }

  if (input.maxPositionPct.trim() !== '') {
    const cap = parsePrice(input.maxPositionPct);
    if (!cap.ok) return fail('INVALID_RISK', 'Concentration cap must be greater than 0 and at most 100.');
    if (decimalOf(cap.value).gt(100)) {
      return fail('INVALID_RISK', 'Concentration cap must be greater than 0 and at most 100.');
    }
    const maxValue = equity.mul(decimalOf(cap.value)).div(100);
    const capQty = floorTo(maxValue.div(entry), input.precision);
    if (capQty.lt(quantity)) {
      quantity = capQty;
      binding = 'concentration';
      notes.push('Quantity was reduced to stay within the concentration cap.');
    }
  }

  if (quantity.lte(0)) {
    notes.push('The risk budget does not cover one allowed share at this stop, so the size is 0.');
  }
  if (fee.gte(equity)) {
    quantity = new Decimal(0);
    binding = 'cash';
    notes.push('The fee is at least the account equity, so no position is opened.');
  }

  const step = new Decimal(10).pow(-input.precision);
  let reducedForRounding = false;
  while (quantity.gt(0) && roundTo(quantity.mul(entry), 2).plus(fee).gt(equity)) {
    quantity = Decimal.max(quantity.minus(step), 0);
    reducedForRounding = true;
    binding = 'cash';
  }
  if (reducedForRounding) {
    notes.push('Quantity was reduced so the rounded position cost does not exceed account equity.');
  }

  const positionValue = roundTo(quantity.mul(entry), 2);
  const spent = quantity.eq(0) ? new Decimal(0) : positionValue.plus(fee);
  const cashRemaining = equity.minus(spent);
  const estimatedLoss = roundTo(quantity.mul(riskPerShare).plus(quantity.eq(0) ? 0 : fee), 2);
  const positionPct = equity.eq(0) ? new Decimal(0) : positionValue.div(equity).mul(100);

  return {
    ok: true,
    value: {
      side: 'long',
      riskBudget: moneyString(riskBudget),
      riskPerShare: quantityString(riskPerShare),
      riskBasedQuantity: quantityString(riskBased),
      quantity: quantityString(quantity),
      positionValue: moneyString(positionValue),
      positionPct: moneyString(roundTo(positionPct, 2)),
      estimatedLoss: moneyString(estimatedLoss),
      potentialProfit: target ? moneyString(roundTo(quantity.mul(target.minus(entry)).minus(quantity.eq(0) ? 0 : fee), 2)) : null,
      rewardToRisk: target ? ratioString(target.minus(entry).div(riskPerShare)) : null,
      cashRemaining: moneyString(cashRemaining),
      bindingConstraint: binding,
      notes,
    },
  };
}
