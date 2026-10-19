import { domainError, domainOk, type DomainResult } from './errors';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function canonicalizeSymbol(input: string): DomainResult<string> {
  const symbol = input.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return domainError(
      'INVALID_SYMBOL',
      'Use 1 to 10 letters, digits, dots, or hyphens, starting with a letter. Slashes are not rewritten.',
    );
  }
  return domainOk(symbol);
}

export function isCanonicalSymbol(input: string): boolean {
  return SYMBOL_RE.test(input);
}
