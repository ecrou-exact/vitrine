// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import repoCss from '../../styles/repo.css?raw';
import { initials } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { shellQuote } from '../../core/shell.js';
import { noticeView } from '../../core/ui.js';
import { RepoError, compact, readRepo } from './repo.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./repo.js').Repo} Repo */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * A repository as a card: owner and name, description, topics, stars, forks, open issues and
 * watchers, the languages as a bar, the license, the latest release, the last activity, the
 * website, and the clone command to copy. A live alternative to a row of badges, for a
 * project's home page or a list of projects.
 *
 * Reads the GitHub API (`src="https://api.github.com/repos/owner/name"` with `allow-remote`),
 * the GitLab API, or `{ repo, languages, release }` put together at build time with
 * `/languages` and `/releases/latest`. Nothing is fetched but `src`.
 *
 * @element vt-repo
 * @since 0.16.0
 *
 * @attr {boolean} stats - Stars, forks, issues and watchers (default on).
 * @attr {boolean} languages - The language bar (default on).
 * @attr {boolean} clone - The clone command. Full variant: on.
 * @attr {boolean} topics - The topics (default on).
 * @attr {string} now - The current time, for relative dates in tests and screenshots.
 *
 * @prop {string} content - The JSON text.
 * @prop {Repo | null} repo - The repository read (read-only).
 *
 * @fires vt-copy - The clone command was copied. Detail: `{ text }`.
 *
 * @csspart card - The card.
 * @csspart name - Owner and name.
 * @csspart stats - The counts.
 * @csspart languages - The language bar and its legend.
 * @csspart meta - License, release, dates and website.
 * @csspart clone - The clone command.
 *
 * @example
 * <vt-repo src="https://api.github.com/repos/ecrou-exact/vitrine" allow-remote></vt-repo>
 */
export class VtRepo extends VtDataElement {
  static type = 'repo';

  static componentAttributes = Object.freeze(['stats', 'languages', 'clone', 'topics']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, clone: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, repoCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.nameId = uid('name');
  }

  /** @returns {{ repo: Repo | null, error: string | null }} */
  read() {
    try {
      return { repo: readRepo(JSON.parse(this.text ?? '')), error: null };
    } catch (error) {
      if (error instanceof RepoError) return { repo: null, error: this.t('rpShape') };
      return { repo: null, error: this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }) }; // prettier-ignore
    }
  }

  /** @returns {Repo | null} */
  get repo() {
    return this.read().repo;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const { repo, error } = this.read();
    const body = h('div', { class: 'body data-body rp-body', part: 'body' });
    if (error || !repo) body.append(noticeView(error ?? this.t('rpShape')));
    else body.append(this.cardView(repo));
    this.frameWith(frame, body, this.panelId, { file: 'repo.json', badge: repo ? (repo.host === 'gitlab' ? 'GitLab' : repo.host === 'github' ? 'GitHub' : 'Git') : 'JSON' }); // prettier-ignore
  }

  /**
   * @param {Repo} repo
   * @returns {HTMLElement}
   */
  cardView(repo) {
    const t = this.t;
    const hostName = repo.host === 'gitlab' ? 'GitLab' : 'GitHub';
    const avatar = repo.avatar
      ? h('img', { class: 'rp-avatar', attrs: { src: sizedAvatar(repo.avatar), alt: '', width: '40', height: '40', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } }) // prettier-ignore
      : h('span', { class: 'rp-avatar initials', text: initials(repo.owner || repo.name), attrs: { 'aria-hidden': 'true' } }); // prettier-ignore
    const title = h(
      'h3',
      { class: 'rp-name', part: 'name', attrs: { id: this.nameId } },
      repo.url
        ? h('a', { attrs: { href: repo.url, rel: 'noopener', target: '_blank' } }, repo.owner ? h('span', { class: 'rp-owner', text: `${repo.owner} / ` }) : null, h('strong', { text: repo.name })) // prettier-ignore
        : h('span', {}, repo.owner ? h('span', { class: 'rp-owner', text: `${repo.owner} / ` }) : null, h('strong', { text: repo.name })), // prettier-ignore
    );
    const badges = [repo.archived ? t('rpArchived') : '', repo.fork ? t('rpFork') : '', repo.template ? t('rpTemplate') : ''].filter(Boolean); // prettier-ignore
    const star =
      repo.url && repo.host !== 'other'
        ? h('a', { class: 'rp-star', attrs: { href: repo.url, rel: 'noopener', target: '_blank', title: t('rpStarOn', { name: repo.name, host: hostName }) } }, icon('star'), h('span', { text: t('rpStar') }), repo.stars !== null ? h('span', { class: 'rp-star-count', text: compact(repo.stars, this.locale) }) : null, h('span', { class: 'sr-only', text: ` (${t('rpStarOn', { name: repo.name, host: hostName })})` })) // prettier-ignore
        : null;
    return h(
      'article',
      { class: `rp-card${repo.archived ? ' archived' : ''}`, part: 'card', attrs: { 'aria-labelledby': this.nameId } }, // prettier-ignore
      h('header', { class: 'rp-head' }, avatar, h('div', { class: 'rp-title' }, title, badges.length ? h('span', { class: 'rp-badges' }, ...badges.map((b) => h('span', { class: 'rp-badge', text: b }))) : null), star), // prettier-ignore
      repo.description ? h('p', { class: 'rp-description', text: repo.description }) : null,
      this.flag('topics') && repo.topics.length ? this.topicsView(repo) : null,
      this.flag('stats') ? this.statsView(repo) : null,
      this.flag('languages') && repo.languages.length ? this.languagesView(repo) : null,
      this.metaView(repo),
      this.feature('clone') && repo.clone ? this.cloneView(repo.clone) : null,
    );
  }

  /**
   * @param {Repo} repo
   * @returns {HTMLElement}
   */
  topicsView(repo) {
    return h(
      'ul',
      { class: 'rp-topics', attrs: { 'aria-label': this.t('rpTopics') } },
      ...repo.topics.map((topic) => {
        const href = repo.host === 'github' ? `https://github.com/topics/${encodeURIComponent(topic)}` : null; // prettier-ignore
        return h('li', {}, href ? h('a', { class: 'rp-topic', text: topic, attrs: { href, rel: 'noopener', target: '_blank' } }) : h('span', { class: 'rp-topic', text: topic })); // prettier-ignore
      }),
    );
  }

  /**
   * @param {Repo} repo
   * @returns {HTMLElement | null}
   */
  statsView(repo) {
    const t = this.t;
    const base = repo.url && repo.host === 'github' ? repo.url : null;
    /** @type {[string, StringKey, number | null, string | null][]} */
    const stats = [
      ['star', 'rpStars', repo.stars, base ? `${base}/stargazers` : null],
      ['fork', 'rpForks', repo.forks, base ? `${base}/forks` : null],
      ['issue', 'rpIssues', repo.issues, base ? `${base}/issues` : repo.url && repo.host === 'gitlab' ? `${repo.url}/-/issues` : null], // prettier-ignore
      ['eye', 'rpWatchers', repo.watchers, base ? `${base}/watchers` : null],
    ];
    const items = stats.filter(([, , n]) => n !== null);
    if (!items.length) return null;
    return h(
      'ul',
      { class: 'rp-stats', part: 'stats' },
      ...items.map(([name, key, n, href]) => {
        const exact = formatNumber(/** @type {number} */ (n), this.locale);
        const inner = [icon(name), h('strong', { text: compact(/** @type {number} */ (n), this.locale), attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'rp-stat-name', text: t(key), attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'sr-only', text: t('rpStat', { count: exact, name: t(key) }) })]; // prettier-ignore
        return h('li', { class: 'rp-stat', attrs: { title: `${exact} ${t(key)}` } }, href ? h('a', { attrs: { href, rel: 'noopener', target: '_blank' } }, ...inner) : h('span', {}, ...inner)); // prettier-ignore
      }),
    );
  }

  /**
   * @param {Repo} repo
   * @returns {HTMLElement}
   */
  languagesView(repo) {
    const t = this.t;
    const percent = (/** @type {number} */ share) => new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: share < 0.1 ? 1 : 0 }).format(share); // prettier-ignore
    const bar = h('div', { class: 'rp-bar', attrs: { 'aria-hidden': 'true' } });
    for (const language of repo.languages) {
      const part = h('span', { class: 'rp-bar-part' });
      // Widths and colors from numbers and a fixed table, through CSSOM.
      part.style.setProperty('width', `${(language.share * 100).toFixed(2)}%`);
      part.style.setProperty('background-color', language.color);
      bar.append(part);
    }
    return h(
      'div',
      { class: 'rp-languages', part: 'languages' },
      h('h4', { class: 'sr-only', text: t('rpLanguages') }),
      bar,
      h(
        'ul',
        { class: 'rp-legend' },
        ...repo.languages.map((l) => {
          const dot = h('span', { class: 'rp-dot', attrs: { 'aria-hidden': 'true' } });
          dot.style.setProperty('background-color', l.color);
          return h('li', {}, dot, h('span', { class: 'rp-language', text: l.name === 'Other' ? t('rpOther') : l.name }), h('span', { class: 'rp-share', text: percent(l.share) })); // prettier-ignore
        }),
      ),
    );
  }

  /**
   * @param {Repo} repo
   * @returns {HTMLElement | null}
   */
  metaView(repo) {
    const t = this.t;
    /** @type {[string, StringKey, Node][]} */
    const rows = [];
    const time = (/** @type {number} */ ms) => h('time', { text: this.relativeTime(ms), attrs: { datetime: new Date(ms).toISOString(), title: this.formatDate(ms, { dateStyle: 'medium', timeZone: 'UTC' }) } }); // prettier-ignore
    if (repo.license) {
      const label = repo.license.id || repo.license.name;
      rows.push(['scale', 'rpLicense', repo.license.url ? h('a', { text: label, attrs: { href: repo.license.url, rel: 'noopener', target: '_blank', title: repo.license.name } }) : h('span', { text: label, attrs: { title: repo.license.name } })]); // prettier-ignore
    }
    if (repo.release) {
      const release = repo.release;
      const tag = release.url ? h('a', { text: release.tag, attrs: { href: release.url, rel: 'noopener', target: '_blank' } }) : h('span', { text: release.tag }); // prettier-ignore
      rows.push(['tag', 'rpRelease', h('span', {}, tag, release.date !== null ? ' · ' : '', release.date !== null ? time(release.date) : '')]); // prettier-ignore
    }
    if (repo.pushed !== null) rows.push(['history', 'rpUpdated', time(repo.pushed)]);
    if (repo.homepage) rows.push(['link', 'rpHomepage', h('a', { text: repo.homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''), attrs: { href: repo.homepage, rel: 'noopener', target: '_blank' } })]); // prettier-ignore
    if (!rows.length) return null;
    return h(
      'dl',
      { class: 'rp-meta', part: 'meta' },
      ...rows.map(([name, key, value]) => h('div', { class: 'rp-meta-row' }, h('dt', {}, icon(name), h('span', { text: t(key) })), h('dd', {}, value))), // prettier-ignore
    );
  }

  /**
   * @param {string} url
   * @returns {HTMLElement}
   */
  cloneView(url) {
    const t = this.t;
    const command = `git clone ${shellQuote(url)}`;
    return h(
      'div',
      { class: 'rp-clone', part: 'clone' },
      h('span', { class: 'rp-clone-label', text: t('rpClone') }),
      h('code', { class: 'rp-command', text: command }),
      this.copyButton(() => command, t('rpCopyClone'), 'clone'),
    );
  }
}

/**
 * GitHub and GitLab avatars at twice the size shown.
 *
 * @param {string} url
 * @returns {string}
 */
function sizedAvatar(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'avatars.githubusercontent.com') u.searchParams.set('s', '80');
    return u.href;
  } catch {
    return url;
  }
}
