// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import { compact, readLanguages, readRepo } from '../../src/components/repo/repo.js';
import { VtRepo } from '../../src/components/repo/vt-repo.js';

if (!customElements.get('vt-repo')) customElements.define('vt-repo', VtRepo);

const GITHUB = {
  full_name: 'acme/rocket',
  name: 'rocket',
  owner: { login: 'acme', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
  html_url: 'https://github.com/acme/rocket',
  clone_url: 'https://github.com/acme/rocket.git',
  description: 'A fast launcher',
  homepage: 'https://rocket.example.com/',
  stargazers_count: 12345,
  forks_count: 678,
  open_issues_count: 42,
  subscribers_count: 90,
  language: 'TypeScript',
  license: { spdx_id: 'MIT', name: 'MIT License' },
  topics: ['cli', 'launcher'],
  pushed_at: '2026-11-13T12:00:00Z',
  archived: false,
  default_branch: 'main',
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtRepo>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtRepo} */ (document.createElement('vt-repo'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', now: '2026-11-15T12:00:00Z', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.content = JSON.stringify(data);
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('repositories', () => {
  it('reads a GitHub repository with its languages and latest release', () => {
    const repo = readRepo({ repo: GITHUB, languages: { TypeScript: 9000, CSS: 800, Shell: 200 }, release: { tag_name: 'v2.1.0', published_at: '2026-11-01T00:00:00Z', html_url: 'https://github.com/acme/rocket/releases/tag/v2.1.0' } }); // prettier-ignore
    expect(repo).toMatchObject({ host: 'github', owner: 'acme', name: 'rocket', stars: 12345, forks: 678, issues: 42, watchers: 90, branch: 'main', clone: 'https://github.com/acme/rocket.git', topics: ['cli', 'launcher'], license: { id: 'MIT', name: 'MIT License' } }); // prettier-ignore
    expect(repo.languages.map((l) => [l.name, Math.round(l.share * 100), l.color])).toEqual([['TypeScript', 90, '#3178c6'], ['CSS', 8, '#663399'], ['Shell', 2, '#89e051']]); // prettier-ignore
    expect(repo.release).toMatchObject({ tag: 'v2.1.0' });
    // Only the main language: a full bar of it.
    expect(readRepo(GITHUB).languages).toEqual([
      { name: 'TypeScript', share: 1, color: '#3178c6' },
    ]);
  });

  it('reads a GitLab project and your own JSON', () => {
    const gitlab = readRepo({ path_with_namespace: 'group/app', name: 'app', web_url: 'https://gitlab.com/group/app', http_url_to_repo: 'https://gitlab.com/group/app.git', star_count: 12, forks_count: 3, open_issues_count: 4, last_activity_at: '2026-11-10T00:00:00Z', topics: ['go'] }); // prettier-ignore
    expect(gitlab).toMatchObject({ host: 'gitlab', owner: 'group', name: 'app', stars: 12, clone: 'https://gitlab.com/group/app.git' }); // prettier-ignore
    const own = readRepo({ name: 'tool', url: 'javascript:alert(1)', stars: '7', avatar: 'javascript:x' }); // prettier-ignore
    expect(own).toMatchObject({ host: 'other', name: 'tool', url: null, stars: 7, avatar: null, clone: null }); // prettier-ignore
    expect(() => readRepo([])).toThrow();
  });

  it('groups small languages and writes compact counts', () => {
    const many = Object.fromEntries(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) => [n, 100 - i]),
    );
    const languages = readLanguages(many);
    expect(languages.map((l) => l.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Other']);
    expect(compact(12345, 'en')).toBe('12.3K');
    expect(compact(950, 'en')).toBe('950');
  });
});

describe('<vt-repo>', () => {
  it('shows the card with counts, languages, license, release and update', async () => {
    const el = await mount({ variant: 'full' }, { repo: GITHUB, languages: { TypeScript: 9000, CSS: 1000 }, release: { tag_name: 'v2.1.0', published_at: '2026-11-01T00:00:00Z' } }); // prettier-ignore
    expect(el.root.querySelector('.rp-name')?.textContent).toBe('acme / rocket');
    expect(el.root.querySelector('.rp-star')?.textContent).toBe(
      'Star12.3K (Star rocket on GitHub)',
    );
    expect([...el.root.querySelectorAll('.rp-stat .sr-only')].map((s) => s.textContent)).toEqual(['12,345 Stars', '678 Forks', '42 Open issues', '90 Watchers']); // prettier-ignore
    expect(el.root.querySelector('.rp-stat a')?.getAttribute('href')).toBe('https://github.com/acme/rocket/stargazers'); // prettier-ignore
    expect([...el.root.querySelectorAll('.rp-legend li')].map((li) => li.textContent)).toEqual(['TypeScript90%', 'CSS10%']); // prettier-ignore
    const parts = /** @type {HTMLElement[]} */ ([...el.root.querySelectorAll('.rp-bar-part')]);
    expect(parts.map((p) => p.style.width)).toEqual(['90.00%', '10.00%']);
    expect([...el.root.querySelectorAll('.rp-meta dd')].map((d) => d.textContent)).toEqual(['MIT', 'v2.1.0 · 14 days ago', '2 days ago', 'rocket.example.com']); // prettier-ignore
    expect(el.root.querySelector('.rp-command')?.textContent).toBe('git clone https://github.com/acme/rocket.git'); // prettier-ignore
    expect(el.root.querySelector('a[href="https://github.com/topics/cli"]')?.textContent).toBe('cli'); // prettier-ignore
  });

  it('hides parts on demand and explains a wrong shape', async () => {
    const el = await mount({ stats: 'false', languages: 'false', topics: 'false' }, GITHUB);
    expect(el.root.querySelector('.rp-stats, .rp-languages, .rp-topics, .rp-clone')).toBeNull();
    const bad = await mount({}, [1, 2]);
    expect(bad.root.querySelector('.notice, [role="status"], p')?.textContent).toContain(
      'repository',
    );
  });
});
