import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-password>, <vt-secret> and <vt-version> on the strict CSP page: typing, keyboard,
 * forms, events and axe, with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// A fake key in the shape of a Stripe live key, too short for secret scanners.
const STRIPE = 'sk_live_51DemoKeyNotReal0000';

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('credential fields', () => {
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
    test(`<vt-password> rates a password while typing and generates one (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-password', { theme, 'lang-ui': 'en', variant: 'full', confirm: '', require: 'upper,digit', 'user-inputs': 'alice@example.com' }); // prettier-ignore
      await recordEvents(page, ['vt-input', 'vt-generate']);
      const el = page.locator('#el');
      const input = el.getByLabel('New password', { exact: true });
      await input.fill('alice2024');
      await expect(el.getByRole('meter', { name: 'Password strength' })).toHaveAttribute('aria-valuetext', 'Very weak'); // prettier-ignore
      await expect(el.locator('.pw-warning')).toHaveText('It contains your name or email.');
      await expect(el.locator('[data-rule="upper"]')).not.toHaveClass(/ok/);
      expect(await axe(page)).toEqual([]);
      await el.getByRole('button', { name: 'Generate a strong password' }).click();
      await expect(el.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Very strong');
      await expect(input).toHaveAttribute('type', 'text');
      await expect(el.locator('.pw-match')).toHaveText('Passwords match');
      await el.locator('.pw-details summary').click();
      await expect(el.locator('.pw-attacks tbody tr')).toHaveCount(4);
      expect(await axe(page)).toEqual([]);
      const log = await events(page);
      expect(log.at(-1)).toEqual({ type: 'vt-generate', detail: { length: 20 } });
      expect(JSON.stringify(log)).not.toContain('alice2024');
    });

    test(`<vt-secret> keeps a key blurred, opens copy formats and reveals it with the keyboard (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-secret', { theme, 'lang-ui': 'en', variant: 'full', label: 'Stripe key', value: STRIPE, created: '2026-09-01', scopes: 'charges:write', rotate: '', now: '2026-11-15T12:00:00Z' }); // prettier-ignore
      await recordEvents(page, ['vt-toggle', 'vt-copy']);
      const el = page.locator('#el');
      expect(await el.evaluate((node) => node.shadowRoot?.innerHTML.includes('DemoKeyNotReal'))).toBe(false); // prettier-ignore
      await expect(el.locator('.sc-badge.env-live')).toHaveText('Live');
      expect(await axe(page)).toEqual([]);
      const more = el.getByRole('button', { name: 'Copy as…' });
      await more.focus();
      await page.keyboard.press('ArrowDown');
      await expect(el.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(el.getByRole('menuitem').nth(1)).toBeFocused();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await el.getByRole('button', { name: 'Show the key' }).click();
      await expect(el.locator('.sc-value.revealed')).toHaveText(STRIPE);
      expect(await axe(page)).toEqual([]);
      const log = await events(page);
      expect(log[0]).toEqual({ type: 'vt-toggle', detail: { visible: true } });
    });

    test(`<vt-version> steps parts with the arrow keys and offers the next versions (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-version', { theme, 'lang-ui': 'en', variant: 'full', value: '1.4.2', current: '1.4.2', newer: '' }); // prettier-ignore
      await recordEvents(page, ['vt-change']);
      const el = page.locator('#el');
      const minor = el.getByRole('spinbutton', { name: 'Minor' });
      await minor.focus();
      await page.keyboard.press('ArrowUp');
      await expect(el.locator('.vr-result-value')).toHaveText('1.5.0');
      await expect(el.getByRole('spinbutton', { name: 'Minor' })).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(el.getByRole('spinbutton', { name: 'Patch' })).toBeFocused();
      await page.keyboard.type('7');
      await expect(el.locator('.vr-result-value')).toHaveText('1.5.7');
      await expect(el.locator('.vr-change')).toContainText('Minor release');
      expect(await axe(page)).toEqual([]);
      await el.getByRole('button', { name: /^Major\W+2\.0\.0$/ }).click();
      await expect(el.locator('.vr-result-value')).toHaveText('2.0.0');
      expect((await events(page)).map((e) => e.detail.change)).toEqual(['minor', 'patch', 'major']);
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-version> text field with − and +, only version characters (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-version', { theme, 'lang-ui': 'en', format: 'x.y', 'segment-max': '*,9', value: '1.8', label: 'Docs version' }); // prettier-ignore
      const el = page.locator('#el');
      const input = el.getByLabel('Docs version');
      await el.getByRole('button', { name: 'Increase Minor' }).click();
      await el.getByRole('button', { name: 'Increase Minor' }).click();
      await expect(input).toHaveValue('2.0');
      await input.fill('');
      await input.pressSequentially('3a.b4');
      await expect(input).toHaveValue('3.4');
      await input.press('Home');
      await input.press('ArrowUp');
      await expect(input).toHaveValue('4.0');
      expect(await axe(page)).toEqual([]);
    });
  }

  test('the three fields take part in a form', async ({ page }) => {
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'form';
      const password = document.createElement('vt-password');
      password.setAttribute('name', 'password');
      password.setAttribute('required', '');
      const secret = document.createElement('vt-secret');
      secret.setAttribute('name', 'token');
      secret.setAttribute('editable', '');
      secret.setAttribute('expect', 'github');
      const version = document.createElement('vt-version');
      version.setAttribute('name', 'version');
      version.setAttribute('value', '1.0.0');
      form.append(password, secret, version);
      document.getElementById('root')?.replaceChildren(form);
    });
    const form = page.locator('#form');
    await expect(form.locator('vt-version input')).toHaveValue('1.0.0');
    expect(await page.evaluate(() => /** @type {HTMLFormElement} */ (document.getElementById('form')).checkValidity())).toBe(false); // prettier-ignore
    await form.locator('vt-password input').first().fill('Qv7#pLm2!xR9wZ');
    await form.locator('vt-secret input').fill('AKIAIOSFODNN7EXAMPLE');
    expect(await page.evaluate(() => /** @type {HTMLFormElement} */ (document.getElementById('form')).checkValidity())).toBe(false); // prettier-ignore
    await form.locator('vt-secret input').fill(`ghp_${'a'.repeat(36)}`);
    const data = await page.evaluate(() => {
      const f = /** @type {HTMLFormElement} */ (document.getElementById('form'));
      return { valid: f.checkValidity(), entries: Object.fromEntries(new FormData(f)) };
    });
    expect(data).toEqual({ valid: true, entries: { password: 'Qv7#pLm2!xR9wZ', token: `ghp_${'a'.repeat(36)}`, version: '1.0.0' } }); // prettier-ignore
  });
});
