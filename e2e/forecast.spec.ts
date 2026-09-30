import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApis } from './mock/routes';

/*
 * The forecast page against stand-in APIs (see mock/). The browser's time
 * zone is Asia/Jakarta, so the first visit opens on Jakarta without asking
 * for location access.
 */

test.describe('forecast page', () => {
  test('shows the current heat stress and advice for the default place', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Jakarta' })).toBeVisible();
    await expect(page.getByText('WBGT in full sun').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The week ahead, hour by hour' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Best time to be outside' })).toBeVisible();
    // The place ends up in the address, so the page can be shared as is.
    await expect(page).toHaveURL(/place=Jakarta/);
  });

  test('changes the advice with the activity', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const chips = page.getByRole('radiogroup', { name: 'Who is outside?' });
    await chips.getByRole('radio', { name: 'Football match' }).click();
    await expect(chips.getByRole('radio', { name: 'Football match' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Matches and match-pace training, with FIFPRO limits')).toBeVisible();
  });

  test('finds another place', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Change place/ }).click();
    await page.getByRole('combobox', { name: 'Search for a place' }).fill('Madr');
    await page.getByRole('option', { name: /Madrid/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Madrid' })).toBeVisible();
    await expect(page).toHaveURL(/place=Madrid/);
  });

  test('switches to Indonesian and Fahrenheit', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Indonesia' }).check();
    await expect(page.getByRole('heading', { name: 'Seminggu ke depan, jam demi jam' })).toBeVisible();
    await page.getByRole('radio', { name: '°F' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.getByText('°F').first()).toBeVisible();
  });

  test('carries on without the ensemble', async ({ page }) => {
    await mockApis(page, { failEnsemble: true });
    await page.goto('/');
    await expect(page.getByText('The ensemble is not available for this place right now.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: 'Best time to be outside' })).toBeVisible();
  });

  test('works under the Content Security Policy of the live site', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy|CSP/.test(message.text())) {
        violations.push(message.text());
      }
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    await mockApis(page);
    const response = await page.goto('/');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    await expect(page.getByRole('heading', { name: 'Best time to be outside' })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.goto('/method');
    await expect(page.getByRole('heading', { name: 'References' })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('passes an automated accessibility check', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hour by hour' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
