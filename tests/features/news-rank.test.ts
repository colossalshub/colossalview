import { describe, expect, it } from 'vitest';
import { dedupeDrafts, rankArticles, toArticles } from '../../src/features/news/rank';
import type { ArticleDraft } from '../../src/domain/types';

const draft = (partial: Partial<ArticleDraft> & Pick<ArticleDraft, 'title' | 'url' | 'source'>): ArticleDraft => ({
  publishedAt: '2024-01-02T00:00:00.000Z',
  summary: '',
  symbols: ['AAPL'],
  filingType: null,
  accessionNumber: null,
  ...partial,
});

describe('news ranking', () => {
  it('dedupes by URL and keeps distinct items that share a title', () => {
    const drafts = [
      draft({ source: 'yahoo-rss', title: 'Apple rises', url: 'https://news.example/a', symbols: ['AAPL'] }),
      draft({ source: 'yahoo-rss', title: 'Apple rises', url: 'https://news.example/b', symbols: ['MSFT'] }),
      draft({ source: 'sec-edgar', title: '4', url: 'https://www.sec.gov/a', publishedAt: '2024-01-02T00:00:00.000Z', symbols: ['AAPL'], filingType: '4' }),
      draft({ source: 'sec-edgar', title: '4', url: 'https://www.sec.gov/b', publishedAt: '2024-01-02T00:00:00.000Z', symbols: ['AAPL'], filingType: '4' }),
    ];
    const articles = rankArticles(toArticles(drafts, []));
    expect(articles.map((article) => article.url).sort()).toEqual([
      'https://news.example/a',
      'https://news.example/b',
      'https://www.sec.gov/a',
      'https://www.sec.gov/b',
    ]);
    const merged = dedupeDrafts([
      draft({ source: 'yahoo-rss', title: 'Same', url: 'https://news.example/a', symbols: ['AAPL'] }),
      draft({ source: 'yahoo-rss', title: 'Same', url: 'https://news.example/a', symbols: ['MSFT'] }),
    ]);
    expect(merged[0]?.symbols).toEqual(['AAPL', 'MSFT']);
  });
});
