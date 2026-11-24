// @ts-check
import waterfallCss from '../../styles/waterfall.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { formatSize } from '../upload/files.js';
import { defangUrl } from '../url/url.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { PHASES, TYPES, byHost, parseHar, toCsv, totals } from './waterfall.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./waterfall.js').Har} Har */
/** @typedef {import('./waterfall.js').Page} Page */
/** @typedef {import('./waterfall.js').Entry} Entry */
/** @typedef {import('./waterfall.js').ResourceType} ResourceType */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"requests" | "domains"} View */

/** Rows shown at first, and added by "Show more". */
const PAGE = 300;
/** @type {readonly View[]} */
const VIEWS = Object.freeze(['requests', 'domains']);

/**
 * Shows a HAR file as a network waterfall: each request with its method, status, type, size
 * and time, and a bar split into its phases (queued, DNS, connection, TLS, request, waiting,
 * download) against the DOMContentLoaded and load marks. A summary counts requests, domains,
 * third parties, bytes and failures, and lists the redirects before the page. Rows open on
 * their URL, server IP, timings and headers. Filters by type, text and third party; a view of
 * the domains contacted. Reads HAR 1.2 from browsers, Playwright, Lookyloo or proxies;
 * nothing is fetched and URLs are never links.
 *
 * @element vt-waterfall
 * @since 0.15.0
 *
 * @attr {"requests" | "domains"} view - Tab shown first. Default: requests.
 * @attr {number} page - The page shown when the file has several (1-based). Default: 1.
 * @attr {boolean} filters - Type, text and third-party filters. Default: on.
 * @attr {boolean} defang - Show URLs defanged. Default: off.
 *
 * @prop {string} content - The HAR file (JSON).
 * @prop {Har | null} har - The file read (read-only), `null` when it cannot be read.
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "waterfall" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-filter-change - Filters changed. Detail: `{ types, query, thirdParty, shown }`.
 * @fires vt-select - A request opened. Detail: `{ index, url, status }`.
 * @fires vt-copy - CSV or URLs copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @cssprop --vt-waterfall-name-width - Width of the name column (default 34%).
 *
 * @csspart summary - The summary of the page.
 * @csspart redirects - The redirects before the page.
 * @csspart filters - The filters.
 * @csspart requests - The table of requests.
 * @csspart bar - The bar of a request.
 * @csspart details - The details of an opened request.
 * @csspart domains - The table of domains.
 * @csspart legend - The legend of the phases.
 *
 * @example
 * <vt-waterfall variant="full" src="capture.har"></vt-waterfall>
 */
export class VtWaterfall extends VtBase {
  static type = 'waterfall';

  static componentAttributes = Object.freeze(['view', 'page', 'filters', 'defang', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [waterfallCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.ids = { query: uid('query'), page: uid('page') };
    /** @type {View | null} */
    this.viewState = null;
    /** @type {number | null} 0-based page chosen in the list. */
    this.pageState = null;
    /** @type {Set<ResourceType>} Types shown; empty: all. */
    this.types = new Set();
    this.thirdOnly = false;
    this.query = '';
    /** @type {Set<number>} Indexes of the opened requests. */
    this.opened = new Set();
    this.limit = PAGE;
    /** @type {{ text: string, result: ReturnType<typeof parseHar> } | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {ReturnType<typeof parseHar>} */
  read() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseHar(text) };
    return this.parsed.result;
  }

  /** @type {Har | null} */
  get har() {
    const result = this.read();
    return result.ok ? result.har : null;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'requests');
  }

  /**
   * @param {Har} har
   * @returns {number}
   */
  pageIndex(har) {
    const chosen = this.pageState ?? parseInteger(this.getAttribute('page'), { min: 1, max: 1000, fallback: 1 }) - 1; // prettier-ignore
    return Math.min(Math.max(0, chosen), Math.max(0, har.pages.length - 1));
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * @param {string} url
   */
  shown(url) {
    return this.flag('defang', false) ? defangUrl(url) : url;
  }

  /**
   * @param {number} ms
   * @returns {string}
   */
  ms(ms) {
    if (ms < 0) return '—';
    if (ms < 1000) return `${formatNumber(Math.round(ms), this.locale)} ms`;
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(ms / 1000)} s`;
  }

  /**
   * @param {number} bytes
   */
  bytes(bytes) {
    return bytes < 0 ? '—' : formatSize(bytes, this.locale);
  }

  /**
   * @param {Entry[]} entries
   * @returns {Entry[]}
   */
  filtered(entries) {
    const query = this.query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (!this.types.size || this.types.has(e.type)) &&
        (!this.thirdOnly || e.thirdParty) &&
        (!query || e.url.toLowerCase().includes(query) || String(e.status) === query),
    );
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body wf-body', part: 'body' });
    /** @type {Page | null} */
    let page = null;
    let tabs = null;
    if (!result.ok) {
      const key = /** @type {StringKey} */ (`wfInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`); // prettier-ignore
      body.append(noticeView(t(key, { detail: result.detail ?? '' })));
    } else if (!result.har.pages.length || !result.har.pages.some((p) => p.entries.length)) {
      body.append(noticeView(t('wfNoEntries')));
    } else {
      const har = result.har;
      page = har.pages[this.pageIndex(har)];
      const hosts = byHost(page.entries);
      tabs = this.feature('tabs')
        ? createTabs({
            tabs: [
              { id: 'requests', label: t('wfTabRequests', { count: page.entries.length }) },
              { id: 'domains', label: t('wfTabDomains', { count: hosts.length }) },
            ],
            selected: this.view,
            label: t('wfTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectView(/** @type {View} */ (id)),
          })
        : null;
      if (har.pages.length > 1) body.append(this.pagePicker(har));
      body.append(this.summaryView(page));
      if (har.capped) body.append(noticeView(t('wfCapped', { count: page.entries.length })));
      if (this.view === 'domains' && tabs) body.append(this.domainsView(hosts));
      else {
        if (this.flag('filters', true)) body.append(this.filtersView(page.entries));
        body.append(this.requestsView(page));
        body.append(this.legend());
      }
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('wf-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const entries = page ? this.filtered(page.entries) : [];
    const copy = this.feature('copy') && entries.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toCsv(entries), t('wfCopyCsv'), 'copy-csv') : null,
      copy ? this.copyButton(() => entries.map((e) => this.shown(e.url)).join('\n'), t('wfCopyUrls')) : null, // prettier-ignore
    ];
    frame.append(...this.chrome({ badge: 'HAR', tabs, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {View} view
   */
  selectView(view) {
    if (view === this.view) return;
    this.viewState = view;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${view}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
  }

  /**
   * @param {Har} har
   * @returns {HTMLElement}
   */
  pagePicker(har) {
    const t = this.t;
    const current = this.pageIndex(har);
    const select = h(
      'select',
      {
        attrs: { id: this.ids.page, 'data-focus-key': 'page' },
        on: {
          change: () => {
            this.pageState = Number(select.value);
            this.opened.clear();
            this.limit = PAGE;
            this.render();
          },
        },
      },
      ...har.pages.map((p, i) => h('option', { text: `${i + 1}. ${p.title || p.url || p.id}`.slice(0, 160), attrs: { value: String(i), selected: i === current } })), // prettier-ignore
    );
    return h('div', { class: 'wf-page' }, h('label', { attrs: { for: this.ids.page }, text: t('wfPage') }), select); // prettier-ignore
  }

  /**
   * @param {Page} page
   * @returns {HTMLElement}
   */
  summaryView(page) {
    const t = this.t;
    const sum = totals(page.entries);
    const facts = [
      h('strong', { text: t('wfRequests', { count: formatNumber(sum.requests, this.locale) }) }),
      h('span', { text: t('wfDomains', { count: sum.domains }) }),
      sum.thirdParty ? h('span', { text: t('wfThirdParty', { count: sum.thirdParty }) }) : null,
      h('span', { text: t('wfTransferred', { size: this.bytes(sum.transfer) }) }),
      sum.size ? h('span', { class: 'wf-muted', text: t('wfResources', { size: this.bytes(sum.size) }) }) : null, // prettier-ignore
      page.onContentLoad >= 0 ? h('span', { class: 'wf-dcl-text', text: t('wfDcl', { time: this.ms(page.onContentLoad) }) }) : null, // prettier-ignore
      page.onLoad >= 0 ? h('span', { class: 'wf-load-text', text: t('wfLoad', { time: this.ms(page.onLoad) }) }) : null, // prettier-ignore
      h('span', { class: 'wf-muted', text: t('wfFinish', { time: this.ms(page.duration) }) }),
      sum.failed ? h('span', { class: 'wf-bad' }, icon('alert'), h('span', { text: t('wfFailed', { count: sum.failed }) })) : null, // prettier-ignore
      sum.mixed ? h('span', { class: 'wf-bad' }, icon('alert'), h('span', { text: t('wfMixed', { count: sum.mixed }) })) : null, // prettier-ignore
    ];
    return h(
      'div',
      { class: 'wf-summary', part: 'summary' },
      page.title || page.url ? h('p', { class: 'wf-title' }, h('code', { text: page.title && page.title !== page.url ? page.title : this.shown(page.url) })) : null, // prettier-ignore
      h('p', { class: 'wf-facts' }, ...facts),
      page.redirects.length
        ? h(
            'div',
            { class: 'wf-redirects', part: 'redirects' },
            h('p', { class: 'wf-label', text: t('wfRedirectChain') }),
            h(
              'ol',
              {},
              ...page.redirects.map((u) => h('li', {}, h('code', { text: this.shown(u) }))),
            ),
          )
        : null,
    );
  }

  /**
   * @param {Entry[]} entries
   * @returns {HTMLElement}
   */
  filtersView(entries) {
    const t = this.t;
    const counts = new Map(TYPES.map((type) => [type, entries.filter((e) => e.type === type).length])); // prettier-ignore
    const chip = (/** @type {string} */ key, /** @type {string} */ label, /** @type {boolean} */ pressed, /** @type {() => void} */ onClick) =>
      h('button', { class: `wf-chip${pressed ? ' on' : ''}`, text: label, attrs: { type: 'button', 'aria-pressed': String(pressed), 'data-focus-key': `filter-${key}` }, on: { click: onClick } }); // prettier-ignore
    const input = h('input', {
      class: 'wf-query',
      attrs: { id: this.ids.query, type: 'search', value: this.query, placeholder: t('wfFilterUrl'), 'aria-label': t('wfFilterUrl'), 'data-focus-key': 'query', spellcheck: 'false' }, // prettier-ignore
      on: {
        input: () => {
          this.query = input.value.slice(0, 200);
          this.filtersChanged(entries);
        },
      },
    });
    return h(
      'div',
      {
        class: 'wf-filters',
        part: 'filters',
        attrs: { role: 'group', 'aria-label': t('wfFilters') },
      },
      chip('all', t('wfAll'), !this.types.size, () => {
        this.types.clear();
        this.filtersChanged(entries);
      }),
      ...TYPES.filter((type) => counts.get(type)).map((type) =>
        chip(
          type,
          `${t(/** @type {StringKey} */ (`wfType_${type}`))} ${counts.get(type)}`,
          this.types.has(type),
          () => {
            if (this.types.has(type)) this.types.delete(type);
            else this.types.add(type);
            if (this.types.size === TYPES.filter((x) => counts.get(x)).length) this.types.clear();
            this.filtersChanged(entries);
          },
        ),
      ),
      entries.some((e) => e.thirdParty)
        ? chip('third', t('wfThirdOnly'), this.thirdOnly, () => {
            this.thirdOnly = !this.thirdOnly;
            this.filtersChanged(entries);
          })
        : null,
      input,
    );
  }

  /**
   * @param {Entry[]} entries
   */
  filtersChanged(entries) {
    this.limit = PAGE;
    this.render();
    emit(this, EVENTS.FILTER_CHANGE, { types: [...this.types], query: this.query, thirdParty: this.thirdOnly, shown: this.filtered(entries).length }); // prettier-ignore
  }

  /**
   * @param {Page} page
   * @returns {HTMLElement}
   */
  requestsView(page) {
    const t = this.t;
    const rows = this.filtered(page.entries);
    if (!rows.length) return noticeView(t('wfNone'));
    const total = page.duration || 1;
    const marks = [
      ['dcl', page.onContentLoad],
      ['load', page.onLoad],
    ].filter(([, at]) => Number(at) >= 0);
    const ruler = h('div', { class: 'wf-ruler', attrs: { 'aria-hidden': 'true' } });
    const step = tickStep(total);
    for (let at = 0; at <= total && step > 0; at += step) {
      const tick = h('span', { class: 'wf-tick', text: this.ms(at) });
      tick.style.insetInlineStart = `${(at / total) * 100}%`;
      ruler.append(tick);
    }
    const head = h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { class: 'wf-c-name', attrs: { scope: 'col' }, text: t('wfName') }),
        h('th', { class: 'wf-c-status', attrs: { scope: 'col' }, text: t('wfStatus') }),
        h('th', { class: 'wf-c-type', attrs: { scope: 'col' }, text: t('wfType') }),
        h('th', { class: 'wf-c-size', attrs: { scope: 'col' }, text: t('wfSize') }),
        h('th', { class: 'wf-c-time', attrs: { scope: 'col' }, text: t('wfTime') }),
        h('th', { class: 'wf-c-lane', attrs: { scope: 'col' } }, h('span', { class: 'sr-only', text: t('wfWaterfall') }), ruler), // prettier-ignore
      ),
    );
    const bodyRows = rows.slice(0, this.limit).flatMap((e) => this.requestRows(e, total, /** @type {[string, number][]} */ (marks))); // prettier-ignore
    const more =
      rows.length > this.limit
        ? h('button', {
            class: 'text-btn wf-more',
            text: t('wfShowMore', { count: formatNumber(Math.min(PAGE, rows.length - this.limit), this.locale) }), // prettier-ignore
            attrs: { type: 'button', 'data-focus-key': 'more' },
            on: {
              click: () => {
                this.limit += PAGE;
                this.render();
              },
            },
          })
        : null;
    return h(
      'div',
      { class: 'wf-requests' },
      h('div', { class: 'wf-scroll' }, h('table', { class: 'wf-table', part: 'requests' }, head, h('tbody', {}, ...bodyRows))), // prettier-ignore
      more,
    );
  }

  /**
   * @param {Entry} e
   * @param {number} total
   * @param {[string, number][]} marks
   * @returns {HTMLElement[]}
   */
  requestRows(e, total, marks) {
    const t = this.t;
    const open = this.opened.has(e.index);
    const detailsId = `${this.panelId}-r${e.index}`;
    let name = e.url;
    try {
      const u = new URL(e.url);
      name =
        `${u.pathname.split('/').filter(Boolean).at(-1) ?? ''}${u.search}`.slice(0, 120) || u.host;
    } catch {
      // Not a URL: keep it whole.
    }
    const redirect = e.status >= 300 && e.status < 400 && e.redirect;
    const lane = h('div', { class: 'wf-lane' });
    const bar = h('span', {
      class: 'wf-bar',
      part: 'bar',
      attrs: { role: 'img', 'aria-label': `${t('wfBarLabel', { start: this.ms(e.start), time: this.ms(e.time) })}. ${this.phaseText(e)}` }, // prettier-ignore
    });
    bar.style.insetInlineStart = `${(e.start / total) * 100}%`;
    bar.style.width = `${Math.max(0.2, (e.time / total) * 100)}%`;
    const sum = PHASES.reduce((s, p) => s + e.timings[p], 0) || 1;
    for (const phase of PHASES) {
      if (!e.timings[phase]) continue;
      const seg = h('span', { class: `wf-seg ph-${phase}` });
      seg.style.width = `${(e.timings[phase] / sum) * 100}%`;
      bar.append(seg);
    }
    lane.append(bar);
    for (const [kind, at] of marks) {
      const line = h('span', { class: `wf-mark ${kind}`, attrs: { 'aria-hidden': 'true' } });
      line.style.insetInlineStart = `${(at / total) * 100}%`;
      lane.append(line);
    }
    const row = h(
      'tr',
      {
        class: `wf-row${e.failed ? ' failed' : ''}${open ? ' open' : ''}`,
        attrs: { 'data-index': e.index },
      },
      h(
        'th',
        { class: 'wf-c-name', attrs: { scope: 'row' } },
        h(
          'button',
          {
            class: 'wf-name',
            attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': open ? detailsId : null, title: this.shown(e.url), 'data-focus-key': `row-${e.index}` }, // prettier-ignore
            on: { click: () => this.toggle(e) },
          },
          h('span', { class: `wf-chevron${open ? ' open' : ''}`, attrs: { 'aria-hidden': 'true' } }, icon('chevron-right')), // prettier-ignore
          h('span', { class: 'wf-file' }, h('span', { class: 'wf-path', text: this.flag('defang', false) ? name.replace(/\./g, '[.]') : name }), h('span', { class: 'wf-host', text: this.flag('defang', false) ? e.host.replace(/\./g, '[.]') : e.host })), // prettier-ignore
        ),
        e.thirdParty ? h('span', { class: 'wf-tag', text: t('wfTag_third') }) : null,
        e.mixed ? h('span', { class: 'wf-tag bad', text: t('wfTag_mixed') }) : null,
        redirect ? h('span', { class: 'wf-tag', text: t('wfTag_redirect') }) : null,
      ),
      h('td', { class: `wf-c-status st-${Math.floor(e.status / 100)}` }, h('span', { text: e.status ? String(e.status) : t('wfFailedStatus') })), // prettier-ignore
      h('td', { class: 'wf-c-type', text: t(/** @type {StringKey} */ (`wfType_${e.type}`)) }),
      h('td', { class: 'wf-c-size', text: e.cached && e.transfer <= 0 ? t('wfCached') : this.bytes(e.transfer >= 0 ? e.transfer : e.size) }), // prettier-ignore
      h('td', { class: 'wf-c-time', text: this.ms(e.time) }),
      h('td', { class: 'wf-c-lane' }, lane),
    );
    if (!open) return [row];
    return [row, h('tr', { class: 'wf-detail-row' }, h('td', { attrs: { colspan: 6, id: detailsId } }, this.detailsView(e)))]; // prettier-ignore
  }

  /**
   * @param {Entry} e
   * @returns {string}
   */
  phaseText(e) {
    return PHASES.filter((p) => e.timings[p])
      .map((p) => `${this.t(/** @type {StringKey} */ (`wfPhase_${p}`))} ${this.ms(e.timings[p])}`)
      .join(', ');
  }

  /**
   * @param {Entry} e
   */
  toggle(e) {
    if (this.opened.has(e.index)) this.opened.delete(e.index);
    else {
      this.opened.add(e.index);
      emit(this, EVENTS.SELECT, { index: e.index, url: e.url, status: e.status });
    }
    this.render();
  }

  /**
   * @param {Entry} e
   * @returns {HTMLElement}
   */
  detailsView(e) {
    const t = this.t;
    /** @type {[StringKey, string][]} */
    const facts = [
      ['wfUrl', this.shown(e.url)],
      ['wfIp', e.ip],
      ['wfProtocol', e.httpVersion],
      ['wfMime', e.mime],
      ['wfRedirectTo', e.redirect ? this.shown(e.redirect) : ''],
      ['wfStart', this.ms(e.start)],
    ];
    const headers = (
      /** @type {StringKey} */ key,
      /** @type {import('./waterfall.js').Header[]} */ list,
    ) =>
      list.length
        ? h('details', { class: 'wf-headers' }, h('summary', { text: t(key, { count: list.length }) }), h('dl', {}, ...list.flatMap((x) => [h('dt', { text: x.name }), h('dd', { text: x.value })]))) // prettier-ignore
        : null;
    return h(
      'div',
      { class: 'wf-details', part: 'details' },
      h('dl', { class: 'wf-facts-list' }, ...facts.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { text: t(k) }), h('dd', {}, h('code', { text: v }))])), // prettier-ignore
      h(
        'div',
        { class: 'wf-timings' },
        h('p', { class: 'wf-label', text: t('wfTimings') }),
        h(
          'table',
          {},
          h(
            'tbody',
            {},
            ...PHASES.filter((p) => e.timings[p]).map(
              (p) =>
              h('tr', {}, h('th', { attrs: { scope: 'row' } }, h('span', { class: `wf-swatch ph-${p}`, attrs: { 'aria-hidden': 'true' } }), h('span', { text: t(/** @type {StringKey} */ (`wfPhase_${p}`)) })), h('td', { text: this.ms(e.timings[p]) })), // prettier-ignore
            ),
          ),
        ),
      ),
      headers('wfRequestHeaders', e.requestHeaders),
      headers('wfResponseHeaders', e.responseHeaders),
    );
  }

  /**
   * @param {ReturnType<typeof byHost>} hosts
   * @returns {HTMLElement}
   */
  domainsView(hosts) {
    const t = this.t;
    const dots = (/** @type {string} */ s) =>
      this.flag('defang', false) ? s.replace(/\./g, '[.]') : s;
    return h(
      'div',
      { class: 'wf-scroll' },
      h(
        'table',
        { class: 'wf-domains', part: 'domains' },
        h(
          'thead',
          {},
          h('tr', {}, ...[t('wfHost'), t('wfRequestsCol'), t('wfSize'), t('wfIps'), t('wfTypes')].map((x) => h('th', { attrs: { scope: 'col' }, text: x }))), // prettier-ignore
        ),
        h(
          'tbody',
          {},
          ...hosts.map((x) =>
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'row' } }, h('code', { text: dots(x.host) }), x.thirdParty ? h('span', { class: 'wf-tag', text: t('wfTag_third') }) : null), // prettier-ignore
              h('td', { class: 'wf-num', text: formatNumber(x.requests, this.locale) }),
              h('td', { class: 'wf-num', text: this.bytes(x.transfer) }),
              h('td', {}, h('code', { text: x.ips.join(', ') })),
              h('td', { text: x.types.map((type) => t(/** @type {StringKey} */ (`wfType_${type}`))).join(', ') }), // prettier-ignore
            ),
          ),
        ),
      ),
    );
  }

  /** @returns {HTMLElement} */
  legend() {
    const t = this.t;
    return h(
      'ul',
      { class: 'wf-legend', part: 'legend' },
      ...PHASES.map((p) => h('li', {}, h('span', { class: `wf-swatch ph-${p}`, attrs: { 'aria-hidden': 'true' } }), h('span', { text: t(/** @type {StringKey} */ (`wfPhase_${p}`)) }))), // prettier-ignore
      h('li', {}, h('span', { class: 'wf-swatch-line dcl', attrs: { 'aria-hidden': 'true' } }), h('span', { text: 'DOMContentLoaded' })), // prettier-ignore
      h('li', {}, h('span', { class: 'wf-swatch-line load', attrs: { 'aria-hidden': 'true' } }), h('span', { text: 'Load' })), // prettier-ignore
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'json',
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
    this.previewTimer = setTimeout(() => this.render(), 400);
  }
}

/**
 * A round step for the time ruler: about five ticks.
 *
 * @param {number} total - ms
 * @returns {number}
 */
function tickStep(total) {
  const raw = total / 5;
  if (raw <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  return step;
}
