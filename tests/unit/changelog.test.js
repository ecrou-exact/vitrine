// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareLoose,
  inlineTokens,
  kindOf,
  readChangelog,
  toMarkdown,
} from '../../src/components/changelog/changelog.js';
import { VtChangelog } from '../../src/components/changelog/vt-changelog.js';

if (!customElements.get('vt-changelog')) customElements.define('vt-changelog', VtChangelog);

const KEEP = `# Changelog

All notable changes to this project.

## [Unreleased]
### Added
- A \`theme\` option (#42)

## [1.2.0] - 2026-11-01
The dark release.
### Added
- Dark mode by @ada
  on every page
  - nested item
### Fixed
- Crash on empty input (a1b2c3d)
### Security
- Labels are escaped

## [1.1.0] - 2026-10-01 [YANKED]
### Removed
- The old API

## [1.0.0] - 2026-09-01
### Added
- First release

[unreleased]: https://github.com/o/r/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/o/r/compare/v1.1.0...v1.2.0
`;

const CONVENTIONAL = `# [2.0.0](https://github.com/o/r/compare/v1.4.0...v2.0.0) (2026-11-10)

### ⚠ BREAKING CHANGES

* **api:** drop Node 18

### Features

* **parser:** read YAML ([1234abc](https://github.com/o/r/commit/1234abc))

## [1.4.1](https://github.com/o/r/compare/v1.4.0...v1.4.1) (2026-11-02)

### Bug Fixes

* handle null
`;

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtChangelog>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtChangelog} */ (document.createElement('vt-changelog'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.content = content;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('changelogs', () => {
  it('reads Keep a Changelog, with dates, yanked releases, notes and compare links', () => {
    const releases = readChangelog(KEEP);
    expect(releases.map((r) => [r.unreleased ? 'Unreleased' : r.version, r.yanked])).toEqual([['Unreleased', false], ['1.2.0', false], ['1.1.0', true], ['1.0.0', false]]); // prettier-ignore
    const r = releases[1];
    expect(new Date(/** @type {number} */ (r.date)).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.notes).toBe('The dark release.');
    expect(r.compare).toBe('https://github.com/o/r/compare/v1.1.0...v1.2.0');
    expect(r.groups.map((g) => g.kind)).toEqual(['added', 'fixed', 'security']);
    expect(r.groups[0].items).toEqual([
      { kind: 'added', text: 'Dark mode by @ada on every page', scope: '', breaking: false, depth: 0 }, // prettier-ignore
      { kind: 'added', text: 'nested item', scope: '', breaking: false, depth: 1 },
    ]);
    expect(releases[0].compare).toBe('https://github.com/o/r/compare/v1.2.0...HEAD');
  });

  it('reads conventional-changelog, with scopes and breaking changes', () => {
    const [major, patch] = readChangelog(CONVENTIONAL);
    expect(major.version).toBe('2.0.0');
    expect(major.compare).toBe('https://github.com/o/r/compare/v1.4.0...v2.0.0');
    expect(major.groups[0]).toMatchObject({ kind: 'breaking', items: [{ scope: 'api', text: 'drop Node 18', breaking: true }] }); // prettier-ignore
    expect(major.groups[1].kind).toBe('added');
    expect(patch.groups[0]).toMatchObject({ kind: 'fixed', label: 'Bug Fixes' });
  });

  it('reads GitHub releases and releases of your own', () => {
    const github = readChangelog(JSON.stringify([
      { tag_name: 'v3.1.0', name: 'Search', published_at: '2026-11-12T10:00:00Z', html_url: 'https://github.com/o/r/releases/tag/v3.1.0', body: "## What's Changed\n* Add search by @ada in https://github.com/o/r/pull/12\n\n**Full Changelog**: https://github.com/o/r/compare/v3.0.0...v3.1.0" }, // prettier-ignore
      { tag_name: 'v3.1.0-rc.1', prerelease: true, body: '' },
      { tag_name: 'v9', draft: true },
    ])); // prettier-ignore
    expect(github.map((r) => [r.version, r.title, r.prerelease])).toEqual([['3.1.0', 'Search', false], ['3.1.0-rc.1', '', true]]); // prettier-ignore
    expect(github[0].compare).toBe('https://github.com/o/r/compare/v3.0.0...v3.1.0');
    const own = readChangelog(JSON.stringify({ releases: [{ version: '1.0.0', date: '2026-01-02', changes: { added: ['One'], 'Bug fixes': ['Two'] } }] })); // prettier-ignore
    expect(own[0].groups.map((g) => [g.kind, g.items[0].text])).toEqual([['added', 'One'], ['fixed', 'Two']]); // prettier-ignore
    expect(() => readChangelog('{"a":1}')).toThrow();
  });

  it('knows the usual headings', () => {
    expect(kindOf('🐛 Bug Fixes').kind).toBe('fixed');
    expect(kindOf('Performance Improvements').kind).toBe('changed');
    expect(kindOf('⚠ BREAKING CHANGES').kind).toBe('breaking');
    expect(kindOf('Documentation')).toEqual({ kind: 'other', label: 'Documentation' });
  });

  it('reads the inline text of a change into safe tokens', () => {
    const tokens = inlineTokens('Add `x` **now** by @ada in https://github.com/o/r/pull/12 (#5) [bad](javascript:alert(1)) a1b2c3d4', 'https://github.com/o/r'); // prettier-ignore
    expect(tokens.filter((t) => t.type !== 'text')).toEqual([
      { type: 'code', text: 'x' },
      { type: 'strong', text: 'now' },
      { type: 'link', text: '@ada', url: 'https://github.com/ada' },
      { type: 'link', text: '#12', url: 'https://github.com/o/r/pull/12' },
      { type: 'link', text: '#5', url: 'https://github.com/o/r/issues/5' },
      { type: 'link', text: 'a1b2c3d', url: 'https://github.com/o/r/commit/a1b2c3d4', code: true },
    ]);
    expect(JSON.stringify(tokens)).not.toContain('javascript');
    // Without a repository, references stay text.
    expect(inlineTokens('Fix #5 by @ada').every((t) => t.type === 'text')).toBe(true);
  });

  it('compares versions and writes Markdown back', () => {
    expect(['1.10.0', '1.2.0', '1.2.0-rc.1', '2.0.0'].sort(compareLoose)).toEqual(['1.2.0-rc.1', '1.2.0', '1.10.0', '2.0.0']); // prettier-ignore
    const md = toMarkdown(readChangelog(CONVENTIONAL).slice(1), { fixed: 'Fixed' });
    expect(md).toBe('## [1.4.1] - 2026-11-02\n\n### Bug Fixes\n\n- handle null');
  });
});

describe('<vt-changelog>', () => {
  it('shows releases with badges, groups and links to the repository', async () => {
    const el = await mount({ repo: 'https://github.com/o/r', variant: 'full' }, KEEP);
    const heads = [...el.root.querySelectorAll('.cl-version')].map((n) => n.textContent);
    expect(heads).toEqual(['Unreleased', '1.2.0', '1.1.0', '1.0.0']);
    expect([...el.root.querySelectorAll('.cl-badge')].map((b) => b.textContent)).toEqual(['Latest', 'Yanked']); // prettier-ignore
    expect(el.root.querySelector('a[href="https://github.com/o/r/issues/42"]')?.textContent).toBe('#42'); // prettier-ignore
    expect(el.root.querySelector('a[href="https://github.com/o/r/commit/a1b2c3d"] code')?.textContent).toBe('a1b2c3d'); // prettier-ignore
    expect([...el.root.querySelectorAll('.cl-filter')].map((b) => b.textContent)).toEqual(['All7', 'Security1', 'Added4', 'Removed1', 'Fixed1']); // prettier-ignore
  });

  it('filters by kind and tells the page', async () => {
    const el = await mount({ filters: '' }, KEEP);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-filter-change', (e) =>
      seen.push(/** @type {CustomEvent} */ (e).detail),
    );
    /** @type {HTMLElement} */ (el.root.querySelector('.cl-filter.kind-fixed')).click();
    expect([...el.root.querySelectorAll('.cl-version')].map((n) => n.textContent)).toEqual([
      '1.2.0',
    ]);
    expect(el.root.querySelectorAll('.cl-group')).toHaveLength(1);
    expect(seen).toEqual([{ kinds: ['fixed'], shown: 1 }]);
  });

  it('says what is new since a version, and shows older releases on demand', async () => {
    const el = await mount({ since: '1.0.0', limit: '1' }, KEEP);
    expect(el.root.querySelector('.cl-since')?.textContent).toBe('New since 1.0.0' + '2 releases' + 'Security: 1' + 'Added: 2' + 'Removed: 1' + 'Fixed: 1'); // prettier-ignore
    expect(el.root.querySelectorAll('.cl-release')).toHaveLength(1);
    /** @type {HTMLElement} */ (el.root.querySelector('.cl-more')).click();
    expect(el.root.querySelectorAll('.cl-release')).toHaveLength(2);
    const later = await mount({ since: '1.2.0' }, KEEP);
    expect(later.root.querySelector('.cl-since')?.textContent).toBe('Nothing new since 1.2.0.');
  });
});
