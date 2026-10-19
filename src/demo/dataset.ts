import type { Portfolio, Quote, Transaction, WatchItem } from '../domain/types';

export const DEMO_PORTFOLIO: Portfolio = {
  id: 'demo-portfolio',
  name: 'Portfolio',
  baseCurrency: 'USD',
  createdAt: '2024-01-15T15:00:00.000Z',
  updatedAt: '2024-11-01T15:00:00.000Z',
};

export const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: 'demo-tx-aapl-buy-1',
    portfolioId: 'demo-portfolio',
    symbol: 'AAPL',
    type: 'buy',
    quantity: '10',
    price: '100',
    fee: '5.00',
    executedAt: '2024-01-15T15:00:00.000Z',
    note: '',
    createdAt: '2024-01-15T15:00:00.000Z',
    updatedAt: '2024-01-15T15:00:00.000Z',
  },
  {
    id: 'demo-tx-vti-buy-1',
    portfolioId: 'demo-portfolio',
    symbol: 'VTI',
    type: 'buy',
    quantity: '5',
    price: '200',
    fee: '0.00',
    executedAt: '2024-03-01T15:00:00.000Z',
    note: '',
    createdAt: '2024-03-01T15:00:00.000Z',
    updatedAt: '2024-03-01T15:00:00.000Z',
  },
  {
    id: 'demo-tx-aapl-buy-2',
    portfolioId: 'demo-portfolio',
    symbol: 'AAPL',
    type: 'buy',
    quantity: '10',
    price: '120',
    fee: '0.00',
    executedAt: '2024-06-03T15:00:00.000Z',
    note: '',
    createdAt: '2024-06-03T15:00:00.000Z',
    updatedAt: '2024-06-03T15:00:00.000Z',
  },
  {
    id: 'demo-tx-aapl-sell-1',
    portfolioId: 'demo-portfolio',
    symbol: 'AAPL',
    type: 'sell',
    quantity: '12',
    price: '130',
    fee: '1.00',
    executedAt: '2024-11-01T15:00:00.000Z',
    note: '',
    createdAt: '2024-11-01T15:00:00.000Z',
    updatedAt: '2024-11-01T15:00:00.000Z',
  },
];

export const DEMO_QUOTES: Quote[] = [
  {
    symbol: 'AAPL',
    price: '150',
    currency: 'USD',
    asOf: '2024-12-01T21:00:00.000Z',
    source: 'manual',
    previousClose: null,
    locked: true,
  },
];

export const DEMO_WATCH: WatchItem[] = [
  {
    id: 'demo-watch-msft',
    symbol: 'MSFT',
    note: '',
    priority: false,
    createdAt: '2024-12-01T21:00:00.000Z',
  },
];
