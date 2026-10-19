import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { CalculatorPage } from '../features/calculator/CalculatorPage';
import { NewsPage } from '../features/news/NewsPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { PortfolioPage } from '../features/portfolio/PortfolioPage';
import { PositionPage } from '../features/portfolio/PositionPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SymbolPage } from '../features/symbol/SymbolPage';
import { WatchlistPage } from '../features/watchlist/WatchlistPage';
import { ErrorBoundary } from './ErrorBoundary';
import { Shell } from './shell';
import { StoreProvider } from './store';

function NotFound() {
  return (
    <main id="main">
      <h1>Page not found</h1>
      <p>
        <a href="/">Back to overview</a>
      </p>
    </main>
  );
}

export const routes: RouteObject[] = [
  {
    element: (
      <ErrorBoundary>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </ErrorBoundary>
    ),
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/portfolio', element: <PortfolioPage /> },
      { path: '/portfolio/:symbol', element: <PositionPage /> },
      { path: '/watchlist', element: <WatchlistPage /> },
      { path: '/news', element: <NewsPage /> },
      { path: '/calculator', element: <CalculatorPage /> },
      { path: '/symbol/:symbol', element: <SymbolPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function AppRouter() {
  return <RouterProvider router={createBrowserRouter(routes)} />;
}
