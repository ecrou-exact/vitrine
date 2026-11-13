// @ts-check
import ansiCss from '../../styles/ansi.css?raw';
import testReportCss from '../../styles/test-report.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { parseAnsi } from '../terminal/ansi.js';
import { segmentNode } from '../terminal/ansi-dom.js';
import { ReportError, failureSummary, parseReport } from './report.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./report.js').Report} Report */
/** @typedef {import('./report.js').Suite} Suite */
/** @typedef {import('./report.js').TestCase} TestCase */
/** @typedef {import('./report.js').Status} Status */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const FILTERS = /** @type {const} */ (['all', 'failed', 'passed', 'skipped']);
const OPEN = /** @type {const} */ (['failed', 'all', 'none']);
const SORTS = /** @type {const} */ (['order', 'duration', 'name']);
/** Tests shown in a suite before "Show more". */
const PAGE = 200;
const FORMAT_NAMES = { junit: 'JUnit', tap: 'TAP', jest: 'Jest', mocha: 'Mocha', json: 'JSON' };
const STATUS_ICONS = {
  passed: 'status-success',
  failed: 'status-failure',
  error: 'alert',
  skipped: 'status-skipped',
};

/**
 * Shows a test report: how many tests passed, failed or were skipped, the suites with
 * their tests and durations, and for each failure its message, stack trace and output.
 *
 * Reads JUnit XML (written by pytest, Maven, Gradle, Go, PHPUnit, .NET and most CI tools),
 * TAP (node --test, tape, Perl), and JSON from Jest and Vitest (`--json`), Mocha
 * (`--reporter json`), or a plain list of tests. ANSI colors in failure messages are kept;
 * everything is shown as text.
 *
 * @element vt-test-report
 * @since 0.9.0
 *
 * @attr {"all"|"failed"|"passed"|"skipped"} status - Tests shown at first (default `all`).
 * @attr {"failed"|"all"|"none"} open - Suites open at first (default `failed`: those with failures).
 * @attr {"order"|"duration"|"name"} sort - Order of the tests in a suite (default `order`).
 * @attr {boolean} status-filter - Buttons to show tests by status, with counts. Full variant: on.
 * @attr {boolean} output - Standard output and errors of a test, under its details (default on).
 *
 * @prop {string} content - The report: JUnit XML, TAP or JSON.
 * @prop {Report | null} report - The report read from the content (read-only copy), `null` when it cannot be read.
 *
 * @fires vt-filter-change - The status shown or the search changed. Detail: `{ status, query, shown }`.
 * @fires vt-toggle - A suite was opened or closed. Detail: `{ suite, expanded }`.
 *
 * @csspart summary - The result of the run: status, counts and duration.
 * @csspart bar - The bar of passed, failed and skipped tests.
 * @csspart status-filter - A status button.
 * @csspart suite - A suite.
 * @csspart suite-header - The button that opens a suite.
 * @csspart case - A test (also `case-passed`, `case-failed`, `case-error`, `case-skipped`).
 * @csspart message - The message of a failed or skipped test.
 * @csspart details - Stack trace, diagnostics and output of a test.
 *
 * @example
 * <vt-test-report variant="full" src="/ci/junit.xml"></vt-test-report>
 */
export class VtTestReport extends VtBase {
  static type = 'test-report';

  static componentAttributes = Object.freeze(['status', 'open', 'sort', 'status-filter', 'output']);

  static presets = {
    simple: { output: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      output: true, 'status-filter': true,
    },
  }; // prettier-ignore

  static styles = [ansiCss, testReportCss];

  constructor() {
    super();
    /** @type {{ text: string, report: Report | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {(typeof FILTERS)[number] | null} Status chosen with the buttons. */
    this.statusChoice = null;
    /** @type {(typeof SORTS)[number] | null} Order chosen with the button. */
    this.sortChoice = null;
    /** @type {Map<number, boolean>} Suites opened or closed by the reader. */
    this.suiteState = new Map();
    /** @type {Set<string>} Tests whose details are shown (`suite:case`). */
    this.openCases = new Set();
    /** @type {Map<number, number>} Tests shown per suite after "Show more". */
    this.shown = new Map();
    this.query = '';
    this.matchCount = 0;
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.listHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.suiteState.clear();
    this.openCases.clear();
    this.shown.clear();
  }

  /** @returns {{ report: Report | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, report: parseReport(text), error: null };
    } catch (error) {
      this.parsed = { text, report: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Report | null} */
  get report() {
    const report = this.parse().report;
    return report ? structuredClone(report) : null;
  }

  /** @returns {(typeof FILTERS)[number]} */
  get status() {
    return this.statusChoice ?? parseEnum(this.getAttribute('status'), FILTERS, 'all');
  }

  /** @returns {(typeof SORTS)[number]} */
  get sortOrder() {
    return this.sortChoice ?? parseEnum(this.getAttribute('sort'), SORTS, 'order');
  }

  /**
   * @param {TestCase} test
   * @returns {boolean}
   */
  visible(test) {
    const status = this.status;
    if (status === 'failed' && test.status !== 'failed' && test.status !== 'error') return false;
    if ((status === 'passed' || status === 'skipped') && test.status !== status) return false;
    if (!this.query) return true;
    const q = this.query.toLowerCase();
    return [test.name, test.classname, test.message].some((v) => v.toLowerCase().includes(q));
  }

  /**
   * @param {Suite} suite
   * @param {number} index
   * @returns {boolean}
   */
  isOpen(suite, index) {
    const chosen = this.suiteState.get(index);
    if (chosen !== undefined) return chosen;
    // A search or a status filter opens every suite with a test to show.
    if (this.query || this.status !== 'all') return true;
    const open = parseEnum(this.getAttribute('open'), OPEN, 'failed');
    if (open === 'all') return true;
    if (open === 'none') return false;
    return suite.cases.some((test) => test.status === 'failed' || test.status === 'error');
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { report, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body tr-body', part: 'body' });
    this.listHost = null;

    if (error || !report) body.append(noticeView(this.errorText(error)));
    else {
      body.append(this.summaryView(report));
      if (this.feature('status-filter') && report.totals.total) body.append(this.statusBar(report));
      this.listHost = h('div', { class: 'tr-suites' });
      body.append(this.listHost);
      this.renderList();
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('tr-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.renderList();
        this.filterChanged();
        return { total: this.matchCount, capped: false };
      },
      /** @param {number} index */
      go: (index) => {
        const items = this.listHost?.querySelectorAll('.tr-case') ?? [];
        for (const item of items) item.classList.remove('current');
        items[index]?.classList.add('current');
        items[index]?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderList();
      },
    };

    const failures = report ? report.totals.failed + report.totals.error : 0;
    const source = (this.text ?? '').trimStart();
    const extension = source.startsWith('<') ? 'xml' : /^[[{]/.test(source) ? 'json' : 'tap';
    const actions = [
      this.searchButton(target),
      ...history,
      report?.totals.total && !this.editing
        ? iconButton({
            icon: 'sort-down',
            label: this.sortOrder === 'duration' ? t('testsInOrder') : t('testsSlowest'),
            key: 'sort',
            part: 'sort-button',
            pressed: this.sortOrder === 'duration',
            onClick: () => {
              this.sortChoice = this.sortOrder === 'duration' ? 'order' : 'duration';
              this.render();
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(`report.${extension}`),
            extension === 'xml' ? 'application/xml' : extension === 'json' ? 'application/json' : 'text/plain', // prettier-ignore
          )
        : null,
      this.feature('copy') && report && failures
        ? this.copyButton(() => failureSummary(report), t('testsCopyFailures'))
        : null,
    ];
    frame.append(...this.chrome({ badge: report ? FORMAT_NAMES[report.format] : '', actions }), panel); // prettier-ignore
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof ReportError) {
      if (error.message === 'empty') return t('testsInvalidEmpty');
      if (error.message === 'format') return t('testsInvalidFormat');
      if (error.message === 'junit') return t('testsInvalidJunit');
    }
    return t('testsInvalid', { message: error?.message ?? '' });
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  summaryView(report) {
    const t = this.t;
    const { total, passed, failed, error, skipped } = report.totals;
    const bad = failed + error;
    const n = (/** @type {number} */ value) => formatNumber(value, this.locale);
    const tone = !total ? 'muted' : bad ? 'bad' : 'ok';
    const headline = !total
      ? t('testsSummaryNone')
      : bad
        ? t('testsSummaryFailed', { failed: n(bad), count: n(total) })
        : t('testsSummaryPassed', { count: n(total) });
    /** @type {string[]} */
    const facts = [];
    if (skipped) facts.push(`${n(skipped)} ${t('testsStatusSkipped')}`);
    if (error) facts.push(`${n(error)} ${t('testsStatusError')}`);
    if (report.duration !== null) facts.push(this.formatDuration(report.duration));

    const bar = h('div', {
      class: 'tr-bar',
      part: 'bar',
      attrs: { role: 'img', 'aria-label': t('testsBar', { passed: n(passed), failed: n(bad), skipped: n(skipped) }) }, // prettier-ignore
    });
    for (const [kind, count] of /** @type {[string, number][]} */ ([['passed', passed], ['failed', bad], ['skipped', skipped]])) {
      if (!count) continue;
      const segment = h('span', { class: `tr-bar-${kind}` });
      segment.style.flexGrow = String(count);
      bar.append(segment);
    } // prettier-ignore
    return h(
      'div',
      { class: `tr-summary ${tone}`, part: 'summary', attrs: { role: 'status' } },
      h(
        'div',
        { class: 'tr-headline' },
        icon(
          tone === 'ok' ? 'status-success' : tone === 'bad' ? 'status-failure' : 'status-circle',
        ),
        h('strong', { text: headline }),
        facts.length ? h('span', { class: 'tr-facts', text: facts.join(' · ') }) : null,
      ),
      total ? bar : null,
    );
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  statusBar(report) {
    const { total, passed, failed, error, skipped } = report.totals;
    const counts = { all: total, failed: failed + error, passed, skipped };
    const labels = { all: 'testsAll', failed: 'testsFailed', passed: 'testsPassed', skipped: 'testsSkipped' }; // prettier-ignore
    const bar = h('div', {
      class: 'tr-filters',
      attrs: { role: 'group', 'aria-label': this.t('testsStatus') },
    });
    for (const status of FILTERS) {
      if (status !== 'all' && !counts[status]) continue;
      bar.append(
        h(
          'button',
          {
            class: `tr-chip chip-${status}`,
            part: 'status-filter',
            attrs: {
              type: 'button',
              'aria-pressed': String(this.status === status),
              'data-focus-key': `status-${status}`,
            },
            on: {
              click: () => {
                this.statusChoice = status;
                this.suiteState.clear();
                this.render();
                this.filterChanged();
              },
            },
          },
          status === 'all' ? null : icon(STATUS_ICONS[status]),
          this.t(/** @type {StringKey} */ (labels[status])),
          h('span', { class: 'chip-count', text: formatNumber(counts[status], this.locale) }),
        ),
      );
    }
    return bar;
  }

  filterChanged() {
    emit(this, EVENTS.FILTER_CHANGE, { status: this.status, query: this.query, shown: this.matchCount }); // prettier-ignore
  }

  /** Renders the suites for the current status, search and order. */
  renderList() {
    const host = this.listHost;
    const report = this.parse().report;
    if (!host || !report) return;
    /** @type {HTMLElement[]} */
    const items = [];
    this.matchCount = 0;
    report.suites.forEach((suite, index) => {
      const cases = suite.cases.filter((test) => this.visible(test));
      this.matchCount += cases.length;
      if (!cases.length && (this.query || this.status !== 'all')) return;
      items.push(this.suiteView(suite, index, cases));
    });
    host.replaceChildren(...(items.length ? items : [h('p', { class: 'empty', part: 'empty', text: this.t('testsNoMatch') })])); // prettier-ignore
  }

  /**
   * @param {Suite} suite
   * @param {number} index
   * @param {TestCase[]} cases - The tests to show.
   * @returns {HTMLElement}
   */
  suiteView(suite, index, cases) {
    const t = this.t;
    const open = this.isOpen(suite, index);
    const listId = `${this.panelId}-suite-${index}`;
    const failed = suite.cases.filter((c) => c.status === 'failed' || c.status === 'error').length;
    const name = suite.name || t('testsUnnamedSuite');
    const header = h(
      'button',
      {
        class: 'tr-suite-header',
        part: 'suite-header',
        attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': listId, 'data-focus-key': `suite-${index}` }, // prettier-ignore
        on: {
          click: () => {
            this.suiteState.set(index, !open);
            this.renderList();
            emit(this, EVENTS.TOGGLE, { suite: suite.name, expanded: !open });
          },
        },
      },
      icon('chevron-right'),
      icon(failed ? 'status-failure' : suite.cases.every((c) => c.status === 'skipped') ? 'status-skipped' : 'status-success'), // prettier-ignore
      h('span', { class: 'tr-suite-name', text: name, attrs: { title: suite.file || null } }),
      h(
        'span',
        { class: 'tr-suite-counts' },
        failed ? h('span', { class: 'tr-failed-count', text: `${formatNumber(failed, this.locale)} ${t('testsStatusFailed')}` }) : null, // prettier-ignore
        h('span', { text: suite.cases.length === 1 ? t('testsOne') : t('testsCount', { count: formatNumber(suite.cases.length, this.locale) }) }), // prettier-ignore
        suite.duration !== null ? h('span', { text: this.formatDuration(suite.duration) }) : null,
      ),
    );
    const section = h(
      'section',
      { class: `tr-suite${failed ? ' has-failures' : ''}`, part: 'suite', attrs: { 'aria-label': name } }, // prettier-ignore
      h('h3', { class: 'tr-suite-title' }, header),
    );
    if (!open) return section;
    const sorted = this.sortCases(cases);
    const limit = this.shown.get(index) ?? PAGE;
    const list = h('ul', { class: 'tr-cases', attrs: { id: listId } });
    for (const test of sorted.slice(0, limit)) list.append(this.caseView(test, index, suite.cases.indexOf(test))); // prettier-ignore
    section.append(list);
    if (sorted.length > limit) {
      section.append(
        h('button', {
          class: 'text-btn tr-more',
          text: t('testsShowMore', { count: formatNumber(Math.min(PAGE, sorted.length - limit), this.locale) }), // prettier-ignore
          attrs: { type: 'button', 'data-focus-key': `more-${index}` },
          on: {
            click: () => {
              this.shown.set(index, limit + PAGE);
              this.renderList();
            },
          },
        }),
      );
    }
    return section;
  }

  /**
   * @param {TestCase[]} cases
   * @returns {TestCase[]}
   */
  sortCases(cases) {
    const order = this.sortOrder;
    if (order === 'order') return cases;
    const copy = [...cases];
    if (order === 'duration') return copy.sort((a, b) => (b.duration ?? -1) - (a.duration ?? -1));
    return copy.sort((a, b) => a.name.localeCompare(b.name, this.locale, { numeric: true }));
  }

  /**
   * @param {TestCase} test
   * @param {number} suiteIndex
   * @param {number} caseIndex
   * @returns {HTMLElement}
   */
  caseView(test, suiteIndex, caseIndex) {
    const t = this.t;
    const key = `${suiteIndex}:${caseIndex}`;
    const hasDetails = Boolean(test.details || (this.feature('output') && (test.output || test.errors))); // prettier-ignore
    const open = this.openCases.has(key);
    const statusWord = t(/** @type {StringKey} */ (`testsStatus${test.status[0].toUpperCase()}${test.status.slice(1)}`)); // prettier-ignore
    const item = h('li', {
      class: `tr-case status-${test.status}`,
      part: `case case-${test.status}`,
    });
    const row = h(
      'div',
      { class: 'tr-row' },
      h('span', { class: 'tr-icon' }, icon(STATUS_ICONS[test.status]), h('span', { class: 'sr-only', text: `${statusWord}: ` })), // prettier-ignore
      h(
        'span',
        { class: 'tr-name' },
        test.classname ? h('span', { class: 'tr-class', text: `${test.classname} › ` }) : null,
        test.name,
      ),
      test.flaky ? h('span', { class: 'tr-flaky', text: t('testsFlaky'), attrs: { title: t('testsFlakyNote') } }) : null, // prettier-ignore
      test.duration !== null ? h('span', { class: 'tr-time', text: this.formatDuration(test.duration) }) : null, // prettier-ignore
    );
    item.append(row);
    if (test.message) item.append(h('p', { class: 'tr-message', part: 'message', text: test.message })); // prettier-ignore
    if (!hasDetails) return item;
    const detailsId = `${this.panelId}-case-${suiteIndex}-${caseIndex}`;
    item.append(
      h('button', {
        class: 'text-btn tr-toggle',
        text: open ? t('testsHideDetails') : t('testsDetails'),
        attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': detailsId, 'data-focus-key': `case-${key}` }, // prettier-ignore
        on: {
          click: () => {
            if (open) this.openCases.delete(key);
            else this.openCases.add(key);
            this.renderList();
          },
        },
      }),
    );
    if (!open) return item;
    const details = h('div', { class: 'tr-details', part: 'details', attrs: { id: detailsId } });
    if (test.details) details.append(this.ansiBlock(test.details));
    if (this.feature('output')) {
      if (test.output) details.append(h('span', { class: 'tr-label', text: t('testsOutput') }), this.ansiBlock(test.output)); // prettier-ignore
      if (test.errors) details.append(h('span', { class: 'tr-label', text: t('testsStderr') }), this.ansiBlock(test.errors)); // prettier-ignore
    }
    item.append(details);
    return item;
  }

  /**
   * Text with its ANSI colors, as text nodes and styled spans.
   *
   * @param {string} text
   * @returns {HTMLElement}
   */
  ansiBlock(text) {
    const pre = h('pre', { class: 'tr-pre' });
    parseAnsi(text).forEach((segments, index) => {
      if (index) pre.append('\n');
      for (const segment of segments) pre.append(segmentNode(segment));
    });
    return pre;
  }

  /**
   * @param {number} ms
   * @returns {string}
   */
  formatDuration(ms) {
    const format = (/** @type {number} */ value, /** @type {number} */ digits) =>
      new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(value);
    if (ms >= 60_000) return `${Math.floor(ms / 60_000)} min ${format((ms % 60_000) / 1000, 0)} s`;
    if (ms >= 1000) return `${format(ms / 1000, 2)} s`;
    return `${format(ms, ms < 10 ? 1 : 0)} ms`;
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const source = (this.text ?? '').trimStart();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: source.startsWith('<') ? 'xml' : /^[[{]/.test(source) ? 'json' : 'plaintext',
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
    this.parsed = null;
    this.previewTimer = setTimeout(() => this.render(), 200);
  }
}
