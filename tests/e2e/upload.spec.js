import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors } from './helpers.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGP4z8BAEmIY1TCqYfhqAAD3Av8B4ZcUkAAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} attrs
 */
async function inForm(page, attrs) {
  await page.evaluate((attrs) => {
    const form = document.createElement('form');
    form.id = 'form';
    const el = document.createElement('vt-upload');
    el.id = 'el';
    el.setAttribute('lang-ui', 'en');
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    const submit = document.createElement('button');
    submit.id = 'submit';
    submit.textContent = 'Send';
    form.append(el, submit);
    /** @type {any} */ (window).__sent = null;
    /** @type {any} */ (window).__events = [];
    for (const type of ['vt-file-add', 'vt-file-remove', 'vt-upload-done', 'vt-upload-error'])
      el.addEventListener(type, (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        /** @type {any} */ (window).__events.push([type, detail.file.name]);
      });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      /** @type {any} */ (window).__sent = [...new FormData(form).entries()].map(([k, v]) => [
        k,
        typeof v === 'string' ? v : `file:${v.name}:${v.size}`,
      ]);
    });
    document.getElementById('root')?.replaceChildren(form);
  }, attrs);
}

/** @param {import('@playwright/test').Page} page */
const sent = (page) => page.evaluate(() => /** @type {any} */ (window).__sent);

test.describe('<vt-upload>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('is required, refuses files with reasons, and submits the files kept', async ({ page }) => {
    await inForm(page, { name: 'docs', label: 'Documents', required: '', multiple: '', 'max-files': '2', 'max-size': '1KB', accept: '.pdf,image/*' }); // prettier-ignore
    const el = page.locator('#el');
    await page.locator('#submit').click();
    expect(await sent(page)).toBe(null);
    await expect(el.locator('.field-error')).toHaveText('Add a file.');
    await expect(el.getByRole('button', { name: /Documents.*choose files/ })).toBeFocused();
    await el.locator('input[type=file]').setInputFiles([
      { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(300, 1) },
      { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('b') },
      { name: 'c.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5000, 1) },
      { name: 'd.png', mimeType: 'image/png', buffer: PNG },
      { name: 'e.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(el.locator('.upload-file')).toHaveCount(2);
    await expect(el.locator('.upload-refused li')).toHaveText([
      'b.txt was not added: this type of file is not accepted.',
      'c.pdf was not added: it is larger than 1 kB.',
      'e.png was not added: only 2 files can be added.',
    ]);
    // The image gets a thumbnail from a data: URL, which the strict CSP of the page allows.
    await expect(el.locator('img.upload-thumb')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await page.locator('#submit').click();
    expect(await sent(page)).toEqual([
      ['docs', 'file:a.pdf:300'],
      ['docs', `file:d.png:${PNG.length}`],
    ]);
    await el.getByRole('button', { name: 'Remove a.pdf' }).click();
    await expect(el.getByRole('button', { name: 'Remove d.png' })).toBeFocused();
    expect(await page.evaluate(() => /** @type {any} */ (window).__events)).toEqual([
      ['vt-file-add', 'a.pdf'],
      ['vt-file-add', 'd.png'],
      ['vt-file-remove', 'a.pdf'],
    ]);
  });

  test('one file at a time: a new one replaces it, and reset empties it', async ({ page }) => {
    await inForm(page, { name: 'avatar', label: 'Avatar' });
    const input = page.locator('#el input[type=file]');
    await input.setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: PNG });
    await input.setInputFiles({ name: 'two.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('#el .upload-name')).toHaveText(['two.png']);
    await page.evaluate(() => /** @type {HTMLFormElement} */ (document.getElementById('form')).reset()); // prettier-ignore
    await expect(page.locator('#el .upload-file')).toHaveCount(0);
  });

  test('a file dropped on the zone is added', async ({ page }) => {
    await inForm(page, { name: 'f', multiple: '' });
    const zone = page.locator('#el .upload-zone');
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['hello'], 'dropped.txt', { type: 'text/plain' }));
      return data;
    });
    await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(zone).toHaveClass(/dragging/);
    await expect(zone).toContainText('Drop to add');
    await zone.dispatchEvent('drop', { dataTransfer: transfer });
    await expect(zone).not.toHaveClass(/dragging/);
    await expect(page.locator('#el .upload-name')).toHaveText(['dropped.txt']);
  });

  test('sends files to upload-url with progress, then submits the ids answered', async ({
    page,
  }) => {
    let badTries = 0;
    await page.route('**/api/upload', async (route) => {
      const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
      if (body.includes('filename="bad.pdf"') && (badTries += 1) === 1)
        return route.fulfill({ status: 500, body: 'no' });
      const name = /filename="([^"]+)"/.exec(body)?.[1];
      return route.fulfill({ json: { id: `id-${name}` } });
    });
    await inForm(page, { name: 'docs', multiple: '', 'upload-url': '/api/upload', 'upload-field': 'upload' }); // prettier-ignore
    const el = page.locator('#el');
    await el.locator('input[type=file]').setInputFiles([
      { name: 'good.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(100, 1) },
      { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(100, 1) },
    ]);
    await expect(el.locator('.upload-file.done')).toHaveCount(1);
    await expect(el.locator('.upload-file.error')).toHaveCount(1);
    await page.locator('#submit').click();
    expect(await sent(page)).toBe(null);
    await expect(el.locator('.field-error')).toHaveText(
      'A file could not be uploaded: try again or remove it.',
    );
    await el.getByRole('button', { name: 'Try again' }).click();
    await expect(el.locator('.upload-file.done')).toHaveCount(2);
    await page.locator('#submit').click();
    expect(await sent(page)).toEqual([
      ['docs', 'id-good.pdf'],
      ['docs', 'id-bad.pdf'],
    ]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__events)).toContainEqual([
      'vt-upload-error',
      'bad.pdf',
    ]);
    // The browser logs the answer 500 of the server: that error is expected here.
    errors.splice(0, errors.length, ...errors.filter((e) => !/status of 500/.test(e)));
  });

  test('an upload-url on another origin is not used without allow-remote', async ({ page }) => {
    let called = false;
    await page.route('https://evil.example/**', (route) => {
      called = true;
      return route.fulfill({ json: {} });
    });
    await inForm(page, { name: 'f', 'upload-url': 'https://evil.example/u' });
    await page
      .locator('#el input[type=file]')
      .setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') });
    await expect(page.locator('#el .upload-file')).toHaveCount(1);
    await expect(page.locator('#el .upload-file')).not.toHaveClass(/uploading|done|error/);
    expect(called).toBe(false);
  });

  test('file names are text, never markup', async ({ page }) => {
    await inForm(page, { name: 'f', multiple: '' });
    const name = '<img src=x onerror="window.__xss=1">.txt';
    await page.locator('#el input[type=file]').setInputFiles([
      { name, mimeType: 'text/plain', buffer: Buffer.from('a') },
      { name: '<svg onload="window.__xss=2">', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    ]);
    await expect(page.locator('#el .upload-name')).toHaveText([name]);
    await expect(page.locator('#el .upload-refused li')).toContainText(['<svg onload']);
    expect(await page.locator('#el img:not(.upload-thumb), #el svg[onload]').count()).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });

  for (const theme of ['light', 'dark']) {
    test(`files, refused files and progress are accessible, ${theme} theme`, async ({ page }) => {
      await page.route('**/api/slow', () => {});
      await inForm(page, { name: 'f', label: 'Files', multiple: '', theme, 'max-size': '1KB', 'upload-url': '/api/slow' }); // prettier-ignore
      await page.locator('#el input[type=file]').setInputFiles([
        { name: 'a.png', mimeType: 'image/png', buffer: PNG },
        { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5000, 1) },
      ]);
      await expect(page.locator('#el [role="progressbar"]')).toHaveCount(1);
      const results = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
});
