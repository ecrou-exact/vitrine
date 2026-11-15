// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import advisoriesCss from '../../styles/advisories.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { csvText } from '../../core/csv.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import {
  AdvisoryError,
  SEVERITIES,
  VECTOR_WORDS,
  cvssMetrics,
  idLine,
  readAdvisories,
} from './advisories.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./advisories.js').Advisory} Advisory */
/** @typedef {import('./advisories.js').Severity} Severity */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Characters of details shown; the advisory link has the rest. */
const MAX_DETAILS = 3000;

/**
 * A security report: vulnerabilities from OSV (osv.dev, osv-scanner), `npm audit --json`,
 * GitHub security advisories or Dependabot alerts, the most severe first, with their CVSS
 * score explained in words, the packages and versions affected, and the version that fixes
 * them.
 *
 * Details are shown as text, never as HTML; links keep safe schemes only. CVSS 3 scores are
 * computed from their vectors when the source gives only the vector, as OSV does.
 *
 * @element vt-advisories
 * @since 0.15.0
 *
 * @attr {"critical"|"high"|"moderate"|"low"} severity - The lowest severity shown (default: all).
 * @attr {boolean} expanded - Opens the details of every advisory.
 * @attr {boolean} filters - Buttons that keep one severity, with counts. Full variant: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The advisories, as a value.
 * @prop {Advisory[]} advisories - The advisories read, the most severe first (read-only).
 *
 * @fires vt-filter-change - A severity was chosen. Detail: `{ severity }` (`null`: all).
 * @fires vt-toggle - The details of an advisory opened or closed. Detail: `{ id, open }`.
 *
 * @csspart summary - The counts by severity.
 * @csspart advisory - An advisory.
 * @csspart severity - A severity.
 *
 * @example
 * <vt-advisories variant="full" src="/audit.json"></vt-advisories>
 */
export class VtAdvisories extends VtDataElement {
  static type = 'advisories';

  static componentAttributes = Object.freeze(['severity', 'expanded', 'filters']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, filters: true }, // prettier-ignore
  };

  static styles = [syntaxCss, codeCss, dataCss, advisoriesCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {Severity | null} */
    this.severityFilter = null;
    /** @type {Set<string>} Advisories opened by the reader. */
    this.open = new Set();
  }

  contentChanged() {
    this.severityFilter = null;
    this.open.clear();
  }

  /** @returns {{ advisories: Advisory[], error: string | null }} */
  read() {
    try {
      const all = readAdvisories(JSON.parse(this.text ?? ''));
      const lowest = this.getAttribute('severity');
      const limit = lowest ? SEVERITIES.indexOf(parseEnum(lowest, SEVERITIES, 'unknown')) : SEVERITIES.length; // prettier-ignore
      return { advisories: all.filter((a) => SEVERITIES.indexOf(a.severity) <= limit), error: null }; // prettier-ignore
    } catch (error) {
      const message = error instanceof AdvisoryError ? this.t('advisoriesShape') : this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }); // prettier-ignore
      return { advisories: [], error: message };
    }
  }

  /** @returns {Advisory[]} */
  get advisories() {
    return this.read().advisories;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { advisories, error } = this.read();
    const body = h('div', { class: 'body data-body adv-body', part: 'body' });
    if (error) body.append(noticeView(error));
    else if (!advisories.length)
      body.append(h('p', { class: 'adv-clean', text: t('advisoriesNone') }));
    else {
      if (this.feature('filters')) body.append(this.summaryView(advisories));
      const shown = this.severityFilter ? advisories.filter((a) => a.severity === this.severityFilter) : advisories; // prettier-ignore
      body.append(shown.length ? h('ul', { class: 'adv-list' }, ...shown.map((a) => h('li', {}, this.advisoryView(a)))) : h('p', { class: 'data-none', text: t('advisoriesNoMatch') })); // prettier-ignore
    }
    const { panel, history } = this.previewPanel(body, this.panelId);
    const list = /** @type {HTMLElement | null} */ (body.querySelector('.adv-list'));
    const count = advisories.length;
    frame.append(
      ...this.chrome({
        badge: error ? '' : count === 1 ? t('advisoriesOne') : t('advisoriesCount', { count: formatNumber(count, this.locale) }), // prettier-ignore
        actions: [
          ...history,
          this.editToggleButton(),
          list ? this.searchButton(new TextSearch(list)) : null,
          this.fullscreenButton(),
          this.feature('download') && count ? this.downloadButton(() => toCsv(advisories), this.downloadName('advisories.csv'), 'text/csv') : null, // prettier-ignore
          this.feature('copy') && count ? this.copyButton(() => toMarkdown(advisories), t('advisoriesCopy')) : null, // prettier-ignore
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * Counts by severity, as buttons that keep one.
   *
   * @param {Advisory[]} advisories
   * @returns {HTMLElement}
   */
  summaryView(advisories) {
    const t = this.t;
    const box = h('div', { class: 'adv-summary', part: 'summary', attrs: { role: 'group', 'aria-label': t('advisoriesFilter') } }); // prettier-ignore
    const present = SEVERITIES.filter((s) => advisories.some((a) => a.severity === s));
    for (const severity of [null, ...present]) {
      const count = severity ? advisories.filter((a) => a.severity === severity).length : advisories.length; // prettier-ignore
      box.append(
        h(
          'button',
          {
            class: `adv-filter${severity ? ` s-${severity}` : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(this.severityFilter === severity), 'data-focus-key': `severity-${severity ?? 'all'}` }, // prettier-ignore
            on: {
              click: () => {
                this.severityFilter = severity;
                this.render();
                emit(this, EVENTS.FILTER_CHANGE, { severity });
              },
            },
          },
          h('span', { text: severity ? t(/** @type {StringKey} */ (`advisoriesSeverity_${severity}`)) : t('advisoriesAll') }), // prettier-ignore
          h('span', { class: 'adv-count', text: formatNumber(count, this.locale) }),
        ),
      );
    }
    return box;
  }

  /**
   * @param {Advisory} a
   * @returns {HTMLElement}
   */
  severityView(a) {
    const t = this.t;
    const label = t(/** @type {StringKey} */ (`advisoriesSeverity_${a.severity}`));
    return h(
      'span',
      { class: `adv-severity s-${a.severity}`, part: 'severity' },
      label,
      a.score !== null ? h('span', { class: 'adv-score', text: formatNumber(a.score, this.locale) }) : null, // prettier-ignore
    );
  }

  /**
   * @param {Advisory} a
   * @returns {HTMLElement}
   */
  advisoryView(a) {
    const t = this.t;
    const packages = h(
      'span',
      { class: 'adv-packages' },
      ...a.affected.slice(0, 6).map((p) =>
        h(
          'span',
          { class: 'adv-package' },
          h('code', { text: p.name || p.ecosystem }),
          p.range ? ` ${p.range}` : '',
          p.version ? h('span', { class: 'adv-muted', text: ` (${t('advisoriesInstalled', { version: p.version })})` }) : null, // prettier-ignore
          h('span', { class: p.fixed ? 'adv-fix' : 'adv-nofix', text: ` → ${p.fixed ? t('advisoriesFixed', { version: p.fixed }) : t('advisoriesNoFix')}` }), // prettier-ignore
        ),
      ),
    );
    const details = h(
      'details',
      {
        class: `adv-item s-${a.severity}`,
        part: 'advisory',
        attrs: { open: parseBoolean(this.getAttribute('expanded')) === true || this.open.has(a.id) ? '' : null }, // prettier-ignore
        on: {
          toggle: () => {
            const open = /** @type {HTMLDetailsElement} */ (details).open;
            if (open === this.open.has(a.id)) return;
            if (open) this.open.add(a.id);
            else this.open.delete(a.id);
            emit(this, EVENTS.TOGGLE, { id: a.id, open });
          },
        },
      },
      h(
        'summary',
        { attrs: { 'data-focus-key': `adv-${a.id}` } },
        this.severityView(a),
        h('span', { class: 'adv-head' }, h('strong', { class: 'adv-title', text: a.title }), h('span', { class: 'adv-id', text: idLine(a) }), packages), // prettier-ignore
      ),
      this.detailsView(a),
    );
    return details;
  }

  /**
   * @param {Advisory} a
   * @returns {HTMLElement}
   */
  detailsView(a) {
    const t = this.t;
    const box = h('div', { class: 'adv-details' });
    if (a.details) box.append(h('p', { class: 'adv-text', text: a.details.length > MAX_DETAILS ? `${a.details.slice(0, MAX_DETAILS)}…` : a.details })); // prettier-ignore
    const m = a.vector.startsWith('CVSS:3') ? cvssMetrics(a.vector) : null;
    if (m) {
      const word = (/** @type {string} */ k) => { const w = VECTOR_WORDS[k]?.[m[k]]; return w ? t(/** @type {StringKey} */ (`advisoriesWord_${w}`)) : '?'; }; // prettier-ignore
      box.append(h('p', { class: 'adv-vector' }, h('span', { text: t('advisoriesVector', { AV: word('AV'), AC: word('AC'), PR: word('PR'), UI: word('UI'), S: word('S') }) }), h('code', { text: a.vector }))); // prettier-ignore
    }
    const meta = h('p', { class: 'adv-meta' });
    if (a.published !== null) meta.append(h('span', { text: t('advisoriesPublished', { date: this.formatDate(a.published, { dateStyle: 'medium', timeZone: 'UTC' }) }) })); // prettier-ignore
    for (const cwe of a.cwes)
      meta.append(h('a', { text: cwe, attrs: { href: `https://cwe.mitre.org/data/definitions/${cwe.slice(4)}.html`, rel: 'noopener', title: t('advisoriesWeakness') } })); // prettier-ignore
    if (a.url) meta.append(h('a', { text: t('advisoriesRead'), attrs: { href: a.url, rel: 'noopener' } })); // prettier-ignore
    if (meta.childNodes.length) box.append(meta);
    return box;
  }
}

/**
 * @param {Advisory[]} advisories
 * @returns {string}
 */
export function toCsv(advisories) {
  return csvText([
    ['id', 'aliases', 'severity', 'score', 'title', 'package', 'affected', 'fixed', 'url'],
    ...advisories.flatMap(
      (a) =>
      (a.affected.length ? a.affected : [null]).map((p) => [a.id, a.aliases.join(' '), a.severity, a.score ?? '', a.title, p?.name ?? '', p?.range ?? '', p?.fixed ?? '', a.url ?? '']), // prettier-ignore
    ),
  ]);
}

/**
 * @param {Advisory[]} advisories
 * @returns {string} A Markdown table, cells escaped.
 */
export function toMarkdown(advisories) {
  const cell = (/** @type {string} */ s) =>
    s.replace(/[\\|`*_[\]<>]/g, '\\$&').replace(/\s+/g, ' ');
  const rows = advisories.map((a) => {
    const pkgs = a.affected.map((p) => `${p.name} ${p.range}`.trim()).join(', ');
    const fixed = a.affected
      .map((p) => p.fixed)
      .filter(Boolean)
      .join(', ');
    return `| ${cell(a.id)} | ${a.severity}${a.score !== null ? ` (${a.score})` : ''} | ${cell(pkgs)} | ${cell(fixed) || '—'} | ${cell(a.title)} |`; // prettier-ignore
  });
  return ['| Advisory | Severity | Affected | Fixed in | Summary |', '| --- | --- | --- | --- | --- |', ...rows].join('\n'); // prettier-ignore
}
