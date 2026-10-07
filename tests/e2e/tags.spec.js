import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, recordEvents } from './helpers.js';

const OPTIONS = JSON.stringify({
  value: ['design'],
  options: [
    { value: 'design', group: 'Product', count: 8 },
    { value: 'research', group: 'Product' },
    { value: 'a11y', label: 'accessibility', group: 'Quality' },
    { value: 'security', group: 'Quality', disabled: true },
  ],
});

/** Mounts a vt-tags element inside a form. */
async function mountTags(page, attrs, content = OPTIONS) {
  await page.evaluate(
    ({ attrs, content }) => {
      const form = document.createElement('form');
      form.id = 'form';
      const el = document.createElement('vt-tags');
      el.id = 'el';
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      el.content = content;
      form.append(el);
      document.getElementById('root').replaceChildren(form);
    },
    { attrs, content },
  );
  await page.locator('#el .tags-body').waitFor();
}

const formValue = (page) =>
  page.evaluate(() => new FormData(document.getElementById('form')).get('topics'));

test.describe('<vt-tags>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('view mode shows chips with counts, colors and per-tag parts', async ({ page }) => {
    await mountTags(
      page,
      { counts: '' },
      JSON.stringify([{ value: 'urgent', color: '#e5484d', count: 3, kind: 'danger' }, 'plain']),
    );
    const tags = page.locator('#el [part~="tag"]');
    await expect(tags).toHaveCount(2);
    await expect(tags.first()).toHaveAttribute('part', 'tag tag-urgent tag-kind-danger');
    await expect(page.locator('#el [part="tag-count"]')).toHaveText('3');
    await expect(page.locator('#el textarea, #el input')).toHaveCount(0);
  });

  test('autocomplete: Enter picks the best match', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics' });
    const input = page.locator('#el').getByRole('combobox');
    await input.click();
    await page.keyboard.type('res');
    await expect(page.locator('#el [role="option"]').first()).toHaveAttribute(
      'part',
      'option option-active',
    );
    await page.keyboard.press('Enter');
    expect(await formValue(page)).toBe('["design","research"]');
  });

  test('labels are searched too, and Create is offered last', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics' });
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.type('access');
    const options = page.locator('#el [role="option"]');
    await expect(options.first()).toContainText('accessibility');
    await page.keyboard.press('Enter');
    expect(await formValue(page)).toBe('["design","a11y"]');
    await page.keyboard.type('brand-new');
    await expect(options.last()).toContainText('Create "brand-new"');
  });

  test('separators and a prefix create tags', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics', prefix: '#' }, '[]');
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.type('#alpha #beta,gamma;');
    expect(await formValue(page)).toBe('["alpha","beta","gamma"]');
  });

  test('pasted lists create tags', async ({ page, browserName }) => {
    // Firefox does not let scripts build a ClipboardEvent with clipboard data.
    test.skip(browserName === 'firefox', 'Synthetic paste events carry no data in Firefox.');
    await mountTags(page, { mode: 'edit', name: 'topics', prefix: '#' }, '[]');
    const input = page.locator('#el').getByRole('combobox');
    await input.click();
    await page.keyboard.type('#alpha #beta,');
    await page.evaluate(() => {
      const field = document.getElementById('el').shadowRoot.querySelector('input');
      const data = new DataTransfer();
      data.setData('text/plain', '#gamma, #delta\n#alpha');
      field.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    expect(await formValue(page)).toBe('["alpha","beta","gamma","delta"]');
  });

  test('Backspace twice removes the last tag', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics' });
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.press('Backspace');
    await expect(page.locator('#el .tag.armed')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    expect(await formValue(page)).toBe('[]');
  });

  test('limits: max-tags, maxlength, pattern, disabled options, allow-create="false"', async ({
    page,
  }) => {
    await mountTags(
      page,
      { mode: 'edit', name: 'topics', 'max-tags': '2', maxlength: '5', pattern: '[a-z]+' },
      '[]',
    );
    const input = page.locator('#el').getByRole('combobox');
    await input.click();
    await page.keyboard.type('toolong,');
    await expect(page.locator('#el .tags-message')).toHaveText('toolong is too long.');
    await page.keyboard.type('a1,');
    await expect(page.locator('#el .tags-message')).toHaveText('a1 is not a valid tag.');
    await page.keyboard.type('one,two,three,');
    expect(await formValue(page)).toBe('["one","two"]');
    // Once full, the field is read-only and says why.
    await expect(input).toHaveAttribute('readonly', '');
    await expect(page.locator('#el [part="tags-status"]')).toContainText('2 / 2 tags');

    await mountTags(page, { mode: 'edit', name: 'topics', 'allow-create': 'false' });
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.type('unknown,');
    await expect(page.locator('#el .tags-message')).toHaveText('unknown is not in the list.');
    await page.keyboard.type('secu');
    await expect(page.locator('#el [role="option"]').first()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('vt-tag-create can refuse a tag, events describe each change', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics' }, '[]');
    await page.evaluate(() =>
      document.getElementById('el').addEventListener('vt-tag-create', (event) => {
        if (event.detail.tag.value === 'nope') event.preventDefault();
      }),
    );
    await recordEvents(page, ['vt-change']);
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.type('nope,yes,');
    expect(await formValue(page)).toBe('["yes"]');
    const changes = await events(page);
    expect(changes).toEqual([
      {
        type: 'vt-change',
        detail: { value: ['yes'], added: [{ value: 'yes', label: 'yes' }], removed: [] },
      },
    ]);
  });

  test('form integration: required, reset, value-format', async ({ page }) => {
    await mountTags(
      page,
      { mode: 'edit', name: 'topics', required: '', 'value-format': 'csv' },
      '["a,b"]',
    );
    expect(await formValue(page)).toBe('"a,b"');
    await page
      .locator('#el')
      .getByRole('button', { name: /Remove a,b/ })
      .click();
    expect(await page.evaluate(() => document.getElementById('form').checkValidity())).toBe(false);
    await page.evaluate(() => document.getElementById('form').reset());
    expect(await formValue(page)).toBe('"a,b"');
  });

  test('browse panel lists every option with checkboxes', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics', variant: 'full' });
    await page.locator('#el').getByRole('button', { name: 'Browse all tags' }).click();
    const panel = page.locator('#el [part="browse-panel"]');
    await expect(panel.getByRole('group', { name: 'Product' })).toBeVisible();
    await panel.getByLabel('accessibility').check();
    expect(await formValue(page)).toBe('["design","a11y"]');
    await panel.getByRole('searchbox').fill('res');
    await expect(panel.locator('.browse-option')).toHaveCount(1);
  });

  test('suggest property asks a backend', async ({ page }) => {
    await mountTags(page, { mode: 'edit', name: 'topics' }, '[]');
    await page.evaluate(() => {
      document.getElementById('el').suggest = async (query) => [`${query}-from-api`];
    });
    await page.locator('#el').getByRole('combobox').click();
    await page.keyboard.type('zed');
    await expect(page.locator('#el [role="option"]', { hasText: 'zed-from-api' })).toBeVisible();
  });
});
