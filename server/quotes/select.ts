import { nonEmpty } from '../env';

export type SelectedQuoteProvider = 'finnhub' | 'alphavantage' | 'none';

export function selectQuoteProvider(env: { FINNHUB_API_KEY?: string; ALPHA_VANTAGE_API_KEY?: string }): SelectedQuoteProvider {
  if (nonEmpty(env.FINNHUB_API_KEY)) return 'finnhub';
  if (nonEmpty(env.ALPHA_VANTAGE_API_KEY)) return 'alphavantage';
  return 'none';
}
