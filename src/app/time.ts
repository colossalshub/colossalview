import { domainError, domainOk, type DomainResult } from '../domain/errors';

export function nowIso(): string {
  return new Date().toISOString();
}

export function localInputToIso(value: string): DomainResult<string> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return domainError('INVALID_TIMESTAMP', 'Enter a date and time.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return domainError('INVALID_TIMESTAMP', 'That date is not valid.');
  return domainOk(parsed.toISOString());
}

export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

export function isStale(iso: string, now = Date.now()): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return true;
  return now - time > 24 * 60 * 60 * 1000;
}
