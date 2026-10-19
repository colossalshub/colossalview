export interface DomainError {
  code:
    | 'INVALID_SYMBOL'
    | 'INVALID_QUANTITY'
    | 'INVALID_PRICE'
    | 'INVALID_FEE'
    | 'INVALID_TIMESTAMP'
    | 'INVALID_NOTE'
    | 'SELL_EXCEEDS_OPEN_QUANTITY'
    | 'UNKNOWN_TRANSACTION_TYPE'
    | 'DUPLICATE_TRANSACTION_ID'
    | 'BASIS_INVARIANT'
    | 'PORTFOLIO_MISMATCH';
  message: string;
}

export type DomainResult<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export function domainOk<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function domainError(code: DomainError['code'], message: string): DomainResult<never> {
  return { ok: false, error: { code, message } };
}
