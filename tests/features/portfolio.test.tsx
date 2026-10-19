import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { deleteDB } from 'idb';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDemoBook } from '../../src/app/loadDemo';
import { routes } from '../../src/app/router';
import { closeDb } from '../../src/persistence/db';
import { listTransactions } from '../../src/persistence/repositories';
import { DEFAULT_SETTINGS } from '../../src/domain/types';

afterEach(async () => {
  cleanup();
  await closeDb();
  await deleteDB('colossalview');
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('portfolio screen', () => {
  it('shows an oversell error and does not add a transaction', async () => {
    await loadDemoBook();
    const user = userEvent.setup();
    renderAt('/portfolio');
    expect(await screen.findByTestId('transaction-count')).toHaveTextContent('4');
    await user.type(screen.getByLabelText('Sell symbol'), 'AAPL');
    await user.clear(screen.getByLabelText('Sell quantity'));
    await user.type(screen.getByLabelText('Sell quantity'), '9');
    await user.clear(screen.getByLabelText('Sell price'));
    await user.type(screen.getByLabelText('Sell price'), '150');
    await user.click(screen.getByRole('button', { name: 'Record sell' }));
    expect(await screen.findByTestId('sell-error')).toHaveTextContent(/exceeds open quantity/);
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('4');
    expect(await listTransactions()).toHaveLength(4);
  });

  it('does not request news feeds when every source is off', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      (input: RequestInfo) => {
        urls.push(String(input));
        return Promise.resolve(new Response(JSON.stringify({ ok: true, providers: { quotes: 'none', yahoo: true, edgar: false, guardian: false } })));
      },
    );
    renderAt('/news');
    expect(await screen.findByText(/news sources are off/i)).toBeInTheDocument();
    expect(DEFAULT_SETTINGS.newsYahoo).toBe(false);
    expect(urls.some((url) => url.includes('/api/news') || url.includes('/api/filings'))).toBe(false);
  });
});
