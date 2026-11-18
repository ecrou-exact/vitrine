// @ts-check
import cookiesCss from '../../styles/cookies.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { checkCookie, parseCookies, toCookieHeader, toJson } from './cookies.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./cookies.js').Cookie} Cookie */
/** @typedef {import('./cookies.js').CheckedCookie} CheckedCookie */
/** @typedef {import('./cookies.js').CookieJar} CookieJar */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const ICONS = { bad: 'shield-alert', warn: 'alert', info: 'status-circle' };
/** Characters of a value shown before it is cut. */
const VALUE_PREVIEW = 48;

/**
 * Shows cookies as a table and checks each one: `__Host-` / `__Secure-` prefixes, Secure,
 * HttpOnly, SameSite, lifetime (browsers cap it at 400 days), size, scope, and whether it
 * belongs to the site or to a third party. Reads `Set-Cookie` headers, a `Cookie` header,
 * JSON (browser, Playwright or Puppeteer exports), a HAR file or a Netscape `cookies.txt`.
 * Nothing is sent or stored.
 *
 * @element vt-cookies
 * @since 0.15.0
 *
 * @attr {string} url - The URL the `Set-Cookie` headers came from: domain of cookies set without `Domain`.
 * @attr {string} site - The site (host or URL) to tell first and third parties apart. Default: the host of `url`, or of the first entry of a HAR file.
 * @attr {boolean} issues - The issues under each cookie. Default: on.
 * @attr {boolean} mask-values - Hides values until revealed. Default: on.
 *
 * @prop {string} content - The cookies.
 * @prop {CheckedCookie[]} cookies - The cookies read and checked (read-only), empty when they cannot be read.
 *
 * @fires vt-ready - Cookies rendered. Detail: `{ type: "cookies" }`.
 * @fires vt-copy - JSON or Cookie header copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary line.
 * @csspart cookies - The table.
 * @csspart cookie - A cookie row.
 * @csspart flag - A flag (Secure, HttpOnly, SameSite…).
 * @csspart party - The party of a cookie.
 * @csspart issue - An issue.
 * @csspart values-button - The show / hide values button.
 *
 * @example
 * <vt-cookies variant="full" url="https://shop.example.com/">
 *   <template>
 *     Set-Cookie: __Host-sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax
 *     Set-Cookie: _ga=GA1.2.1; Domain=example.com; Max-Age=63072000
 *   </template>
 * </vt-cookies>
 */
export class VtCookies extends VtBase {
  static type = 'cookies';

  static componentAttributes = Object.freeze(['url', 'site', 'issues', 'mask-values']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [cookiesCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** Only cookies with issues are shown. */
    this.issuesOnly = false;
    /** Values shown by the reader. */
    this.revealed = false;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    super.disconnectedCallback();
  }

  /** @returns {import('./cookies.js').ParseResult} */
  read() {
    return parseCookies(this.text ?? '', {
      url: this.getAttribute('url'),
      site: this.getAttribute('site'),
    });
  }

  /** @type {CheckedCookie[]} */
  get cookies() {
    const result = this.read();
    if (!result.ok) return [];
    const now = new Date();
    return result.jar.cookies.map((c) => checkCookie(c, result.jar.site, now));
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  get masking() {
    return this.flag('mask-values', true) && !this.revealed;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body cookies-body', part: 'body' });
    /** @type {CheckedCookie[]} */
    let checked = [];
    if (!result.ok) {
      const key = /** @type {StringKey} */ (`cookiesInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`); // prettier-ignore
      body.append(noticeView(t(key, { detail: result.detail ?? '' })));
    } else {
      const now = new Date();
      checked = result.jar.cookies.map((c) => checkCookie(c, result.jar.site, now));
      body.append(this.summaryView(checked, result.jar));
      const shown = this.issuesOnly ? checked.filter((c) => c.issues.some((i) => i.level !== 'info')) : checked; // prettier-ignore
      body.append(shown.length ? this.tableView(shown, result.jar.format === 'har') : h('p', { class: 'cookies-muted', text: t('cookiesNone') })); // prettier-ignore
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('cookies-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const cookies = checked.map((c) => c.cookie);
    const copy = this.feature('copy') && cookies.length > 0;
    const hasValues = cookies.some((c) => c.value);
    const actions = [
      ...history,
      this.editToggleButton(),
      result.ok
        ? iconButton({
            icon: this.issuesOnly ? 'list' : 'filter',
            label: this.issuesOnly ? t('cookiesShowAll') : t('cookiesIssuesOnly'),
            key: 'issues-only',
            pressed: this.issuesOnly,
            onClick: () => {
              this.issuesOnly = !this.issuesOnly;
              this.render();
            },
          })
        : null,
      this.flag('mask-values', true) && hasValues
        ? iconButton({
            icon: this.revealed ? 'eye-off' : 'eye',
            label: t(this.revealed ? 'cookiesHideValues' : 'cookiesShowValues'),
            key: 'values',
            part: 'values-button',
            pressed: this.revealed,
            onClick: () => {
              this.revealed = !this.revealed;
              this.render();
              this.announce(t(this.revealed ? 'cookiesValuesShown' : 'cookiesValuesHidden'));
            },
          })
        : null,
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toJson(cookies), t('cookiesCopyJson'), 'copy-json') : null,
      copy ? this.copyButton(() => toCookieHeader(cookies), t('cookiesCopyHeader')) : null,
    ];
    const badge = result.ok ? t('cookiesCount', { count: formatNumber(cookies.length, this.locale) }) : 'Cookies'; // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {CheckedCookie[]} checked
   * @param {CookieJar} jar
   * @returns {HTMLElement}
   */
  summaryView(checked, jar) {
    const t = this.t;
    const count = (/** @type {(c: CheckedCookie) => boolean} */ test) => formatNumber(checked.filter(test).length, this.locale); // prettier-ignore
    const bad = checked.flatMap((c) => c.issues).filter((i) => i.level === 'bad').length;
    const warn = checked.flatMap((c) => c.issues).filter((i) => i.level === 'warn').length;
    const tone = bad ? 'bad' : warn ? 'warn' : 'ok';
    return h(
      'div',
      { class: `cookies-summary ${tone}`, part: 'summary' },
      h(
        'p',
        { class: 'cookies-counts' },
        h('strong', { text: t('cookiesCount', { count: formatNumber(checked.length, this.locale) }) }), // prettier-ignore
        jar.site ? h('span', { text: t('cookiesThird', { count: count((c) => c.party === 'third') }) }) : null, // prettier-ignore
        h('span', { text: t('cookiesSession', { count: count((c) => c.cookie.session) }) }),
        bad || warn
          ? h('span', { class: `cookies-issue-count ${tone}` }, icon(ICONS[bad ? 'bad' : 'warn']), h('span', { text: t('cookiesIssues', { bad, warn }) })) // prettier-ignore
          : null,
      ),
      h(
        'p',
        { class: 'cookies-muted' },
        jar.site ? `${t('cookiesSite', { site: jar.site })} · ` : '',
        t('cookiesNotSent'),
      ),
    );
  }

  /**
   * @param {CheckedCookie[]} checked
   * @param {boolean} setBy - Show the URL that set each cookie (a HAR file: it varies).
   * @returns {HTMLElement}
   */
  tableView(checked, setBy) {
    const t = this.t;
    const showIssues = this.flag('issues', true);
    const rows = checked.flatMap((item) => {
      const { cookie, party, issues } = item;
      const worst = issues[0]?.level ?? 'ok';
      const row = h(
        'tr',
        { class: `cookie ${worst}`, part: 'cookie' },
        h(
          'th',
          { attrs: { scope: 'row' } },
          h('code', { class: 'cookies-name', text: cookie.name || t('cookiesNoName') }),
          setBy && cookie.url ? h('span', { class: 'cookies-muted cookies-url', text: t('cookiesSetBy', { url: cookie.url }) }) : null, // prettier-ignore
        ),
        h('td', { class: 'cookies-value' }, this.valueView(cookie.value)),
        h('td', { class: 'cookies-scope' }, this.scopeView(cookie)),
        h('td', { class: 'cookies-expires' }, ...this.expiresView(item)),
        h('td', {}, this.flagsView(cookie)),
        h('td', {}, h('span', {
          class: `cookies-party ${party ?? 'unknown'}`,
          part: 'party',
          text: party ? t(/** @type {StringKey} */ (`cookiesParty_${party}`)) : t('cookiesPartyUnknown'),
        })), // prettier-ignore
      );
      if (!showIssues || !issues.length) return [row];
      return [
        row,
        h(
          'tr',
          { class: 'cookies-issues-row' },
          h(
            'td',
            { attrs: { colspan: 6 } },
            h(
              'ul',
              { class: 'cookies-issues' },
              ...issues.map((issue) =>
                h(
                  'li',
                  { class: `cookies-issue ${issue.level}`, part: 'issue' },
                  h('span', { class: 'cookies-level' }, icon(ICONS[issue.level]), h('span', { text: t(/** @type {StringKey} */ (`cookiesLevel_${issue.level}`)) })), // prettier-ignore
                  h('span', { text: t(/** @type {StringKey} */ (`cookiesIssue_${issue.code}`), { domain: cookie.domain ?? '', setter: cookie.setter ?? '' }) }), // prettier-ignore
                ),
              ),
            ),
          ),
        ),
      ];
    });
    const column = (/** @type {StringKey} */ key) =>
      h('th', { attrs: { scope: 'col' }, text: t(key) });
    return h(
      'div',
      { class: 'cookies-scroll' },
      h(
        'table',
        { class: 'cookies-table', part: 'cookies' },
        h(
          'thead',
          {},
          h('tr', {}, column('cookiesName'), column('cookiesValue'), column('cookiesScope'), column('cookiesExpires'), column('cookiesFlags'), column('cookiesParty')), // prettier-ignore
        ),
        h('tbody', {}, ...rows),
      ),
    );
  }

  /**
   * @param {string} value
   * @returns {HTMLElement}
   */
  valueView(value) {
    if (!value) return h('span', { class: 'cookies-muted', text: '""' });
    if (this.masking)
      return h('code', { class: 'cookies-masked', text: `${'•'.repeat(8)}${value.length > 4 ? value.slice(-4) : ''}` }); // prettier-ignore
    if (value.length <= VALUE_PREVIEW) return h('code', { text: value });
    return h(
      'details',
      { class: 'cookies-long' },
      h('summary', {}, h('code', { text: `${value.slice(0, VALUE_PREVIEW)}…` })),
      h('code', { class: 'cookies-full', text: value }),
    );
  }

  /**
   * @param {Cookie} cookie
   * @returns {HTMLElement}
   */
  scopeView(cookie) {
    const t = this.t;
    return h(
      'span',
      {},
      h('code', { text: cookie.domain ?? '—' }),
      cookie.attributes && cookie.domain
        ? h('span', { class: 'cookies-muted', text: ` ${t(cookie.hostOnly ? 'cookiesHostOnly' : 'cookiesSubdomains')}` }) // prettier-ignore
        : null,
      cookie.path ? h('code', { class: 'cookies-path', text: cookie.path }) : null,
    );
  }

  /**
   * @param {CheckedCookie} item
   * @returns {(HTMLElement | string)[]}
   */
  expiresView(item) {
    const t = this.t;
    const { cookie, lifetime } = item;
    if (!cookie.attributes) return [h('span', { class: 'cookies-muted', text: '—' })];
    if (!cookie.expires || lifetime === null)
      return [h('span', { text: t('cookiesSessionLabel') })];
    if (lifetime <= 0) return [h('span', { class: 'cookies-muted', text: t('cookiesExpired') })];
    const date = new Intl.DateTimeFormat(this.locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(cookie.expires); // prettier-ignore
    return [
      h('span', { text: relative(lifetime, this.locale) }),
      h('time', { class: 'cookies-muted cookies-date', text: date, attrs: { datetime: cookie.expires.toISOString() } }), // prettier-ignore
    ];
  }

  /**
   * @param {Cookie} cookie
   * @returns {HTMLElement}
   */
  flagsView(cookie) {
    if (!cookie.attributes) return h('span', { class: 'cookies-muted', text: '—' });
    /** @type {[string, boolean][]} */
    const flags = [
      ['Secure', cookie.secure],
      ['HttpOnly', cookie.httpOnly],
      [`SameSite=${cookie.sameSite ?? '—'}`, cookie.sameSite !== null],
    ];
    if (cookie.partitioned) flags.push(['Partitioned', true]);
    return h(
      'span',
      { class: 'cookies-flags' },
      ...flags.map(([label, on]) =>
        h('span', {
          class: `cookies-flag ${on ? 'on' : 'off'}`,
          part: `flag${on ? '' : ' flag-off'}`,
          text:
            on || label.startsWith('SameSite')
              ? label
              : this.t('cookiesFlagMissing', { flag: label }),
        }),
      ),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: true,
      wrap: false,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}

/**
 * "in 3 days", "in 2 years"…
 *
 * @param {number} ms
 * @param {string} locale
 * @returns {string}
 */
function relative(ms, locale) {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const hours = ms / 3600000;
  if (hours < 1) return format.format(Math.max(1, Math.round(ms / 60000)), 'minute');
  if (hours < 48) return format.format(Math.round(hours), 'hour');
  const days = hours / 24;
  if (days < 60) return format.format(Math.round(days), 'day');
  if (days < 730) return format.format(Math.round(days / 30.44), 'month');
  return format.format(Math.round(days / 365.25), 'year');
}
