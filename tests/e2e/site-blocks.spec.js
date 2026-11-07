import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount } from './helpers.js';

const FAQ = JSON.stringify([
  { question: 'Is there a free plan?', answer: 'Yes, **forever**.', category: 'Billing' },
  { question: 'Where is my data?', answer: 'In the EU.', category: 'Security', id: 'data' },
  { question: 'Can I export?', answer: 'Yes, as JSON.', category: 'Security' },
]);
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.describe('site blocks', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('<vt-faq> opens, filters and follows the address', async ({ page }) => {
    await mount(page, 'vt-faq', { 'lang-ui': 'en' }, FAQ);
    const el = page.locator('#el');
    const first = el.getByRole('button', { name: 'Is there a free plan?' });
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(el.locator('.faq-answer')).toContainText('forever');
    await el.getByRole('button', { name: 'Security' }).click();
    await expect(el.locator('.faq-question')).toHaveCount(2);
    await page.evaluate(() => {
      location.hash = 'data';
    });
    await expect(el.getByRole('button', { name: 'Where is my data?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('<vt-gallery> opens a viewer that moves with the keyboard and gives the focus back', async ({
    page,
  }) => {
    await mount(
      page,
      'vt-gallery',
      { 'lang-ui': 'en' },
      JSON.stringify([PNG, { src: PNG, alt: 'Second' }, PNG]),
    );
    const el = page.locator('#el');
    await el.locator('.gallery-open').nth(1).click();
    const viewer = el.locator('dialog[open]');
    await expect(viewer).toContainText('2 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(el.locator('dialog[open]')).toContainText('3 of 3');
    await page.keyboard.press('Escape');
    await expect(el.locator('dialog[open]')).toHaveCount(0);
    // The focus comes back on the dialog's close event, just after it loses its open attribute.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.getElementById('el')?.shadowRoot?.activeElement?.getAttribute('data-focus-key'),
        ),
      )
      .toBe('image-2');
  });

  test('<vt-stats> writes changes in words and reads the history', async ({ page }) => {
    await mount(
      page,
      'vt-stats',
      { 'lang-ui': 'en' },
      JSON.stringify([
        {
          label: 'Visitors',
          value: 120,
          previous: 100,
          series: [
            { label: 'Jan', value: 80 },
            { label: 'Feb', value: 120 },
          ],
        },
      ]),
    );
    const el = page.locator('#el');
    await expect(el.locator('.stats-change')).toHaveText('Up 20%');
    const trend = el.getByRole('slider', { name: 'History of Visitors' });
    await trend.focus();
    await page.keyboard.press('Home');
    await expect(trend).toHaveAttribute('aria-valuetext', 'Jan: 80');
  });

  test('<vt-testimonials> carousel moves with its buttons', async ({ page }) => {
    await mount(
      page,
      'vt-testimonials',
      { layout: 'carousel', 'lang-ui': 'en' },
      JSON.stringify([
        { quote: 'One', author: 'A', rating: 5 },
        { quote: 'Two', author: 'B', rating: 4 },
      ]),
    );
    const el = page.locator('#el');
    await expect(el.locator('.testimonials-summary')).toContainText('4.5 out of 5, from 2 reviews');
    await expect(el.locator('blockquote')).toHaveText('One');
    await el.getByRole('button', { name: 'Next testimonial' }).click();
    await expect(el.locator('blockquote')).toHaveText('Two');
  });

  test('<vt-countdown> counts down and ends', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
    await page.goto(STRICT);
    await mount(
      page,
      'vt-countdown',
      { 'lang-ui': 'en' },
      JSON.stringify({ to: '2026-11-07T12:00:05Z', title: 'Go' }),
    );
    const el = page.locator('#el');
    await expect(el.locator('.countdown-value').last()).toHaveText(/^[45]$/);
    await page.evaluate(() => {
      /** @type {any} */ (window).__ended = false;
      document.getElementById('el')?.addEventListener('vt-countdown-end', () => {
        /** @type {any} */ (window).__ended = true;
      });
    });
    await page.clock.runFor(6000);
    await expect(el.locator('.countdown-ended')).toBeVisible();
    expect(await page.evaluate(() => /** @type {any} */ (window).__ended)).toBe(true);
  });
});

test.describe('JSON as input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STRICT);
  });

  test('json-src with json-path feeds any element, under the same rules as src', async ({
    page,
  }) => {
    await page.route('**/api/snippet.json', (route) =>
      route.fulfill({
        body: JSON.stringify({ data: { code: 'print("hi")', language: 'python' } }),
        contentType: 'application/json',
      }),
    );
    const { event } = await mount(page, 'vt-code', {
      'json-src': '/api/snippet.json',
      'json-path': 'data',
    });
    expect(event).toBe('vt-ready');
    await expect(page.locator('#el .hljs-built_in, #el [class*="hljs-"]').first()).toBeVisible();
    const blocked = await mount(page, 'vt-code', {
      'json-src': 'https://elsewhere.example/x.json',
    });
    expect(blocked.event).toBe('vt-error');
  });

  test('a JSON script inside the element is read and never shown as text', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-terminal');
      el.id = 'el';
      // Pages with Trusted Types cannot write a script from JavaScript: a template works too.
      const template = document.createElement('template');
      template.dataset.json = '';
      template.content.append(JSON.stringify([{ command: 'npm test', output: 'ok' }]));
      el.append(template);
      document.getElementById('root')?.replaceChildren(el);
    });
    await expect(page.locator('#el')).toContainText('npm test');
    await expect(page.locator('#el')).not.toContainText('"command"');
  });

  test('Vitrine.render() takes data', async ({ page }) => {
    await page.evaluate(() => {
      /** @type {any} */ (window).Vitrine.render(document.getElementById('root'), {
        type: 'env',
        data: { PORT: 8080, API_KEY: 'secret' },
      });
    });
    await expect(page.locator('#root vt-env')).toContainText('PORT');
  });
});
