import { expect, test } from '@playwright/test';
import { collectErrors, events, mount, recordEvents, STRICT } from './helpers.js';

test.describe('Loading indicators', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('every indicator renders under a strict CSP and fires vt-ready', async ({ page }) => {
    const tags = [
      'vt-spinner', 'vt-progress', 'vt-progress-ring', 'vt-skeleton', 'vt-loading-overlay',
      'vt-page-progress', 'vt-loading-steps', 'vt-typing', 'vt-loading-button', 'vt-loading-message',
    ]; // prettier-ignore
    for (const tag of tags) {
      const result = await mount(page, tag, { active: '', value: '40' }, null);
      expect(result.event, tag).toBe('vt-ready');
    }
  });

  test('a spinner with a delay never shows for a fast load', async ({ page }) => {
    await mount(page, 'vt-spinner', { delay: '300ms' });
    await recordEvents(page, ['vt-loading-start', 'vt-loading-end']);
    await page.evaluate(() => document.getElementById('el').stop());
    await page.waitForTimeout(400);
    await expect(page.locator('#el [part~="spinner"]')).toHaveCount(0);
    expect(await events(page)).toEqual([]);
  });

  test('a progress bar announces its value', async ({ page }) => {
    await mount(page, 'vt-progress', { value: '30', text: 'Upload', 'show-value': 'percent' });
    const bar = page.getByRole('progressbar', { name: 'Upload' });
    await expect(bar).toHaveAttribute('aria-valuenow', '30');
    await page.evaluate(() => (document.getElementById('el').value = 75));
    await expect(bar).toHaveAttribute('aria-valuenow', '75');
    await expect(page.locator('#el [part~="value"]')).toHaveText('75%');
  });

  test('the overlay makes its content unreachable until it stops', async ({ page }) => {
    await page.evaluate(() => {
      const overlay = document.createElement('vt-loading-overlay');
      overlay.id = 'el';
      overlay.setAttribute('text', 'Saving…');
      const button = document.createElement('button');
      button.textContent = 'Inside';
      overlay.append(button);
      document.getElementById('root').replaceChildren(overlay);
    });
    const inside = page.getByRole('button', { name: 'Inside' });
    await expect(page.getByRole('status', { name: 'Saving…' })).toBeVisible();
    const focusable = () =>
      page.evaluate(() => {
        const button = document.querySelector('#el button');
        button.focus();
        return document.activeElement === button;
      });
    await expect(inside).toHaveAttribute('inert', '');
    expect(await focusable()).toBe(false);
    await page.evaluate(() => document.getElementById('el').stop());
    expect(await focusable()).toBe(true);
    await expect(inside).not.toHaveAttribute('inert', '');
  });

  test('the loading button tracks a promise and ignores clicks meanwhile', async ({ page }) => {
    await page.evaluate(() => {
      const button = document.createElement('vt-loading-button');
      button.id = 'el';
      button.textContent = 'Save';
      button.setAttribute('loading-text', 'Saving…');
      button.setAttribute('success-text', 'Saved');
      window.__clicks = 0;
      button.addEventListener('click', () => {
        window.__clicks += 1;
        button.track(new Promise((resolve) => setTimeout(resolve, 400)));
      });
      document.getElementById('root').replaceChildren(button);
    });
    const button = page.locator('#el').getByRole('button');
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toContainText('Saving…');
    // force: Playwright waits for aria-disabled buttons to be enabled; the point is to click now.
    await button.click({ force: true });
    await button.click({ force: true });
    await expect(button).toContainText('Saved');
    expect(await page.evaluate(() => window.__clicks)).toBe(1);
  });

  test('the page bar starts, trickles and finishes', async ({ page }) => {
    await mount(page, 'vt-page-progress', { 'trickle-speed': '50ms' });
    await recordEvents(page, ['vt-complete', 'vt-loading-end']);
    await page.evaluate(() => document.getElementById('el').start());
    const bar = page.getByRole('progressbar', { name: 'Page loading' });
    await expect(bar).toBeAttached();
    // The bar spans the window, scaled to the progress.
    const width = await page.locator('#el').evaluate((el) => el.shadowRoot.querySelector('.page-bar').getBoundingClientRect().width); // prettier-ignore
    expect(width).toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(20);
    await page.evaluate(() => document.getElementById('el').done());
    await expect.poll(async () => (await events(page)).map((e) => e.type)).toEqual(['vt-complete', 'vt-loading-end']); // prettier-ignore
    await expect(bar).toHaveCount(0);
  });

  test('steps update and complete', async ({ page }) => {
    await mount(page, 'vt-loading-steps', { text: 'Deploy' }, 'running Build\npending Push');
    await recordEvents(page, ['vt-complete']);
    const list = page.getByRole('list', { name: 'Deploy' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await page.evaluate(() => {
      const el = document.getElementById('el');
      el.setStep(0, { status: 'done' });
      el.setStep(1, { status: 'done' });
    });
    await expect(page.locator('#el [part~="summary"]')).toContainText('Complete');
    await expect.poll(async () => (await events(page)).map((e) => e.detail.status)).toEqual(['done']); // prettier-ignore
  });

  test('reduced motion turns spinning into a fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page, 'vt-spinner', {});
    const name = await page.locator('#el').evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('.spinner')).animationName); // prettier-ignore
    expect(name).toBe('vt-fade');
  });
});
