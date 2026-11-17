// @ts-check
import sigmaCss from '../../styles/sigma.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { isSafeUrl } from '../../core/urls.js';
import { loadYaml } from '../../core/yaml-loader.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { LEVELS, readRules, verdict } from './sigma.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./sigma.js').SigmaRule} SigmaRule */
/** @typedef {import('./sigma.js').Search} Search */
/** @typedef {import('./sigma.js').Item} Item */
/** @typedef {import('./sigma.js').Node} Node */
/** @typedef {import('./sigma.js').Finding} Finding */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"rules" | "source"} View */
/** @typedef {{ text: string, rules: SigmaRule[], capped: boolean, error: string, pending: boolean }} Parsed */

/** @type {readonly View[]} */
const VIEWS = Object.freeze(['rules', 'source']);

/**
 * Shows Sigma detection rules explained: title, level and status, ATT&CK tactics and
 * techniques and CVEs as links, the log source, each search of the detection as a table
 * of fields with their modifiers in words (`contains`, `endswith`, `all`, `re`, `cidr`…),
 * and the condition as a tree (`1 of selection_*` expanded to the searches it names).
 * Checks for missing fields, a condition that names unknown searches, searches never used,
 * unknown modifiers, levels, statuses, identifiers and dates outside the specification.
 * Reads YAML (several documents, Sigma 1 `action: global` collections) or JSON.
 *
 * @element vt-sigma
 * @since 0.15.0
 *
 * @attr {"rules" | "source"} view - Tab shown first. Default: rules.
 * @attr {boolean} lint - The problems of each rule. Default: on.
 * @attr {boolean} links - ATT&CK, CVE and reference links. Default: on.
 *
 * @prop {string} content - The Sigma rules (YAML or JSON).
 * @prop {SigmaRule[]} rules - The rules read (read-only), empty while YAML loads.
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "sigma" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-copy - Rules or an identifier copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart rule - The card of a rule.
 * @csspart level - The level of a rule.
 * @csspart tags - The tags of a rule.
 * @csspart search - A search of the detection.
 * @csspart condition - The condition and its tree.
 * @csspart findings - The problems of a rule.
 * @csspart source - The YAML source.
 *
 * @example
 * <vt-sigma variant="full" src="rules/proc_creation_win_whoami.yml"></vt-sigma>
 */
export class VtSigma extends VtBase {
  static type = 'sigma';

  static componentAttributes = Object.freeze(['view', 'lint', 'links', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [sigmaCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {Parsed | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {Parsed} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text && !this.parsed.pending) return this.parsed;
    const trimmed = text.trim();
    const done = (/** @type {unknown[]} */ docs) => ({ text, ...readRules(docs), error: '', pending: false }); // prettier-ignore
    if (!trimmed) return (this.parsed = done([]));
    try {
      if (/^[[{]/.test(trimmed)) {
        const value = JSON.parse(trimmed);
        return (this.parsed = done(Array.isArray(value) ? value : [value]));
      }
      const yaml = loadYaml();
      if (!yaml.ready || !yaml.parseAll) {
        yaml.promise.then(
          () => this.requestRender(),
          (error) => {
            this.parsed = { text, rules: [], capped: false, error: String(error?.message ?? error), pending: false }; // prettier-ignore
            this.requestRender();
          },
        );
        return (this.parsed = { text, rules: [], capped: false, error: '', pending: true });
      }
      return (this.parsed = done(yaml.parseAll(trimmed)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return (this.parsed = { text, rules: [], capped: false, error: message.slice(0, 300), pending: false }); // prettier-ignore
    }
  }

  /** @type {SigmaRule[]} */
  get rules() {
    return this.parse().rules;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'rules');
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * A link when links are on and the URL is safe, else the text.
   *
   * @param {string} text
   * @param {string} url
   * @param {string} [title]
   * @returns {HTMLElement}
   */
  link(text, url, title) {
    if (url && this.flag('links', true) && /^https?:\/\//i.test(url) && isSafeUrl(url))
      return h('a', { text, attrs: { href: url, rel: 'noopener noreferrer', target: '_blank', title: title ?? null } }); // prettier-ignore
    return h('span', { text, attrs: { title: title ?? null } });
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const parsed = this.parse();
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'rules', label: t('sigmaTabRules', { count: parsed.rules.length }) },
            { id: 'source', label: t('sigmaTabSource') },
          ],
          selected: this.view,
          label: t('sigmaTabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const body = h('div', { class: 'body sigma-body', part: 'body' });
    if (this.view === 'source' && tabs) {
      const view = buildCodeView(this.text ?? '', { language: 'yaml', lineNumbers: true, startLine: 1, highlightRanges: [], diff: false, highlightLimit: getConfig().highlightLimit }); // prettier-ignore
      body.append(h('div', { class: 'sigma-source', part: 'source' }, view.element));
    } else if (parsed.pending) body.append(noticeView(t('sigmaLoading')));
    else if (parsed.error) body.append(noticeView(t('sigmaInvalid', { message: parsed.error })));
    else if (!parsed.rules.length) body.append(noticeView(t('sigmaEmpty')));
    else {
      for (const rule of parsed.rules) body.append(this.ruleView(rule));
      if (parsed.capped) body.append(noticeView(t('sigmaCapped', { count: parsed.rules.length })));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('sigma-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && this.text ? this.copyButton(() => this.text ?? '', t('sigmaCopyRules')) : null, // prettier-ignore
    ];
    const badge = parsed.rules.length > 1 ? `Sigma · ${t('sigmaRules', { count: parsed.rules.length })}` : 'Sigma'; // prettier-ignore
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
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
   * @param {SigmaRule} rule
   * @returns {HTMLElement}
   */
  ruleView(rule) {
    const t = this.t;
    const lint = this.flag('lint', true);
    const level = LEVELS.includes(rule.level) ? rule.level : '';
    const state = verdict(rule);
    const problems = rule.findings.filter((f) => f.level !== 'info').length;
    /** @type {[StringKey, string | HTMLElement][]} */
    const facts = [
      ['sigmaStatus', rule.status],
      ['sigmaAuthor', rule.author],
      ['sigmaDate', rule.date],
      ['sigmaModified', rule.modified],
      ['sigmaLicense', rule.license],
      ['sigmaId', rule.id ? h('span', { class: 'sigma-id' }, h('code', { text: rule.id }), this.feature('copy') ? this.copyTextButton(() => rule.id, t('sigmaCopyId'), `copy-id-${rule.id}`) : null) : ''], // prettier-ignore
    ];
    const logsource = Object.entries(rule.logsource);
    return h(
      'section',
      { class: `sigma-rule lv-${level || 'none'}`, part: 'rule', attrs: { 'aria-label': rule.title || t('sigmaUntitled') } }, // prettier-ignore
      h(
        'header',
        { class: 'sigma-head' },
        h('h3', { class: 'sigma-title', text: rule.title || t('sigmaUntitled') }),
        rule.type !== 'rule' ? h('span', { class: 'sigma-chip', text: t(/** @type {StringKey} */ (`sigmaType_${rule.type}`)) }) : null, // prettier-ignore
        level ? h('span', { class: `sigma-level lv-${level}`, part: 'level' }, h('span', { class: 'sr-only', text: `${t('sigmaLevel')} ` }), t(/** @type {StringKey} */ (`sigmaLevel_${level}`))) : null, // prettier-ignore
        lint ? h('span', { class: `sigma-verdict ${state}` }, icon(state === 'none' ? 'check' : 'alert'), h('span', { text: problems ? (problems === 1 ? t('sigmaProblem') : t('sigmaProblems', { count: problems })) : t('sigmaNoProblem') })) : null, // prettier-ignore
      ),
      rule.description ? h('p', { class: 'sigma-description', text: rule.description }) : null,
      lint && rule.findings.length ? this.findingsView(rule.findings) : null,
      h(
        'dl',
        { class: 'sigma-facts' },
        ...facts.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { text: t(k) }), h('dd', {}, v)]), // prettier-ignore
        ...(logsource.length ? [h('dt', { text: t('sigmaLogsource') }), h('dd', { class: 'sigma-logsource' }, ...logsource.map(([k, v]) => h('span', { class: 'sigma-chip' }, h('span', { class: 'sigma-muted', text: `${k}: ` }), h('code', { text: v }))))] : []), // prettier-ignore
      ),
      rule.tags.length
        ? h(
            'ul',
            { class: 'sigma-tags', part: 'tags', attrs: { 'aria-label': t('sigmaTags') } },
            ...rule.tags.map(
              (tag) =>
              h('li', { class: `tag-${tag.kind}` }, tag.kind === 'other' ? h('code', { text: tag.raw }) : this.link(tag.label, tag.url, `${t(/** @type {StringKey} */ (`sigmaTag_${tag.kind}`))} · ${tag.raw}`)), // prettier-ignore
            ),
          )
        : null,
      rule.searches.length ? this.detectionView(rule) : null,
      rule.correlation ? this.correlationView(rule.correlation) : null,
      this.listView('sigmaFalsePositives', rule.falsepositives),
      this.listView('sigmaFields', rule.fields, true),
      rule.related.length ? this.listView('sigmaRelated', rule.related.map((r) => `${r.type}: ${r.id}`), true) : null, // prettier-ignore
      rule.references.length
        ? h('details', { class: 'sigma-refs' }, h('summary', { text: `${t('sigmaReferences')} (${rule.references.length})` }), h('ul', {}, ...rule.references.map((r) => h('li', {}, this.link(r, r))))) // prettier-ignore
        : null,
    );
  }

  /**
   * @param {StringKey} key
   * @param {string[]} list
   * @param {boolean} [code]
   * @returns {HTMLElement | null}
   */
  listView(key, list, code = false) {
    if (!list.length) return null;
    return h(
      'div',
      { class: 'sigma-list' },
      h('p', { class: 'sigma-label', text: this.t(key) }),
      h('ul', {}, ...list.map((x) => h('li', {}, code ? h('code', { text: x }) : x))),
    );
  }

  /**
   * @param {SigmaRule} rule
   * @returns {HTMLElement}
   */
  detectionView(rule) {
    const t = this.t;
    return h(
      'div',
      { class: 'sigma-detection' },
      h('p', { class: 'sigma-label', text: t('sigmaDetection') }),
      ...rule.searches.map((s) => this.searchView(s, rule.conditions.length > 0)),
      ...rule.conditions.map((c, i) =>
        h(
          'div',
          { class: 'sigma-condition', part: 'condition' },
          h('p', { class: 'sigma-cond-line' }, h('span', { class: 'sigma-label', text: t('sigmaCondition') }), h('code', {}, ...this.conditionTokens(c, rule))), // prettier-ignore
          rule.timeframe ? h('p', { class: 'sigma-muted', text: t('sigmaTimeframe', { time: rule.timeframe }) }) : null, // prettier-ignore
          rule.trees[i]
            ? h('div', { class: 'sigma-tree' }, h('p', { class: 'sigma-muted', text: t('sigmaReadsAs') }), h('ul', {}, this.nodeView(/** @type {Node} */ (rule.trees[i]))))
            : null, // prettier-ignore
        ),
      ),
    );
  }

  /**
   * The condition with search names, operators and quantifiers told apart.
   *
   * @param {string} condition
   * @param {SigmaRule} rule
   * @returns {(HTMLElement | string)[]}
   */
  conditionTokens(condition, rule) {
    const names = new Set(rule.searches.map((s) => s.name));
    return (condition.match(/\s+|\(|\)|[^\s()]+/g) ?? []).map((token) => {
      if (/^\s+$/.test(token) || token === '(' || token === ')') return token;
      if (/^(and|or|not|of|them|all|any|1)$/i.test(token)) return h('span', { class: 's-op', text: token }); // prettier-ignore
      return h('span', { class: names.has(token) || token.includes('*') ? 's-name' : 's-name unknown', text: token }); // prettier-ignore
    });
  }

  /**
   * @param {Node} node
   * @returns {HTMLElement}
   */
  nodeView(node) {
    const t = this.t;
    if (node.type === 'search') return h('li', {}, h('code', { class: 's-name', text: node.name }));
    if (node.type === 'of')
      return h('li', { text: t(node.quantity === 'all' ? 'sigmaNode_all' : 'sigmaNode_one', { pattern: node.pattern, names: node.names.join(', ') || t('sigmaNode_none') }) }); // prettier-ignore
    if (node.type === 'not') return h('li', {}, h('span', { class: 's-op', text: t('sigmaNode_not') }), h('ul', {}, this.nodeView(node.child))); // prettier-ignore
    return h('li', {}, h('span', { class: 's-op', text: t(node.type === 'and' ? 'sigmaNode_and' : 'sigmaNode_or') }), h('ul', {}, ...node.children.map((c) => this.nodeView(c)))); // prettier-ignore
  }

  /**
   * @param {Search} search
   * @param {boolean} hasCondition
   * @returns {HTMLElement}
   */
  searchView(search, hasCondition) {
    const t = this.t;
    const head = h(
      'p',
      { class: 'sigma-search-head' },
      h('code', { class: 's-name', text: search.name }),
      h('span', { class: 'sigma-muted', text: search.kind === 'map' ? t('sigmaSearchMap') : search.kind === 'list' ? t('sigmaSearchList', { count: search.groups.length }) : t('sigmaSearchKeywords') }), // prettier-ignore
      hasCondition && !search.used ? h('span', { class: 'sigma-chip warn', text: t('sigmaUnused') }) : null, // prettier-ignore
    );
    if (search.kind === 'keywords')
      return h('div', { class: 'sigma-search', part: 'search', attrs: { 'data-search': search.name } }, head, this.valuesView(search.groups[0][0], 'or')); // prettier-ignore
    return h(
      'div',
      { class: 'sigma-search', part: 'search', attrs: { 'data-search': search.name } },
      head,
      ...search.groups.map((group, i) =>
        h(
          'div',
          { class: 'sigma-scroll' },
          search.groups.length > 1 && i ? h('p', { class: 'sigma-or', text: t('sigmaOr') }) : null,
          h(
            'table',
            { class: 'sigma-items' },
            h('thead', {}, h('tr', {}, ...[t('sigmaField'), t('sigmaMatch'), t('sigmaValues')].map((x) => h('th', { attrs: { scope: 'col' }, text: x })))), // prettier-ignore
            h(
              'tbody',
              {},
              ...group.map((item) =>
                h(
                  'tr',
                  {},
                  h('th', { attrs: { scope: 'row' } }, h('code', { text: item.field })),
                  h('td', { class: 'sigma-mods', text: this.modifierText(item) }),
                  h('td', {}, this.valuesView(item, item.modifiers.includes('all') ? 'and' : 'or')), // prettier-ignore
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * The modifiers of a field in words: `|contains|all` → "contains, every value, not just one".
   *
   * @param {Item} item
   * @returns {string}
   */
  modifierText(item) {
    const t = this.t;
    const mods = item.modifiers.length ? item.modifiers : ['equals'];
    return mods
      .map((m) => {
        const key = /** @type {StringKey} */ (`sigmaMod_${m}`);
        return Object.hasOwn(strings, key) ? t(key) : m;
      })
      .join(', ');
  }

  /**
   * @param {Item} item
   * @param {"and" | "or"} joiner
   * @returns {HTMLElement}
   */
  valuesView(item, joiner) {
    const t = this.t;
    const list = item.values.slice(0, 200);
    const word = t(joiner === 'and' ? 'sigmaAnd' : 'sigmaOr');
    return h(
      'ul',
      { class: `sigma-values ${joiner}` },
      ...list.map((v, i) => h('li', { attrs: { 'data-joiner': i ? word : null } }, v === null ? h('em', { text: t('sigmaNull') }) : h('code', { text: String(v) }))), // prettier-ignore
    );
  }

  /**
   * @param {Record<string, unknown>} correlation
   * @returns {HTMLElement}
   */
  correlationView(correlation) {
    const rows = Object.entries(correlation).map(([k, v]) => [k, typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)]); // prettier-ignore
    return h(
      'div',
      { class: 'sigma-list' },
      h('p', { class: 'sigma-label', text: this.t('sigmaCorrelation') }),
      h('dl', { class: 'sigma-facts' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', {}, h('code', { text: v.slice(0, 500) }))])), // prettier-ignore
    );
  }

  /**
   * @param {Finding[]} findings
   * @returns {HTMLElement}
   */
  findingsView(findings) {
    const t = this.t;
    return h(
      'ul',
      { class: 'sigma-findings', part: 'findings', attrs: { 'aria-label': t('sigmaFindings') } },
      ...findings.map((f) =>
        h(
          'li',
          { class: `sigma-finding ${f.level}`, attrs: { 'data-finding': f.id } },
          icon(f.level === 'info' ? 'help' : 'alert'),
          h('span', { text: t(/** @type {StringKey} */ (`sigmaFinding_${f.id}`), f.params) }),
        ),
      ),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'yaml',
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
