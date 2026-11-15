// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import csvCss from '../../styles/csv.css?raw';
import lifecycleCss from '../../styles/lifecycle.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { csvText } from '../../core/csv.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { CycleError, cycleOf, readCycles, statusOf } from './cycles.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./cycles.js').Cycle} Cycle */
/** @typedef {import('./cycles.js').Status} Status */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const VIEWS = /** @type {const} */ (['table', 'schedule']);
const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/**
 * The release cycles of a product and their support: which versions are supported, until
 * when, and which ones reached their end of life, as a table and as a schedule like the one
 * of Node.js. Give `version` and it says whether that version is still supported.
 *
 * Reads the endoflife.date API (`/api/v1/products/{product}` or `/api/{product}.json`) or
 * `[{ version, released, support, eol, lts, latest }]`. Dates are days, shown in UTC.
 *
 * @element vt-lifecycle
 * @since 0.15.0
 *
 * @attr {string} version - A version to check, such as `20.11.1`: its cycle is marked and its support said.
 * @attr {"table"|"schedule"} view - What is shown at first (default `table`).
 * @attr {number} ended - Ended cycles shown before a "Show more" button (default 3).
 * @attr {string} now - The date support is judged at (ISO 8601), for documentation and tests.
 * @attr {boolean} tabs - Table / Schedule tabs. Full variant: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The cycles, as a value.
 * @prop {Cycle[]} cycles - The cycles read, newest first (read-only).
 *
 * @fires vt-tab-change - The view changed. Detail: `{ tab }`.
 *
 * @csspart check - What is said about `version`.
 * @csspart table - The table.
 * @csspart schedule - The schedule.
 * @csspart status - A status.
 *
 * @example
 * <vt-lifecycle variant="full" version="20.11.1" json-src="https://endoflife.date/api/v1/products/nodejs" allow-remote></vt-lifecycle>
 */
export class VtLifecycle extends VtDataElement {
  static type = 'lifecycle';

  static componentAttributes = Object.freeze(['version', 'view', 'ended', 'now', 'tabs']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, tabs: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, csvCss, lifecycleCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {"table" | "schedule" | null} */
    this.viewChoice = null;
    this.showAll = false;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewChoice = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** @returns {{ name: string, cycles: Cycle[], error: string | null }} */
  read() {
    try {
      return { ...readCycles(JSON.parse(this.text ?? '')), error: null };
    } catch (error) {
      const message = error instanceof CycleError ? this.t('lifecycleShape') : this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }); // prettier-ignore
      return { name: '', cycles: [], error: message };
    }
  }

  /** @returns {Cycle[]} */
  get cycles() {
    return this.read().cycles;
  }

  /** @returns {"table" | "schedule"} */
  get view() {
    return this.viewChoice ?? parseEnum(this.getAttribute('view'), VIEWS, 'table');
  }

  /**
   * @param {number | null} time
   * @returns {string}
   */
  day(time) {
    return time === null ? '' : this.formatDate(time, { dateStyle: 'medium', timeZone: 'UTC' });
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { cycles, error } = this.read();
    const now = this.now;
    const body = h('div', { class: 'body data-body lc-body', part: 'body' });
    const version = this.getAttribute('version')?.trim() ?? '';
    const mine = version ? cycleOf(cycles, version) : null;
    if (error) body.append(noticeView(error));
    else if (!cycles.length) body.append(h('p', { class: 'data-none', text: t('lifecycleEmpty') }));
    else {
      if (version) body.append(this.checkView(version, mine, now));
      const shown = this.shownCycles(cycles, now, mine);
      body.append(this.view === 'schedule' ? this.scheduleView(shown, now, mine) : this.tableView(shown, now, mine)); // prettier-ignore
      const hidden = cycles.length - shown.length;
      if (hidden > 0) body.append(this.moreButton(hidden));
    }
    const tabs =
      this.feature('tabs') && cycles.length
        ? createTabs({
            tabs: [{ id: 'table', label: t('lifecycleTable'), icon: 'table' }, { id: 'schedule', label: t('lifecycleSchedule'), icon: 'calendar' }], // prettier-ignore
            selected: this.view,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.viewChoice = /** @type {"table" | "schedule"} */ (id);
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
    const supported = cycles.filter((c) => !['eol', 'upcoming'].includes(statusOf(c, now))).length;
    const csv = () => this.toCsv(cycles, now);
    frame.append(
      ...this.chrome({
        badge: cycles.length ? t('lifecycleSupported', { count: formatNumber(supported, this.locale) }) : '', // prettier-ignore
        tabs,
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download') && cycles.length ? this.downloadButton(csv, this.downloadName('lifecycle.csv'), 'text/csv') : null, // prettier-ignore
          this.feature('copy') && cycles.length ? this.copyButton(csv, t('lifecycleCopyCsv')) : null, // prettier-ignore
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * Cycles not ended, and the newest `ended` ended ones (all of them once asked).
   *
   * @param {Cycle[]} cycles
   * @param {number} now
   * @param {Cycle | null} mine
   * @returns {Cycle[]}
   */
  shownCycles(cycles, now, mine) {
    if (this.showAll) return cycles;
    let room = parseInteger(this.getAttribute('ended'), { min: 0, max: 1000, fallback: 3 });
    return cycles.filter((c) => {
      if (statusOf(c, now) !== 'eol' || c === mine) return true;
      room -= 1;
      return room >= 0;
    });
  }

  /**
   * @param {number} count
   * @returns {HTMLElement}
   */
  moreButton(count) {
    return h('button', {
      class: 'text-btn lc-more',
      text: this.t('lifecycleShowEnded', { count: formatNumber(count, this.locale) }),
      attrs: { type: 'button', 'data-focus-key': 'more' },
      on: {
        click: () => {
          this.showAll = true;
          this.render();
        },
      },
    });
  }

  /**
   * @param {Status} status
   * @returns {HTMLElement}
   */
  statusChip(status) {
    return h('span', { class: `lc-status s-${status}`, part: 'status', text: this.t(/** @type {StringKey} */ (`lifecycleStatus_${status}`)) }); // prettier-ignore
  }

  /**
   * What is said about the version of `version`.
   *
   * @param {string} version
   * @param {Cycle | null} cycle
   * @param {number} now
   * @returns {HTMLElement}
   */
  checkView(version, cycle, now) {
    const t = this.t;
    const box = h('div', { class: 'lc-check', part: 'check', attrs: { role: 'note' } });
    if (!cycle) {
      box.classList.add('s-unknown');
      box.append(h('p', { text: t('lifecycleCheckUnknown', { version }) }));
      return box;
    }
    const status = statusOf(cycle, now);
    box.classList.add(`s-${status}`);
    const until = status === 'active' ? (cycle.activeEnd ?? cycle.eol) : status === 'upcoming' ? cycle.released : cycle.eol; // prettier-ignore
    const open = until === null && (status === 'active' || status === 'eol');
    const key = /** @type {StringKey} */ (`lifecycleCheck_${status}${open ? 'Open' : ''}`);
    box.append(
      this.statusChip(status),
      h('p', { text: t(key, { version, cycle: cycle.name, date: this.day(until), until: this.day(cycle.extendedEnd) }) }), // prettier-ignore
    );
    if (cycle.latest && cycle.latest.replace(/^v/i, '') !== version.replace(/^v/i, ''))
      box.append(h('p', { class: 'lc-update', text: t('lifecycleUpdate', { cycle: cycle.name, latest: cycle.latest }) })); // prettier-ignore
    return box;
  }

  /**
   * @param {Cycle} cycle
   * @returns {HTMLElement}
   */
  nameView(cycle) {
    return h(
      'span',
      { class: 'lc-name' },
      h('strong', { text: cycle.label && cycle.label !== cycle.name ? cycle.label : cycle.name }),
      cycle.lts ? h('span', { class: 'lc-lts', text: this.t('lifecycleLts') }) : null,
      cycle.codename ? h('span', { class: 'lc-codename', text: cycle.codename }) : null,
    );
  }

  /**
   * A support end: its date, "until" or "ended".
   *
   * @param {number | null} time
   * @param {number} now
   * @param {boolean | null} flag - When there is no date: `true` ended, `false` going on.
   * @returns {string}
   */
  endText(time, now, flag) {
    const t = this.t;
    if (time === null) return flag === null ? '' : t(flag ? 'lifecycleNo' : 'lifecycleYes');
    return t(time <= now ? 'lifecycleEnded' : 'lifecycleUntil', { date: this.day(time) });
  }

  /**
   * @param {Cycle[]} cycles
   * @param {number} now
   * @param {Cycle | null} mine
   * @returns {HTMLElement}
   */
  tableView(cycles, now, mine) {
    const t = this.t;
    const head = h('tr', {}, ...['lifecycleVersion', 'lifecycleStatus', 'lifecycleReleased', 'lifecycleActive', 'lifecycleSecurity', 'lifecycleLatest'].map((k) => h('th', { attrs: { scope: 'col' }, text: t(/** @type {StringKey} */ (k)) }))); // prettier-ignore
    const body = h('tbody');
    for (const cycle of cycles) {
      const status = statusOf(cycle, now);
      const ended = cycle.eol === null ? (cycle.ended ? true : cycle.supported ? false : null) : null; // prettier-ignore
      body.append(
        h(
          'tr',
          { class: `s-${status}${cycle === mine ? ' lc-mine' : ''}`, attrs: { 'aria-current': cycle === mine ? 'true' : null } }, // prettier-ignore
          h('th', { attrs: { scope: 'row' } }, this.nameView(cycle)),
          h('td', {}, this.statusChip(status)),
          h('td', { text: this.day(cycle.released) }),
          h('td', { text: this.endText(cycle.activeEnd, now, null) }),
          h('td', { text: this.endText(cycle.eol, now, ended) }),
          h('td', {}, cycle.latest ? (cycle.link ? h('a', { text: cycle.latest, attrs: { href: cycle.link, rel: 'noopener' } }) : cycle.latest) : ''), // prettier-ignore
        ),
      );
    }
    return h(
      'div',
      { class: 'lc-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('lifecycleTable') } }, // prettier-ignore
      h('table', { class: 'grid lc-table', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /**
   * Bars from release to end of life: active support, then security fixes, then extended
   * support, with a line for today. Each row says the same in words.
   *
   * @param {Cycle[]} cycles
   * @param {number} now
   * @param {Cycle | null} mine
   * @returns {HTMLElement}
   */
  scheduleView(cycles, now, mine) {
    const t = this.t;
    const starts = cycles.map((c) => c.released ?? now);
    const ends = cycles.map((c) => Math.max(c.extendedEnd ?? 0, c.eol ?? 0, c.activeEnd ?? 0, c.released ?? 0)); // prettier-ignore
    const from = Math.min(now - YEAR, ...starts);
    const to = Math.max(now + YEAR, ...ends);
    const span = to - from;
    const at = (/** @type {number} */ time) => `${(((time - from) / span) * 100).toFixed(3)}%`;
    const ruler = h('div', { class: 'lc-ruler', attrs: { 'aria-hidden': 'true' } });
    const firstYear = new Date(from).getUTCFullYear() + 1;
    const lastYear = new Date(to).getUTCFullYear();
    const step = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 12));
    for (let year = firstYear; year <= lastYear; year += step) {
      const tick = h('span', { class: 'lc-tick', text: String(year) });
      tick.style.setProperty('--_at', at(Date.UTC(year, 0, 1)));
      ruler.append(tick);
    }
    const today = h('span', { class: 'lc-today', attrs: { title: t('lifecycleToday') } });
    today.style.setProperty('--_at', at(now));
    ruler.append(today);
    const rows = h('ol', { class: 'lc-rows' });
    for (const cycle of cycles) {
      const status = statusOf(cycle, now);
      const track = h('div', { class: 'lc-track', attrs: { 'aria-hidden': 'true' } });
      const start = cycle.released ?? now;
      const eol = cycle.eol ?? (cycle.ended ? start : to);
      const segment = (
        /** @type {string} */ kind,
        /** @type {number} */ a,
        /** @type {number} */ b,
      ) => {
        if (b <= a) return;
        const bar = h('span', { class: `lc-bar b-${kind}${cycle.eol === null && !cycle.ended && kind !== 'extended' && b === to ? ' open' : ''}` }); // prettier-ignore
        bar.style.setProperty('--_start', at(a));
        bar.style.setProperty('--_width', `${(((b - a) / span) * 100).toFixed(3)}%`);
        track.append(bar);
      };
      const activeEnd = cycle.activeEnd !== null ? Math.min(cycle.activeEnd, eol) : eol;
      segment('active', start, activeEnd);
      segment('security', activeEnd, eol);
      if (cycle.extendedEnd !== null) segment('extended', eol, cycle.extendedEnd);
      const words = [
        t('lifecycleRow', { cycle: cycle.name, status: t(/** @type {StringKey} */ (`lifecycleStatus_${status}`)) }), // prettier-ignore
        cycle.released !== null ? `${t('lifecycleReleased')}: ${this.day(cycle.released)}.` : '',
        cycle.activeEnd !== null ? `${t('lifecycleActive')}: ${this.endText(cycle.activeEnd, now, null)}.` : '', // prettier-ignore
        cycle.eol !== null ? `${t('lifecycleSecurity')}: ${this.endText(cycle.eol, now, null)}.` : '', // prettier-ignore
      ].filter(Boolean);
      rows.append(
        h(
          'li',
          { class: `lc-row s-${status}${cycle === mine ? ' lc-mine' : ''}` },
          h('span', { class: 'lc-label', attrs: { 'aria-hidden': 'true' } }, this.nameView(cycle)),
          h('span', { class: 'sr-only', text: words.join(' ') }),
          track,
        ),
      );
    }
    const legend = h(
      'p',
      { class: 'lc-legend', attrs: { 'aria-hidden': 'true' } },
      ...['active', 'security', 'extended'].map((k) => h('span', { class: `lc-key b-${k}`, text: t(/** @type {StringKey} */ (`lifecycleStatus_${k}`)) })), // prettier-ignore
    );
    return h('div', { class: 'lc-schedule', part: 'schedule' }, ruler, rows, legend);
  }

  /**
   * @param {Cycle[]} cycles
   * @param {number} now
   * @returns {string}
   */
  toCsv(cycles, now) {
    const iso = (/** @type {number | null} */ time) => (time === null ? '' : new Date(time).toISOString().slice(0, 10)); // prettier-ignore
    return csvText([
      ['version', 'status', 'lts', 'released', 'active_support', 'security_support', 'extended_support', 'latest'], // prettier-ignore
      ...cycles.map((c) => [c.name, statusOf(c, now), c.lts ? 'yes' : 'no', iso(c.released), iso(c.activeEnd), iso(c.eol), iso(c.extendedEnd), c.latest]), // prettier-ignore
    ]);
  }
}
