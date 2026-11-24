import { expect, test } from '@playwright/test';
import { collectErrors, events, mount, recordEvents, STRICT } from './helpers.js';

test.describe('<vt-cookies>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  const HEADERS = [
    'HTTP/2 200',
    'content-type: text/html',
    'Set-Cookie: __Host-sid=f3a9c1e07b2d; Path=/; Secure; HttpOnly; SameSite=Lax',
    'Set-Cookie: track=1; SameSite=None',
    'Set-Cookie: _ga=GA1.2.3; Domain=example.com; Max-Age=63072000; Secure; SameSite=Lax',
  ].join('\n');

  test('lists the cookies with their flags, lifetime and issues', async ({ page }) => {
    await mount(page, 'vt-cookies', { variant: 'full', url: 'https://shop.example.com/' }, HEADERS);
    const el = page.locator('#el');
    await expect(el.locator('[part~="cookie"]')).toHaveCount(3);
    await expect(el.locator('[part~="summary"]')).toContainText('3 cookies');
    const track = el.locator('[part~="cookie"]', { hasText: 'track' });
    await expect(track).toContainText('no Secure');
    await expect(track).toContainText('Session');
    await expect(el.locator('[part~="issue"]').first()).toContainText(
      'SameSite=None requires Secure',
    );
    await expect(el.locator('[part~="cookie"]', { hasText: '_ga' })).toContainText('in 2 years');
  });

  test('masks values until revealed, and copies the real ones', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName === 'webkit', 'Clipboard permissions are not grantable in WebKit.');
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-cookies', { variant: 'full', url: 'https://shop.example.com/' }, HEADERS);
    await recordEvents(page, ['vt-copy']);
    const el = page.locator('#el');
    await expect(el.locator('[part~="cookies"]')).not.toContainText('f3a9c1e07b2d');
    await expect(el.locator('[part~="cookies"]')).toContainText('••••••••7b2d');
    await el.getByRole('button', { name: 'Show values' }).click();
    await expect(el.locator('[part~="cookies"]')).toContainText('f3a9c1e07b2d');
    await el.getByRole('button', { name: 'Copy as a Cookie header' }).click();
    await expect
      .poll(async () => (await events(page)).map((e) => e.detail.text))
      .toEqual(['__Host-sid=f3a9c1e07b2d; track=1; _ga=GA1.2.3']);
  });

  test('keeps only the cookies with issues', async ({ page }) => {
    await mount(page, 'vt-cookies', { variant: 'full', url: 'https://shop.example.com/' }, HEADERS);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Show cookies with issues only' }).click();
    // track: SameSite=None without Secure; _ga: kept two years, over the 400-day cap.
    await expect(el.locator('[part~="cookie"]')).toHaveCount(2);
    await expect(el.locator('[part~="cookie"]', { hasText: '__Host-sid' })).toHaveCount(0);
  });

  test('marks third-party cookies of a HAR file', async ({ page }) => {
    const har = JSON.stringify({
      log: {
        entries: [
          { request: { url: 'https://www.example.com/' }, response: { headers: [{ name: 'Set-Cookie', value: 'a=1; Secure; HttpOnly; SameSite=Lax' }] } },
          { request: { url: 'https://ads.example.net/p' }, response: { headers: [{ name: 'Set-Cookie', value: 'uid=2; Max-Age=63072000; Secure; SameSite=None' }] } },
        ],
      },
    }); // prettier-ignore
    await mount(page, 'vt-cookies', { variant: 'full' }, har);
    const el = page.locator('#el');
    await expect(el.locator('[part~="cookie"]', { hasText: 'uid' }).locator('[part~="party"]')).toHaveText('Third'); // prettier-ignore
    await expect(el.locator('[part~="cookie"]', { hasText: 'uid' })).toContainText('Set by https://ads.example.net/p'); // prettier-ignore
  });

  test('explains what it cannot read', async ({ page }) => {
    await mount(page, 'vt-cookies', {}, 'hello world');
    await expect(page.locator('#el [part~="notice"]')).toContainText('No cookie found');
  });
});

test.describe('<vt-redirects>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('shows each hop, how it redirects and what changes', async ({ page }) => {
    await mount(
      page,
      'vt-redirects',
      { variant: 'full' },
      '301 http://example.com/\n302 https://example.com/\n302 https://go.example.net/?utm_source=mail\n302 http://shop.example.org/\n200 https://shop.example.org/home',
    );
    const el = page.locator('#el');
    await expect(el.locator('[part~="hop"]')).toHaveCount(5);
    await expect(el.locator('[part~="summary"]')).toContainText('4 redirects');
    await expect(el.locator('[part~="summary"]')).toContainText('https://shop.example.org/home');
    const steps = el.locator('[part~="step"]');
    await expect(steps.nth(0)).toContainText('permanent');
    await expect(steps.nth(0)).toContainText('HTTP → HTTPS');
    await expect(steps.nth(1)).toContainText('other site');
    await expect(steps.nth(1)).toContainText('utm_source (tracking)');
    await expect(steps.nth(2)).toContainText('HTTPS → HTTP');
    await expect(el.locator('[part~="issues"]')).toContainText('leaves HTTPS');
  });

  test('never turns a URL into a link, and copies the final URL', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName === 'webkit', 'Clipboard permissions are not grantable in WebKit.');
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-redirects', { variant: 'full' }, '302 https://a.example/ -> javascript:alert(1) (js) -> 200 https://b.example/'); // prettier-ignore
    await recordEvents(page, ['vt-copy']);
    const el = page.locator('#el');
    await expect(el.locator('a')).toHaveCount(0);
    await el.getByRole('button', { name: 'Copy the final URL' }).click();
    await expect.poll(async () => (await events(page)).map((e) => e.detail.text)).toEqual(['https://b.example/']); // prettier-ignore
  });

  test('reports a loop', async ({ page }) => {
    await mount(page, 'vt-redirects', { variant: 'full' }, '302 https://a.example/\n302 https://b.example/\n302 https://a.example/'); // prettier-ignore
    await expect(page.locator('#el [part~="issues"]')).toContainText('The chain loops');
  });

  test('explains what it cannot read', async ({ page }) => {
    await mount(page, 'vt-redirects', {}, 'no URL here');
    await expect(page.locator('#el [part~="notice"]')).toContainText('No redirect chain found');
  });
});
