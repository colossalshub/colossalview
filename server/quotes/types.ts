export type QuoteProviderId = 'finnhub' | 'alphavantage';

export interface NormalizedQuote {
  symbol: string;
  price: string;
  previousClose: string | null;
  asOf: string;
  source: QuoteProviderId;
}
