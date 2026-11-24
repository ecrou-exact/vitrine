// @ts-check
import redirectsCss from '../../styles/redirects.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { checkChain, parseRedirects, toText } from './redirects.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./redirects.js').Hop} Hop */
/** @typedef {import('./redirects.js').Step} Step */
/** @typedef {import('./redirects.js').ChainIssue} ChainIssue */
/** @typedef {import('./redirects.js').Chain} Chain */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const ICONS = { bad: 'shield-alert', warn: 'alert', info: 'status-circle' };

/**
 * Shows a chain of redirects, hop by hop: status, URL, how each hop sends to the next
 * (permanent, temporary, meta refresh, JavaScript), and what changes on the way: another
 * host or site, HTTPS left for HTTP, query parameters added (tracking ones marked). Loops,
 * long chains and chains ending in an error are reported. Reads a HAR file, curl output,
 * JSON or a list of URLs; nothing is fetched, and URLs are never links.
 *
 * @element vt-redirects
 * @since 0.15.0
 *
 * @attr {string} start - The first URL: for curl output without the `curl` command, or to start a HAR chain at another entry.
 * @attr {boolean} params - Query parameters added at each step. Default: on.
 *
 * @prop {string} content - The chain.
 * @prop {Hop[]} hops - The hops read (read-only), empty when they cannot be read.
 *
 * @fires vt-ready - Chain rendered. Detail: `{ type: "redirects" }`.
 * @fires vt-copy - Final URL or chain copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary.
 * @csspart issues - The list of issues.
 * @csspart chain - The ordered list of hops.
 * @csspart hop - A hop.
 * @csspart status - A status badge (also `status-3xx`… by class).
 * @csspart url - A URL.
 * @csspart step - What happens between two hops.
 * @csspart change - A change marked on a step (other site, HTTPS → HTTP, tracking…).
 *
 * @example
 * <vt-redirects variant="full">
 *   <template>
 *     301 http://example.com/
 *     302 https://example.com/
 *     200 https://www.example.com/home
 *   </template>
 * </vt-redirects>
 */
export class VtRedirects extends VtBase {
  static type = 'redirects';

  static componentAttributes = Object.freeze(['start', 'params']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [redirectsCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    super.disconnectedCallback();
  }

  /** @returns {import('./redirects.js').ParseResult} */
  read() {
    return parseRedirects(this.text ?? '', { start: this.getAttribute('start') });
  }

  /** @type {Hop[]} */
  get hops() {
    const result = this.read();
    return result.ok ? structuredClone(result.chain.hops) : [];
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body redirects-body', part: 'body' });
    /** @type {Hop[]} */
    let hops = [];
    if (!result.ok) {
      const key = /** @type {StringKey} */ (`redirectsInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`); // prettier-ignore
      body.append(noticeView(t(key, { detail: result.detail ?? '' })));
    } else {
      hops = result.chain.hops;
      const check = checkChain(hops);
      body.append(this.summaryView(hops, check.issues, check.sites));
      if (check.issues.length) body.append(this.issuesView(check.issues));
      body.append(this.chainView(hops, check.steps));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('redirects-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const final = hops[hops.length - 1]?.url;
    const copy = this.feature('copy') && hops.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toText(hops), t('redirectsCopyChain'), 'copy-chain') : null,
      copy && final ? this.copyButton(() => final, t('redirectsCopyFinal')) : null,
    ];
    const count = Math.max(0, hops.length - 1);
    const badge = result.ok
      ? count ? t('redirectsCount', { count: formatNumber(count, this.locale) }) : t('redirectsNone')
      : t('redirectsChain'); // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Hop[]} hops
   * @param {ChainIssue[]} issues
   * @param {string[]} sites
   * @returns {HTMLElement}
   */
  summaryView(hops, issues, sites) {
    const t = this.t;
    const count = hops.length - 1;
    const last = hops[hops.length - 1];
    const tone = issues.some((i) => i.level === 'bad') ? 'bad' : issues.some((i) => i.level === 'warn') ? 'warn' : 'ok'; // prettier-ignore
    const times = hops.map((hop) => hop.time).filter((x) => x !== null);
    const total = times.length === hops.length ? times.reduce((a, b) => a + b, 0) : null;
    return h(
      'div',
      { class: `redirects-summary ${tone}`, part: 'summary' },
      h(
        'p',
        { class: 'redirects-counts' },
        h('strong', { text: count ? t('redirectsCount', { count: formatNumber(count, this.locale) }) : t('redirectsNone') }), // prettier-ignore
        h('span', { text: t('redirectsSites', { count: formatNumber(sites.length, this.locale) }) }), // prettier-ignore
        total !== null ? h('span', { class: 'redirects-muted', text: t('redirectsTotalTime', { time: formatNumber(Math.round(total), this.locale) }) }) : null, // prettier-ignore
      ),
      h(
        'p',
        { class: 'redirects-final' },
        h('span', { class: 'redirects-muted', text: `${t('redirectsFinal')} ` }),
        last.status !== null ? this.statusBadge(last.status) : null,
        this.urlView(last.url),
      ),
      h('p', { class: 'redirects-muted', text: t('redirectsNotFetched') }),
    );
  }

  /**
   * @param {ChainIssue[]} issues
   * @returns {HTMLElement}
   */
  issuesView(issues) {
    const t = this.t;
    return h(
      'ul',
      { class: 'redirects-issues', part: 'issues' },
      ...issues.map((issue) =>
        h(
          'li',
          { class: `redirects-issue ${issue.level}` },
          h('span', { class: 'redirects-level' }, icon(ICONS[issue.level]), h('span', { text: t(/** @type {StringKey} */ (`redirectsLevel_${issue.level}`)) })), // prettier-ignore
          h('span', { text: t(/** @type {StringKey} */ (`redirectsIssue_${issue.code}`), { count: formatNumber(issue.count ?? 0, this.locale) }) }), // prettier-ignore
        ),
      ),
    );
  }

  /**
   * @param {Hop[]} hops
   * @param {Step[]} steps
   * @returns {HTMLElement}
   */
  chainView(hops, steps) {
    const t = this.t;
    return h(
      'ol',
      { class: 'redirects-chain', part: 'chain', attrs: { 'aria-label': t('redirectsChain') } },
      ...hops.map((hop, i) => {
        const step = steps[i];
        const meta = [hop.ip, hop.time !== null ? `${formatNumber(Math.round(hop.time), this.locale)} ms` : null].filter(Boolean).join(' · '); // prettier-ignore
        return h(
          'li',
          { class: `redirects-hop${i === hops.length - 1 ? ' final' : ''}`, part: 'hop' },
          h(
            'div',
            { class: 'redirects-line' },
            h('span', { class: 'redirects-index', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }), // prettier-ignore
            hop.status !== null
              ? this.statusBadge(hop.status)
              : h('span', { class: 'status status-none', part: 'status', text: hop.kind === 'meta' || hop.kind === 'script' ? '—' : t('redirectsStatusUnknown') }), // prettier-ignore
            this.urlView(hop.url),
          ),
          meta ? h('p', { class: 'redirects-meta redirects-muted', text: meta }) : null,
          step ? this.stepView(step) : null,
        );
      }),
    );
  }

  /**
   * @param {Step} step
   * @returns {HTMLElement}
   */
  stepView(step) {
    const t = this.t;
    const kind = step.from.kind ?? 'other';
    /** @type {HTMLElement[]} */
    const changes = [];
    /** @param {string} text @param {string} tone */
    const mark = (text, tone) => changes.push(h('span', { class: `redirects-change ${tone}`, part: 'change', text })); // prettier-ignore
    if (step.loop) mark(t('redirectsLoop'), 'bad');
    if (step.scheme === 'downgrade') mark(t('redirectsDowngrade'), 'bad');
    if (step.scheme === 'upgrade') mark(t('redirectsUpgrade'), 'ok');
    if (step.siteChange) mark(t('redirectsOtherSite'), 'warn');
    else if (step.hostChange) mark(t('redirectsOtherHost'), 'info');
    if (this.flag('params', true) && step.added.length) {
      const names = step.added.map((name) => (step.tracking.includes(name) ? `${name} (${t('redirectsTracking')})` : name)); // prettier-ignore
      mark(
        t('redirectsAdded', { params: names.join(', ') }),
        step.tracking.length ? 'warn' : 'info',
      );
    }
    return h(
      'div',
      { class: `redirects-step ${kind}`, part: 'step' },
      icon('chevron-down'),
      h('span', { class: 'redirects-kind', text: t(/** @type {StringKey} */ (`redirectsKind_${kind}`)) }), // prettier-ignore
      ...changes,
    );
  }

  /**
   * @param {number} status
   * @returns {HTMLElement}
   */
  statusBadge(status) {
    const kind = `${Math.floor(status / 100)}xx`;
    return h('span', { class: `status status-${kind}`, part: `status status-${kind}`, text: String(status) }); // prettier-ignore
  }

  /**
   * The URL as text, never a link: its origin, then the rest muted.
   *
   * @param {string} url
   * @returns {HTMLElement}
   */
  urlView(url) {
    if (!url) return h('span', { class: 'url redirects-muted', part: 'url', text: this.t('redirectsUnknownUrl') }); // prettier-ignore
    const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i.exec(url)?.[0] ?? '';
    return h(
      'span',
      { class: 'url', part: 'url' },
      origin ? h('span', { class: 'origin', text: origin }) : null,
      h('span', { class: 'rest', text: url.slice(origin.length) }),
    );
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
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
