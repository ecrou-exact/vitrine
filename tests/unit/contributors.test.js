// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  peopleToMarkdown,
  readPeople,
  sizedAvatar,
} from '../../src/components/contributors/people.js';
import { VtContributors } from '../../src/components/contributors/vt-contributors.js';

if (!customElements.get('vt-contributors'))
  customElements.define('vt-contributors', VtContributors);

const GITHUB = [
  { login: 'ada', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', html_url: 'https://github.com/ada', contributions: 120, type: 'User' }, // prettier-ignore
  { login: 'dependabot[bot]', avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4', html_url: 'https://github.com/apps/dependabot', contributions: 40, type: 'Bot' }, // prettier-ignore
  { login: 'alan', avatar_url: 'https://avatars.githubusercontent.com/u/3?v=4', html_url: 'https://github.com/alan', contributions: 7, type: 'User' }, // prettier-ignore
];

const ALL_CONTRIBUTORS = {
  projectName: 'app',
  contributors: [
    { login: 'grace', name: 'Grace Hopper', avatar_url: 'https://example.com/g.png', profile: 'https://grace.dev', contributions: ['code', 'doc'] }, // prettier-ignore
    { login: 'linus', name: 'Linus', avatar_url: 'https://example.com/l.png', profile: 'https://l.dev', contributions: ['bug', { type: 'review' }, 'nonsense'] }, // prettier-ignore
  ],
};

const OPEN_COLLECTIVE = [
  { MemberId: 1, type: 'ORGANIZATION', role: 'BACKER', tier: 'Gold sponsors', totalAmountDonated: 5000, name: 'Big Co', website: 'https://big.example', image: 'https://img/b.png' }, // prettier-ignore
  { MemberId: 2, type: 'USER', role: 'BACKER', tier: 'Backers', totalAmountDonated: 50, name: 'Sam', profile: 'https://opencollective.com/sam' }, // prettier-ignore
  { MemberId: 3, type: 'USER', role: 'FOLLOWER', name: 'Follower' },
  { MemberId: 4, type: 'USER', role: 'ADMIN', name: 'Maintainer' },
];

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtContributors>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtContributors} */ (document.createElement('vt-contributors'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('reading people', () => {
  it('reads the GitHub API, with bots marked', () => {
    const [group] = readPeople(GITHUB);
    expect(group.people.map((p) => [p.login, p.contributions, p.bot])).toEqual([
      ['ada', 120, false],
      ['dependabot[bot]', 40, true],
      ['alan', 7, false],
    ]);
  });

  it('reads All Contributors types and drops unknown ones', () => {
    const [group] = readPeople(ALL_CONTRIBUTORS);
    expect(group.people[0]).toMatchObject({ name: 'Grace Hopper', url: 'https://grace.dev', types: ['code', 'doc'] }); // prettier-ignore
    expect(group.people[1].types).toEqual(['bug', 'review']);
  });

  it('groups Open Collective members by tier, the most generous first', () => {
    const groups = readPeople(OPEN_COLLECTIVE);
    expect(groups.map((g) => [g.name, g.role, g.people.map((p) => p.name)])).toEqual([
      ['Gold sponsors', null, ['Big Co']],
      ['Backers', null, ['Sam']],
      ['', 'admin', ['Maintainer']],
    ]);
    expect(groups[0].people[0]).toMatchObject({ sponsor: true, url: 'https://big.example' });
  });

  it('reads GitHub Sponsors from GraphQL and own groups', () => {
    const graphql = { data: { user: { sponsorshipsAsMaintainer: { nodes: [{ sponsorEntity: { login: 'octo', avatarUrl: 'https://a/o.png', url: 'https://github.com/octo' }, tier: { name: 'Silver', monthlyPriceInDollars: 25 } }] } } } }; // prettier-ignore
    expect(readPeople(graphql)[0]).toMatchObject({ name: 'Silver', people: [{ login: 'octo', amount: 25, sponsor: true }] }); // prettier-ignore
    const own = { groups: [{ name: 'Core team', size: 'large', people: [{ name: 'Ada' }] }, { name: 'Friends', people: [{ name: 'Bob' }] }] }; // prettier-ignore
    expect(readPeople(own).map((g) => [g.name, g.size])).toEqual([['Core team', 'large'], ['Friends', null]]); // prettier-ignore
    expect(() => readPeople({ nothing: 1 })).toThrow();
  });

  it('keeps safe links only, and asks GitHub for small avatars', () => {
    const [group] = readPeople([{ name: 'X', url: 'javascript:alert(1)', avatar: 'javascript:x' }]);
    expect(group.people[0]).toMatchObject({ url: null, avatar: null });
    expect(sizedAvatar('https://avatars.githubusercontent.com/u/1?v=4', 112)).toBe('https://avatars.githubusercontent.com/u/1?v=4&s=112'); // prettier-ignore
    expect(sizedAvatar('https://example.com/a.png', 112)).toBe('https://example.com/a.png');
  });

  it('writes a Markdown list with names escaped', () => {
    const [group] = readPeople([{ login: 'ada', name: 'Ada [x](y)', html_url: 'https://github.com/ada' }]); // prettier-ignore
    expect(peopleToMarkdown(group.people)).toBe('- [Ada \\[x\\]\\(y\\)](<https://github.com/ada>) (@ada)'); // prettier-ignore
  });
});

describe('<vt-contributors>', () => {
  it('hides bots and shows contributions', async () => {
    const el = await mount({}, GITHUB);
    const names = [...el.root.querySelectorAll('.ct-name')].map((n) => n.textContent);
    expect(names).toEqual(['ada', 'alan']);
    expect(el.root.querySelector('.ct-commits')?.textContent).toBe('120 contributions');
    const avatar = /** @type {HTMLImageElement} */ (el.root.querySelector('img.ct-avatar'));
    expect(avatar.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(avatar.getAttribute('src')).toContain('&s=112');
  });

  it('filters by type of contribution', async () => {
    const el = await mount({ variant: 'full' }, ALL_CONTRIBUTORS);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-filter-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail)); // prettier-ignore
    const bug = [...el.root.querySelectorAll('.ct-filter')].find((b) => b.textContent?.includes('Bug reports')); // prettier-ignore
    /** @type {HTMLElement} */ (bug).click();
    expect(seen).toEqual([{ type: 'bug' }]);
    expect([...el.root.querySelectorAll('.ct-name')].map((n) => n.textContent)).toEqual(['Linus']);
  });

  it('marks sponsor links and sizes tiers', async () => {
    const el = await mount({}, OPEN_COLLECTIVE);
    expect(el.root.querySelector('a.ct-person')?.getAttribute('rel')).toBe('sponsored noopener');
    expect([...el.root.querySelectorAll('.ct-group')].map((g) => g.className)).toEqual([
      'ct-group ct-large',
      'ct-group ct-medium',
      'ct-group ct-small',
    ]);
    expect([...el.root.querySelectorAll('.ct-group-name')].map((g) => g.textContent)).toEqual(['Gold sponsors', 'Backers', 'Team']); // prettier-ignore
  });

  it('shows the first people and the rest on demand', async () => {
    const people = Array.from({ length: 30 }, (_, n) => ({ name: `P${n}` }));
    const el = await mount({ max: '10' }, people);
    expect(el.root.querySelectorAll('.ct-person')).toHaveLength(10);
    const more = /** @type {HTMLElement} */ (el.root.querySelector('.ct-more'));
    expect(more.textContent).toBe('Show 20 more');
    more.click();
    expect(el.root.querySelectorAll('.ct-person')).toHaveLength(30);
  });
});
