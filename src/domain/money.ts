import Decimal from 'decimal.js';
import { domainError, domainOk, type DomainResult } from './errors';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const MAX_AMOUNT = new Decimal('1000000000000');

const USER_DECIMAL = /^(?:\d+)(?:\.\d+)?$/;
const CANON_POS = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const FEE_CANON = /^(?:0|[1-9]\d*)\.\d{2}$/;
const MONEY_CANON = /^-?(?:0|[1-9]\d*)\.\d{2}$/;

export function roundTo(value: Decimal, scale: number): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function moneyString(value: Decimal): string {
  return roundTo(value, 2).toFixed(2);
}

export function quantityString(value: Decimal): string {
  let text = roundTo(value, 8).toFixed(8);
  if (text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  return text;
}

export function basisString(value: Decimal): string {
  return quantityString(value);
}

function fractionalDigits(value: string): number {
  const index = value.indexOf('.');
  if (index < 0) return 0;
  return value.length - index - 1;
}

function parseUserDecimal(raw: string): Decimal | null {
  const text = raw.trim();
  if (!USER_DECIMAL.test(text)) return null;
  try {
    return new Decimal(text);
  } catch {
    return null;
  }
}

export function parseQuantity(raw: string): DomainResult<string> {
  const text = raw.trim();
  const value = parseUserDecimal(text);
  if (!value || value.lte(0) || value.gt(MAX_AMOUNT) || fractionalDigits(text) > 8) {
    return domainError('INVALID_QUANTITY', 'Enter a quantity greater than 0 with at most 8 decimal places.');
  }
  return domainOk(quantityString(value));
}

export function parsePrice(raw: string): DomainResult<string> {
  const text = raw.trim();
  const value = parseUserDecimal(text);
  if (!value || value.lte(0) || value.gt(MAX_AMOUNT) || fractionalDigits(text) > 8) {
    return domainError('INVALID_PRICE', 'Enter a price greater than 0 with at most 8 decimal places.');
  }
  return domainOk(quantityString(value));
}

export function parseFee(raw: string): DomainResult<string> {
  const text = raw.trim();
  const value = parseUserDecimal(text);
  if (!value || value.lt(0) || value.gt(MAX_AMOUNT)) {
    return domainError('INVALID_FEE', 'Enter a fee of 0 or more.');
  }
  return domainOk(moneyString(value));
}

export function assertCanonicalQuantity(value: string): DomainResult<string> {
  if (!CANON_POS.test(value) || fractionalDigits(value) > 8) {
    return domainError('INVALID_QUANTITY', 'Stored quantity is not a canonical positive decimal.');
  }
  const parsed = new Decimal(value);
  if (parsed.lte(0) || parsed.gt(MAX_AMOUNT)) {
    return domainError('INVALID_QUANTITY', 'Stored quantity is out of range.');
  }
  return domainOk(value);
}

export function assertCanonicalPrice(value: string): DomainResult<string> {
  if (!CANON_POS.test(value) || fractionalDigits(value) > 8) {
    return domainError('INVALID_PRICE', 'Stored price is not a canonical positive decimal.');
  }
  const parsed = new Decimal(value);
  if (parsed.lte(0) || parsed.gt(MAX_AMOUNT)) {
    return domainError('INVALID_PRICE', 'Stored price is out of range.');
  }
  return domainOk(value);
}

export function assertCanonicalFee(value: string): DomainResult<string> {
  if (!FEE_CANON.test(value)) {
    return domainError('INVALID_FEE', 'Stored fee must be a non-negative amount with 2 decimal places.');
  }
  const parsed = new Decimal(value);
  if (parsed.lt(0) || parsed.gt(MAX_AMOUNT)) {
    return domainError('INVALID_FEE', 'Stored fee is out of range.');
  }
  return domainOk(value);
}

export function assertMoney(value: string): boolean {
  return MONEY_CANON.test(value);
}

export function roundPriceInput(raw: string): string | null {
  const text = raw.trim();
  if (!/^-?(?:\d+)(?:\.\d+)?$/.test(text)) return null;
  try {
    const value = new Decimal(text);
    if (value.lte(0) || value.gt(MAX_AMOUNT)) return null;
    return quantityString(value);
  } catch {
    return null;
  }
}

export function formatMoney(value: string): string {
  if (!MONEY_CANON.test(value)) {
    throw new Error('formatMoney expected a 2 decimal place amount.');
  }
  return value;
}

export function formatUsd(value: string): string {
  if (!MONEY_CANON.test(value)) {
    throw new Error('formatUsd expected a 2 decimal place amount.');
  }
  const negative = value.startsWith('-');
  const absolute = negative ? value.slice(1) : value;
  const [integer, fraction] = absolute.split('.') as [string, string];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${fraction}`;
}

export function formatQuantity(value: string): string {
  if (!assertCanonicalQuantity(value).ok && value !== '0') {
    throw new Error('formatQuantity expected a canonical quantity.');
  }
  return value;
}

export function decimalOf(value: string): Decimal {
  return new Decimal(value);
}

export function sumMoney(values: string[]): string {
  return moneyString(values.reduce((sum, value) => sum.plus(value), new Decimal(0)));
}
