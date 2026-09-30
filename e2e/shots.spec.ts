import { chromium, devices, test, type BrowserContext, type Page } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mockApis } from './mock/routes';

/**
 * Screenshots of every page at phone, tablet and desktop sizes in both
 * themes, for review and for the README. Not part of the normal run:
 *   SHOTS=1 npx playwright test shots --project=desktop
 */

test.skip(!process.env.SHOTS, 'Set SHOTS=1 to capture screenshots');

const OUT = process.env.SHOTS_DIR ?? path.resolve('test-results/shots');
const BASE = 'http://127.0.0.1:4173';
/** For example "?place=Madrid&lat=40.4165&lon=-3.7026&tz=Europe/Madrid". */
const QUERY = process.env.SHOTS_QUERY ?? '';

async function open(
  dir: string,
  options: Parameters<typeof chromium.launchPersistentContext>[1],
): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(dir, {
    baseURL: BASE,
    locale: process.env.SHOTS_LOCALE ?? 'en-GB',
    timezoneId: 'Asia/Jakarta',
    ...options,
  });
  await mockApis(context);
  return context;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Let the 3D intros finish.
  await page.waitForTimeout(2500);
}

async function shoot(page: Page, name: string, fullPage = true) {
  // In a full-page capture the fixed phone tab bar would land mid-page; park it at the end.
  const style = fullPage ? await page.addStyleTag({ content: '#root > nav { position: static !important; }' }) : null;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  await style?.evaluate((el) => (el as Element).remove());
}

test('capture every page', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Runs once, with its own browser contexts');
  test.setTimeout(900_000);
  // Outside test-results, which Playwright empties on every run, so the record survives.
  const dir = process.env.SHOTS_PROFILE ?? path.join(os.tmpdir(), 'terik-shots-profile');
  const only = process.env.SHOTS_ONLY?.split(',');
  const want = (name: string) => !only || only.some((o) => name.includes(o));

  // Desktop: build the climate record once; it stays in this profile's IndexedDB.
  let context = await open(dir, { viewport: { width: 1440, height: 900 } });
  let page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`/climate${QUERY}`);
  const indonesian = (process.env.SHOTS_LOCALE ?? '').startsWith('id');
  const build = page.getByRole('button', { name: indonesian ? 'Bangun catatan' : 'Build the record' });
  const ready = page.getByRole('heading', { name: indonesian ? 'Hari panas setahun' : 'Hot days a year' });
  await Promise.race([build.waitFor({ timeout: 20_000 }), ready.waitFor({ timeout: 20_000 })]).catch(() => undefined);
  if (await build.isVisible()) await build.click();
  if (process.env.SHOTS_PROGRESS) {
    // A frame from the middle of the download, for the loading state.
    await page.getByText(/Loaded [3-9] of/).waitFor({ timeout: 120_000 });
    await shoot(page, 'climate-loading-desktop-light', false);
  }
  await ready.waitFor({ timeout: 300_000 });

  const sizes = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'laptop', width: 1180, height: 800 },
    { name: 'tablet', width: 820, height: 1180 },
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const [route, label] of [
        ['/', 'forecast'],
        ['/climate', 'climate'],
        ['/method', 'method'],
      ] as const) {
        const name = `${label}-${size.name}-${scheme}`;
        if (!want(name)) continue;
        await page.goto(route + QUERY);
        await settle(page);
        await shoot(page, name);
      }
    }
  }
  await context.close();

  // Phone, with touch and a high-density screen.
  const phone = devices['Pixel 7'];
  context = await open(dir, {
    viewport: phone.viewport,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: phone.userAgent,
  });
  page = context.pages()[0] ?? (await context.newPage());
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [route, label] of [
      ['/', 'forecast'],
      ['/climate', 'climate'],
      ['/method', 'method'],
    ] as const) {
      const name = `${label}-phone-${scheme}`;
      if (!want(name)) continue;
      await page.goto(route + QUERY);
      await settle(page);
      await shoot(page, name);
    }
  }
  await context.close();
});
