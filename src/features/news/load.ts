import type { Article, ArticleState, Settings } from '../../domain/types';
import { fetchFilings, fetchGuardian, fetchYahoo } from '../../providers/client';
import { guardianSymbols, newsSymbols, rankArticles, toArticles } from './rank';

export interface NewsLoad {
  articles: Article[];
  notices: string[];
  companies: Record<string, { companyName: string | null; exchange: string | null }>;
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) return;
      results[current] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

export async function loadHeadlines(input: {
  openSymbols: string[];
  watchSymbols: string[];
  settings: Settings;
  articleStates: ArticleState[];
  onlySymbol?: string;
}): Promise<NewsLoad> {
  const symbols = input.onlySymbol ? [input.onlySymbol] : newsSymbols(input.openSymbols, input.watchSymbols);
  const notices: string[] = [];
  const drafts = [];
  const companies: NewsLoad['companies'] = {};
  if (!input.settings.newsYahoo && !input.settings.newsEdgar && !input.settings.newsGuardian) {
    const saved = input.articleStates
      .filter((state) => state.saved)
      .map((state) => ({
        id: state.id,
        source: state.source,
        title: state.title,
        url: state.url,
        publishedAt: state.publishedAt,
        summary: state.summary,
        symbols: state.symbols,
        filingType: state.filingType,
        accessionNumber: state.accessionNumber,
        saved: true,
        read: state.read,
      }));
    return { articles: rankArticles(saved), notices, companies };
  }
  if (input.settings.newsYahoo) {
    const rows = await mapPool(symbols, 2, async (symbol) => {
      try {
        const response = await fetchYahoo(symbol);
        if (response.notice) notices.push(`${symbol}: ${response.notice}`);
        return response.articles;
      } catch (error) {
        notices.push(`${symbol}: ${error instanceof Error ? error.message : 'Yahoo failed.'}`);
        return [];
      }
    });
    drafts.push(...rows.flat());
  }
  if (input.settings.newsEdgar) {
    const rows = await mapPool(symbols, 2, async (symbol) => {
      try {
        const response = await fetchFilings(symbol);
        if (response.notice === 'CIK_NOT_FOUND') notices.push(`${symbol}: no SEC company match.`);
        companies[symbol] = { companyName: response.companyName, exchange: response.exchange };
        return response.articles;
      } catch (error) {
        notices.push(`${symbol}: ${error instanceof Error ? error.message : 'EDGAR failed.'}`);
        return [];
      }
    });
    drafts.push(...rows.flat());
  }
  if (input.settings.newsGuardian) {
    const targets = input.onlySymbol ? [input.onlySymbol] : guardianSymbols(input.openSymbols);
    const rows = await mapPool(targets, 1, async (symbol) => {
      try {
        const response = await fetchGuardian(symbol);
        return response.articles;
      } catch (error) {
        notices.push(`${symbol}: ${error instanceof Error ? error.message : 'Guardian failed.'}`);
        return [];
      }
    });
    drafts.push(...rows.flat());
  }
  const articles = rankArticles(toArticles(drafts, input.articleStates));
  const savedOnly = input.articleStates
    .filter((state) => state.saved && !articles.some((article) => article.id === state.id))
    .map((state) => ({ ...state, saved: true, read: state.read }));
  return { articles: rankArticles([...articles, ...savedOnly]), notices, companies };
}
