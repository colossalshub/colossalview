import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, providers: { quotes: 'none', yahoo: true, edgar: false, guardian: false } }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'stubbed' } }),
    });
  });
});

test('starts empty, loads the demo, and keeps it after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your book is empty' })).toBeVisible();
  await expect(page.getByTestId('position-AAPL')).toHaveCount(0);
  await expect(page.getByText('$314.00')).toHaveCount(0);
  await page.goto('/settings');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await expect(page.getByTestId('unrealized-VTI')).toHaveText('—');
  await page.reload();
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await expect(page.getByTestId('unrealized-VTI')).toHaveText('—');
});

test('rejects a 9-share AAPL sell', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await page.goto('/portfolio');
  await page.getByLabel('Sell symbol').fill('AAPL');
  await page.getByLabel('Sell quantity').fill('9');
  await page.getByLabel('Sell price').fill('150');
  await page.getByLabel('Sell fee').fill('0');
  await page.getByRole('button', { name: 'Record sell' }).click();
  await expect(page.getByTestId('sell-error')).toContainText(/exceeds open quantity/i);
  await expect(page.getByTestId('transaction-count')).toHaveText('4');
});

test('manual VTI quote can be saved and cleared', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await page.goto('/portfolio/VTI');
  await expect(page.getByTestId('unrealized-VTI')).toHaveText('—');
  await page.getByTestId('quote-price').fill('220');
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('unrealized-VTI')).toContainText('$100.00');
  await page.getByTestId('clear-quote').click();
  await expect(page.getByTestId('unrealized-VTI')).toHaveText('—');
});

test('replace-import removes a later buy', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('load-demo').click();
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await page.goto('/settings');
  await page.getByTestId('export-json').click();
  const exported = await page.getByTestId('export-json-text').inputValue();
  await page.goto('/portfolio');
  await page.getByLabel('Buy symbol').fill('MSFT');
  await page.getByLabel('Buy quantity').fill('1');
  await page.getByLabel('Buy price').fill('10');
  await page.getByLabel('Buy fee').fill('0');
  await page.getByRole('button', { name: 'Record buy' }).click();
  await expect(page.getByTestId('transaction-count')).toHaveText('5');
  await page.goto('/settings');
  await page.getByTestId('import-json-text').fill(exported);
  await page.getByTestId('preview-import').click();
  await page.getByTestId('confirm-replace').click();
  await expect(page.getByText('Import saved.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('realized-AAPL')).toContainText('$314.00');
  await page.goto('/portfolio');
  await expect(page.getByTestId('transaction-count')).toHaveText('4');
});

test('command palette opens the calculator', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+K');
  await page.getByRole('dialog', { name: 'Command palette' }).getByRole('button', { name: 'Calculator' }).click();
  await expect(page).toHaveURL(/\/calculator$/);
});

test('theme survives reload and the mobile overview does not overflow', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Dark').click();
  await expect(page.getByLabel('Dark')).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
