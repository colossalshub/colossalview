import { DEMO_PORTFOLIO, DEMO_QUOTES, DEMO_TRANSACTIONS, DEMO_WATCH } from '../demo/dataset';
import { enqueueWrite } from './portfolioService';
import { replaceBook } from '../persistence/repositories';

export function loadDemoBook(): Promise<void> {
  return enqueueWrite(() => replaceBook({
    portfolio: DEMO_PORTFOLIO,
    transactions: [...DEMO_TRANSACTIONS],
    quotes: [...DEMO_QUOTES],
    watchlist: [...DEMO_WATCH],
    articleStates: null,
    settings: null,
  }));
}
