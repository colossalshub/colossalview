import type { ImportPreview } from '../domain/types';

export type ImportCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_BUNDLE'
  | 'PORTFOLIO_ID_MISMATCH'
  | 'REPLAY_REJECTED'
  | 'CSV_PARSE_ERROR';

export interface ImportFailure {
  ok: false;
  code: ImportCode;
  message: string;
  preview: ImportPreview;
}

export function blankPreview(format: ImportPreview['format'], mode: ImportPreview['mode']): ImportPreview {
  return {
    schemaVersion: 0,
    format,
    mode,
    portfolioName: '',
    transactionCount: 0,
    buyCount: 0,
    sellCount: 0,
    symbols: [],
    executedFrom: null,
    executedTo: null,
    warnings: [],
    errors: [],
    replayRealizedPl: null,
  };
}
