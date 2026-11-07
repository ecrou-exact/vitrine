import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount } from './helpers.js';

/** @param {string} iso */
const day = (iso) => Math.round(Date.parse(iso) / 864e5);

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} attrs
 */
async function inForm(page, attrs) {
  await page.evaluate((attrs) => {
    const form = document.createElement('form');
    form.id = 'form';
    const el = document.createElement('vt-date-picker');
    el.id = 'el';
    el.setAttribute('lang-ui', 'en');
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    const submit = document.createElement('button');
    submit.id = 'submit';
    submit.textContent = 'Send';
    form.append(el, submit);
    /** @type {any} */ (window).__sent = null;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      /** @type {any} */ (window).__sent = [...new FormData(form).entries()];
    });
    document.getElementById('root')?.replaceChildren(form);
  }, attrs);
}

test.describe('<vt-date-picker>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('is required in a form, then submits the ISO date chosen with the keyboard', async ({
    page,
  }) => {
    await inForm(page, { name: 'when', label: 'Delivery', required: '', now: '2026-11-18' });
    const el = page.locator('#el');
    await page.locator('#submit').click();
    expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toBe(null);
    await expect(el.locator('.field-error')).toHaveText('Choose a date.');
    await expect(el.getByRole('textbox', { name: /Delivery/ })).toBeFocused();

    await el.getByRole('button', { name: 'Choose a date' }).click();
    await expect(el.getByRole('dialog', { name: 'Choose a date' })).toBeVisible();
    await expect(el.locator(`[data-day="${day('2026-11-18')}"]`)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(el.getByRole('dialog')).toHaveCount(0);
    await expect(el.getByRole('button', { name: 'Choose a date' })).toBeFocused();
    await expect(el.locator('input')).toHaveValue('11/26/2026');
    await page.locator('#submit').click();
    expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual([
      ['when', '2026-11-26'],
    ]);
  });

  test('reads a typed date, and says when it cannot', async ({ page }) => {
    await mount(page, 'vt-date-picker', { 'lang-ui': 'fr', label: 'Date', now: '2026-11-18' });
    const input = page.locator('#el input');
    await expect(input).toHaveAttribute('placeholder', 'jj/mm/aaaa');
    await input.fill('3/2/27');
    await input.press('Tab');
    expect(await page.locator('#el').evaluate((e) => /** @type {any} */ (e).value)).toBe('2027-02-03'); // prettier-ignore
    await expect(input).toHaveValue('03/02/2027');
    await input.fill('31/02/2027');
    await input.press('Tab');
    await expect(page.locator('#el .field-error')).toHaveText(
      'Saisissez une date comme 18/11/2026.',
    );
    await expect(input).toHaveValue('31/02/2027');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('a period: start, end, preview and the usual periods', async ({ page }) => {
    await mount(page, 'vt-date-picker', {
      'lang-ui': 'en',
      mode: 'range',
      label: 'Stay',
      now: '2026-11-18',
      'first-day': '1',
    });
    const el = page.locator('#el');
    const changes = page.evaluate(
      () =>
        new Promise((resolve) => {
          const seen = /** @type {unknown[]} */ ([]);
          document.getElementById('el')?.addEventListener('vt-change', (e) => {
            seen.push(/** @type {CustomEvent} */ (e).detail);
            if (seen.length === 2) resolve(seen);
          });
        }),
    );
    await el.getByRole('button', { name: 'Choose dates' }).click();
    await expect(el.locator('.date-grid')).toHaveCount(2);
    await el.locator(`[data-day="${day('2026-11-24')}"]`).click();
    await expect(el.locator('.date-status')).toHaveText('Now choose the end date.');
    await el.locator(`[data-day="${day('2026-11-20')}"]`).hover();
    await expect(el.locator('.date-day.preview')).toHaveCount(5);
    // An end before the start makes the period the other way round.
    await el.locator(`[data-day="${day('2026-11-20')}"]`).click();
    await expect(el.locator('.date-popup')).toHaveCount(0);
    expect(await el.evaluate((e) => /** @type {any} */ (e).value)).toBe('2026-11-20/2026-11-24');

    await el.getByRole('button', { name: 'Choose dates' }).click();
    await el.getByRole('button', { name: 'Last 7 days' }).click();
    expect(await changes).toEqual([
      { value: '2026-11-20/2026-11-24', start: '2026-11-20', end: '2026-11-24' },
      { value: '2026-11-12/2026-11-18', start: '2026-11-12', end: '2026-11-18' },
    ]);
    await el.getByRole('button', { name: 'Choose dates' }).click();
    await expect(el.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(el.locator('.date-popup')).toHaveCount(0);
  });

  test('blocked days, min and max cannot be chosen', async ({ page }) => {
    await mount(page, 'vt-date-picker', {
      'lang-ui': 'en',
      label: 'Appointment',
      now: '2026-11-18',
      min: 'today',
      max: '2026-12-31',
      'disabled-dates': 'sat sun 2026-11-19',
    });
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Choose a date' }).click();
    // Today is free; the next working day is the 20th.
    const blocked = el.locator(`[data-day="${day('2026-11-19')}"]`);
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(blocked).toHaveAccessibleName(/not available/);
    await blocked.click({ force: true });
    await expect(el.locator('.date-popup')).toHaveCount(1);
    await expect(el.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    await el.getByRole('button', { name: 'Next month' }).click();
    await expect(el.getByRole('button', { name: 'Next month' })).toBeDisabled();
    // A blocked date typed in is refused with words.
    await page.keyboard.press('Escape');
    await el.locator('input').fill('11/21/2026');
    await el.locator('input').press('Tab');
    await expect(el.locator('.field-error')).toHaveText('This date is not available.');
    await el.locator('input').fill('01/04/2027');
    await el.locator('input').press('Tab');
    await expect(el.locator('.field-error')).toHaveText('Choose Dec 31, 2026 or earlier.');
  });

  test('Page Down and Shift + Page Down move by month and year', async ({ page }) => {
    await mount(page, 'vt-date-picker', { 'lang-ui': 'en', value: '2026-01-31' });
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Choose a date' }).click();
    await page.keyboard.press('PageDown');
    await expect(el.locator(`[data-day="${day('2026-02-28')}"]`)).toBeFocused();
    await page.keyboard.press('Shift+PageDown');
    await expect(el.locator('.date-title')).toHaveText('February 2027');
    await page.keyboard.press('Home');
    await expect(el.locator(`[data-day="${day('2027-02-28')}"]`)).toBeFocused();
  });

  test('reset and disabled follow the form', async ({ page }) => {
    await inForm(page, { name: 'd', value: '2026-11-22' });
    await page.locator('#el input').fill('2026-12-01');
    await page.locator('#el input').press('Tab');
    await page.evaluate(() => /** @type {HTMLFormElement} */ (document.getElementById('form')).reset()); // prettier-ignore
    await expect(page.locator('#el input')).toHaveValue('11/22/2026');
    await page.evaluate(() => {
      const fieldset = document.createElement('fieldset');
      const form = /** @type {HTMLFormElement} */ (document.getElementById('form'));
      fieldset.append(/** @type {HTMLElement} */ (document.getElementById('el')));
      form.prepend(fieldset);
      fieldset.disabled = true;
    });
    await expect(page.locator('#el input')).toBeDisabled();
    await page.locator('#submit').click();
    expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toEqual([]);
  });
});
