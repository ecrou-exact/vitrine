import { expect, test } from '@playwright/test';
import { STRICT, collectErrors } from './helpers.js';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ tag: string, attrs?: Record<string, string>, data?: unknown, inForm?: boolean }} options
 */
async function place(page, { tag, attrs = {}, data, inForm = false }) {
  await page.evaluate(
    ({ tag, attrs, data, inForm }) => {
      const el = document.createElement(tag);
      el.id = 'el';
      el.setAttribute('lang-ui', 'en');
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      if (data !== undefined) /** @type {any} */ (el).data = data;
      if (!inForm) {
        document.getElementById('root')?.replaceChildren(el);
        return;
      }
      const form = document.createElement('form');
      form.id = 'form';
      form.append(el);
      const submit = document.createElement('button');
      submit.id = 'submit';
      submit.textContent = 'Send';
      form.append(submit);
      /** @type {any} */ (window).__sent = null;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        /** @type {any} */ (window).__sent = [...new FormData(form).entries()];
      });
      document.getElementById('root')?.replaceChildren(form);
    },
    { tag, attrs, data, inForm },
  );
  await page.locator('#el').evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

const sent = (/** @type {import('@playwright/test').Page} */ page) =>
  page.evaluate(() => /** @type {any} */ (window).__sent);

test.describe('<vt-field>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('blocks the form while invalid, shows why, then submits its value', async ({ page }) => {
    await place(page, { tag: 'vt-field', inForm: true, data: { type: 'email', name: 'email', label: 'Email', required: true, hint: 'We never share it.' } }); // prettier-ignore
    const input = page.locator('#el input');
    await expect(page.locator('#el label')).toContainText('Email');
    await page.locator('#submit').click();
    expect(await sent(page)).toBeNull();
    await expect(page.locator('#el .field-error')).toHaveText('This field is required.');
    await expect(input).toBeFocused();
    await input.fill('ada');
    await input.blur();
    await expect(page.locator('#el .field-error')).toContainText('email address');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.fill('ada@example.com');
    await page.locator('#submit').click();
    expect(await sent(page)).toEqual([['email', 'ada@example.com']]);
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('the help button shows and hides the tip', async ({ page }) => {
    await place(page, {
      tag: 'vt-field',
      data: { label: 'VAT number', tip: 'Found on your invoices.' },
    });
    const help = page.locator('#el').getByRole('button', { name: 'Help: VAT number' });
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await help.click();
    await expect(page.locator('#el .field-tip')).toContainText('Found on your invoices.');
    await page.keyboard.press('Escape');
    await expect(page.locator('#el .field-tip')).toHaveCount(0);
    await expect(help).toBeFocused();
  });

  test('a list with search, groups and several choices works with the keyboard', async ({
    page,
  }) => {
    const options = [
      { group: 'Europe', options: ['France', 'Germany', 'Luxembourg'] },
      { group: 'Asia', options: ['Japan'] },
    ];
    await place(page, { tag: 'vt-field', inForm: true, attrs: { searchable: '' }, data: { type: 'multiselect', name: 'countries', label: 'Countries', options } }); // prettier-ignore
    await page.locator('#el .field-trigger').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#el [role="listbox"]')).toBeVisible();
    await page.keyboard.type('lux');
    await expect(page.locator('#el [role="option"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('jap');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('#el .field-trigger')).toBeFocused();
    await expect(page.locator('#el .field-chip')).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await expect(page.locator('#el .field-chip')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('jap');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.locator('#submit').click();
    expect(await sent(page)).toEqual([
      ['countries', 'Luxembourg'],
      ['countries', 'Japan'],
    ]);
    await page.locator('#el').getByRole('button', { name: 'Remove Japan' }).click();
    await expect(page.locator('#el .field-chip')).toHaveCount(1);
  });

  test('a counter is read near the limit, and the form reset restores the value', async ({
    page,
  }) => {
    await place(page, { tag: 'vt-field', inForm: true, attrs: { value: 'Hi' }, data: { type: 'textarea', name: 'note', label: 'Note', maxLength: 10 } }); // prettier-ignore
    await expect(page.locator('#el .field-counter')).toHaveText('2 / 10');
    await page.locator('#el textarea').fill('Hello you');
    await expect(page.locator('#el .field-counter')).toHaveText('9 / 10');
    await expect(page.locator('#el .field-counter')).toHaveAttribute('aria-live', 'polite');
    await page.evaluate(() =>
      /** @type {HTMLFormElement} */ (document.getElementById('form')).reset(),
    );
    await expect(page.locator('#el textarea')).toHaveValue('Hi');
  });

  test('radio buttons and a switch submit like native ones', async ({ page }) => {
    await place(page, { tag: 'vt-field', inForm: true, data: { type: 'radio', name: 'plan', label: 'Plan', required: true, options: ['free', 'pro'] } }); // prettier-ignore
    await page.locator('#submit').click();
    expect(await sent(page)).toBeNull();
    await page.locator('#el').getByLabel('pro').check();
    await page.locator('#submit').click();
    expect(await sent(page)).toEqual([['plan', 'pro']]);
  });
});

const BOARD = {
  columns: [{ id: 'todo' }, { id: 'in-progress', limit: 1 }, { id: 'done' }],
  tasks: [
    { id: 'a', title: 'Alpha', column: 'todo', labels: ['ui'] },
    { id: 'b', title: 'Beta', column: 'todo', priority: 'urgent' },
    { id: 'c', title: 'Gamma', column: 'in-progress', due: '2026-01-01' },
  ],
};

test.describe('<vt-board>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  const columnsOf = (/** @type {import('@playwright/test').Page} */ page) =>
    page.evaluate(() =>
      /** @type {any} */ (document.getElementById('el')).board.tasks.map(
        (t) => `${t.id}:${t.column}`,
      ),
    );

  test('drags a card to another column with the mouse', async ({ page }) => {
    await place(page, { tag: 'vt-board', data: BOARD, attrs: { now: '2026-11-07T12:00:00Z' } });
    const card = await page.locator('#el [data-task="a"]').boundingBox();
    const target = await page.locator('#el [data-list="done"]').boundingBox();
    if (!card || !target) throw new Error('no boxes');
    await page.mouse.move(card.x + 30, card.y + 12);
    await page.mouse.down();
    await page.mouse.move(card.x + 60, card.y + 40, { steps: 5 });
    await page.mouse.move(target.x + 30, target.y + 5, { steps: 10 });
    await page.mouse.up();
    expect(await columnsOf(page)).toContain('a:done');
    await expect(page.locator('#el [data-list="done"] [data-task="a"]')).toHaveCount(1);
  });

  test('moves a card with the keyboard, and Escape puts it back', async ({ page }) => {
    await place(page, { tag: 'vt-board', data: BOARD });
    await page.locator('#el [data-task="b"] .board-open').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    expect(await columnsOf(page)).toContain('b:todo');
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    expect(await columnsOf(page)).toEqual(['a:todo', 'b:in-progress', 'c:in-progress']);
    await expect(page.locator('#el .board-count.over')).toHaveText('2 of 1');
  });

  test('a listener can refuse a move', async ({ page }) => {
    await place(page, { tag: 'vt-board', data: BOARD });
    await page.evaluate(() =>
      document.getElementById('el')?.addEventListener('vt-task-move', (e) => e.preventDefault()),
    );
    await page.locator('#el [data-task="a"] .board-open').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await columnsOf(page)).toContain('a:todo');
  });

  test('adds a task in a column and edits it in the dialog', async ({ page }) => {
    await place(page, { tag: 'vt-board', data: BOARD });
    await page.locator('#el').getByRole('button', { name: 'Add a task to Done' }).click();
    await page.keyboard.type('Delta');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    expect(await columnsOf(page)).toContain(`${await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).board.tasks.find((t) => t.title === 'Delta').id)}:done`); // prettier-ignore
    await page.locator('#el .board-open', { hasText: 'Delta' }).click();
    const dialog = page.locator('#el dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill('Delta, renamed');
    await dialog.getByLabel('Priority').selectOption('high');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#el .board-open', { hasText: 'Delta, renamed' })).toBeVisible();
    await page.locator('#el .board-open', { hasText: 'Delta, renamed' }).click();
    await page.locator('#el dialog[open]').getByRole('button', { name: 'Delete' }).click();
    await page.locator('#el dialog[open]').getByRole('button', { name: 'Delete for good' }).click();
    await expect(page.locator('#el .board-open', { hasText: 'Delta' })).toHaveCount(0);
  });

  test('filters, shows a table, and keeps the board in the browser with persist', async ({
    page,
  }) => {
    await place(page, { tag: 'vt-board', data: BOARD, attrs: { variant: 'full', persist: 'e2e' } });
    await page.locator('#el').getByRole('button', { name: 'ui', exact: true }).click();
    await expect(page.locator('#el [data-task]')).toHaveCount(1);
    await page.locator('#el').getByRole('tab', { name: 'Table' }).click();
    await expect(page.locator('#el table tbody tr')).toHaveCount(1);
    await page.locator('#el').getByRole('tab', { name: 'Board' }).click();
    await page.locator('#el').getByRole('button', { name: 'All', exact: true }).click();
    await page.evaluate(() =>
      /** @type {any} */ (document.getElementById('el')).moveTask('a', 'done'),
    );
    await page.reload();
    await place(page, { tag: 'vt-board', data: BOARD, attrs: { persist: 'e2e' } });
    expect(await columnsOf(page)).toContain('a:done');
  });

  test('read-only boards change nothing', async ({ page }) => {
    await place(page, { tag: 'vt-board', data: BOARD, attrs: { readonly: '' } });
    await expect(page.locator('#el .board-add')).toHaveCount(0);
    await expect(page.locator('#el .board-handle')).toHaveCount(0);
  });
});

const INDEX = [
  {
    id: '1b4e28ba-2fa1',
    title: 'Getting started',
    section: 'Guides',
    content: 'Install from a CDN.',
    featured: true,
  },
  { id: '6ecd8c99-4036', title: 'Board', section: 'Components', content: 'Drag and drop tasks.' },
  {
    id: '3f333df6-90a4',
    title: 'Accessibilité',
    section: 'Guides',
    content: 'Clavier et lecteurs d’écran.',
  },
];

test.describe('<vt-search>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('opens with its shortcut, finds by words and typos, and gives the result id', async ({
    page,
  }) => {
    await place(page, { tag: 'vt-search', data: INDEX, attrs: { 'url-template': '#doc/{id}' } });
    await page.evaluate(() =>
      document.getElementById('el')?.addEventListener('vt-select', (e) => {
        /** @type {any} */ (window).__picked = /** @type {CustomEvent} */ (e).detail;
      }),
    );
    await page.keyboard.press('/');
    const input = page.locator('#el input[role="combobox"]');
    await expect(input).toBeFocused();
    await expect(page.locator('#el [role="option"] .search-title')).toHaveText(['Getting started']);
    await input.fill('acessibilite');
    await expect(page.locator('#el [role="option"]')).toHaveCount(1);
    await input.fill('drag');
    await expect(page.locator('#el mark')).toHaveText(['Drag']);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => /** @type {any} */ (window).__picked)).toMatchObject({
      id: '6ecd8c99-4036',
      url: '#doc/6ecd8c99-4036',
    });
    await expect(page).toHaveURL(/#doc\/6ecd8c99-4036$/);
    await expect(page.locator('#el dialog[open]')).toHaveCount(0);
    await expect(page.locator('#el .search-trigger')).toBeFocused();
    await page.keyboard.press('Control+K');
    await expect(page.locator('#el .search-section')).toContainText('Recent searches');
    await expect(page.locator('#el [role="option"] .search-title')).toHaveText(['Board']);
    // One Escape closes it, even with words typed.
    await page.locator('#el input[role="combobox"]').fill('board');
    await page.keyboard.press('Escape');
    await expect(page.locator('#el dialog[open]')).toHaveCount(0);
  });

  test('loads its index the first time it opens, and asks an API with search-src', async ({
    page,
  }) => {
    let indexLoads = 0;
    await page.route('**/search-index.json', (route) => {
      indexLoads += 1;
      return route.fulfill({ body: JSON.stringify(INDEX), contentType: 'application/json' });
    });
    await page.route('**/api/search?q=*', (route) =>
      route.fulfill({
        body: JSON.stringify({ hits: [{ objectID: 'r-1', title: 'From the API', url: '/r/1' }] }),
        contentType: 'application/json',
      }),
    );
    await place(page, { tag: 'vt-search', attrs: { 'index-src': '/search-index.json' } });
    expect(indexLoads).toBe(0);
    await page.locator('#el .search-trigger').click();
    await page.locator('#el input').fill('board');
    await expect(page.locator('#el [role="option"]')).toHaveCount(1);
    expect(indexLoads).toBe(1);
    await place(page, {
      tag: 'vt-search',
      attrs: { 'search-src': '/api/search?q={query}', layout: 'inline' },
    });
    await page.locator('#el input').fill('anything');
    await expect(page.locator('#el [role="option"] .search-title')).toHaveText(['From the API']);
  });
});
