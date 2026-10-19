import type { ArticleDraft } from '../../src/domain/types';
import { AdapterError } from '../http';
import { mentionsSymbol, stripText, toIsoTimestamp, truncate } from '../text';

interface GuardianResult {
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  trailText?: string;
}

export function filterGuardian(results: GuardianResult[], symbol: string, companyName: string | null): ArticleDraft[] {
  const articles: ArticleDraft[] = [];
  for (const result of results) {
    const title = stripText(result.webTitle ?? '');
    const trail = stripText(result.trailText ?? '');
    const url = (result.webUrl ?? '').trim();
    const publishedAt = result.webPublicationDate ? toIsoTimestamp(result.webPublicationDate) : null;
    if (!title || !publishedAt || !/^https?:\/\//i.test(url)) continue;
    if (!mentionsSymbol(`${title} ${trail}`, symbol, companyName)) continue;
    articles.push({
      source: 'guardian',
      title,
      url,
      publishedAt,
      summary: truncate(trail),
      symbols: [symbol],
      filingType: null,
      accessionNumber: null,
    });
  }
  return articles;
}

export async function fetchGuardian(
  symbol: string,
  companyName: string | null,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<ArticleDraft[]> {
  const url = new URL('https://content.guardianapis.com/search');
  url.searchParams.set('order-by', 'newest');
  url.searchParams.set('page-size', '20');
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('q', companyName ? `"${companyName}"` : symbol);
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new AdapterError('UPSTREAM_UNAVAILABLE', 'The Guardian could not be reached.');
  }
  if (response.status === 429) throw new AdapterError('UPSTREAM_RATE_LIMIT', 'Guardian rate limit reached.');
  if (!response.ok) throw new AdapterError('UPSTREAM_UNAVAILABLE', 'The Guardian returned an error.');
  const payload = (await response.json()) as { response?: { results?: GuardianResult[] } };
  return filterGuardian(payload.response?.results ?? [], symbol, companyName);
}
