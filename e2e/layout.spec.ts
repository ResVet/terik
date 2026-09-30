import { expect, test } from '@playwright/test';
import { mockApis } from './mock/routes';

/*
 * On a phone, anything that reaches past the edge of the screen widens the
 * whole page, even from inside a horizontal scroller if it escapes the
 * scroller's clipping, and the browser then zooms out to fit it.
 */

for (const route of ['/', '/climate', '/method']) {
  test(`${route} is no wider than the screen`, async ({ page }) => {
    await mockApis(page);
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const width = page.viewportSize()!.width;
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
