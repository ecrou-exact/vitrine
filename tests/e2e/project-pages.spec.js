import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { NO_CSP, STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-consent>, <vt-changelog> and <vt-repo>: keyboard, events, held-back content and axe,
 * with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CHANGELOG = `# Changelog

## [Unreleased]
### Added
- A \`theme\` option (#42)

## [1.2.0] - 2026-11-01
### Added
- Dark mode by @ada
### Fixed
- Crash on empty input
### Security
- Labels are escaped

## [1.1.0] - 2026-10-01
### Removed
- The old API
`;
const REPO = JSON.stringify({
  repo: {
    full_name: 'acme/rocket',
    name: 'rocket',
    owner: { login: 'acme' },
    html_url: 'https://github.com/acme/rocket',
    clone_url: 'https://github.com/acme/rocket.git',
    description: 'A fast launcher',
    stargazers_count: 12345,
    forks_count: 678,
    open_issues_count: 42,
    license: { spdx_id: 'MIT', name: 'MIT License' },
    topics: ['cli'],
    pushed_at: '2026-11-13T12:00:00Z',
  },
  languages: { TypeScript: 9000, CSS: 1000 },
  release: { tag_name: 'v2.1.0', published_at: '2026-11-01T00:00:00Z' },
});

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

/**
 * Mounts a <vt-consent>, which renders nothing until it has read the stored choice.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} attrs
 */
async function mountConsent(page, attrs) {
  await page.evaluate((attrs) => {
    const el = document.createElement('vt-consent');
    el.id = 'el';
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.getElementById('root')?.replaceChildren(el);
  }, attrs);
}

test.describe('project page elements', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
    await page.evaluate(() => localStorage.clear());
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark']) {
    test(`<vt-consent> banner, settings dialog and stored choice (${theme})`, async ({ page }) => {
      await mountConsent(page, { theme, 'lang-ui': 'en', policy: '/privacy', version: '3' });
      await recordEvents(page, ['vt-consent']);
      const el = page.locator('#el');
      const banner = el.getByRole('region', { name: 'Cookies on this site' });
      await expect(banner).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await el.getByRole('button', { name: 'Customize' }).click();
      const dialog = el.getByRole('dialog', { name: 'Cookie settings' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('switch', { name: 'Necessary' })).toBeDisabled();
      await dialog.getByRole('switch', { name: 'Audience measurement' }).check();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(el.getByRole('button', { name: 'Customize' })).toBeFocused();
      await el.getByRole('button', { name: 'Customize' }).click();
      await el.getByRole('switch', { name: 'Audience measurement' }).check();
      await el.getByRole('button', { name: 'Save my choices' }).click();
      await expect(banner).toBeHidden();
      const reopen = el.getByRole('button', { name: 'Cookie settings' });
      await expect(reopen).toBeFocused();
      expect(await axe(page)).toEqual([]);
      const log = await events(page);
      expect(log.at(-1).detail).toMatchObject({ action: 'save', categories: { necessary: true, analytics: true, marketing: false } }); // prettier-ignore
      // The choice is read back on the next page, without a banner.
      await page.reload();
      await mountConsent(page, { theme, 'lang-ui': 'en', version: '3' });
      await expect(page.locator('#el').getByRole('button', { name: 'Cookie settings' })).toBeVisible(); // prettier-ignore
      await expect(page.locator('#el .cs-banner')).toHaveCount(0);
    });

    test(`<vt-changelog> filters kinds and copies a release (${theme})`, async ({ page }) => {
      await mount(page, 'vt-changelog', { theme, 'lang-ui': 'en', variant: 'full', repo: 'https://github.com/acme/rocket' }, CHANGELOG); // prettier-ignore
      await recordEvents(page, ['vt-filter-change']);
      const el = page.locator('#el');
      await expect(el.getByRole('heading', { level: 3 })).toHaveText([
        'Unreleased',
        '1.2.0',
        '1.1.0',
      ]);
      await expect(el.getByRole('link', { name: '#42' })).toHaveAttribute('href', 'https://github.com/acme/rocket/issues/42'); // prettier-ignore
      expect(await axe(page)).toEqual([]);
      await el.getByRole('button', { name: /^Fixed/ }).click();
      await expect(el.getByRole('button', { name: /^Fixed/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(el.getByRole('heading', { level: 3 })).toHaveText(['1.2.0']);
      expect((await events(page)).at(-1).detail).toEqual({ kinds: ['fixed'], shown: 1 });
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-repo> card with counts, languages and clone command (${theme})`, async ({ page }) => {
      await mount(page, 'vt-repo', { theme, 'lang-ui': 'en', variant: 'full', now: '2026-11-15T12:00:00Z' }, REPO); // prettier-ignore
      const el = page.locator('#el');
      await expect(el.getByRole('heading', { name: 'acme / rocket' })).toBeVisible();
      await expect(el.getByRole('link', { name: '12,345 Stars' })).toHaveAttribute('href', 'https://github.com/acme/rocket/stargazers'); // prettier-ignore
      await expect(el.locator('.rp-legend')).toContainText('TypeScript90%');
      await expect(el.locator('.rp-command')).toHaveText('git clone https://github.com/acme/rocket.git'); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });
  }

  test('<vt-consent> holds back frames until their category is accepted', async ({ page }) => {
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.setAttribute('data-consent', 'marketing');
      frame.setAttribute('data-src', '/tests/e2e/fixtures/nocsp.html');
      frame.title = 'Video';
      document.body.append(frame);
    });
    await mountConsent(page, { 'lang-ui': 'en' });
    await page.locator('#el').getByRole('button', { name: 'Reject all' }).click();
    await expect(page.locator('iframe[title="Video"]')).not.toHaveAttribute('src', /.+/);
    await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).accept());
    await expect(page.locator('iframe[title="Video"]')).toHaveAttribute('src', '/tests/e2e/fixtures/nocsp.html'); // prettier-ignore
  });
});

test('<vt-consent> runs a held-back script once accepted, and follows Global Privacy Control', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(NO_CSP);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.type = 'text/plain';
    script.setAttribute('data-consent', 'analytics');
    script.setAttribute('src', '/tests/e2e/fixtures/consent-probe.js');
    document.body.append(script);
    const el = document.createElement('vt-consent');
    el.id = 'el';
    el.setAttribute('lang-ui', 'en');
    document.getElementById('root')?.replaceChildren(el);
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => /** @type {any} */ (window).__consentProbe)).toBeUndefined();
  await page.locator('#el').getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__consentProbe)).toBe(1);
  // With Global Privacy Control and no choice, nothing is asked: everything optional is off.
  await page.evaluate(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    const el = document.createElement('vt-consent');
    el.id = 'el';
    el.setAttribute('lang-ui', 'en');
    document.getElementById('root')?.replaceChildren(el);
  });
  await expect(page.locator('#el').getByRole('button', { name: 'Cookie settings' })).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).choice.source)).toBe('gpc'); // prettier-ignore
  expect(errors).toEqual([]);
});
