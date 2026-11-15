import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-lifecycle>, <vt-advisories> and <vt-licenses> on the strict CSP page: behavior, keyboard,
 * events and axe, with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CYCLES = JSON.stringify([
  { cycle: '24', releaseDate: '2025-05-06', eol: '2028-04-30', support: '2026-10-20', lts: '2025-10-28', latest: '24.11.0' }, // prettier-ignore
  { cycle: '22', releaseDate: '2024-04-24', eol: '2027-04-30', support: '2025-10-21', lts: '2024-10-29', latest: '22.21.0' }, // prettier-ignore
  { cycle: '20', releaseDate: '2023-04-18', eol: '2026-04-30', support: '2024-10-22', lts: '2023-10-24', latest: '20.19.5' }, // prettier-ignore
]);
const ADVISORIES = JSON.stringify({
  vulns: [
    { id: 'GHSA-aaaa-bbbb-cccc', summary: 'Remote code execution in parser', details: 'A crafted file runs code.', severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }], affected: [{ package: { ecosystem: 'npm', name: 'parser' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '2.1.0' }] }] }] }, // prettier-ignore
    { id: 'GHSA-dddd-eeee-ffff', summary: 'Cross-site scripting in markdown preview', severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N' }], affected: [{ package: { ecosystem: 'npm', name: 'preview' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '1.0.0' }] }] }] }, // prettier-ignore
  ],
});
const SBOM = JSON.stringify({
  bomFormat: 'CycloneDX',
  components: [
    { name: 'react', version: '19.0.0', licenses: [{ license: { id: 'MIT' } }] },
    { name: 'axe-core', version: '4.10.0', licenses: [{ license: { id: 'MPL-2.0' } }] },
    { name: 'readline-sync', version: '1.4.10', licenses: [{ license: { id: 'GPL-3.0-only' } }] },
  ],
});

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('maintenance elements', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark']) {
    test(`<vt-lifecycle> checks a version and shows the schedule (${theme})`, async ({ page }) => {
      await mount(page, 'vt-lifecycle', { variant: 'full', theme, 'lang-ui': 'en', now: '2026-11-15', version: '22.3.0' }, CYCLES); // prettier-ignore
      await recordEvents(page, ['vt-tab-change']);
      const el = page.locator('#el');
      await expect(el.locator('.lc-check')).toContainText('22.3.0 gets security fixes only, until Apr 30, 2027.'); // prettier-ignore
      await expect(el.locator('tr.lc-mine')).toContainText('22');
      expect(await axe(page)).toEqual([]);
      await el.getByRole('tab', { name: 'Table' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(el.getByRole('tab', { name: 'Schedule' })).toBeFocused();
      await expect(el.locator('.lc-row')).toHaveCount(3);
      expect((await events(page))[0].detail).toEqual({ tab: 'schedule' });
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-advisories> opens an advisory and filters by severity (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-advisories', { variant: 'full', theme, 'lang-ui': 'en' }, ADVISORIES); // prettier-ignore
      await recordEvents(page, ['vt-toggle', 'vt-filter-change']);
      const el = page.locator('#el');
      await expect(el.locator('.adv-severity').first()).toHaveText(/Critical\s*9\.8/);
      await el.locator('summary').first().focus();
      await page.keyboard.press('Enter');
      await expect(el.locator('.adv-text')).toHaveText('A crafted file runs code.');
      await el.getByRole('button', { name: /^Moderate/ }).click();
      await expect(el.locator('.adv-item')).toHaveCount(1);
      await expect(el.locator('.adv-nofix')).toHaveText(' → no fix yet');
      expect((await events(page)).map((e) => e.detail)).toEqual([{ id: 'GHSA-aaaa-bbbb-cccc', open: true }, { severity: 'moderate' }]); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-licenses> flags licenses that are not allowed (${theme})`, async ({ page }) => {
      await mount(page, 'vt-licenses', { variant: 'full', theme, 'lang-ui': 'en', allow: 'permissive,MPL-2.0' }, SBOM); // prettier-ignore
      const el = page.locator('#el');
      await expect(el.locator('[part~="badge"]')).toHaveText('1 not allowed');
      await expect(el.locator('details[open] .lic-denied')).toHaveText('Not allowed');
      await el.getByRole('tab', { name: 'Packages' }).click();
      await expect(el.locator('tbody tr')).toHaveCount(3);
      expect(await axe(page)).toEqual([]);
    });
  }
});
