// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import contributorsCss from '../../styles/contributors.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { initials } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import { PeopleError, TYPES, peopleToMarkdown, readPeople, sizedAvatar } from './people.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./people.js').Person} Person */
/** @typedef {import('./people.js').Group} Group */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const LAYOUTS = /** @type {const} */ (['grid', 'avatars', 'list']);
const SORTS = /** @type {const} */ (['none', 'contributions', 'name', 'amount']);
/** Open Collective roles with a name of their own. */
const ROLES = ['backer', 'admin', 'member', 'contributor', 'fundraiser'];
/** Avatar sizes in CSS pixels. */
const PIXELS = { small: 40, medium: 56, large: 80 };

/**
 * Thanks the people behind a project: contributors and sponsors as a wall of avatars, a grid
 * or a list, in groups (sponsor tiers, the most generous first), with what each one did.
 *
 * Reads the GitHub API (`/repos/{owner}/{repo}/contributors`), an All Contributors file
 * (`.all-contributorsrc`, with its types of contributions and their filters), Open Collective
 * members (`members/all.json`), GitHub Sponsors from GraphQL, or `{ groups: [{ name, people }] }`.
 * Nothing is fetched but `src` and `json-src`: export sponsors at build time, as their APIs
 * need a token. Avatars load lazily without a referrer; links of sponsors are `rel="sponsored"`.
 *
 * @element vt-contributors
 * @since 0.15.0
 *
 * @attr {"grid"|"avatars"|"list"} layout - Avatars with names (default), faces only, or a list.
 * @attr {"none"|"contributions"|"name"|"amount"} sort - Order within a group (default: as given).
 * @attr {number} max - People shown before a "Show more" button (default: all).
 * @attr {boolean} bots - Shows bots (`dependabot[bot]`…). Default: off.
 * @attr {"small"|"medium"|"large"} size - Avatar size (default: by tier, else `medium`).
 * @attr {boolean} counts - Contributions under each name. Default: on.
 * @attr {boolean} filters - Buttons that keep one type of contribution. Full variant: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The people, as a value.
 * @prop {Group[]} groups - The groups read (read-only).
 *
 * @fires vt-filter-change - A type of contribution was chosen. Detail: `{ type }` (`null`: all).
 *
 * @csspart filters - The types of contributions.
 * @csspart group - A group.
 * @csspart person - A person.
 * @csspart avatar - A picture, or initials.
 * @csspart name - A name.
 *
 * @example
 * <vt-contributors json-src="/contributors.json" max="48"></vt-contributors>
 */
export class VtContributors extends VtDataElement {
  static type = 'contributors';

  static componentAttributes = Object.freeze(['layout', 'sort', 'max', 'bots', 'size', 'counts', 'filters']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, filters: true }, // prettier-ignore
  };

  static styles = [syntaxCss, codeCss, dataCss, contributorsCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {string | null} */
    this.typeFilter = null;
    this.expanded = false;
  }

  contentChanged() {
    this.typeFilter = null;
    this.expanded = false;
  }

  /** @returns {{ groups: Group[], error: string | null }} */
  read() {
    try {
      const groups = readPeople(JSON.parse(this.text ?? ''));
      const bots = parseBoolean(this.getAttribute('bots')) === true;
      const sort = parseEnum(this.getAttribute('sort'), SORTS, 'none');
      for (const group of groups) {
        if (!bots) group.people = group.people.filter((p) => !p.bot);
        if (sort !== 'none') group.people.sort(comparator(sort, this.locale));
      }
      return { groups: groups.filter((g) => g.people.length), error: null };
    } catch (error) {
      if (error instanceof PeopleError) return { groups: [], error: this.t('contributorsShape') };
      return { groups: [], error: this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }) }; // prettier-ignore
    }
  }

  /** @returns {Group[]} */
  get groups() {
    return this.read().groups;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { groups, error } = this.read();
    const body = h('div', { class: 'body data-body ct-body', part: 'body' });
    const people = groups.flatMap((g) => g.people);
    if (error) body.append(noticeView(error));
    else if (!people.length)
      body.append(h('p', { class: 'data-none', text: t('contributorsEmpty') })); // prettier-ignore
    else this.renderGroups(body, groups, people);
    const { panel, history } = this.previewPanel(body, this.panelId);
    const list = /** @type {HTMLElement | null} */ (body.querySelector('.ct-groups'));
    const badge = people.length === 1 ? t('contributorsOne') : t('contributorsCount', { count: formatNumber(people.length, this.locale) }); // prettier-ignore
    frame.append(
      ...this.chrome({
        badge: people.length ? badge : '',
        actions: [
          ...history,
          this.editToggleButton(),
          list ? this.searchButton(new TextSearch(list)) : null,
          this.fullscreenButton(),
          this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName('contributors.json'), 'application/json') : null, // prettier-ignore
          this.feature('copy') && people.length ? this.copyButton(() => peopleToMarkdown(this.shown(people)), t('contributorsCopy')) : null, // prettier-ignore
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * @param {Person[]} people
   * @returns {Person[]} Those the type filter keeps.
   */
  shown(people) {
    const type = this.typeFilter;
    return type ? people.filter((p) => p.types.includes(type)) : people;
  }

  /**
   * @param {HTMLElement} body
   * @param {Group[]} groups
   * @param {Person[]} people
   */
  renderGroups(body, groups, people) {
    const t = this.t;
    if (this.feature('filters')) {
      const filters = this.filtersView(people);
      if (filters) body.append(filters);
    }
    const max = parseInteger(this.getAttribute('max'), { min: 1, max: 10000, fallback: 0 });
    let room = max && !this.expanded ? max : Infinity;
    let hidden = 0;
    const box = h('div', { class: 'ct-groups' });
    const sized = groups.filter((g) => g.people.some((p) => p.amount !== null)).length > 1;
    for (const [n, group] of groups.entries()) {
      const list = this.shown(group.people);
      if (!list.length) continue;
      const visible = list.slice(0, Math.max(0, room));
      hidden += list.length - visible.length;
      room -= visible.length;
      if (!visible.length) continue;
      const size = this.sizeFor(group, sized ? n : -1);
      const name = group.name || (group.role ? (ROLES.includes(group.role) ? t(/** @type {StringKey} */ (`contributorsRole_${group.role}`)) : group.role) : groups.length > 1 ? t('contributorsOthers') : ''); // prettier-ignore
      const headingId = uid('group');
      box.append(
        h(
          'section',
          { class: `ct-group ct-${size}`, part: 'group', attrs: { 'aria-labelledby': name ? headingId : null } }, // prettier-ignore
          name ? h('h3', { class: 'ct-group-name', text: name, attrs: { id: headingId } }) : null, // prettier-ignore
          h('ul', { class: `ct-list ${this.layout}` }, ...visible.map((p) => h('li', {}, this.personView(p, size)))), // prettier-ignore
        ),
      );
    }
    if (!box.children.length) box.append(h('p', { class: 'data-none', text: t('contributorsNoMatch') })); // prettier-ignore
    body.append(box);
    if (hidden)
      body.append(
        h('button', {
          class: 'text-btn ct-more',
          text: t('contributorsMore', { count: formatNumber(hidden, this.locale) }),
          attrs: { type: 'button', 'data-focus-key': 'more' },
          on: {
            click: () => {
              this.expanded = true;
              this.render();
            },
          },
        }),
      );
  }

  /** @returns {"grid" | "avatars" | "list"} */
  get layout() {
    return parseEnum(this.getAttribute('layout'), LAYOUTS, 'grid');
  }

  /**
   * @param {Group} group
   * @param {number} rank - Rank of a sponsor tier, `-1` when groups are not tiers.
   * @returns {"small" | "medium" | "large"}
   */
  sizeFor(group, rank) {
    const asked = this.getAttribute('size');
    if (asked) return parseEnum(asked, /** @type {const} */ (['small', 'medium', 'large']), 'medium'); // prettier-ignore
    if (group.size) return group.size;
    if (rank < 0) return this.layout === 'avatars' ? 'small' : 'medium';
    return rank === 0 ? 'large' : rank === 1 ? 'medium' : 'small';
  }

  /**
   * @param {Person[]} people
   * @returns {HTMLElement | null}
   */
  filtersView(people) {
    const t = this.t;
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const p of people) for (const type of p.types) counts.set(type, (counts.get(type) ?? 0) + 1); // prettier-ignore
    if (!counts.size) return null;
    const box = h('div', { class: 'ct-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('contributorsFilter') } }); // prettier-ignore
    const types = /** @type {string[]} */ (Object.keys(TYPES)).filter((type) => counts.has(type));
    for (const type of [null, ...types]) {
      const label = type ? t(/** @type {StringKey} */ (`contributorsType_${type}`)) : t('contributorsAll'); // prettier-ignore
      box.append(
        h(
          'button',
          {
            class: 'ct-filter',
            attrs: { type: 'button', 'aria-pressed': String(this.typeFilter === type), 'data-focus-key': `type-${type ?? 'all'}` }, // prettier-ignore
            on: {
              click: () => {
                this.typeFilter = type;
                this.render();
                emit(this, EVENTS.FILTER_CHANGE, { type });
              },
            },
          },
          type ? h('span', { class: 'ct-emoji', text: TYPES[/** @type {keyof typeof TYPES} */ (type)], attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
          h('span', { text: label }),
          h('span', { class: 'ct-count', text: formatNumber(type ? (counts.get(type) ?? 0) : people.length, this.locale) }), // prettier-ignore
        ),
      );
    }
    return box;
  }

  /**
   * @param {Person} person
   * @param {"small" | "medium" | "large"} size
   * @returns {HTMLElement}
   */
  personView(person, size) {
    const t = this.t;
    const faces = this.layout === 'avatars';
    const counts = this.flag('counts') && person.contributions !== null && !person.sponsor;
    const details = [
      person.login && person.login !== person.name ? h('span', { class: 'ct-login', text: `@${person.login}` }) : null, // prettier-ignore
      counts ? h('span', { class: 'ct-commits', text: t('contributorsCommits', { count: formatNumber(/** @type {number} */ (person.contributions), this.locale) }) }) : null, // prettier-ignore
    ].filter((d) => d !== null);
    const types = person.types.length
      ? h('span', { class: 'ct-types' }, ...person.types.map((type) => { const label = t(/** @type {StringKey} */ (`contributorsType_${type}`)); return h('span', { class: 'ct-type', text: TYPES[/** @type {keyof typeof TYPES} */ (type)], attrs: { title: label, role: 'img', 'aria-label': label } }); })) // prettier-ignore
      : null;
    const inner = [
      this.avatarView(person, PIXELS[size]),
      h('span', { class: faces ? 'ct-name sr-only' : 'ct-name', part: 'name', text: person.name }),
      faces ? null : details.length ? h('span', { class: 'ct-details' }, ...details) : null,
      faces ? null : types,
    ];
    const attrs = { title: faces ? person.name : null };
    if (!person.url) return h('div', { class: 'ct-person', part: 'person', attrs }, ...inner);
    return h(
      'a',
      {
        class: 'ct-person',
        part: 'person',
        attrs: {
          ...attrs,
          href: person.url,
          rel: person.sponsor ? 'sponsored noopener' : 'noopener',
        },
      },
      ...inner,
    );
  }

  /**
   * @param {Person} person
   * @param {number} pixels
   * @returns {HTMLElement}
   */
  avatarView(person, pixels) {
    const fallback = () =>
      h('span', { class: 'ct-avatar ct-initials', part: 'avatar', text: initials(person.name), attrs: { 'aria-hidden': 'true' } }); // prettier-ignore
    if (!person.avatar) return fallback();
    const image = h('img', {
      class: 'ct-avatar',
      part: 'avatar',
      attrs: {
        src: sizedAvatar(person.avatar, pixels * 2),
        alt: '',
        width: String(pixels),
        height: String(pixels),
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
      },
      on: { error: () => image.replaceWith(fallback()) },
    });
    return image;
  }
}

/**
 * @param {"contributions" | "name" | "amount"} sort
 * @param {string} locale
 * @returns {(a: Person, b: Person) => number}
 */
function comparator(sort, locale) {
  if (sort === 'name') return (a, b) => a.name.localeCompare(b.name, locale);
  const key = sort === 'amount' ? 'amount' : 'contributions';
  return (a, b) => (b[key] ?? -1) - (a[key] ?? -1);
}
