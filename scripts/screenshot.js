/**
 * Dev helper: screenshots a page or an element and prints console errors.
 * Usage: node scripts/screenshot.js <url> <out.png> [selector] [width] [light|dark]
 */
import { chromium } from '@playwright/test';

const [url, out, selector = '', width = '1280', scheme = 'light'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: 900 },
  colorScheme: scheme,
});
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(900);
if (selector) await page.locator(selector).first().screenshot({ path: out });
else await page.screenshot({ path: out, fullPage: true });
console.log(errors.join('\n') || 'no console errors');
await browser.close();
