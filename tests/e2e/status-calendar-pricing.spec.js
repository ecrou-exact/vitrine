import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount } from './helpers.js';

const NOW = '2026-11-05T12:00:00Z';

const STATUS = JSON.stringify({
  components: [
    {
      name: 'API',
      status: 'degraded',
      since: '2026-10-01',
      history: { '2026-11-02': { status: 'major', minutes: 42 } },
    },
    { name: 'Web', status: 'operational', url: 'javascript:alert(1)' },
  ],
  incidents: [
    { title: 'Slow API', status: 'identified', impact: 'minor', start: '2026-11-05T10:00:00Z' },
    { title: 'Old one', status: 'resolved', impact: 'major', start: '2026-10-01T10:00:00Z' },
    { title: 'Older', status: 'resolved', impact: 'major', start: '2026-09-01T10:00:00Z' },
  ],
});

const CALENDAR = JSON.stringify([
  { uid: 'p', title: 'Planning', start: '2026-11-02T09:00:00Z', rrule: 'FREQ=WEEKLY;COUNT=3' },
  { uid: 'l', title: 'Launch', start: '2026-11-12T14:00:00Z', url: 'https://example.com/l' },
  { uid: 'h', title: 'Holiday', start: '2026-12-25' },
]);

const PRICING = JSON.stringify({
  currencies: ['EUR', 'USD'],
  plans: [
    { id: 'free', name: 'Free', price: 0 },
    {
      id: 'pro',
      name: 'Pro',
      highlight: true,
      price: { monthly: { EUR: 12, USD: 14 }, yearly: { EUR: 120, USD: 140 } },
      cta: { label: 'Try Pro', url: '#buy' },
    },
    { id: 'bad', name: 'Bad', price: 1, cta: { label: 'Go', url: 'javascript:alert(1)' } },
  ],
  compare: [{ name: 'SSO', values: { pro: true } }],
});

/**
 * Records one event of the element in `window.__events`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
const record = (page, name) =>
  page.evaluate((name) => {
    /** @type {any} */ (window).__events = [];
    document.getElementById('el')?.addEventListener(name, (event) => {
      /** @type {any} */ (window).__events.push(/** @type {CustomEvent} */ (event).detail);
    });
  }, name);

/** @param {import('@playwright/test').Page} page */
const recorded = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('new elements', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('<vt-status> shows the state, the days and the incidents', async ({ page }) => {
    await mount(page, 'vt-status', { now: NOW, days: '10', 'max-incidents': '1' }, STATUS);
    const el = page.locator('#el');
    await expect(el.locator('.status-banner')).toContainText('Degraded performance');
    await expect(el.locator('.status-days').first().locator('.status-day')).toHaveCount(10);
    await expect(el.locator('.status-incident')).toHaveCount(2);
    await el.getByRole('button', { name: 'Show all 2 incidents' }).click();
    await expect(el.locator('.status-incident')).toHaveCount(3);
    // An unsafe link becomes plain text.
    await expect(el.locator('.status-name a')).toHaveCount(0);
  });

  test('<vt-status> days are read with the keyboard', async ({ page }) => {
    await mount(page, 'vt-status', { now: NOW, days: '10', 'lang-ui': 'en' }, STATUS);
    const days = page.locator('#el .status-days').first();
    await days.focus();
    await expect(days).toHaveAttribute('aria-valuenow', '9');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(days).toHaveAttribute('aria-valuetext', /Major outage.*42 min/);
    await page.keyboard.press('Home');
    await expect(days).toHaveAttribute('aria-valuenow', '0');
  });

  test('<vt-status> tells when the state changes', async ({ page }) => {
    await mount(page, 'vt-status', { now: NOW }, STATUS);
    await record(page, 'vt-status-change');
    await page.evaluate(() => {
      /** @type {any} */ (document.getElementById('el')).content =
        '{"components":[{"name":"API","status":"down"}]}';
    });
    await expect.poll(() => recorded(page)).toEqual([{ status: 'major', previous: 'degraded' }]);
  });

  test('<vt-status> refresh keeps the last status when loading fails', async ({ page }) => {
    let fail = false;
    await page.route('**/status.json', (route) =>
      fail ? route.fulfill({ status: 500 }) : route.fulfill({ body: STATUS }),
    );
    await mount(page, 'vt-status', { now: NOW, src: '/status.json' });
    await expect(page.locator('#el .status-banner')).toContainText('Degraded');
    fail = true;
    await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).refresh());
    await expect(page.locator('#el .notice')).toContainText('could not be refreshed');
    await expect(page.locator('#el .status-banner')).toContainText('Degraded');
    errors.length = 0; // The browser logs the failed request.
  });

  test('<vt-calendar> moves through the month and opens events', async ({ page }) => {
    await mount(
      page,
      'vt-calendar',
      { now: NOW, timezone: 'UTC', 'lang-ui': 'en', 'first-day': '1' },
      CALENDAR,
    );
    const el = page.locator('#el');
    await expect(el.locator('.calendar-period')).toHaveText('November 2026');
    await expect(el.locator('.calendar-chip', { hasText: 'Planning' })).toHaveCount(3);
    await record(page, 'vt-event-select');
    await el.locator('.calendar-chip', { hasText: 'Launch' }).click();
    await expect(el.locator('.calendar-details')).toContainText('Add to calendar');
    await expect(el.locator('.calendar-link')).toHaveAttribute('href', 'https://example.com/l');
    expect((await recorded(page))[0]).toMatchObject({
      uid: 'l',
      start: '2026-11-12T14:00:00.000Z',
    });
    await el.getByRole('button', { name: 'Next month' }).click();
    await expect(el.locator('.calendar-period')).toHaveText('December 2026');
    await expect(el.locator('.calendar-chip.all-day')).toHaveText('Holiday');
  });

  test('<vt-calendar> grid works with the keyboard', async ({ page }) => {
    await mount(page, 'vt-calendar', { now: NOW, timezone: 'UTC', 'lang-ui': 'en' }, CALENDAR);
    const el = page.locator('#el');
    await el.locator('[aria-current="date"]').focus();
    await page.keyboard.press('ArrowDown');
    const focused = () =>
      page.evaluate(() =>
        document.getElementById('el')?.shadowRoot?.activeElement?.getAttribute('aria-label'),
      );
    expect(await focused()).toContain('November 12, 2026');
    await page.keyboard.press('Enter');
    await expect(el.locator('.calendar-day-title')).toContainText('November 12, 2026');
    expect(await focused()).toContain('November 12, 2026');
    await page.keyboard.press('PageDown');
    await expect(el.locator('.calendar-period')).toHaveText('December 2026');
    expect(await focused()).toContain('December 12, 2026');
  });

  test('<vt-calendar> agenda and tabs, and iCalendar', async ({ page }) => {
    const ics =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:From ICS\r\nDTSTART:20261110T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    await mount(
      page,
      'vt-calendar',
      { now: NOW, timezone: 'UTC', variant: 'full', 'lang-ui': 'en' },
      ics,
    );
    const el = page.locator('#el');
    await expect(el.locator('.badge')).toHaveText('ICS');
    await el.getByRole('tab', { name: 'Agenda' }).click();
    await expect(el.locator('.calendar-event-title')).toHaveText('From ICS');
    await expect(el.locator('.calendar-period')).toContainText('From November 5, 2026');
  });

  test('<vt-pricing> switches period and currency', async ({ page }) => {
    await mount(page, 'vt-pricing', { 'lang-ui': 'en' }, PRICING);
    const el = page.locator('#el');
    const pro = el.locator('.pricing-plan.highlight');
    await expect(pro.locator('.pricing-amount')).toHaveText('€12');
    await record(page, 'vt-pricing-change');
    await el.getByRole('radio', { name: 'Yearly' }).check();
    await expect(pro.locator('.pricing-amount')).toHaveText('€10');
    await expect(pro).toContainText('€120 billed yearly');
    await expect(pro).toContainText('Save 17%');
    await el.getByRole('combobox').selectOption('USD');
    await expect(pro).toContainText('$140 billed yearly');
    expect(await recorded(page)).toEqual([
      { period: 'yearly', currency: 'EUR' },
      { period: 'yearly', currency: 'USD' },
    ]);
    // Radio focus survives the render, so arrows keep working.
    await el.getByRole('radio', { name: 'Yearly' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(pro.locator('.pricing-amount')).toHaveText('$14');
  });

  test('<vt-pricing> button events can stop the link', async ({ page }) => {
    await mount(page, 'vt-pricing', { 'lang-ui': 'en' }, PRICING);
    await page.evaluate(() => {
      document.getElementById('el')?.addEventListener('vt-plan-select', (event) => {
        /** @type {any} */ (window).__plan = /** @type {CustomEvent} */ (event).detail;
        event.preventDefault();
      });
    });
    const el = page.locator('#el');
    await el.getByRole('link', { name: 'Try Pro' }).click();
    expect(await page.evaluate(() => /** @type {any} */ (window).__plan)).toMatchObject({
      plan: 'pro',
      period: 'monthly',
      currency: 'EUR',
      amount: 12,
    });
    expect(new URL(page.url()).hash).toBe('');
    // An unsafe link becomes a plain button.
    await expect(el.getByRole('button', { name: 'Go' })).toBeVisible();
    await expect(el.locator('a[href^="javascript"]')).toHaveCount(0);
  });

  test('a line too long to highlight is shown plain, and quickly', async ({ page }) => {
    const started = Date.now();
    await mount(page, 'vt-code', { language: 'markdown' }, '['.repeat(200000));
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(page.locator('#el [class*="hljs-"]')).toHaveCount(0);
    await mount(page, 'vt-code', { language: 'json' }, '{"a": 1}');
    await expect(page.locator('#el [class*="hljs-"]').first()).toBeVisible();
  });

  test('<vt-yaml> is ready after loading its library, and refuses alias bombs', async ({
    page,
  }) => {
    const { event } = await mount(page, 'vt-yaml', {}, 'a: 1');
    expect(event).toBe('vt-ready');
    let source = 'a0: &a0 [x, x, x, x, x, x, x, x, x]\n';
    for (let i = 1; i < 12; i += 1) {
      const alias = `*a${i - 1}`;
      source += `a${i}: &a${i} [${Array(9).fill(alias).join(', ')}]\n`;
    }
    await mount(page, 'vt-yaml', {}, source);
    await expect(page.locator('#el')).toContainText('expand to too much');
  });

  test('<vt-regex> asks before running what could freeze the page', async ({ page }) => {
    await mount(page, 'vt-regex', { pattern: '(a|aa)+$' }, `${'a'.repeat(60)}!`);
    await expect(page.locator('#el .notice').first()).toBeVisible();
  });

  test('<vt-job> and <vt-timeline> survive hostile values', async ({ page }) => {
    await mount(
      page,
      'vt-job',
      {},
      '{"name":"deploy","status":"__proto__","steps":[{"name":"build","status":"constructor"}]}',
    );
    await expect(page.locator('#el')).toContainText('build');
    await mount(page, 'vt-timeline', {}, '[{"title":"far away","date":1e30}]');
    await expect(page.locator('#el')).toContainText('far away');
  });

  for (const [tag, content] of [
    ['vt-status', STATUS],
    ['vt-calendar', CALENDAR],
    ['vt-pricing', PRICING],
  ]) {
    test(`<${tag}> reports text it cannot read, and edits update the preview`, async ({ page }) => {
      await mount(page, tag, {}, '{not json');
      await expect(page.locator('#el .notice')).toBeVisible();
      await mount(page, tag, { mode: 'edit' }, content);
      await expect(page.locator('#el .editor-input')).toBeVisible();
      await page.locator('#el .editor-input').fill('{not json');
      await expect(page.locator('#el .notice')).toBeVisible();
    });
  }
});
