// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import changelogCss from '../../styles/changelog.css?raw';
import { copyText } from '../../core/actions.js';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { safeLink } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import {
  KINDS,
  anchorOf,
  compareLoose,
  inlineTokens,
  readChangelog,
  toMarkdown,
} from './changelog.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./changelog.js').Release} Release */
/** @typedef {import('./changelog.js').Kind} Kind */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * A changelog as a release-notes page. Reads `CHANGELOG.md` written as Keep a Changelog or
 * by conventional-changelog (semantic-release, release-please), GitHub or GitLab releases,
 * or a list of releases in JSON. Each version with its date, its badges (latest,
 * unreleased, pre-release, yanked), its compare and release links, and its changes in colored
 * groups, breaking changes first; `#123`, `@user` and commits linked to the repository.
 * Filters by kind of change, "what's new since" a version, links to each version, and copy of
 * the notes of a version or of everything shown as Markdown.
 *
 * @element vt-changelog
 * @since 0.16.0
 *
 * @attr {string} repo - Address of the repository (`https://github.com/owner/name`), for `#123`, `@user` and commits.
 * @attr {string} since - Shows only the releases after this version: "what's new since 1.2.0".
 * @attr {number} limit - Releases shown before "Show older releases" (default: all).
 * @attr {string} kinds - Kinds of changes shown at first, separated by commas: `breaking`, `security`, `added`, `changed`, `deprecated`, `removed`, `fixed`, `other`.
 * @attr {boolean} filters - Buttons that keep some kinds of changes. Full variant: on.
 * @attr {boolean} unreleased - Shows the Unreleased section (default on).
 *
 * @prop {string} content - The changelog text.
 * @prop {Release[]} releases - The releases read (read-only).
 *
 * @fires vt-filter-change - Kinds shown changed. Detail: `{ kinds, shown }`.
 *
 * @csspart filters - The kinds of changes.
 * @csspart release - A release.
 * @csspart version - The version heading.
 * @csspart group - A group of changes.
 * @csspart kind - The label of a group.
 *
 * @example
 * <vt-changelog src="/CHANGELOG.md" repo="https://github.com/owner/name" limit="5"></vt-changelog>
 */
export class VtChangelog extends VtDataElement {
  static type = 'changelog';

  static editorLanguage = 'markdown';

  static componentAttributes = Object.freeze(['repo', 'since', 'limit', 'kinds', 'filters', 'unreleased']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, filters: true }, // prettier-ignore
  };

  static styles = [syntaxCss, codeCss, dataCss, changelogCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {Set<Kind> | null} `null`: the `kinds` attribute. */
    this.kindFilter = null;
    this.expanded = false;
    this.scrolled = false;
  }

  contentChanged() {
    this.kindFilter = null;
    this.expanded = false;
  }

  /** @returns {{ releases: Release[], error: string | null }} */
  read() {
    try {
      const releases = readChangelog(this.text ?? '');
      return { releases, error: null };
    } catch (error) {
      if (error instanceof SyntaxError) return { releases: [], error: this.t('jsonInvalid', { message: error.message }) }; // prettier-ignore
      return { releases: [], error: this.t('clShape') };
    }
  }

  /** @returns {Release[]} */
  get releases() {
    return this.read().releases;
  }

  /** @returns {Set<Kind>} The kinds shown; empty: all. */
  get kinds() {
    if (this.kindFilter) return this.kindFilter;
    const asked = (this.getAttribute('kinds') ?? '').split(',').map((s) => s.trim().toLowerCase()); // prettier-ignore
    return new Set(
      /** @type {Kind[]} */ (asked.filter((k) => KINDS.includes(/** @type {Kind} */ (k)))),
    );
  }

  /** @returns {string | null} */
  get repo() {
    const url = safeLink(this.getAttribute('repo'));
    return url && /^https:\/\//.test(url) ? url : null;
  }

  /**
   * The releases in view: after `since`, without Unreleased when asked, with the kinds kept.
   *
   * @param {Release[]} releases
   * @param {boolean} [byKind] - Keeps only the kinds chosen (default).
   * @returns {Release[]}
   */
  inView(releases, byKind = true) {
    const since = (this.getAttribute('since') ?? '').trim().replace(/^v/i, '');
    let list = releases;
    if (parseBoolean(this.getAttribute('unreleased')) === false || since) list = list.filter((r) => !r.unreleased); // prettier-ignore
    if (since) list = list.filter((r) => compareLoose(r.version, since) > 0);
    const kinds = this.kinds;
    if (!kinds.size || !byKind) return list;
    return list
      .map((r) => ({
        ...r,
        groups: r.groups.filter(
          (g) => kinds.has(g.kind) || (kinds.has('breaking') && g.items.some((i) => i.breaking)),
        ),
      })) // prettier-ignore
      .filter((r) => r.groups.length);
  }

  /** @returns {Record<string, string>} Group headings by kind. */
  get labels() {
    return Object.fromEntries(KINDS.map((k) => [k, this.t(/** @type {StringKey} */ (`clKind_${k}`))])); // prettier-ignore
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { releases, error } = this.read();
    const body = h('div', { class: 'body data-body cl-body', part: 'body' });
    const shown = this.inView(releases);
    if (error) body.append(noticeView(error));
    else if (!releases.length) body.append(h('p', { class: 'data-none', text: t('clEmpty') }));
    else this.renderReleases(body, releases, shown);
    const { panel, history } = this.previewPanel(body, this.panelId);
    const list = /** @type {HTMLElement | null} */ (body.querySelector('.cl-list'));
    const count = releases.filter((r) => !r.unreleased).length;
    frame.append(
      ...this.chrome({
        badge: count ? (count === 1 ? t('clReleaseOne') : t('clReleases', { count: formatNumber(count, this.locale) })) : '', // prettier-ignore
        actions: [
          ...history,
          this.editToggleButton(),
          list ? this.searchButton(new TextSearch(list)) : null,
          this.fullscreenButton(),
          this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName('CHANGELOG.md'), 'text/markdown') : null, // prettier-ignore
          this.feature('copy') && shown.length ? this.copyButton(() => toMarkdown(shown, this.labels), t('clCopyAll')) : null, // prettier-ignore
        ],
      }),
      panel,
    );
    this.editor?.align();
    this.followHash();
  }

  /**
   * @param {HTMLElement} body
   * @param {Release[]} releases
   * @param {Release[]} shown
   */
  renderReleases(body, releases, shown) {
    const t = this.t;
    const since = (this.getAttribute('since') ?? '').trim().replace(/^v/i, '');
    if (since) body.append(this.sinceView(since, shown));
    if (this.feature('filters')) body.append(this.filtersView(this.inView(releases, false)));
    const limit = parseInteger(this.getAttribute('limit'), { min: 1, max: 10000, fallback: 0 });
    const visible = limit && !this.expanded ? shown.slice(0, limit) : shown;
    const latest = releases.find((r) => !r.unreleased && !r.prerelease && !r.yanked);
    const list = h('div', { class: 'cl-list' }, ...visible.map((r) => this.releaseView(r, r.version === latest?.version && !r.unreleased))); // prettier-ignore
    if (!shown.length && !since) list.append(h('p', { class: 'data-none', text: t('clNoMatch') }));
    body.append(list);
    if (visible.length < shown.length)
      body.append(
        h('button', {
          class: 'text-btn cl-more',
          text: t('clMore', { count: formatNumber(shown.length - visible.length, this.locale) }),
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

  /**
   * "New since 1.2.0": the releases after it, and their changes by kind.
   *
   * @param {string} since
   * @param {Release[]} shown
   * @returns {HTMLElement}
   */
  sinceView(since, shown) {
    const t = this.t;
    if (!shown.length) return h('p', { class: 'cl-since none', text: t('clNothingSince', { version: since }) }); // prettier-ignore
    /** @type {Map<Kind, number>} */
    const counts = new Map();
    for (const r of shown) for (const g of r.groups) for (const i of g.items) {
      const kind = i.breaking ? 'breaking' : g.kind;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    } // prettier-ignore
    return h(
      'div',
      { class: 'cl-since' },
      h('strong', { text: t('clSince', { version: since }) }),
      h('span', { text: shown.length === 1 ? t('clReleaseOne') : t('clSinceCount', { count: shown.length }) }), // prettier-ignore
      ...KINDS.filter((k) => counts.has(k)).map((k) => h('span', { class: `cl-count kind-${k}`, text: `${t(/** @type {StringKey} */ (`clKind_${k}`))}: ${counts.get(k)}` })), // prettier-ignore
    );
  }

  /**
   * Buttons that keep some kinds of changes, with their counts.
   *
   * @param {Release[]} releases
   * @returns {HTMLElement}
   */
  filtersView(releases) {
    const t = this.t;
    /** @type {Map<Kind, number>} */
    const counts = new Map();
    for (const r of releases) for (const g of r.groups) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.items.length); // prettier-ignore
    const kinds = this.kinds;
    const button = (/** @type {Kind | null} */ kind, /** @type {string} */ label, /** @type {number} */ count) =>
      h(
        'button',
        {
          class: `cl-filter${kind ? ` kind-${kind}` : ''}`,
          attrs: { type: 'button', 'aria-pressed': String(kind ? kinds.has(kind) : !kinds.size), 'data-focus-key': `kind-${kind ?? 'all'}` }, // prettier-ignore
          on: { click: () => this.toggleKind(kind) },
        },
        h('span', { text: label }),
        h('span', { class: 'cl-filter-count', text: formatNumber(count, this.locale) }),
      ); // prettier-ignore
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return h(
      'div',
      {
        class: 'cl-filters',
        part: 'filters',
        attrs: { role: 'group', 'aria-label': t('clFilters') },
      },
      button(null, t('clAll'), total),
      ...KINDS.filter((k) => counts.has(k)).map((k) => button(k, t(/** @type {StringKey} */ (`clKind_${k}`)), counts.get(k) ?? 0)), // prettier-ignore
    );
  }

  /** @param {Kind | null} kind - `null`: all. */
  toggleKind(kind) {
    const next = new Set(this.kinds);
    if (!kind) next.clear();
    else if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    this.kindFilter = next;
    this.render();
    emit(this, EVENTS.FILTER_CHANGE, { kinds: [...next], shown: this.inView(this.releases).length }); // prettier-ignore
  }

  /**
   * @param {Release} release
   * @param {boolean} latest
   * @returns {HTMLElement}
   */
  releaseView(release, latest) {
    const t = this.t;
    const anchor = anchorOf(release);
    const name = release.unreleased ? t('clUnreleased') : release.version;
    const headingId = `${this.panelId}-${anchor}`;
    const badges = [
      latest ? ['latest', t('clLatest')] : null,
      release.unreleased ? ['unreleased', t('clUnreleased')] : null,
      release.prerelease ? ['prerelease', t('clPrerelease')] : null,
      release.yanked ? ['yanked', t('clYanked')] : null,
    ].filter((b) => b !== null && !(b[0] === 'unreleased'));
    const groups = [...release.groups].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)); // prettier-ignore
    return h(
      'article',
      { class: `cl-release${release.yanked ? ' yanked' : ''}${release.unreleased ? ' unreleased' : ''}`, part: 'release', attrs: { 'aria-labelledby': headingId, 'data-anchor': anchor } }, // prettier-ignore
      h(
        'header',
        { class: 'cl-head' },
        h(
          'h3',
          { class: 'cl-version', part: 'version', attrs: { id: headingId } },
          h('span', { text: name }),
          release.title ? h('span', { class: 'cl-title', text: release.title }) : null,
        ),
        ...badges.map((b) => h('span', { class: `cl-badge ${b?.[0]}`, text: b?.[1] ?? '' })),
        release.date !== null ? h('time', { class: 'cl-date', text: this.formatDate(release.date, { dateStyle: 'medium', timeZone: 'UTC' }), attrs: { datetime: new Date(release.date).toISOString().slice(0, 10) } }) : null, // prettier-ignore
        h(
          'span',
          { class: 'cl-actions' },
          release.compare ? h('a', { class: 'cl-link', text: t('clCompare'), attrs: { href: release.compare, rel: 'noopener', target: '_blank' } }) : null, // prettier-ignore
          release.url ? h('a', { class: 'cl-link', text: t('clReleasePage'), attrs: { href: release.url, rel: 'noopener', target: '_blank' } }) : null, // prettier-ignore
          this.actionButton('link', t('clCopyLink', { version: name }), `link-${anchor}`, () => this.copyLink(anchor)), // prettier-ignore
          this.actionButton('copy', t('clCopyNotes', { version: name }), `copy-${anchor}`, () => copyText(toMarkdown([release], this.labels), this.root)), // prettier-ignore
        ),
      ),
      release.notes ? h('p', { class: 'cl-notes' }, ...this.inline(release.notes)) : null,
      ...groups.map((g) =>
        h(
          'section',
          { class: `cl-group kind-${g.kind}`, part: 'group' },
          h('h4', { class: 'cl-kind', part: 'kind', text: g.label && g.kind === 'other' ? g.label : t(/** @type {StringKey} */ (`clKind_${g.kind}`)) }), // prettier-ignore
          h(
            'ul',
            { class: 'cl-items' },
            ...g.items.map((item) =>
              h(
                'li',
                {
                  class: `cl-item${item.depth ? ' nested' : ''}${item.breaking ? ' breaking' : ''}`,
                },
                item.breaking && g.kind !== 'breaking' ? h('span', { class: 'cl-badge breaking', text: t('clBreaking') }) : null, // prettier-ignore
                item.scope ? h('strong', { class: 'cl-scope', text: `${item.scope}: ` }) : null,
                ...this.inline(item.text),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * @param {string} name
   * @param {string} label
   * @param {string} key
   * @param {() => Promise<boolean>} action
   * @returns {HTMLButtonElement}
   */
  actionButton(name, label, key, action) {
    const button = /** @type {HTMLButtonElement} */ (
      h(
        'button',
        {
          class: 'cl-icon-button',
          attrs: { type: 'button', 'aria-label': label, title: label, 'data-focus-key': key },
          on: {
            click: async () => {
              const ok = await action();
              button.replaceChildren(icon(ok ? 'check' : 'alert'));
              setTimeout(() => button.replaceChildren(icon(name)), 1500);
              this.announce(this.t(ok ? (name === 'link' ? 'clLinkCopied' : 'copied') : 'copyFailed')); // prettier-ignore
              if (ok) emit(this, EVENTS.COPY, { text: '' });
            },
          },
        },
        icon(name),
      )
    );
    return button;
  }

  /**
   * @param {string} anchor
   * @returns {Promise<boolean>}
   */
  copyLink(anchor) {
    const url = new URL(location.href);
    url.hash = anchor;
    return copyText(url.href, this.root);
  }

  /**
   * @param {string} source
   * @returns {(Node | string)[]}
   */
  inline(source) {
    return inlineTokens(source, this.repo).map((token) => {
      if (token.type === 'text') return token.text;
      if (token.type === 'link') {
        const label = token.code ? h('code', { text: token.text }) : token.text;
        return h('a', { attrs: { href: token.url, rel: 'noopener', target: '_blank' } }, label);
      }
      return h(token.type === 'code' ? 'code' : token.type, { text: token.text });
    });
  }

  /** The page address ends with `#v1.2.0`: the release is scrolled into view, once. */
  followHash() {
    if (this.scrolled || typeof location === 'undefined') return;
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!/^(v[\w.+-]+|unreleased)$/.test(hash)) return;
    const target = this.root.querySelector(`[data-anchor="${CSS.escape(hash)}"]`);
    if (!target) return;
    this.scrolled = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
}
