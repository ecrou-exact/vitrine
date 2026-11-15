// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import csvCss from '../../styles/csv.css?raw';
import accessCss from '../../styles/access-log.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { csvText } from '../../core/csv.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { createTabs } from '../../core/ui.js';
import { formatDuration } from '../job/job.js';
import { formatSize } from '../upload/files.js';
import { maskIp, readAccessLog, statusClass, summarize, timeline, top } from './access.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./access.js').Request} Request */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const CLASSES = /** @type {const} */ (['2xx', '3xx', '4xx', '5xx']);
/** Field names a filter may name: `status:404`, `ip:203.0.113.7`. */
const FIELDS = ['ip', 'status', 'method', 'path', 'user', 'agent', 'host', 'referer', 'bot', 'browser', 'os']; // prettier-ignore

/**
 * Web server access logs read like an analytics page: totals (requests, visitors, errors, data,
 * response times, bots), requests per period by class of status, the requests in a table whose
 * rows open on their details, and top lists of pages, IPs, browsers and bots, referers, 404s and
 * slow pages. Every entry of a top list keeps only its requests.
 *
 * Reads Apache and Nginx logs (common and combined formats, with `$request_time`), IIS logs
 * (W3C extended, `#Fields:`) and JSON lines of Caddy, Traefik or Nginx; each line is read on its
 * own, so logs can be mixed. `anonymize` hides the end of IP addresses, for logs shown to others.
 * Add lines live with `write()`.
 *
 * @element vt-access-log
 * @since 0.15.0
 *
 * @attr {boolean} anonymize - Hides the last part of IP addresses (`203.0.113.0`).
 * @attr {"newest"|"oldest"} order - Order of the table (default `newest`).
 * @attr {number} page - Rows drawn before "Show more" (default 200).
 * @attr {string} filter - The filter at first: words, `status:404`, `ip:…`, `bot:yes`.
 * @attr {boolean} chart - Requests per period. Default: on.
 * @attr {boolean} filters - Status buttons and the filter field. Full variant: on.
 * @attr {boolean} tabs - Requests / Top lists tabs. Full variant: on.
 *
 * @prop {string} content - The log.
 * @prop {Request[]} requests - The requests read (read-only).
 *
 * @fires vt-filter-change - The status or the filter changed. Detail: `{ status, filter, shown }`.
 * @fires vt-tab-change - The view changed. Detail: `{ tab }`.
 *
 * @csspart stats - The totals.
 * @csspart chart - Requests per period.
 * @csspart table - The requests.
 * @csspart top - The top lists.
 *
 * @example
 * <vt-access-log variant="full" anonymize src="/logs/access.log"></vt-access-log>
 */
export class VtAccessLog extends VtDataElement {
  static type = 'access-log';

  static editorLanguage = 'plaintext';

  static keepCarriageReturns = false;

  static componentAttributes = Object.freeze(['anonymize', 'order', 'page', 'filter', 'chart', 'filters', 'tabs']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, filters: true, tabs: true }, // prettier-ignore
  };

  static styles = [syntaxCss, codeCss, dataCss, csvCss, accessCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {{ text: string, requests: Request[] } | null} */
    this.cache = null;
    /** @type {string | null} */
    this.statusFilter = null;
    /** @type {string | null} */
    this.query = null;
    /** @type {"requests" | "top" | null} */
    this.viewChoice = null;
    this.limit = 0;
    /** @type {Set<number>} Lines of the rows opened. */
    this.opened = new Set();
  }

  contentChanged() {
    this.cache = null;
  }

  /** @returns {Request[]} */
  get requests() {
    const text = this.text ?? '';
    if (this.cache?.text !== text) this.cache = { text, requests: readAccessLog(text) };
    return this.cache.requests;
  }

  /**
   * Adds lines to the log, as a server writes them.
   *
   * @param {string} lines
   */
  write(lines) {
    const chunk = String(lines).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!chunk) return;
    const before = this.content;
    const next = before ? `${before}\n${chunk}` : chunk;
    this.text = next;
    this._content = next;
    this.cache = null;
    this.requestRender();
  }

  /** @returns {"requests" | "top"} */
  get view() {
    return this.viewChoice ?? 'requests';
  }

  /** @returns {string} */
  get filter() {
    return this.query ?? this.getAttribute('filter') ?? '';
  }

  /**
   * @param {string} ip
   * @returns {string}
   */
  ip(ip) {
    return parseBoolean(this.getAttribute('anonymize')) === true ? maskIp(ip) : ip;
  }

  /**
   * Whether a request matches the filter: every word, in any field, or in the field it names.
   *
   * @param {Request} r
   * @param {string[]} words
   * @returns {boolean}
   */
  keeps(r, words) {
    const client = r.client.bot || [r.client.browser, r.client.os].filter(Boolean).join(' ');
    const values = /** @type {Record<string, string>} */ ({
      ip: this.ip(r.ip), status: String(r.status ?? ''), method: r.method, path: r.path, user: r.user, agent: r.agent,
      host: r.host, referer: r.referer, bot: r.client.device === 'bot' ? `yes ${r.client.bot}` : 'no', browser: client, os: r.client.os, // prettier-ignore
    }); // prettier-ignore
    return words.every((word) => {
      const at = word.indexOf(':');
      const field = at > 0 ? word.slice(0, at).toLowerCase() : '';
      if (FIELDS.includes(field)) {
        const wanted = word.slice(at + 1).toLowerCase();
        const value = values[field].toLowerCase();
        return field === 'status' || field === 'ip' || field === 'method' ? value === wanted || (field === 'status' && /^\dxx$/.test(wanted) && value[0] === wanted[0]) : value.includes(wanted); // prettier-ignore
      }
      const w = word.toLowerCase();
      return Object.values(values).some((v) => v.toLowerCase().includes(w)) || client.toLowerCase().includes(w); // prettier-ignore
    });
  }

  /**
   * @param {string} filter
   */
  setFilter(filter) {
    this.query = filter.slice(0, 300);
    this.limit = 0;
    this.render();
    const shown = this.shown(this.requests).length;
    emit(this, EVENTS.FILTER_CHANGE, { status: this.statusFilter, filter: this.query, shown });
  }

  /**
   * @param {Request[]} all
   * @returns {Request[]}
   */
  shown(all) {
    const words = this.filter.trim().split(/\s+/).filter(Boolean).slice(0, 10);
    return all.filter((r) => (!this.statusFilter || statusClass(r.status) === this.statusFilter) && (!words.length || this.keeps(r, words))); // prettier-ignore
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const all = this.requests;
    const shown = this.shown(all);
    const body = h('div', { class: 'body data-body ax-body', part: 'body' });
    if (!all.length) body.append(h('p', { class: 'data-none', text: t('accessEmpty') }));
    else {
      body.append(this.statsView(shown));
      if (this.flag('chart')) {
        const chart = this.chartView(shown);
        if (chart) body.append(chart);
      }
      if (this.feature('filters')) body.append(this.filtersView(all, shown));
      if (!shown.length) body.append(h('p', { class: 'data-none', text: t('accessNone') }));
      else body.append(this.view === 'top' ? this.topView(shown) : this.tableView(shown));
    }
    const tabs =
      this.feature('tabs') && all.length
        ? createTabs({
            tabs: [{ id: 'requests', label: t('accessTable'), icon: 'table' }, { id: 'top', label: t('accessTop'), icon: 'chart' }], // prettier-ignore
            selected: this.view,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.viewChoice = /** @type {"requests" | "top"} */ (id);
              this.render();
              /** @type {HTMLElement | null} */ (
                this.root.querySelector(`[data-tab="${id}"]`)
              )?.focus();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    const { panel, history } = this.previewPanel(body, this.panelId);
    if (tabs) panel.setAttribute('role', 'tabpanel');
    const csv = () => this.toCsv(this.shown(this.requests));
    frame.append(
      ...this.chrome({
        badge: all.length ? t('accessShown', { shown: formatNumber(shown.length, this.locale), total: formatNumber(all.length, this.locale) }) : '', // prettier-ignore
        tabs,
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName('access.log'), 'text/plain') : null, // prettier-ignore
          this.feature('copy') && shown.length ? this.copyButton(csv, t('accessCopyCsv')) : null,
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * @param {number} part
   * @param {number} whole
   * @returns {string}
   */
  percent(part, whole) {
    const share = whole ? part / whole : 0;
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: share && share < 0.1 ? 1 : 0 }).format(share); // prettier-ignore
  }

  /**
   * @param {Request[]} requests
   * @returns {HTMLElement}
   */
  statsView(requests) {
    const t = this.t;
    const s = summarize(requests);
    /** @type {[string, string, string?][]} */
    const tiles = [
      [t('accessRequests'), formatNumber(s.requests, this.locale)],
      [t('accessVisitors'), formatNumber(s.visitors, this.locale)],
      [t('accessErrors'), t('accessShare', { count: formatNumber(s.errors, this.locale), percent: this.percent(s.errors, s.requests) }), s.errors ? 'bad' : ''], // prettier-ignore
      [t('accessData'), formatSize(s.bytes, this.locale)],
      [t('accessBots'), t('accessShare', { count: formatNumber(s.bots, this.locale), percent: this.percent(s.bots, s.requests) })], // prettier-ignore
    ];
    if (s.median !== null && s.p95 !== null) tiles.push([t('accessLatency'), t('accessLatencyValue', { median: formatDuration(s.median), p95: formatDuration(s.p95) })]); // prettier-ignore
    return h(
      'dl',
      { class: 'ax-stats', part: 'stats' },
      ...tiles.map(([label, value, tone]) => h('div', { class: `ax-stat${tone ? ` ${tone}` : ''}` }, h('dt', { text: label }), h('dd', { text: value }))), // prettier-ignore
    );
  }

  /**
   * Requests per period, stacked by class of status.
   *
   * @param {Request[]} requests
   * @returns {HTMLElement | null}
   */
  chartView(requests) {
    const t = this.t;
    const data = timeline(requests);
    if (!data) return null;
    const peak = Math.max(
      1,
      ...data.buckets.map((b) => Object.values(b).reduce((a, n) => a + n, 0)),
    );
    const period = data.size >= 604_800_000 ? 'w' : data.size >= 86_400_000 ? 'd' : data.size >= 3_600_000 ? 'h' : data.size >= 60_000 ? 'min' : 's'; // prettier-ignore
    const when = (/** @type {number} */ time) => this.formatDate(time, data.size >= 86_400_000 ? { dateStyle: 'medium' } : { dateStyle: 'short', timeStyle: data.size >= 60_000 ? 'short' : 'medium' }); // prettier-ignore
    const end = data.start + data.size * data.buckets.length;
    const bars = h('div', { class: 'ax-bars', attrs: { 'aria-hidden': 'true' } });
    data.buckets.forEach((bucket, n) => {
      const total = Object.values(bucket).reduce((a, c) => a + c, 0);
      const bar = h('span', { class: 'ax-bar', attrs: { title: t('accessBar', { time: when(data.start + n * data.size), count: formatNumber(total, this.locale) }) } }); // prettier-ignore
      for (const key of [...CLASSES, 'other']) {
        if (!bucket[key]) continue;
        const part = h('span', { class: `ax-part c${key}` });
        part.style.setProperty('--_h', `${(bucket[key] / peak) * 100}%`);
        bar.append(part);
      }
      bars.append(bar);
    });
    return h(
      'figure',
      { class: 'ax-chart', part: 'chart', attrs: { role: 'img', 'aria-label': t('accessChart', { period: t(/** @type {StringKey} */ (`accessPeriod_${period}`)), from: when(data.start), to: when(end), peak: formatNumber(peak, this.locale) }) } }, // prettier-ignore
      bars,
      h('figcaption', { class: 'ax-axis', attrs: { 'aria-hidden': 'true' } }, h('span', { text: when(data.start) }), h('span', { text: when(end) })), // prettier-ignore
    );
  }

  /**
   * Status buttons and the filter field.
   *
   * @param {Request[]} all
   * @param {Request[]} shown
   * @returns {HTMLElement}
   */
  filtersView(all, shown) {
    const t = this.t;
    const box = h('div', { class: 'ax-filters' });
    const group = h('div', { class: 'ax-classes', attrs: { role: 'group', 'aria-label': t('accessFilter') } }); // prettier-ignore
    for (const c of [null, ...CLASSES]) {
      const count = c ? all.filter((r) => statusClass(r.status) === c).length : all.length;
      if (c && !count) continue;
      group.append(
        h(
          'button',
          {
            class: `ax-class${c ? ` c${c}` : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(this.statusFilter === c), 'data-focus-key': `class-${c ?? 'all'}` }, // prettier-ignore
            on: {
              click: () => {
                this.statusFilter = c;
                this.setFilter(this.filter);
              },
            },
          },
          h('span', { text: c ?? t('accessAll') }),
          h('span', { class: 'ax-count', text: formatNumber(count, this.locale) }),
        ),
      );
    }
    const input = h('input', {
      class: 'ax-search',
      attrs: { type: 'search', value: this.filter, 'aria-label': t('accessSearch'), placeholder: t('accessSearchPlaceholder'), spellcheck: 'false', autocomplete: 'off', 'data-focus-key': 'filter' }, // prettier-ignore
      on: { input: (e) => this.setFilter(/** @type {HTMLInputElement} */ (e.target).value) },
    });
    box.append(group, input, h('span', { class: 'ax-shown', attrs: { 'aria-live': 'polite' }, text: t('accessShown', { shown: formatNumber(shown.length, this.locale), total: formatNumber(all.length, this.locale) }) })); // prettier-ignore
    return box;
  }

  /**
   * @param {Request} r
   * @returns {string}
   */
  clientText(r) {
    return r.client.bot || [r.client.browser, r.client.os].filter(Boolean).join(' · ');
  }

  /**
   * The requests, the newest first; a row opens on its details.
   *
   * @param {Request[]} shown
   * @returns {HTMLElement}
   */
  tableView(shown) {
    const t = this.t;
    const ordered = parseEnum(this.getAttribute('order'), /** @type {const} */ (['newest', 'oldest']), 'newest') === 'newest' ? [...shown].reverse() : shown; // prettier-ignore
    const page = parseInteger(this.getAttribute('page'), { min: 20, max: 5000, fallback: 200 });
    const limit = this.limit || page;
    const heads = ['accessTime', 'accessIp', 'accessMethod', 'accessPath', 'accessStatus', 'accessSize', 'accessDuration', 'accessClient']; // prettier-ignore
    const head = h('tr', {}, ...heads.map((k) => h('th', { class: ['accessSize', 'accessDuration', 'accessStatus'].includes(k) ? 'col-number' : '', attrs: { scope: 'col' }, text: t(/** @type {StringKey} */ (k)) }))); // prettier-ignore
    const body = h('tbody');
    for (const r of ordered.slice(0, limit)) {
      const open = this.opened.has(r.line);
      const detailId = `ax-row-${r.line}`;
      body.append(
        h(
          'tr',
          { class: `ax-row c${statusClass(r.status)}${open ? ' open' : ''}` },
          h('td', { class: 'ax-time', text: r.time !== null ? this.formatDate(r.time, { dateStyle: 'short', timeStyle: 'medium' }) : '' }), // prettier-ignore
          h('td', {}, h('button', { class: 'ax-link', text: this.ip(r.ip), attrs: { type: 'button', title: t('accessKeep', { value: this.ip(r.ip) }), 'data-focus-key': `ip-${r.line}` }, on: { click: () => this.setFilter(`ip:${this.ip(r.ip)}`) } })), // prettier-ignore
          h('td', { class: 'ax-method', text: r.method }),
          h(
            'td',
            { class: 'ax-path' },
            h('button', { class: 'ax-toggle', text: r.path || '—', attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': open ? detailId : null, 'data-focus-key': `row-${r.line}` }, on: { click: () => { if (open) this.opened.delete(r.line); else this.opened.add(r.line); this.render(); } } }), // prettier-ignore
          ),
          h('td', { class: 'col-number' }, h('span', { class: `ax-status c${statusClass(r.status)}`, text: r.status === null ? '' : String(r.status) })), // prettier-ignore
          h('td', { class: 'col-number', text: r.bytes !== null ? formatSize(r.bytes, this.locale) : '' }), // prettier-ignore
          h('td', { class: 'col-number', text: r.duration !== null ? formatDuration(r.duration) : '' }), // prettier-ignore
          h('td', { class: `ax-client${r.client.device === 'bot' ? ' bot' : ''}`, text: this.clientText(r) }), // prettier-ignore
        ),
      );
      if (open) body.append(h('tr', { class: 'ax-detail', attrs: { id: detailId } }, h('td', { attrs: { colspan: String(heads.length) } }, this.detailView(r)))); // prettier-ignore
    }
    const box = h(
      'div',
      { class: 'ax-wrap' },
      h('div', { class: 'ax-scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': t('accessTable') } }, h('table', { class: 'grid ax-table', part: 'table' }, h('thead', {}, head), body)), // prettier-ignore
    );
    if (ordered.length > limit)
      box.append(h('button', { class: 'text-btn ax-more', text: t('accessMore', { count: formatNumber(Math.min(page, ordered.length - limit), this.locale) }), attrs: { type: 'button', 'data-focus-key': 'more' }, on: { click: () => { this.limit = limit + page; this.render(); } } })); // prettier-ignore
    return box;
  }

  /**
   * @param {Request} r
   * @returns {HTMLElement}
   */
  detailView(r) {
    const t = this.t;
    /** @type {[StringKey, string][]} */
    const rows = [
      ['accessAgent', r.agent],
      ['accessReferer', r.referer],
      ['accessUser', r.user],
      ['accessHost', r.host],
      ['accessProtocol', r.protocol],
    ];
    return h(
      'dl',
      { class: 'ax-details' },
      ...rows.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { text: t(k) }), h('dd', { text: v })]), // prettier-ignore
      h('dt', { text: t('accessLine', { line: r.line }) }),
      h('dd', { text: this.clientText(r) }),
    );
  }

  /**
   * Top lists; every entry keeps only its requests.
   *
   * @param {Request[]} requests
   * @returns {HTMLElement}
   */
  topView(requests) {
    const t = this.t;
    /** @type {[StringKey, [string, number][], string, ((v: string) => string)?][]} */
    const lists = [
      ['accessTopPaths', top(requests, (r) => r.path.split('?')[0]), 'path'],
      ['accessTopIps', top(requests, (r) => this.ip(r.ip)), 'ip'],
      ['accessTopClients', top(requests, (r) => r.client.bot || r.client.browser), 'browser'],
      ['accessTopSystems', top(requests, (r) => r.client.os), 'os'],
      ['accessTopStatus', top(requests, (r) => String(r.status ?? '')), 'status'],
      ['accessTopMissing', top(requests.filter((r) => r.status === 404), (r) => r.path.split('?')[0]), 'path'], // prettier-ignore
      ['accessTopReferers', top(requests, (r) => r.referer), 'referer'],
    ];
    const slow = this.slowest(requests);
    const grid = h('div', { class: 'ax-tops', part: 'top' });
    for (const [title, entries, field] of lists) {
      if (!entries.length) continue;
      grid.append(this.listView(t(title), entries, (value) => `${field}:${value.includes(' ') ? value.split(' ')[0] : value}`)); // prettier-ignore
    }
    if (slow.length) grid.append(this.listView(t('accessTopSlow'), slow.map(([p, ms]) => [p, ms]), (v) => `path:${v}`, (n) => formatDuration(n))); // prettier-ignore
    return grid;
  }

  /**
   * @param {Request[]} requests
   * @returns {[string, number][]} Pages by mean response time.
   */
  slowest(requests) {
    /** @type {Map<string, number[]>} */
    const times = new Map();
    for (const r of requests) {
      if (r.duration === null) continue;
      const p = r.path.split('?')[0];
      times.set(p, [...(times.get(p) ?? []), r.duration]);
    }
    return [...times].map(([p, list]) => /** @type {[string, number]} */ ([p, list.reduce((a, b) => a + b, 0) / list.length])).sort((a, b) => b[1] - a[1]).slice(0, 10); // prettier-ignore
  }

  /**
   * @param {string} title
   * @param {[string, number][]} entries
   * @param {(value: string) => string} filterOf
   * @param {(n: number) => string} [format]
   * @returns {HTMLElement}
   */
  listView(title, entries, filterOf, format) {
    const t = this.t;
    const most = Math.max(...entries.map(([, n]) => n));
    return h(
      'section',
      { class: 'ax-top' },
      h('h3', { text: title }),
      h(
        'ol',
        {},
        ...entries.map(([value, n]) => {
          const button = h(
            'button',
            { class: 'ax-entry', attrs: { type: 'button', title: t('accessKeep', { value }), 'data-focus-key': `top-${title}-${value}` }, on: { click: () => { this.viewChoice = 'requests'; this.setFilter(filterOf(value)); } } }, // prettier-ignore
            h('span', { class: 'ax-entry-name', text: value }),
            h('span', {
              class: 'ax-entry-count',
              text: format ? format(n) : formatNumber(n, this.locale),
            }),
          );
          button.style.setProperty('--_share', `${(n / most) * 100}%`);
          return h('li', {}, button);
        }),
      ),
    );
  }

  /**
   * @param {Request[]} requests
   * @returns {string}
   */
  toCsv(requests) {
    return csvText([
      ['time', 'ip', 'user', 'method', 'path', 'status', 'bytes', 'duration_ms', 'referer', 'user_agent', 'client'], // prettier-ignore
      ...requests.map((r) => [r.time !== null ? new Date(r.time).toISOString() : '', this.ip(r.ip), r.user, r.method, r.path, r.status ?? '', r.bytes ?? '', r.duration === null ? '' : Math.round(r.duration * 1000) / 1000, r.referer, r.agent, this.clientText(r)]), // prettier-ignore
    ]);
  }
}
