import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApis } from './mock/routes';

/*
 * Building the heat record downloads 14 five-year blocks, paced to stay
 * inside Open-Meteo's free limits, so a full build takes a little over a
 * minute even against the stand-in API.
 */

async function build(page: Page) {
  await page.goto('/climate');
  await page.getByRole('button', { name: 'Build the record' }).click();
  await expect(page.getByText(/Loaded \d+ of 14 five-year blocks/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hot days a year' })).toBeVisible({ timeout: 180_000 });
}

test.describe('climate page', () => {
  test('builds the heat record, then opens it from the device', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One full build is enough; the phone run checks layout below');
    test.setTimeout(300_000);
    const counts: Record<string, number> = {};
    await mockApis(page, { counts });
    await build(page);

    await expect(page.getByRole('heading', { name: 'Every day since 1961' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The year, then and now' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "How rare is a year's hottest day?" })).toBeVisible();
    await expect(page.getByText(/Sport climate category here: Category [123]/)).toBeVisible();

    // Every year in a real table.
    await page.getByText(/Show all \d+ years as a table/).click();
    await expect(page.getByRole('row', { name: /^2025 / })).toBeVisible();

    // The data can be taken away.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Yearly figures (CSV)' }).click();
    expect((await download).suggestedFilename()).toMatch(/^terik-jakarta-yearly-moderate-level3\.csv$/);

    // A hot day can be redefined, and the numbers follow.
    const before = await page.getByRole('heading', { name: 'Hot days a year' }).locator('..').innerText();
    await page.getByRole('radio', { name: 'Level 5 or worse' }).check();
    await expect(page.getByRole('heading', { name: 'Hot days a year' }).locator('..')).not.toHaveText(before);

    // The second visit reads the record from IndexedDB and asks the archive for nothing.
    const archiveCalls = counts['archive-api'] ?? 0;
    expect(archiveCalls).toBeGreaterThanOrEqual(14);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hot days a year' })).toBeVisible({ timeout: 30_000 });
    expect(counts['archive-api'] ?? 0).toBe(archiveCalls);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('offers a retry when the archive fails', async ({ page }) => {
    await mockApis(page, { failArchive: true });
    await page.goto('/climate');
    await page.getByRole('button', { name: 'Build the record' }).click();
    await expect(page.getByRole('alert')).toContainText('The climate archive did not respond', { timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('explains what building the record involves before starting', async ({ page }) => {
    const counts: Record<string, number> = {};
    await mockApis(page, { counts });
    await page.goto('/climate');
    await expect(page.getByRole('heading', { level: 1, name: 'How heat has changed in Jakarta' })).toBeVisible();
    await expect(page).toHaveTitle('Climate · Terik');
    await expect(page.getByText(/downloads about 65 years of hourly weather/)).toBeVisible();
    // Nothing is downloaded until asked.
    expect(counts['archive-api'] ?? 0).toBe(0);
  });
});
