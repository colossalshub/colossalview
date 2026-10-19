export function stripText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(value: string, max = 280): string {
  if (value.length <= max) return value;
  return value.slice(0, max).trim();
}

export function toIsoTimestamp(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function mentionsSymbol(text: string, symbol: string, companyName: string | null): boolean {
  if (companyName && companyName.trim() && text.toLowerCase().includes(companyName.trim().toLowerCase())) return true;
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i');
  return pattern.test(text);
}
