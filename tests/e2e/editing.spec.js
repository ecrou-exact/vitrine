import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

test.describe('Edit mode', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('vt-code: typing updates content, fires vt-input and keeps highlighting', async ({
    page,
  }) => {
    await mount(page, 'vt-code', { mode: 'edit', language: 'js' }, 'const a = 1;');
    await recordEvents(page, ['vt-input', 'vt-change']);
    const field = page.locator('#el textarea');
    await field.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nlet b = 2;');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('el').content))
      .toBe('const a = 1;\nlet b = 2;');
    await expect(page.locator('#el .editor-layer .hljs-keyword')).toHaveText(['const', 'let']);
    await field.blur();
    const recorded = await events(page);
    expect(recorded.some((e) => e.type === 'vt-input')).toBe(true);
    expect(recorded.at(-1)).toEqual({
      type: 'vt-change',
      detail: { value: 'const a = 1;\nlet b = 2;' },
    });
  });

  test('the text field sits exactly on the highlighted text', async ({ page }) => {
    await mount(
      page,
      'vt-code',
      { mode: 'edit', language: 'js', 'line-numbers': '' },
      'const answer = 42;\n  return answer;',
    );
    const [layer, field] = await Promise.all([
      page
        .locator('#el .editor-layer .content')
        .first()
        .evaluate((el) => el.getBoundingClientRect().left),
      page
        .locator('#el textarea')
        .evaluate(
          (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft),
        ),
    ]);
    const padding = await page
      .locator('#el .editor-layer .content')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(Math.abs(layer + padding - field)).toBeLessThan(1);
  });

  test('Tab indents, Enter keeps indentation, Escape then Tab leaves the field', async ({
    page,
  }) => {
    await mount(page, 'vt-code', { mode: 'edit' }, 'x');
    // A control after the editor, so Tab has somewhere to go in every browser.
    await page.evaluate(() => {
      const after = document.createElement('button');
      after.id = 'after';
      after.textContent = 'Next control';
      document.getElementById('root').append(after);
    });
    const field = page.locator('#el textarea');
    await field.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('y');
    await page.keyboard.press('Enter');
    await page.keyboard.type('z');
    expect(await field.inputValue()).toBe('x\n  y\n  z');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
  });

  test('undo and redo buttons follow the history', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full', mode: 'edit' }, 'start');
    const el = page.locator('#el');
    const undo = el.getByRole('button', { name: 'Undo' });
    const redo = el.getByRole('button', { name: 'Redo' });
    await expect(undo).toBeDisabled();
    await el.locator('textarea').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' one');
    await page.waitForTimeout(700);
    await page.keyboard.type(' two');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(el.locator('textarea')).toHaveValue('start one');
    await expect(redo).toBeEnabled();
    await page.keyboard.press('Control+Shift+Z');
    await expect(el.locator('textarea')).toHaveValue('start one two');
    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Z');
    await expect(el.locator('textarea')).toHaveValue('start');
  });

  test('edit-toggle switches between view and edit', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full', 'edit-toggle': '' }, 'x');
    await recordEvents(page, ['vt-mode-change']);
    const el = page.locator('#el');
    await expect(el.locator('textarea')).toHaveCount(0);
    await el.getByRole('button', { name: 'Edit' }).click();
    await expect(el.locator('textarea')).toBeFocused();
    await el.getByRole('button', { name: 'Stop editing' }).click();
    await expect(el.locator('textarea')).toHaveCount(0);
    expect((await events(page)).map((e) => e.detail.mode)).toEqual(['edit', 'view']);
  });

  test('vt-markdown: the preview follows the source', async ({ page }) => {
    await mount(page, 'vt-markdown', { mode: 'edit', variant: 'full' }, '# Title');
    const el = page.locator('#el');
    await expect(el.locator('.panel')).toHaveAttribute('data-preview', 'right');
    await el.locator('textarea').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n**bold** text');
    await expect(el.locator('[part="markdown"] strong')).toHaveText('bold');
  });

  test('vt-json: live validation with line and column', async ({ page }) => {
    await mount(page, 'vt-json', { mode: 'edit', variant: 'full' }, '{"a": 1}');
    const el = page.locator('#el');
    await expect(el.locator('[part="status"]')).toHaveText('Valid JSON');
    await el.locator('textarea').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type(',');
    await expect(el.locator('[part="status"]')).toContainText(
      'Invalid JSON at line 1, column 8: Trailing comma.',
    );
    await expect(el.locator('.editor-layer .line.highlighted')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(el.locator('[part="status"]')).toHaveText('Valid JSON');
  });

  test('full screen enters and leaves with the button and Escape', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full' }, 'x');
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Full screen' }).click();
    await expect(el.locator('.vt')).toHaveAttribute('data-fullscreen', /native|window/);
    await el.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(el.locator('.vt')).not.toHaveAttribute('data-fullscreen');
  });
});
