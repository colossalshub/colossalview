import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDemoBook } from '../../src/app/loadDemo';
import { importPrepared, previewJson } from '../../src/app/portfolioService';
import { DEMO_QUOTES, DEMO_TRANSACTIONS, DEMO_WATCH } from '../../src/demo/dataset';
import { replay } from '../../src/domain/fifo';
import { buildExportBundle } from '../../src/import/json';
import { parseCsv, serializeCsv } from '../../src/import/csv';
import { prepareHoldingsCsv, prepareTransactionCsv, transactionsToCsv } from '../../src/import/holdings';
import { closeDb } from '../../src/persistence/db';
import { getPortfolio, listQuotes, listTransactions, listWatch } from '../../src/persistence/repositories';
import { DEFAULT_SETTINGS } from '../../src/domain/types';

afterEach(async () => {
  await closeDb();
  await deleteDB('colossalview');
});

describe('import and export', () => {
  it('replaces a book from its own JSON export', async () => {
    await loadDemoBook();
    const portfolio = await getPortfolio();
    expect(portfolio).toBeTruthy();
    if (!portfolio) return;
    const bundle = buildExportBundle(
      {
        portfolio,
        transactions: await listTransactions(),
        quotes: await listQuotes(),
        watchlist: await listWatch(),
        articleStates: [],
        settings: DEFAULT_SETTINGS,
      },
      '2024-12-02T00:00:00.000Z',
    );
    const extra = await previewJson(
      {
        ...bundle,
        transactions: [
          ...bundle.transactions,
          {
            ...DEMO_TRANSACTIONS[0],
            id: 'extra-buy',
            executedAt: '2024-12-15T15:00:00.000Z',
            quantity: '1',
          },
        ],
      },
      'replace',
    );
    expect(extra.ok).toBe(true);
    if (!extra.ok) return;
    await importPrepared(extra.next);
    const original = await previewJson(bundle, 'replace');
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(original.preview.replayRealizedPl).toBe('314.00');
    expect(original.preview.symbols).toEqual(['AAPL', 'VTI']);
    await importPrepared(original.next);
    const snapshot = replay(await listTransactions(), await listQuotes());
    expect(snapshot.ok && snapshot.value.totalRealizedPl).toBe('314.00');
    expect(await listTransactions()).toHaveLength(4);
    expect((await listWatch()).map((item) => item.symbol)).toEqual(DEMO_WATCH.map((item) => item.symbol));
  });

  it('rejects an unknown schema and a mismatched merge', async () => {
    await loadDemoBook();
    const bad = await previewJson({ schemaVersion: 2 }, 'replace');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
    expect(await listTransactions()).toHaveLength(4);
    const portfolio = await getPortfolio();
    if (!portfolio) throw new Error('missing portfolio');
    const bundle = buildExportBundle(
      {
        portfolio: { ...portfolio, id: 'other-book' },
        transactions: DEMO_TRANSACTIONS.map((tx) => ({ ...tx, portfolioId: 'other-book' })),
        quotes: DEMO_QUOTES,
        watchlist: [],
        articleStates: [],
        settings: DEFAULT_SETTINGS,
      },
      '2024-12-02T00:00:00.000Z',
    );
    const merged = await previewJson(bundle, 'merge');
    expect(merged.ok).toBe(false);
    if (merged.ok) return;
    expect(merged.code).toBe('PORTFOLIO_ID_MISMATCH');
    expect(await listTransactions()).toHaveLength(4);
    const mismatched = buildExportBundle(
      {
        portfolio,
        transactions: (await listTransactions()).map((tx) => ({ ...tx, portfolioId: 'other-book' })),
        quotes: await listQuotes(),
        watchlist: [],
        articleStates: [],
        settings: DEFAULT_SETTINGS,
      },
      '2024-12-02T00:00:00.000Z',
    );
    const rejected = await previewJson(mismatched, 'replace');
    expect(rejected.ok).toBe(false);
    expect(await listTransactions()).toHaveLength(4);
  });

  it('round-trips transaction CSV notes and warns on holdings imports', () => {
    const note = 'hello, "world"';
    const sample = DEMO_TRANSACTIONS[0];
    if (!sample) throw new Error('missing demo transaction');
    const csv = transactionsToCsv([{ ...sample, note }]);
    const rows = parseCsv(csv);
    expect(rows[1]?.[7]).toBe(note);
    expect(serializeCsv([['a', 'b,c']])).toBe('a,"b,c"');
    const portfolio = {
      id: 'demo-portfolio',
      name: 'Portfolio',
      baseCurrency: 'USD' as const,
      createdAt: '2024-01-15T15:00:00.000Z',
      updatedAt: '2024-01-15T15:00:00.000Z',
    };
    const holdings = prepareHoldingsCsv(
      'symbol,quantity,price,fee,executedAt,note\nAAPL,1,10,0,2024-01-15T15:00:00.000Z,add',
      DEMO_TRANSACTIONS,
      portfolio,
    );
    expect(holdings.ok).toBe(true);
    if (!holdings.ok) return;
    expect(holdings.preview.warnings.join(' ')).toMatch(/new buy/);
    expect(holdings.preview.warnings.join(' ')).toMatch(/not a lossless restore/);
    const round = prepareTransactionCsv(csv, [], portfolio);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.transactions[0]?.note).toBe(note);
  });
});
