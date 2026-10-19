import { replay } from '../domain/fifo';
import { assertTimestamp } from '../domain/fifo';
import { parseFee, parsePrice, parseQuantity } from '../domain/money';
import { canonicalizeSymbol } from '../domain/symbols';
import type { ImportPreview, Portfolio, PortfolioSnapshot, Transaction } from '../domain/types';
import { blankPreview, type ImportFailure } from './types';
import { parseCsv, rowsToRecords, serializeCsv } from './csv';

const HOLDINGS_HEADERS = ['symbol', 'quantity', 'price', 'fee', 'executedAt', 'note'];
const TRANSACTION_HEADERS = ['id', 'symbol', 'type', 'quantity', 'price', 'fee', 'executedAt', 'note'];
const HOLDINGS_EXPORT_HEADERS = ['symbol', 'quantityOpen', 'averageCost', 'remainingBasis', 'marketValue', 'unrealizedPl'];

function headersMatch(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((header, index) => header === expected[index]);
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const rows = [
    TRANSACTION_HEADERS,
    ...transactions.map((tx) => [tx.id, tx.symbol, tx.type, tx.quantity, tx.price, tx.fee, tx.executedAt, tx.note]),
  ];
  return serializeCsv(rows);
}

export function holdingsToCsv(snapshot: PortfolioSnapshot): string {
  const rows = [
    HOLDINGS_EXPORT_HEADERS,
    ...snapshot.positions
      .filter((position) => position.quantityOpen !== '0')
      .map((position) => [
        position.symbol,
        position.quantityOpen,
        position.averageCost ?? '',
        position.remainingBasis,
        position.marketValue ?? '',
        position.unrealizedPl ?? '',
      ]),
  ];
  return serializeCsv(rows);
}

export function prepareTransactionCsv(
  text: string,
  current: Transaction[],
  portfolio: Portfolio,
): { ok: true; preview: ImportPreview; transactions: Transaction[] } | ImportFailure {
  const preview = blankPreview('transactions-csv', 'append');
  preview.portfolioName = portfolio.name;
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return { ok: false, code: 'CSV_PARSE_ERROR', message: error instanceof Error ? error.message : 'CSV parse failed.', preview };
  }
  let records: Record<string, string>[];
  try {
    const parsed = rowsToRecords(rows);
    if (!headersMatch(parsed.headers, TRANSACTION_HEADERS)) {
      return {
        ok: false,
        code: 'CSV_PARSE_ERROR',
        message: `Transaction CSV headers must be ${TRANSACTION_HEADERS.join(',')}.`,
        preview,
      };
    }
    records = parsed.records;
  } catch (error) {
    return { ok: false, code: 'CSV_PARSE_ERROR', message: error instanceof Error ? error.message : 'CSV parse failed.', preview };
  }
  const incoming: Transaction[] = [];
  const errors: ImportPreview['errors'] = [];
  records.forEach((record, index) => {
    const path = `row ${index + 2}`;
    const symbol = canonicalizeSymbol(record.symbol ?? '');
    const quantity = parseQuantity(record.quantity ?? '');
    const price = parsePrice(record.price ?? '');
    const fee = parseFee(record.fee ?? '');
    const executedAt = assertTimestamp(record.executedAt ?? '');
    const type = record.type;
    if (type !== 'buy' && type !== 'sell') errors.push({ path, message: 'Type must be buy or sell.' });
    if (!symbol.ok) errors.push({ path, message: symbol.error.message });
    if (!quantity.ok) errors.push({ path, message: quantity.error.message });
    if (!price.ok) errors.push({ path, message: price.error.message });
    if (!fee.ok) errors.push({ path, message: fee.error.message });
    if (!executedAt.ok) errors.push({ path, message: executedAt.error.message });
    if (!symbol.ok || !quantity.ok || !price.ok || !fee.ok || !executedAt.ok || (type !== 'buy' && type !== 'sell')) return;
    const id = (record.id ?? '').trim() || crypto.randomUUID();
    const now = new Date().toISOString();
    incoming.push({
      id,
      portfolioId: portfolio.id,
      symbol: symbol.value,
      type,
      quantity: quantity.value,
      price: price.value,
      fee: fee.value,
      executedAt: executedAt.value,
      note: record.note ?? '',
      createdAt: now,
      updatedAt: now,
    });
  });
  const transactions = [...current, ...incoming];
  const replayed = errors.length === 0 ? replay(transactions, []) : null;
  const times = incoming.map((tx) => tx.executedAt).sort();
  const next: ImportPreview = {
    ...preview,
    transactionCount: incoming.length,
    buyCount: incoming.filter((tx) => tx.type === 'buy').length,
    sellCount: incoming.filter((tx) => tx.type === 'sell').length,
    symbols: [...new Set(incoming.map((tx) => tx.symbol))].sort(),
    executedFrom: times[0] ?? null,
    executedTo: times[times.length - 1] ?? null,
    warnings: ['Append adds these transactions to the current book. Nothing is written until you confirm.'],
    errors: replayed && !replayed.ok ? [...errors, { path: 'REPLAY_REJECTED', message: replayed.error.message }] : errors,
    replayRealizedPl: replayed && replayed.ok ? replayed.value.totalRealizedPl : null,
  };
  if (next.errors.length > 0) {
    return { ok: false, code: next.errors.some((error) => error.path === 'REPLAY_REJECTED') ? 'REPLAY_REJECTED' : 'CSV_PARSE_ERROR', message: next.errors[0]?.message ?? 'CSV rejected.', preview: next };
  }
  return { ok: true, preview: next, transactions };
}

export function prepareHoldingsCsv(
  text: string,
  current: Transaction[],
  portfolio: Portfolio | null,
): { ok: true; preview: ImportPreview; transactions: Transaction[]; portfolio: Portfolio } | ImportFailure {
  const preview = blankPreview('holdings-csv', 'append');
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return { ok: false, code: 'CSV_PARSE_ERROR', message: error instanceof Error ? error.message : 'CSV parse failed.', preview };
  }
  let records: Record<string, string>[];
  try {
    const parsed = rowsToRecords(rows);
    if (!headersMatch(parsed.headers, HOLDINGS_HEADERS)) {
      return {
        ok: false,
        code: 'CSV_PARSE_ERROR',
        message: `Holdings CSV headers must be ${HOLDINGS_HEADERS.join(',')}.`,
        preview: {
          ...preview,
          warnings: ['Each imported row becomes a new buy. Re-importing a holdings export is not a lossless restore.'],
        },
      };
    }
    records = parsed.records;
  } catch (error) {
    return { ok: false, code: 'CSV_PARSE_ERROR', message: error instanceof Error ? error.message : 'CSV parse failed.', preview };
  }
  const book = portfolio ?? {
    id: crypto.randomUUID(),
    name: 'Portfolio',
    baseCurrency: 'USD' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const incoming: Transaction[] = [];
  const errors: ImportPreview['errors'] = [];
  const warnings = [
    'Each imported row becomes a new buy. This does not recreate sells.',
    'Re-importing a holdings export on top of the same book is not a lossless restore.',
  ];
  records.forEach((record, index) => {
    const path = `row ${index + 2}`;
    const symbol = canonicalizeSymbol(record.symbol ?? '');
    const quantity = parseQuantity(record.quantity ?? '');
    const price = parsePrice(record.price ?? '');
    const fee = parseFee((record.fee ?? '') === '' ? '0' : (record.fee ?? ''));
    const executedAt = assertTimestamp(record.executedAt ?? '');
    if (!symbol.ok) errors.push({ path, message: symbol.error.message });
    if (!quantity.ok) errors.push({ path, message: quantity.error.message });
    if (!price.ok) errors.push({ path, message: price.error.message });
    if (!fee.ok) errors.push({ path, message: fee.error.message });
    if (!executedAt.ok) errors.push({ path, message: executedAt.error.message });
    if (!symbol.ok || !quantity.ok || !price.ok || !fee.ok || !executedAt.ok) return;
    if (current.some((tx) => tx.symbol === symbol.value) || incoming.some((tx) => tx.symbol === symbol.value)) {
      warnings.push(`${symbol.value} already has transactions. This adds another buy and does not replace them.`);
    }
    const now = new Date().toISOString();
    incoming.push({
      id: crypto.randomUUID(),
      portfolioId: book.id,
      symbol: symbol.value,
      type: 'buy',
      quantity: quantity.value,
      price: price.value,
      fee: fee.value,
      executedAt: executedAt.value,
      note: record.note ?? '',
      createdAt: now,
      updatedAt: now,
    });
  });
  const transactions = [...current, ...incoming];
  const replayed = errors.length === 0 ? replay(transactions, []) : null;
  const times = incoming.map((tx) => tx.executedAt).sort();
  const next: ImportPreview = {
    ...preview,
    portfolioName: book.name,
    transactionCount: incoming.length,
    buyCount: incoming.length,
    sellCount: 0,
    symbols: [...new Set(incoming.map((tx) => tx.symbol))].sort(),
    executedFrom: times[0] ?? null,
    executedTo: times[times.length - 1] ?? null,
    warnings,
    errors: replayed && !replayed.ok ? [...errors, { path: 'REPLAY_REJECTED', message: replayed.error.message }] : errors,
    replayRealizedPl: replayed && replayed.ok ? replayed.value.totalRealizedPl : null,
  };
  if (next.errors.length > 0) {
    return { ok: false, code: 'CSV_PARSE_ERROR', message: next.errors[0]?.message ?? 'CSV rejected.', preview: next };
  }
  return { ok: true, preview: next, transactions, portfolio: book };
}
