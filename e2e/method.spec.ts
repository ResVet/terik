import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApis } from './mock/routes';

test.describe('method page', () => {
  test('runs the WBGT model live as the sliders move', async ({ page }) => {
    await mockApis(page);
    await page.goto('/method');
    const readout = page.getByText('WBGT in full sun', { exact: true }).locator('..');
    const first = await readout.innerText();

    const slider = page.getByRole('slider', { name: 'Humidity' });
    await slider.focus();
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => readout.innerText()).not.toBe(first);

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect.poll(() => readout.innerText()).toBe(first);
  });

  test('links citations to the reference list', async ({ page }) => {
    await mockApis(page);
    await page.goto('/method');
    await expect(page).toHaveTitle('Method · Terik');
    await page.getByRole('link', { name: 'Reference 1' }).first().click();
    await expect(page).toHaveURL(/#ref-1$/);
    await expect(page.locator('#ref-1')).toContainText('Liljegren JC');
  });

  test('publishes the licence notices with the site', async ({ page, request }) => {
    await mockApis(page);
    await page.goto('/method');
    await expect(page.getByRole('link', { name: 'Licence notice' })).toHaveAttribute('href', '/NOTICE.txt');
    expect(await (await request.get('/NOTICE.txt')).text()).toContain('Contract No. DE-AC02-06CH11357');
    expect(await (await request.get('/third-party-licenses.txt')).text()).toContain('## three - ');
  });

  test('passes an automated accessibility check', async ({ page }) => {
    await mockApis(page);
    await page.goto('/method');
    await expect(page.getByRole('heading', { name: 'References' })).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
