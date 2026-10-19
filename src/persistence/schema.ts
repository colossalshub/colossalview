import { z } from 'zod';
import { canonicalThreshold } from '../domain/concentration';
import { assertTimestamp } from '../domain/fifo';
import { assertCanonicalFee, assertCanonicalPrice, assertCanonicalQuantity } from '../domain/money';
import { isCanonicalSymbol } from '../domain/symbols';
import { SCHEMA_VERSION } from '../domain/types';

const quantity = z.string().refine((value) => assertCanonicalQuantity(value).ok, 'Invalid quantity');
const price = z.string().refine((value) => assertCanonicalPrice(value).ok, 'Invalid price');
const fee = z.string().refine((value) => assertCanonicalFee(value).ok, 'Invalid fee');
const symbol = z.string().refine((value) => isCanonicalSymbol(value), 'Invalid symbol');
const timestamp = z.string().refine((value) => assertTimestamp(value).ok, 'Invalid timestamp');
const httpUrl = z.string().regex(/^https?:\/\/\S+$/);

export const portfolioSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    baseCurrency: z.literal('USD'),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const transactionSchema = z
  .object({
    id: z.string().min(1).max(80),
    portfolioId: z.string().min(1).max(80),
    symbol,
    type: z.enum(['buy', 'sell']),
    quantity,
    price,
    fee,
    executedAt: timestamp,
    note: z.string().max(500),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const quoteSchema = z
  .object({
    symbol,
    price,
    currency: z.literal('USD'),
    asOf: timestamp,
    source: z.enum(['manual', 'finnhub', 'alphavantage']),
    previousClose: price.nullable(),
    locked: z.boolean(),
  })
  .strict();

export const watchSchema = z
  .object({
    id: z.string().min(1).max(80),
    symbol,
    note: z.string().max(500),
    priority: z.boolean().default(false),
    createdAt: timestamp,
  })
  .strict();

export const articleStateSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(['yahoo-rss', 'sec-edgar', 'guardian']),
    url: httpUrl,
    title: z.string().min(1).max(500),
    publishedAt: timestamp,
    summary: z.string().max(280),
    symbols: z.array(symbol).max(30),
    filingType: z.string().max(40).nullable(),
    accessionNumber: z.string().max(40).nullable(),
    saved: z.boolean(),
    read: z.boolean(),
    updatedAt: timestamp,
  })
  .strict();

export const settingsSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    theme: z.enum(['system', 'light', 'dark']),
    concentrationThresholdPct: z.string().refine((value) => canonicalThreshold(value) !== null, 'Invalid threshold'),
    quoteMode: z.enum(['manual', 'live']),
    newsYahoo: z.boolean(),
    newsEdgar: z.boolean(),
    newsGuardian: z.boolean(),
  })
  .strict();

export const importBundleSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    app: z.literal('colossalview'),
    exportedAt: timestamp,
    portfolio: portfolioSchema,
    transactions: z.array(transactionSchema),
    quotes: z.array(quoteSchema),
    watchlist: z.array(watchSchema),
    settings: settingsSchema.nullable(),
    articleStates: z.array(articleStateSchema),
  })
  .strict();

export const DB_NAME = 'colossalview';
export const DB_VERSION = 1;
