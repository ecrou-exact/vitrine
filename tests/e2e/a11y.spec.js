import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, mount } from './helpers.js';

const SAMPLES = {
  'vt-code':
    'def hello(name):\n    return f"Hello {name}"  # greet\n\nprint(hello("world"), 42, None)',
  'vt-markdown':
    '# Title\n\nText with a [link](https://example.com) and `code`.\n\n## Part\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1; // note\n```\n\n> quote',
  'vt-json':
    '{"name": "Ada", "age": 36, "admin": true, "tags": ["a", "b"], "manager": null, "nested": {"x": 1}}',
};
const THEMES = ['light', 'dark', 'dim', 'paper', 'high-contrast'];

test.describe('Accessibility (axe-core, WCAG 2.2 AA)', () => {
  for (const [tag, content] of Object.entries(SAMPLES)) {
    for (const theme of THEMES) {
      test(`${tag} full variant, ${theme} theme`, async ({ page }) => {
        await page.goto(STRICT);
        await mount(
          page,
          tag,
          { variant: 'full', theme, label: `${tag} sample`, 'highlight-lines': '2' },
          content,
        );
        const results = await new AxeBuilder({ page })
          .include('#el')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const summary = results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );
        expect(summary).toEqual([]);
      });
    }
  }

  test('search bar and tabs are accessible when open', async ({ page }) => {
    await page.goto(STRICT);
    await mount(
      page,
      'vt-markdown',
      { variant: 'full', 'default-tab': 'split' },
      SAMPLES['vt-markdown'],
    );
    await page.locator('#el').getByRole('button', { name: 'Search' }).click();
    await page.locator('#el').getByRole('searchbox').fill('a');
    const results = await new AxeBuilder({ page })
      .include('#el')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('every icon button has an accessible name', async ({ page }) => {
    await page.goto(STRICT);
    for (const tag of Object.keys(SAMPLES)) {
      await mount(page, tag, { variant: 'full' }, SAMPLES[tag]);
      const unnamed = await page
        .locator('#el button')
        .evaluateAll(
          (buttons) =>
            buttons.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
        );
      expect(unnamed, tag).toBe(0);
    }
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(STRICT);
    await mount(page, 'vt-json', { variant: 'full' }, SAMPLES['vt-json']);
    const duration = await page
      .locator('#el .toggle .icon')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');
  });
});
