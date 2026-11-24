// @ts-check
import lighthouseCss from '../../styles/lighthouse.css?raw';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { FIELD, fieldRating, parseLighthouse, rating } from './lighthouse.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./lighthouse.js').Report} Report */
/** @typedef {import('./lighthouse.js').Category} Category */
/** @typedef {import('./lighthouse.js').Audit} Audit */
/** @typedef {import('./lighthouse.js').ParseResult} ParseResult */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Shows a Lighthouse report: the JSON of the CLI or of Chrome DevTools, or a PageSpeed
 * Insights API answer. Category scores as gauges, Core Web Vitals of real visits (CrUX field
 * data, page and origin, with their distribution), lab metrics with their rating,
 * opportunities with their estimated savings, and the failed audits of each category with
 * their elements or resources. Nothing is fetched and descriptions are text.
 *
 * @element vt-lighthouse
 * @since 0.15.0
 *
 * @attr {string} category - Category tab shown first (`performance`, `accessibility`, `best-practices`, `seo`).
 *
 * @prop {string} content - The report (JSON).
 * @prop {Report | null} report - The report read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "lighthouse" }`.
 * @fires vt-tab-change - Category changed. Detail: `{ tab }`.
 * @fires vt-copy - Summary copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart scores - The gauges of the categories.
 * @csspart gauge - A gauge.
 * @csspart field - The field data.
 * @csspart metrics - The lab metrics.
 * @csspart opportunities - The opportunities.
 * @csspart audit - An audit.
 *
 * @example
 * <vt-lighthouse variant="full" src="report.json"></vt-lighthouse>
 */
export class VtLighthouse extends VtBase {
  static type = 'lighthouse';

  static componentAttributes = Object.freeze(['category', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [lighthouseCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {string | null} */
    this.categoryState = null;
    /** @type {{ text: string, result: ParseResult } | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {ParseResult} */
  read() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseLighthouse(text) };
    return this.parsed.result;
  }

  /** @type {Report | null} */
  get report() {
    const r = this.read();
    return r.ok ? r.report : null;
  }

  /**
   * @param {Report} report
   * @returns {string}
   */
  categoryId(report) {
    const wanted = this.categoryState ?? this.getAttribute('category') ?? '';
    return report.categories.some((c) => c.id === wanted)
      ? wanted
      : (report.categories[0]?.id ?? '');
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body lh-body', part: 'body' });
    let tabs = null;
    if (!result.ok)
      body.append(noticeView(t(/** @type {StringKey} */ (`lhInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`), { detail: result.detail ?? '' }))); // prettier-ignore
    else {
      const report = result.report;
      const current = this.categoryId(report);
      tabs = this.feature('tabs') && report.categories.length > 1
        ? createTabs({
            tabs: report.categories.map((c) => ({ id: c.id, label: `${c.title}${c.score !== null ? ` ${Math.round(c.score * 100)}` : ''}` })), // prettier-ignore
            selected: current,
            label: t('lhTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectCategory(id),
          })
        : null; // prettier-ignore
      body.append(this.headView(report));
      if (report.error) body.append(noticeView(t('lhRuntimeError', { message: report.error })));
      if (report.categories.length) body.append(this.scoresView(report));
      if (report.field.length) body.append(this.fieldView(report));
      if (report.warnings.length) body.append(h('details', { class: 'lh-warnings' }, h('summary', { text: `${t('lhWarnings')} (${report.warnings.length})` }), h('ul', {}, ...report.warnings.map((w) => h('li', { text: w }))))); // prettier-ignore
      const category = report.categories.find((c) => c.id === current);
      if (category) {
        const section = h('div', { class: 'lh-category', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
        if (!tabs) section.append(h('h3', { text: category.title }));
        if (category.id === 'performance') {
          if (report.metrics.length) section.append(this.metricsView(report));
          if (report.opportunities.length)
            section.append(this.opportunitiesView(report.opportunities));
        }
        section.append(this.auditsView(category, category.id === 'performance' ? new Set(report.opportunities.map((o) => o.id)) : new Set())); // prettier-ignore
        body.append(section);
        if (!tabs)
          for (const other of report.categories.filter((c) => c !== category)) {
            body.append(h('div', { class: 'lh-category' }, h('h3', { text: other.title }), this.auditsView(other, new Set()))); // prettier-ignore
          }
      }
    }
    const panel = h('div', { class: 'panel' });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('lh-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const report = result.ok ? result.report : null;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && report ? this.copyButton(() => this.summaryText(report), t('lhCopySummary')) : null, // prettier-ignore
    ];
    frame.append(...this.chrome({ badge: 'Lighthouse', tabs, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {string} id
   */
  selectCategory(id) {
    this.categoryState = id;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${CSS.escape(id)}"]`))?.focus(); // prettier-ignore
    emit(this, EVENTS.TAB_CHANGE, { tab: id });
  }

  /**
   * @param {Report} report
   * @returns {string}
   */
  summaryText(report) {
    const lines = [report.url, ...report.categories.map((c) => `${c.title}: ${c.score === null ? '—' : Math.round(c.score * 100)}`), ...report.metrics.map((m) => `${m.short} ${m.value}`)]; // prettier-ignore
    return lines.filter(Boolean).join('\n');
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  headView(report) {
    const t = this.t;
    const date = report.fetchTime ? new Date(report.fetchTime) : null;
    return h(
      'p',
      { class: 'lh-head' },
      report.url ? h('code', { class: 'lh-url', text: report.url }) : null,
      report.formFactor ? h('span', { class: 'lh-chip', text: report.formFactor === 'desktop' ? t('lhDesktop') : t('lhMobile') }) : null, // prettier-ignore
      date && !Number.isNaN(date.getTime()) ? h('span', { class: 'lh-muted', text: new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC' }) : null, // prettier-ignore
      report.version ? h('span', { class: 'lh-muted', text: t('lhVersion', { version: report.version }) }) : null, // prettier-ignore
    );
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  scoresView(report) {
    const t = this.t;
    return h(
      'ul',
      { class: 'lh-scores', part: 'scores', attrs: { 'aria-label': t('lhScores') } },
      ...report.categories.map((c) => {
        const score = c.score === null ? null : Math.round(c.score * 100);
        const r = rating(c.score);
        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('viewBox', '0 0 36 36');
        svg.setAttribute('aria-hidden', 'true');
        const track = document.createElementNS(SVG, 'circle');
        const arc = document.createElementNS(SVG, 'circle');
        for (const circle of [track, arc]) {
          circle.setAttribute('cx', '18');
          circle.setAttribute('cy', '18');
          circle.setAttribute('r', '15.9155');
          circle.setAttribute('fill', 'none');
          circle.setAttribute('stroke-width', '3');
        }
        track.setAttribute('class', 'lh-track');
        arc.setAttribute('class', 'lh-arc');
        // A circle of radius 15.9155 has a circumference of 100.
        arc.setAttribute('stroke-dasharray', `${score ?? 0} 100`);
        arc.setAttribute('transform', 'rotate(-90 18 18)');
        svg.append(track, arc);
        const label = t('lhScoreOf', { title: c.title, score: score ?? '—', rating: t(/** @type {StringKey} */ (`lhRating_${r}`)) }); // prettier-ignore
        return h(
          'li',
          { class: `lh-gauge r-${r}`, part: 'gauge', attrs: { 'data-category': c.id } },
          h('span', { class: 'lh-ring' }, svg, h('span', { class: 'lh-score', attrs: { 'aria-hidden': 'true' }, text: score === null ? '—' : String(score) })), // prettier-ignore
          h('span', { class: 'lh-gauge-title', attrs: { 'aria-hidden': 'true' }, text: c.title }),
          h('span', { class: 'sr-only', text: label }),
        );
      }),
    );
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  fieldView(report) {
    const t = this.t;
    const value = (/** @type {import('./lighthouse.js').FieldMetric} */ m) => {
      const f = FIELD.find((x) => x.key === m.key);
      if (f?.unit === 'cls') return (m.percentile / 100).toFixed(2);
      return m.percentile >= 1000 ? `${(m.percentile / 1000).toFixed(1)} s` : `${m.percentile} ms`;
    };
    return h(
      'div',
      { class: 'lh-field', part: 'field' },
      h('p', { class: 'lh-label', text: t('lhField') }),
      ...report.field.map((scope) =>
        h(
          'div',
          { class: 'lh-field-scope' },
          h(
            'p',
            { class: 'lh-field-title' },
            h('strong', { text: scope.scope === 'page' ? t('lhFieldPage') : t('lhFieldOrigin') }),
            scope.overall ? h('span', { class: `lh-chip ${scope.overall === 'FAST' ? 'r-good' : 'r-poor'}`, text: t('lhFieldOverall', { result: scope.overall === 'FAST' ? t('lhFieldPassed') : t('lhFieldFailed') }) }) : null, // prettier-ignore
          ),
          h(
            'ul',
            { class: 'lh-field-list' },
            ...scope.metrics.map((m) => {
              const r = fieldRating(m);
              const [good = 0, avg = 0, poor = 0] = m.distribution;
              const bar = h('span', { class: 'lh-dist', attrs: { 'aria-hidden': 'true' } });
              for (const [cls, part] of /** @type {[string, number][]} */ ([
                ['r-good', good],
                ['r-average', avg],
                ['r-poor', poor],
              ])) {
                // prettier-ignore
                const seg = h('span', { class: cls });
                seg.style.width = `${Math.max(0, Math.min(1, part)) * 100}%`;
                bar.append(seg);
              }
              const pct = (/** @type {number} */ x) => String(Math.round(x * 100));
              return h(
                'li',
                { class: `lh-field-metric r-${r}`, attrs: { 'data-metric': m.short } },
                h('span', { class: 'lh-metric-name', text: m.short }),
                h('strong', { class: 'lh-metric-value', text: value(m) }),
                h('span', {
                  class: 'lh-rating',
                  text: t(/** @type {StringKey} */ (`lhRating_${r}`)),
                }),
                m.distribution.length ? bar : null,
                m.distribution.length ? h('span', { class: 'sr-only', text: t('lhFieldDistribution', { good: pct(good), average: pct(avg), poor: pct(poor) }) }) : null, // prettier-ignore
              );
            }),
          ),
        ),
      ),
    );
  }

  /**
   * @param {Report} report
   * @returns {HTMLElement}
   */
  metricsView(report) {
    const t = this.t;
    return h(
      'div',
      { class: 'lh-metrics-box' },
      h('p', { class: 'lh-label', text: t('lhLab') }),
      h(
        'ul',
        { class: 'lh-metrics', part: 'metrics' },
        ...report.metrics.map((m) => {
          const r = rating(m.score);
          return h(
            'li',
            { class: `lh-metric r-${r}`, attrs: { 'data-metric': m.short } },
            h('span', { class: 'lh-dot', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'lh-metric-name', text: m.title }),
            h('strong', { class: 'lh-metric-value', text: m.value || '—' }),
            h('span', {
              class: 'sr-only',
              text: `, ${t(/** @type {StringKey} */ (`lhRating_${r}`))}`,
            }),
          );
        }),
      ),
    );
  }

  /**
   * @param {Audit[]} list
   * @returns {HTMLElement}
   */
  opportunitiesView(list) {
    const t = this.t;
    const max = Math.max(...list.map((a) => a.savingsMs), 1);
    return h(
      'div',
      { class: 'lh-opps', part: 'opportunities' },
      h('p', { class: 'lh-label', text: `${t('lhOpportunities')} · ${t('lhSavings')}` }),
      ...list.map((a) => {
        const bar = h('span', { class: 'lh-saving-bar', attrs: { 'aria-hidden': 'true' } });
        bar.style.width = `${Math.max(2, (a.savingsMs / max) * 100)}%`;
        return this.auditView(a, h('span', { class: 'lh-saving' }, bar, h('span', { text: a.display }))); // prettier-ignore
      }),
    );
  }

  /**
   * @param {Category} category
   * @param {Set<string>} skip - Audits already shown as opportunities.
   * @returns {HTMLElement}
   */
  auditsView(category, skip) {
    const t = this.t;
    const failed = category.audits.filter((a) => !skip.has(a.id) && a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.mode)); // prettier-ignore
    const informative = category.audits.filter((a) => a.mode === 'informative' && !skip.has(a.id) && a.display); // prettier-ignore
    const passed = category.audits.filter((a) => a.score !== null && a.score >= 0.9 && a.mode !== 'informative'); // prettier-ignore
    const na = category.audits.filter((a) => a.mode === 'notApplicable');
    const manual = category.audits.filter((a) => a.mode === 'manual');
    const fold = (/** @type {StringKey} */ key, /** @type {Audit[]} */ list) =>
      list.length ? h('details', { class: 'lh-fold' }, h('summary', { text: t(key, { count: list.length }) }), h('ul', { class: 'lh-plain' }, ...list.map((a) => h('li', { text: a.title })))) : null; // prettier-ignore
    return h(
      'div',
      { class: 'lh-audits' },
      failed.length || informative.length
        ? h('div', { class: 'lh-failed' }, h('p', { class: 'lh-label', text: t('lhFailed', { count: failed.length }) }), ...failed.map((a) => this.auditView(a)), ...informative.map((a) => this.auditView(a))) // prettier-ignore
        : noticeView(t('lhNothing')),
      fold('lhManual', manual),
      fold('lhPassed', passed),
      fold('lhNotApplicable', na),
    );
  }

  /**
   * @param {Audit} audit
   * @param {HTMLElement} [extra]
   * @returns {HTMLElement}
   */
  auditView(audit, extra) {
    const t = this.t;
    const r = audit.mode === 'informative' ? 'none' : rating(audit.score);
    return h(
      'details',
      { class: `lh-audit r-${r}`, part: 'audit', attrs: { 'data-audit': audit.id } },
      h(
        'summary',
        {},
        h('span', { class: 'lh-dot', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'lh-audit-title', text: audit.title }),
        extra ?? (audit.display ? h('span', { class: 'lh-muted', text: audit.display }) : null),
        r !== 'none' ? h('span', { class: 'sr-only', text: `, ${t(/** @type {StringKey} */ (`lhRating_${r}`))}` }) : null, // prettier-ignore
      ),
      h(
        'div',
        { class: 'lh-audit-body' },
        audit.description ? h('p', { text: audit.description }) : null,
        audit.learnMore ? h('p', {}, h('a', { text: t('lhLearnMore'), attrs: { href: audit.learnMore, rel: 'noopener noreferrer', target: '_blank' } })) : null, // prettier-ignore
        audit.items.length
          ? h(
              'div',
              { class: 'lh-scroll' },
              h(
                'table',
                { class: 'lh-items' },
                h('thead', {}, h('tr', {}, ...audit.headings.map((x) => h('th', { attrs: { scope: 'col' }, text: x })))), // prettier-ignore
                h('tbody', {}, ...audit.items.map((row) => h('tr', {}, ...row.map((c) => h('td', {}, h('code', { text: c.value })))))), // prettier-ignore
              ),
            )
          : null,
      ),
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
