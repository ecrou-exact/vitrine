import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  byHost,
  parseHar,
  toCsv,
  totals,
  typeOf,
} from '../../src/components/waterfall/waterfall.js';
import { VtWaterfall } from '../../src/components/waterfall/vt-waterfall.js';

const HAR = readFileSync(join(import.meta.dirname, 'fixtures', 'security', 'capture.har'), 'utf8');

const page = () => {
  const result = parseHar(HAR);
  if (!result.ok) throw new Error(result.error);
  return result.har.pages[0];
};

describe('parseHar', () => {
  it('reads pages, entries and timings', () => {
    const result = parseHar(HAR);
    expect(result.ok && result.har.creator).toBe('Playwright 1.48.0');
    const p = page();
    expect(p.title).toBe('Sign in');
    expect(p.entries).toHaveLength(6);
    expect(p.entries[0].start).toBe(10);
    expect(p.onLoad).toBe(610);
    // HAR counts TLS in `connect`: they are kept apart.
    expect(p.entries[1].timings).toMatchObject({ connect: 25, ssl: 35, wait: 110 });
    expect(p.entries[2].timings.dns).toBe(0);
  });

  it('finds the page, redirects, third parties, mixed content and failures', () => {
    const p = page();
    expect(p.url).toBe('https://login.shop.example/signin');
    expect(p.domain).toBe('shop.example');
    expect(p.redirects).toEqual(['http://bit.example/x7', 'https://login.shop.example/signin']);
    const byUrl = Object.fromEntries(p.entries.map((e) => [e.url, e]));
    expect(byUrl['https://cdn.tracker.example/t.js?id=1'].thirdParty).toBe(true);
    expect(byUrl['https://login.shop.example/app.js']).toMatchObject({ thirdParty: false, type: 'script', transfer: 15200 }); // prettier-ignore
    expect(byUrl['http://img.other.example/logo.png'].mixed).toBe(true);
    expect(byUrl['https://login.shop.example/api/collect']).toMatchObject({
      failed: true,
      type: 'xhr',
    });
    expect(totals(p.entries)).toMatchObject({ requests: 6, domains: 4, failed: 1, redirects: 1, mixed: 1 }); // prettier-ignore
  });

  it('groups by host', () => {
    const hosts = byHost(page().entries);
    expect(hosts[0]).toMatchObject({
      host: 'login.shop.example',
      requests: 3,
      ips: ['198.51.100.7'],
    });
  });

  it('accepts a log alone or a list of entries', () => {
    const entries = JSON.parse(HAR).log.entries;
    const list = parseHar(JSON.stringify(entries));
    expect(list.ok && list.har.pages[0].entries).toHaveLength(6);
    expect(parseHar(JSON.stringify(JSON.parse(HAR).log)).ok).toBe(true);
  });

  it('rejects other content', () => {
    expect(parseHar('')).toEqual({ ok: false, error: 'empty' });
    expect(parseHar('{').ok).toBe(false);
    expect(parseHar('{"a":1}')).toEqual({ ok: false, error: 'format' });
  });

  it('guesses types', () => {
    expect(typeOf('', 'text/css', '')).toBe('style');
    expect(typeOf('', '', 'https://x.example/a.woff2')).toBe('font');
    expect(typeOf('Stylesheet', '', '')).toBe('style');
  });

  it('writes CSV without formulas', () => {
    const entries = page().entries.slice(0, 1);
    entries[0].url = '=HYPERLINK("x")';
    expect(toCsv(entries).split('\n')[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('<vt-waterfall>', () => {
  if (!customElements.get('vt-waterfall')) customElements.define('vt-waterfall', VtWaterfall);

  it('shows the requests, filters them and opens one', () => {
    const el = /** @type {VtWaterfall} */ (document.createElement('vt-waterfall'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = HAR;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('.wf-row')).toHaveLength(6);
    expect(root.querySelector('.wf-redirects')?.textContent).toContain('bit.example');
    expect(root.querySelectorAll('.wf-seg').length).toBeGreaterThan(10);
    /** @type {HTMLButtonElement} */ (
      root.querySelector('[data-focus-key="filter-script"]')
    ).click();
    expect(el.root.querySelectorAll('.wf-row')).toHaveLength(2);
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-focus-key="filter-third"]')
    ).click();
    expect(el.root.querySelectorAll('.wf-row')).toHaveLength(1);
    /** @type {HTMLButtonElement} */ (el.root.querySelector('.wf-name')).click();
    expect(el.root.querySelector('.wf-details')?.textContent).toContain('192.0.2.50');
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-tab="domains"]')).click();
    expect(el.root.querySelectorAll('.wf-domains tbody tr')).toHaveLength(4);
    el.remove();
  });

  it('defangs URLs on demand', () => {
    const el = /** @type {VtWaterfall} */ (document.createElement('vt-waterfall'));
    el.setAttribute('defang', '');
    el.content = HAR;
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.wf-host')?.textContent).toBe('bit[.]example');
    el.remove();
  });
});
