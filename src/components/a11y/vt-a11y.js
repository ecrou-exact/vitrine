// @ts-check
import a11yCss from '../../styles/a11y.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { IMPACTS, byImpact, fixes, parseA11y } from './a11y.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./a11y.js').Results} Results */
/** @typedef {import('./a11y.js').Rule} Rule */
/** @typedef {import('./a11y.js').Impact} Impact */
/** @typedef {import('./a11y.js').ParseResult} ParseResult */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"violations" | "review"} View */

/** @type {readonly View[]} */
const VIEWS = Object.freeze(['violations', 'review']);
/** Elements shown per rule before "more". */
const NODES = 5;

/**
 * Shows accessibility test results from axe-core (`axe.run()`, `@axe-core/playwright`,
 * `@axe-core/cli` with several pages) or Pa11y: violations by impact, each with its WCAG
 * success criteria and level, the elements it was found on (selector and HTML) and what to
 * fix, and the checks axe could not decide, to review by hand. Filters by impact and text;
 * copy as CSV or the selectors. Nothing is fetched and HTML snippets are shown as text.
 *
 * @element vt-a11y
 * @since 0.15.0
 *
 * @attr {"violations" | "review"} view - Tab shown first. Default: violations.
 * @attr {boolean} filters - Impact and text filters. Default: on.
 *
 * @prop {string} content - The results (JSON).
 * @prop {Results | null} results - The results read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "a11y" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-filter-change - Filters changed. Detail: `{ impacts, query, shown }`.
 * @fires vt-copy - CSV or selectors copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary.
 * @csspart filters - The filters.
 * @csspart rule - A rule and its elements.
 * @csspart impact - An impact badge.
 * @csspart node - An element.
 *
 * @example
 * <vt-a11y variant="full" src="axe-results.json"></vt-a11y>
 */
export class VtA11y extends VtBase {
  static type = 'a11y';

  static componentAttributes = Object.freeze(['view', 'filters', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [a11yCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {Set<string>} */
    this.impacts = new Set();
    this.query = '';
    /** @type {Set<string>} Rules whose every element is shown. */
    this.expanded = new Set();
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
    if (this.parsed?.text !== text) this.parsed = { text, result: parseA11y(text) };
    return this.parsed.result;
  }

  /** @type {Results | null} */
  get results() {
    const r = this.read();
    return r.ok ? r.results : null;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'violations');
  }

  /**
   * @param {Rule[]} rules
   * @returns {Rule[]}
   */
  filtered(rules) {
    const q = this.query.trim().toLowerCase();
    return rules.filter(
      (r) =>
        (!this.impacts.size || this.impacts.has(r.impact || 'unknown')) &&
        (!q || `${r.id} ${r.help} ${r.criteria.join(' ')} ${r.nodes.map((n) => n.target).join(' ')}`.toLowerCase().includes(q)), // prettier-ignore
    );
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body a11y-body', part: 'body' });
    let tabs = null;
    /** @type {Rule[]} */
    let shown = [];
    if (!result.ok)
      body.append(noticeView(t(/** @type {StringKey} */ (`a11yInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`), { detail: result.detail ?? '' }))); // prettier-ignore
    else {
      const r = result.results;
      tabs = this.feature('tabs')
        ? createTabs({
            tabs: [
              { id: 'violations', label: t('a11yTabViolations', { count: r.violations.length }) },
              { id: 'review', label: t('a11yTabReview', { count: r.incomplete.length }) },
            ],
            selected: this.view,
            label: t('a11yTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectView(/** @type {View} */ (id)),
          })
        : null;
      body.append(this.summaryView(r));
      const rules = tabs && this.view === 'review' ? r.incomplete : r.violations;
      if (parseBoolean(this.getAttribute('filters')) !== false && rules.length) body.append(this.filtersView(rules)); // prettier-ignore
      shown = this.filtered(rules);
      if (!rules.length) body.append(noticeView(tabs && this.view === 'review' ? t('a11yNoReview') : t('a11yNone'))); // prettier-ignore
      else if (!shown.length) body.append(noticeView(t('a11yNoMatch')));
      else body.append(h('div', { class: 'a11y-rules' }, ...shown.map((rule) => this.ruleView(rule, r.pages.length > 1)))); // prettier-ignore
    }
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('a11y-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const copy = this.feature('copy') && shown.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toCsv(shown), t('a11yCopyCsv'), 'copy-csv') : null,
      copy ? this.copyButton(() => [...new Set(shown.flatMap((r) => r.nodes.map((n) => n.target)))].join('\n'), t('a11yCopySelectors')) : null, // prettier-ignore
    ];
    const engine = result.ok ? result.results.engine : '';
    frame.append(...this.chrome({ badge: engine || 'axe', tabs, actions }), panel);
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
   * @param {Results} r
   * @returns {HTMLElement}
   */
  summaryView(r) {
    const t = this.t;
    const counts = byImpact(r.violations);
    const nodes = r.violations.reduce((s, x) => s + x.total, 0);
    const n = (/** @type {number} */ x) => formatNumber(x, this.locale);
    return h(
      'div',
      { class: 'a11y-summary', part: 'summary' },
      h(
        'p',
        { class: 'a11y-facts' },
        h('strong', { text: t('a11yRules', { count: n(r.violations.length) }) }),
        h('span', { text: t('a11yElements', { count: n(nodes) }) }),
        r.passes ? h('span', { class: 'a11y-muted', text: t('a11yPasses', { count: n(r.passes) }) }) : null, // prettier-ignore
        r.inapplicable ? h('span', { class: 'a11y-muted', text: t('a11yInapplicable', { count: n(r.inapplicable) }) }) : null, // prettier-ignore
        r.pages.length > 1 ? h('span', { class: 'a11y-muted', text: t('a11yPages', { count: r.pages.length }) }) : r.pages[0] ? h('code', { class: 'a11y-url', text: r.pages[0] }) : null, // prettier-ignore
      ),
      h(
        'ul',
        { class: 'a11y-counts', attrs: { 'aria-label': t('a11yImpact') } },
        ...[...IMPACTS, 'unknown']
          .filter((k) => counts[/** @type {Impact | "unknown"} */ (k)].rules)
          .map((k) => {
            const c = counts[/** @type {Impact | "unknown"} */ (k)];
            return h('li', { class: `a11y-impact i-${k}` }, h('span', { text: t(/** @type {StringKey} */ (`a11yImpact_${k}`)) }), h('strong', { text: ` ${n(c.rules)}` }), h('span', { class: 'a11y-muted', text: ` · ${(c.nodes === 1 ? t('a11yNode') : t('a11yNodes', { count: n(c.nodes) }))}` })); // prettier-ignore
          }),
      ),
    );
  }

  /**
   * @param {Rule[]} rules
   * @returns {HTMLElement}
   */
  filtersView(rules) {
    const t = this.t;
    const present = [...IMPACTS, 'unknown'].filter((k) => rules.some((r) => (r.impact || 'unknown') === k)); // prettier-ignore
    const chip = (/** @type {string} */ key, /** @type {string} */ label, /** @type {boolean} */ pressed, /** @type {() => void} */ onClick) =>
      h('button', { class: `a11y-chip${pressed ? ' on' : ''}`, text: label, attrs: { type: 'button', 'aria-pressed': String(pressed), 'data-focus-key': `filter-${key}` }, on: { click: onClick } }); // prettier-ignore
    const changed = () => {
      this.render();
      emit(this, EVENTS.FILTER_CHANGE, { impacts: [...this.impacts], query: this.query, shown: this.filtered(rules).length }); // prettier-ignore
    };
    const input = h('input', {
      class: 'a11y-query',
      attrs: { type: 'search', value: this.query, placeholder: t('a11yFilter'), 'aria-label': t('a11yFilter'), 'data-focus-key': 'query', spellcheck: 'false' }, // prettier-ignore
      on: {
        input: () => {
          this.query = input.value.slice(0, 200);
          changed();
        },
      },
    });
    return h(
      'div',
      { class: 'a11y-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('a11yFilters') } }, // prettier-ignore
      chip('all', t('a11yAll'), !this.impacts.size, () => {
        this.impacts.clear();
        changed();
      }),
      ...present.map((k) =>
        chip(k, t(/** @type {StringKey} */ (`a11yImpact_${k}`)), this.impacts.has(k), () => {
          if (this.impacts.has(k)) this.impacts.delete(k);
          else this.impacts.add(k);
          if (this.impacts.size === present.length) this.impacts.clear();
          changed();
        }),
      ),
      input,
    );
  }

  /**
   * @param {Rule} rule
   * @param {boolean} pages
   * @returns {HTMLElement}
   */
  ruleView(rule, pages) {
    const t = this.t;
    const impact = rule.impact || 'unknown';
    const key = `${rule.page}|${rule.id}`;
    const all = this.expanded.has(key);
    const nodes = all ? rule.nodes : rule.nodes.slice(0, NODES);
    const more = rule.total - nodes.length;
    return h(
      'section',
      { class: `a11y-rule i-${impact}`, part: 'rule', attrs: { 'aria-label': rule.help || rule.id, 'data-rule': rule.id } }, // prettier-ignore
      h(
        'header',
        { class: 'a11y-rule-head' },
        h('span', { class: `a11y-impact i-${impact}`, part: 'impact', text: t(/** @type {StringKey} */ (`a11yImpact_${impact}`)) }), // prettier-ignore
        h('h3', { text: rule.help || rule.id }),
        h('code', { class: 'a11y-id', text: rule.id }),
      ),
      h(
        'p',
        { class: 'a11y-meta' },
        rule.criteria.length ? h('span', { class: 'a11y-tag', text: t('a11yCriteria', { list: rule.criteria.join(', ') }) }) : null, // prettier-ignore
        rule.level ? h('span', { class: 'a11y-tag', text: t('a11yLevel', { level: rule.level }) }) : null, // prettier-ignore
        rule.tags.includes('best-practice') ? h('span', { class: 'a11y-tag', text: t('a11yBestPractice') }) : null, // prettier-ignore
        h('span', {
          class: 'a11y-muted',
          text: rule.total === 1 ? t('a11yNode') : t('a11yNodes', { count: rule.total }),
        }),
        pages && rule.page ? h('span', { class: 'a11y-muted', text: t('a11yPage', { page: rule.page }) }) : null, // prettier-ignore
        rule.helpUrl ? h('a', { text: t('a11yLearnMore', { rule: rule.id }), attrs: { href: rule.helpUrl, rel: 'noopener noreferrer', target: '_blank' } }) : null, // prettier-ignore
      ),
      rule.description ? h('p', { class: 'a11y-desc', text: rule.description }) : null,
      h(
        'ol',
        { class: 'a11y-nodes' },
        ...nodes.map((n) =>
          h(
            'li',
            { class: 'a11y-node', part: 'node' },
            h('p', { class: 'a11y-target' }, h('span', { class: 'sr-only', text: `${t('a11yElement')}: ` }), h('code', { text: n.target })), // prettier-ignore
            n.html ? h('pre', { class: 'a11y-html' }, h('span', { class: 'sr-only', text: `${t('a11yHtml')}: ` }), h('code', { text: n.html })) : null, // prettier-ignore
            ...fixes(n.summary).map((f) =>
              h(
                'div',
                { class: 'a11y-fix' },
                h('p', { class: 'a11y-fix-title' }, icon('help'), h('span', { text: f.title || t('a11yFix') })), // prettier-ignore
                f.items.length ? h('ul', {}, ...f.items.map((x) => h('li', { text: x }))) : null,
              ),
            ),
          ),
        ),
      ),
      more > 0 && nodes.length < rule.nodes.length
        ? h('button', { class: 'text-btn a11y-more', text: t('a11yNodesMore', { count: rule.nodes.length - nodes.length }), attrs: { type: 'button', 'data-focus-key': `more-${rule.id}` }, on: { click: () => { this.expanded.add(key); this.render(); } } }) // prettier-ignore
        : null,
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
 * Violations as CSV, one row per element (formulas neutralized).
 *
 * @param {Rule[]} rules
 * @returns {string}
 */
export function toCsv(rules) {
  const cell = (/** @type {string} */ value) => {
    let s = value;
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) || s !== value ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['rule', 'impact', 'wcag', 'page', 'target', 'html']];
  for (const r of rules) for (const n of r.nodes) rows.push([r.id, r.impact, r.criteria.join(' '), r.page, n.target, n.html]); // prettier-ignore
  return rows.map((row) => row.map(cell).join(',')).join('\n');
}
