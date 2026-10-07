/**
 * Captures docs/assets/preview-light.png and preview-dark.png for the README
 * from the running website (`npm run site`, then `node scripts/serve.js _site 4174`).
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await page.goto('http://localhost:4174/');
  await page.waitForTimeout(800);
  await page.locator('.hero .wrap').screenshot({ path: `docs/assets/preview-${scheme}.png` });
  await page.close();
}
await browser.close();
