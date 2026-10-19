import type { Article, ArticleDraft, ArticleSource, ArticleState } from '../../domain/types';

const SOURCE_ORDER: Record<ArticleSource, number> = {
  'sec-edgar': 0,
  'yahoo-rss': 1,
  guardian: 2,
};

export function articleId(source: string, url: string): string {
  return `${source}|${url}`;
}

export function normalizeHeadline(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function dedupeDrafts(drafts: ArticleDraft[]): ArticleDraft[] {
  const byId = new Map<string, ArticleDraft>();
  for (const draft of drafts) {
    const id = articleId(draft.source, draft.url);
    const previous = byId.get(id);
    if (!previous) {
      byId.set(id, { ...draft, symbols: [...draft.symbols] });
      continue;
    }
    const symbols = [...new Set([...previous.symbols, ...draft.symbols])].sort();
    byId.set(id, { ...previous, symbols });
  }
  return [...byId.values()];
}

export function sourceDisclaimer(source: Article['source']): string | null {
  if (source === 'yahoo-rss') return 'Unofficial Yahoo Finance headline feed. Not affiliated with Yahoo.';
  if (source === 'guardian') return 'Content via The Guardian Open Platform.';
  return null;
}

export function toArticles(drafts: ArticleDraft[], states: ArticleState[]): Article[] {
  const byId = new Map(states.map((state) => [state.id, state]));
  return dedupeDrafts(drafts).map((draft) => {
    const id = articleId(draft.source, draft.url);
    const state = byId.get(id);
    return {
      ...draft,
      id,
      saved: state?.saved ?? false,
      read: state?.read ?? false,
    };
  });
}

export function rankArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
    const aSymbol = [...a.symbols].sort()[0] ?? '';
    const bSymbol = [...b.symbols].sort()[0] ?? '';
    if (aSymbol !== bSymbol) return aSymbol < bSymbol ? -1 : 1;
    if (a.source !== b.source) return SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (a.url !== b.url) return a.url < b.url ? -1 : 1;
    return 0;
  });
}

export function newsSymbols(openSymbols: string[], watchSymbols: string[]): string[] {
  return [...new Set([...openSymbols, ...watchSymbols])].sort().slice(0, 30);
}

export function guardianSymbols(openSymbols: string[]): string[] {
  return [...new Set(openSymbols)].sort().slice(0, 10);
}

export function relevance(article: Article, openSymbols: string[], watchSymbols: string[]): string {
  const open = new Set(openSymbols);
  const watch = new Set(watchSymbols);
  const held = article.symbols.filter((symbol) => open.has(symbol));
  const watched = article.symbols.filter((symbol) => watch.has(symbol));
  if (article.source === 'sec-edgar' && held.length > 0) {
    return `SEC filing for ${held.join(', ')}, which you hold.`;
  }
  if (held.length > 0) return `Matches ${held.join(', ')} in your portfolio.`;
  if (watched.length > 0) return `Matches ${watched.join(', ')} on your watchlist.`;
  if (article.source === 'sec-edgar') return `SEC filing for ${article.symbols.join(', ') || 'this company'}.`;
  return `Matched ticker ${article.symbols.join(', ') || 'symbols'} by exact symbol or company name.`;
}
