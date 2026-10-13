// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import cronCss from '../../styles/cron.css?raw';
import { parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { highlight } from '../../core/highlighter.js';
import { formatNumber } from '../../core/i18n.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import {
  FIELDS,
  isCrontab,
  isTimeZone,
  localTimeZone,
  nextRuns,
  parseCron,
  parseCrontab,
  weekGrid,
} from './cron.js';
import { describe, describeField, weekdayName } from './describe.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./cron.js').CronSchedule} CronSchedule */
/** @typedef {import('./cron.js').Crontab} Crontab */
/** @typedef {import('./cron.js').CrontabEntry} CrontabEntry */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Weekdays from Monday, as the week grid shows them. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * Displays cron schedules: one expression with its fields labelled, a description in plain
 * words, the next runs in a time zone and the hours of the week it runs, or a whole crontab
 * as a table of entries with their next run and command.
 *
 * Five fields (minute to day of week) or six (with seconds first), macros (`@daily`,
 * `@reboot`…), names (`JAN`, `MON`), lists, ranges and steps are read, and the Quartz
 * extensions `?`, `L`, `W` and `#`. When both the day of the month and the day of the week
 * are restricted, either one is enough, as cron does.
 *
 * @element vt-cron
 * @since 0.9.0
 *
 * @attr {string} expression - The expression, when there is no content.
 * @attr {number} count - Next runs listed, 0 to 50 (default `5`).
 * @attr {string} timezone - IANA time zone of the runs (default: the browser's).
 * @attr {string} now - Date the next runs are counted from (ISO 8601 or milliseconds; default: now).
 * @attr {boolean} system - Crontab with a user column (`/etc/crontab`).
 * @attr {boolean} grid - Hours of the week grid (default on).
 * @attr {boolean} fields - Labelled fields of the expression (default on).
 *
 * @prop {string} content - The expression or the crontab.
 * @prop {CronSchedule | null} schedule - The expression read (read-only; `null` for a crontab).
 * @prop {CrontabEntry[]} entries - Entries of a crontab (read-only).
 *
 * @fires vt-select - A crontab entry was selected. Detail: `{ line, schedule, command }`.
 *
 * @csspart fields - The fields of the expression.
 * @csspart field - One field.
 * @csspart description - The description in words.
 * @csspart runs - The list of next runs.
 * @csspart week - The hours of the week grid.
 * @csspart table - The table of crontab entries.
 * @csspart command - A command.
 * @csspart status - The validation status in edit mode.
 *
 * @example
 * <vt-cron variant="full" expression="30 9 * * 1-5" timezone="Europe/Paris"></vt-cron>
 */
export class VtCron extends VtBase {
  static type = 'cron';

  static componentAttributes = Object.freeze([
    'expression', 'count', 'timezone', 'now', 'system', 'grid', 'fields',
  ]); // prettier-ignore

  static presets = {
    simple: { grid: true, fields: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      grid: true, fields: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, cronCss];

  static allowEmpty = true;

  constructor() {
    super();
    this.panelId = uid('panel');
    this.query = '';
    this.matchCount = 0;
    /** @type {number} Line of the selected crontab entry. */
    this.selectedLine = 0;
    /** @type {HTMLElement | null} */
    this.tableHost = null;
    /** @type {HTMLElement | null} */
    this.detailHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.tickTimer = undefined;
    /** @type {{ key: string, value: CronSchedule | Crontab } | null} */
    this.parsed = null;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    clearTimeout(this.tickTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
  }

  // ------------------------------------------------------------------ model

  /** @returns {string} The expression or crontab shown. */
  get source() {
    return this.text || this.getAttribute('expression') || '';
  }

  /** @returns {boolean} */
  get isTab() {
    return isCrontab(this.source);
  }

  /** @returns {CronSchedule | Crontab} */
  model() {
    const key = `${this.isTab ? 'tab' : 'one'}|${this.hasAttribute('system')}|${this.source}`;
    if (this.parsed?.key !== key) {
      this.parsed = {
        key,
        value: this.isTab
          ? parseCrontab(this.source, { system: this.feature('system') })
          : parseCron(this.source),
      };
    }
    return this.parsed.value;
  }

  /** @returns {CronSchedule | null} */
  get schedule() {
    return this.isTab ? null : /** @type {CronSchedule} */ (this.model());
  }

  /** @returns {CrontabEntry[]} */
  get entries() {
    return this.isTab ? [.../** @type {Crontab} */ (this.model()).entries] : [];
  }

  /** @returns {string} */
  get timeZone() {
    const zone = this.getAttribute('timezone');
    return zone && isTimeZone(zone) ? zone : localTimeZone();
  }

  /** @returns {number} */
  get now() {
    const value = this.getAttribute('now');
    if (value) {
      const time = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
    return Date.now();
  }

  /** @returns {number} */
  get count() {
    return parseInteger(this.getAttribute('count'), { min: 0, max: 50, fallback: 5 });
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    clearTimeout(this.tickTimer);
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', {
      class: 'body cron-body',
      part: 'body',
      attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('cron') },
    });
    body.append(...this.zoneNotice());
    /** @type {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void } | null} */
    let target = null;
    if (!this.source.trim())
      body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else if (this.isTab) target = this.renderTab(body);
    else body.append(...this.expressionView(/** @type {CronSchedule} */ (this.model())));

    /** @type {(HTMLElement | null)[]} */
    let extra = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('cron-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        this.status(),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      target ? this.searchButton(target) : null,
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.source, this.downloadName('crontab'), 'text/plain')
        : null,
      this.feature('copy') ? this.copyButton(() => this.source, t('copy')) : null,
    ];
    const badge = this.isTab ? 'CRONTAB' : 'CRON';
    frame.append(...this.chrome({ badge: this.source.trim() ? badge : '', actions }), panel);
    this.editor?.align();
    this.scheduleTick();
  }

  /** Re-renders at the next minute, so relative times stay true (not with `now`). */
  scheduleTick() {
    if (this.hasAttribute('now') || this.editing || !this.source.trim()) return;
    const wait = 60000 - (Date.now() % 60000) + 50;
    this.tickTimer = setTimeout(() => {
      if (!this.editing && !this.searchQuery) this.render();
    }, wait);
  }

  /** @returns {HTMLElement[]} */
  zoneNotice() {
    const zone = this.getAttribute('timezone');
    return zone && !isTimeZone(zone) ? [noticeView(this.t('cronBadZone', { zone }))] : [];
  }

  /** @returns {HTMLElement} Validation status of the text being edited. */
  status() {
    const model = this.model();
    let error = '';
    if ('entries' in model) {
      if (model.invalid.length) error = this.invalidText(model);
    } else if (model.error) error = this.errorText(model);
    return h('div', {
      class: `cron-status${error ? ' invalid' : ''}`,
      part: 'status',
      attrs: { role: 'status' },
      text: error || this.t('cronValid'),
    });
  }

  /**
   * @param {CronSchedule} schedule
   * @returns {string}
   */
  errorText(schedule) {
    const error = schedule.error;
    if (!error) return '';
    const t = this.t;
    const message = t(/** @type {StringKey} */ (`cronError_${error.code}`), error.params);
    if (error.field < 0) return t('cronErrorAtAll', { message });
    const n = schedule.seconds ? error.field + 1 : error.field;
    return t('cronErrorAt', {
      n,
      field: t(/** @type {StringKey} */ (`cronField_${FIELDS[error.field].name}`)),
      column: error.column,
      message,
    });
  }

  /**
   * @param {Crontab} tab
   * @returns {string}
   */
  invalidText(tab) {
    const [first] = tab.invalid;
    const text = this.t('cronInvalidLines', {
      count: formatNumber(tab.invalid.length, this.locale),
      line: first.line,
    });
    if (!first.error) return text;
    /** @type {CronSchedule} */
    const schedule = {
      source: first.text,
      macro: null,
      reboot: false,
      seconds: false,
      fields: [],
      error: first.error,
    };
    return `${text} ${this.errorText(schedule)}`;
  }

  /**
   * One expression: fields, description, next runs and week grid.
   *
   * @param {CronSchedule} schedule
   * @param {string} [timeZone]
   * @returns {HTMLElement[]}
   */
  expressionView(schedule, timeZone = this.timeZone) {
    const t = this.t;
    if (schedule.error) {
      return [this.fieldsView(schedule), noticeView(this.errorText(schedule))];
    }
    const nodes = [];
    if (this.feature('fields') && !schedule.reboot) nodes.push(this.fieldsView(schedule));
    nodes.push(
      h('p', {
        class: 'cron-description',
        part: 'description',
        text: describe(schedule, t, this.locale),
      }),
    );
    if (this.count) nodes.push(this.runsView(schedule, timeZone));
    if (this.feature('grid') && !schedule.reboot) nodes.push(this.weekView(schedule));
    return nodes;
  }

  /**
   * The expression split into labelled fields, the wrong one marked.
   *
   * @param {CronSchedule} schedule
   * @returns {HTMLElement}
   */
  fieldsView(schedule) {
    const t = this.t;
    const wrap = h('div', { class: 'cron-fields', part: 'fields' });
    if (schedule.macro && !schedule.error) {
      wrap.append(h('code', { class: 'cron-macro', text: `${schedule.source} =` }));
    }
    if (schedule.error) {
      const words = schedule.source.split(/\s+/);
      const counted = words.length === 5 || words.length === 6;
      const bad = schedule.error.field - (words.length === 6 ? 0 : 1);
      words.forEach((word, i) => {
        const invalid = counted && i === bad;
        wrap.append(
          h(
            'span',
            { class: `field${invalid ? ' invalid' : ''}`, part: 'field' },
            h('code', { text: word }),
            counted
              ? h('span', {
                  class: 'field-name',
                  text: t(
                    /** @type {StringKey} */ (
                      `cronField_${FIELDS[i + (words.length === 6 ? 0 : 1)].name}`
                    ),
                  ),
                })
              : null,
          ),
        );
      });
      return wrap;
    }
    const start = schedule.seconds ? 0 : 1;
    for (let i = start; i < FIELDS.length; i += 1) {
      const field = schedule.fields[i];
      wrap.append(
        h(
          'span',
          {
            class: `field f-${field.name}${field.any ? ' any' : ''}`,
            part: 'field',
            attrs: { title: describeField(field, t, this.locale) },
          },
          h('code', { text: field.source }),
          h('span', {
            class: 'field-name',
            text: t(/** @type {StringKey} */ (`cronField_${field.name}`)),
          }),
        ),
      );
    }
    return wrap;
  }

  /**
   * @param {CronSchedule} schedule
   * @param {string} timeZone
   * @returns {HTMLElement}
   */
  runsView(schedule, timeZone) {
    const t = this.t;
    const section = h(
      'section',
      { class: 'cron-runs', attrs: { 'aria-label': t('cronNextRuns') } },
      h(
        'div',
        { class: 'cron-runs-head' },
        h('h3', { text: t('cronNextRuns') }),
        h('span', { class: 'cron-zone', text: t('cronTimeZone', { zone: timeZone }) }),
      ),
    );
    if (schedule.reboot) {
      section.append(h('p', { class: 'cron-none', text: t('cronNoRuns') }));
      return section;
    }
    const now = this.now;
    const runs = nextRuns(schedule, { from: now, count: this.count, timeZone });
    if (!runs.length) {
      section.append(h('p', { class: 'cron-none', text: t('cronNever') }));
      return section;
    }
    const format = this.dateFormat(timeZone, Boolean(schedule.seconds));
    section.append(
      h(
        'ol',
        { class: 'cron-run-list', part: 'runs' },
        ...runs.map((run) =>
          h(
            'li',
            {},
            h('time', { attrs: { datetime: run.toISOString() }, text: format.format(run) }),
            h('span', { class: 'cron-relative', text: relative(run.getTime(), now, this.locale) }),
          ),
        ),
      ),
    );
    return section;
  }

  /**
   * @param {string} timeZone
   * @param {boolean} seconds
   * @returns {Intl.DateTimeFormat}
   */
  dateFormat(timeZone, seconds) {
    return new Intl.DateTimeFormat(this.locale, {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: seconds ? '2-digit' : undefined,
      hourCycle: 'h23',
    });
  }

  /**
   * Weekdays by hours, shaded by the number of runs in each hour.
   *
   * @param {CronSchedule} schedule
   * @returns {HTMLElement}
   */
  weekView(schedule) {
    const t = this.t;
    const grid = weekGrid(schedule);
    const max = Math.max(1, ...grid.flat());
    const table = h('table', { class: 'cron-week', part: 'week' });
    table.append(
      h(
        'thead',
        { attrs: { 'aria-hidden': 'true' } },
        h(
          'tr',
          {},
          h('th'),
          ...Array.from({ length: 24 }, (_, hour) =>
            h('th', { class: 'hour', text: hour % 3 === 0 ? String(hour) : '' }),
          ),
        ),
      ),
    );
    const body = h('tbody');
    for (const dow of WEEK) {
      const name = weekdayName(this.locale, dow, 'short');
      const row = h('tr', {}, h('th', { attrs: { scope: 'row' }, text: name }));
      for (let hour = 0; hour < 24; hour += 1) {
        const count = grid[dow][hour];
        const level = count ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
        row.append(
          h('td', {
            class: `cell l${level}`,
            attrs: {
              title: t('cronCell', {
                day: weekdayName(this.locale, dow),
                hour: `${String(hour).padStart(2, '0')}:00`,
                count: formatNumber(count, this.locale),
              }),
            },
          }),
        );
      }
      body.append(row);
    }
    table.append(body);
    const [, , , dom, month] = schedule.fields;
    return h(
      'figure',
      { class: 'cron-week-figure' },
      h('figcaption', { text: t('cronWeek') }),
      h('div', { class: 'cron-week-scroll' }, table),
      !dom.any || !month.any ? h('p', { class: 'cron-note', text: t('cronWeekNote') }) : null,
    );
  }

  // ------------------------------------------------------------------ crontab

  /**
   * @param {HTMLElement} body
   * @returns {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }}
   */
  renderTab(body) {
    const tab = /** @type {Crontab} */ (this.model());
    if (tab.invalid.length) body.append(noticeView(this.invalidText(tab)));
    if (tab.variables.length) {
      body.append(
        h(
          'dl',
          { class: 'cron-vars', attrs: { 'aria-label': this.t('cronVariables') } },
          ...tab.variables.map((v) =>
            h(
              'div',
              {},
              h('dt', {}, h('code', { text: v.name })),
              h('dd', {}, h('code', { text: v.value })),
            ),
          ),
        ),
      );
    }
    if (!tab.entries.some((e) => e.line === this.selectedLine)) {
      this.selectedLine = tab.entries[0]?.line ?? 0;
    }
    this.tableHost = h('div', { class: 'cron-table-wrap' });
    this.detailHost = h('div', { class: 'cron-detail' });
    body.append(this.tableHost, this.detailHost);
    this.renderTable();
    this.renderDetail();
    return {
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.renderTable();
        return { total: this.matchCount, capped: this.matchCount >= MAX_MATCHES };
      },
      go: (index) => {
        const rows = this.tableHost?.querySelectorAll('tr.entry') ?? [];
        for (const row of rows) row.classList.remove('current');
        rows[index]?.classList.add('current');
        rows[index]?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderTable();
      },
    };
  }

  /**
   * @param {CrontabEntry} entry
   * @returns {string}
   */
  entryZone(entry) {
    return entry.timeZone && isTimeZone(entry.timeZone) ? entry.timeZone : this.timeZone;
  }

  /** Builds the table of entries for the current search. */
  renderTable() {
    const host = this.tableHost;
    if (!host) return;
    const t = this.t;
    const tab = /** @type {Crontab} */ (this.model());
    const system = this.feature('system');
    const q = this.query.toLowerCase();
    this.matchCount = 0;
    const body = h('tbody');
    for (const entry of tab.entries) {
      const description = describe(entry.parsed, t, this.locale);
      if (
        q &&
        ![entry.schedule, entry.command, entry.user, entry.comment, description].some((v) =>
          v.toLowerCase().includes(q),
        )
      )
        continue;
      this.matchCount += 1;
      body.append(this.entryRow(entry, description, system));
    }
    if (!this.matchCount) {
      host.replaceChildren(
        h('div', {
          class: 'empty',
          part: 'empty',
          text: tab.entries.length ? t('cronNoMatch') : t('cronEmptyTab'),
        }),
      );
      return;
    }
    const head = h(
      'tr',
      {},
      h('th', { attrs: { scope: 'col' }, text: t('cronSchedule') }),
      h('th', { attrs: { scope: 'col' }, text: t('cronDescription') }),
      h('th', { attrs: { scope: 'col' }, text: t('cronNextRun') }),
      system ? h('th', { attrs: { scope: 'col' }, text: t('cronUser') }) : null,
      h('th', { attrs: { scope: 'col' }, text: t('cronCommand') }),
    );
    host.replaceChildren(
      h('table', { class: 'cron-table', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /**
   * @param {CrontabEntry} entry
   * @param {string} description
   * @param {boolean} system
   * @returns {HTMLElement}
   */
  entryRow(entry, description, system) {
    const zone = this.entryZone(entry);
    const [next] = nextRuns(entry.parsed, { from: this.now, count: 1, timeZone: zone });
    const selected = entry.line === this.selectedLine;
    const command = h('code', { class: 'hljs language-bash', part: 'command' });
    command.append(highlight(entry.command, 'bash'));
    const row = h(
      'tr',
      { class: `entry${selected ? ' selected' : ''}`, attrs: { 'data-line': entry.line } },
      h(
        'td',
        { class: 'schedule' },
        h(
          'button',
          {
            class: 'schedule-button',
            attrs: {
              type: 'button',
              'aria-pressed': String(selected),
              'data-focus-key': `entry-${entry.line}`,
              title: entry.comment || null,
            },
            on: { click: () => this.select(entry) },
          },
          h('code', { text: entry.schedule }),
        ),
      ),
      h('td', { class: 'description', text: description }),
      h(
        'td',
        { class: 'next' },
        next
          ? h('time', {
              attrs: {
                datetime: next.toISOString(),
                title: this.dateFormat(zone, false).format(next),
              },
              text: relative(next.getTime(), this.now, this.locale),
            })
          : h('span', { class: 'cron-none', text: '—' }),
      ),
      system ? h('td', { class: 'user' }, h('code', { text: entry.user })) : null,
      h('td', { class: 'command' }, command),
    );
    if (this.query) mark(row, this.query);
    return row;
  }

  /**
   * @param {CrontabEntry} entry
   */
  select(entry) {
    this.selectedLine = entry.line;
    for (const row of this.tableHost?.querySelectorAll('tr.entry') ?? []) {
      const on = Number(/** @type {HTMLElement} */ (row).dataset.line) === entry.line;
      row.classList.toggle('selected', on);
      row.querySelector('.schedule-button')?.setAttribute('aria-pressed', String(on));
    }
    this.renderDetail();
    emit(this, EVENTS.SELECT, {
      line: entry.line,
      schedule: entry.schedule,
      command: entry.command,
    });
  }

  /** Details of the selected entry: its fields, description, runs and week. */
  renderDetail() {
    const host = this.detailHost;
    if (!host) return;
    const entry = this.entries.find((e) => e.line === this.selectedLine);
    if (!entry) {
      host.replaceChildren();
      return;
    }
    host.replaceChildren(...this.expressionView(entry.parsed, this.entryZone(entry)));
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.source,
      language: this.isTab ? 'bash' : 'plaintext',
      lineNumbers: this.isTab,
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
    this.previewTimer = setTimeout(() => {
      this.parsed = null;
      this.render();
    }, 200);
  }
}

/**
 * "in 3 hours", "tomorrow"…, relative to `now`.
 *
 * @param {number} time
 * @param {number} now
 * @param {string} locale
 * @returns {string}
 */
export function relative(time, now, locale) {
  const seconds = (time - now) / 1000;
  /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return '';
}

/**
 * Marks a query in the text of a row.
 *
 * @param {Element} root
 * @param {string} query
 */
function mark(root, query) {
  const q = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(/** @type {Text} */ (node));
  for (const node of nodes) {
    let current = node;
    let index = (current.nodeValue ?? '').toLowerCase().indexOf(q);
    while (index >= 0) {
      const match = current.splitText(index);
      const rest = match.splitText(q.length);
      const element = h('mark', { class: 'match', part: 'match' });
      match.replaceWith(element);
      element.append(match);
      current = rest;
      index = (current.nodeValue ?? '').toLowerCase().indexOf(q);
    }
  }
}
