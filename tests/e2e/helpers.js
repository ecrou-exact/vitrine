/**
 * Shared helpers for end-to-end tests.
 */

export const STRICT = '/tests/e2e/fixtures/strict.html';
export const NO_CSP = '/tests/e2e/fixtures/nocsp.html';

/**
 * Creates an element in #root, sets attributes and (optionally) the content property,
 * and resolves once `vt-ready` or `vt-error` fired.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {string | null} [content]
 * @returns {Promise<{ event: string, detail: unknown }>}
 */
export async function mount(page, tag, attrs = {}, content = null) {
  return page.evaluate(
    ({ tag, attrs, content }) =>
      new Promise((resolve) => {
        const el = document.createElement(tag);
        el.id = 'el';
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        const done = (event) =>
          resolve({ event: event.type, detail: event.detail?.message ?? event.detail });
        el.addEventListener('vt-ready', done, { once: true });
        el.addEventListener('vt-error', done, { once: true });
        if (content !== null) el.content = content;
        document.getElementById('root').replaceChildren(el);
      }),
    { tag, attrs, content },
  );
}

/**
 * Collects console errors and page errors during a test.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Records events of the given types dispatched by #el.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} types
 */
export async function recordEvents(page, types) {
  await page.evaluate((types) => {
    window.__events = [];
    const el = document.getElementById('el');
    for (const type of types)
      el.addEventListener(type, (event) => window.__events.push({ type, detail: event.detail }));
  }, types);
}

/** @param {import('@playwright/test').Page} page */
export const events = (page) => page.evaluate(() => window.__events);
