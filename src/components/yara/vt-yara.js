// @ts-check
import yaraCss from '../../styles/yara.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { parseYara, tokenize, verdict } from './yara.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./yara.js').Ruleset} Ruleset */
/** @typedef {import('./yara.js').Rule} Rule */
/** @typedef {import('./yara.js').Token} Token */
/** @typedef {import('./yara.js').Finding} Finding */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"rules" | "source"} View */

/** @type {readonly View[]} */
const VIEWS = Object.freeze(['rules', 'source']);

/**
 * Shows YARA rules explained: each rule with its tags, meta, strings (text, hex with its
 * wildcards and jumps, regular expressions) and what their modifiers do, the condition
 * colored and read in words (file type checked by its first bytes, size, how many strings),
 * and the problems the compiler or a reviewer would raise: strings undefined or unused,
 * duplicates, short atoms, unbounded jumps, modules without `import`. Nothing is run.
 *
 * @element vt-yara
 * @since 0.15.0
 *
 * @attr {"rules" | "source"} view - Tab shown first. Default: rules.
 * @attr {boolean} lint - The problems of each rule. Default: on.
 * @attr {boolean} explain - The condition read in words. Default: on.
 *
 * @prop {string} content - The YARA rules.
 * @prop {Ruleset} ruleset - The rules read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "yara" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-copy - Rules or a rule name copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart rule - The card of a rule.
 * @csspart verdict - The count of problems of a rule.
 * @csspart meta - The meta of a rule.
 * @csspart strings - The table of strings.
 * @csspart condition - The condition.
 * @csspart notes - The condition read in words.
 * @csspart findings - The problems of a rule.
 * @csspart source - The colored source.
 *
 * @example
 * <vt-yara variant="full" src="rules/emotet.yar"></vt-yara>
 */
export class VtYara extends VtBase {
  static type = 'yara';

  static componentAttributes = Object.freeze(['view', 'lint', 'explain', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [yaraCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {{ text: string, set: Ruleset } | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Ruleset} */
  get ruleset() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, set: parseYara(text) };
    return this.parsed.set;
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
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const set = this.ruleset;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'rules', label: t('yaraTabRules', { count: set.rules.length }) },
            { id: 'source', label: t('yaraTabSource') },
          ],
          selected: this.view,
          label: t('yaraTabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const body = h('div', { class: 'body yara-body', part: 'body' });
    if (this.view === 'source' && tabs) body.append(this.sourceView(this.text ?? ''));
    else {
      if (!set.rules.length && !set.findings.length) body.append(noticeView(t('yaraEmpty')));
      if (set.imports.length || set.includes.length) body.append(this.headerView(set));
      if (set.findings.length && this.flag('lint', true)) body.append(this.findingsView(set.findings)); // prettier-ignore
      for (const rule of set.rules) body.append(this.ruleView(rule));
      if (set.capped) body.append(noticeView(t('yaraCapped', { count: set.rules.length })));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('yara-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && this.text ? this.copyButton(() => this.text ?? '', t('yaraCopyRules')) : null, // prettier-ignore
    ];
    const badge = set.rules.length > 1 ? `YARA · ${t('yaraRules', { count: set.rules.length })}` : 'YARA'; // prettier-ignore
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
   * @param {Ruleset} set
   * @returns {HTMLElement}
   */
  headerView(set) {
    const t = this.t;
    const line = (/** @type {StringKey} */ key, /** @type {string} */ keyword, /** @type {string[]} */ list) =>
      list.length ? h('p', { class: 'yara-imports' }, h('span', { class: 'yara-label', text: t(key) }), ...list.map((x) => h('code', {}, h('span', { class: 'y-keyword', text: keyword }), ' ', h('span', { class: 'y-string', text: `"${x}"` })))) : null; // prettier-ignore
    return h('div', { class: 'yara-header' }, line('yaraImports', 'import', set.imports), line('yaraIncludes', 'include', set.includes)); // prettier-ignore
  }

  /**
   * @param {Rule} rule
   * @returns {HTMLElement}
   */
  ruleView(rule) {
    const t = this.t;
    const lint = this.flag('lint', true);
    const level = verdict(rule);
    const problems = rule.findings.filter((f) => f.level === 'danger').length;
    const warnings = rule.findings.filter((f) => f.level === 'warning').length;
    const counts = [
      problems ? (problems === 1 ? t('yaraProblem') : t('yaraProblems', { count: problems })) : '',
      warnings ? (warnings === 1 ? t('yaraWarning') : t('yaraWarnings', { count: warnings })) : '',
    ].filter(Boolean);
    const verdictText = counts.join(' · ') || t('yaraNoProblem');
    return h(
      'section',
      { class: `yara-rule ${lint ? level : ''}`, part: 'rule', attrs: { 'aria-label': rule.name || t('yaraEmpty'), 'data-rule': rule.name } }, // prettier-ignore
      h(
        'header',
        { class: 'yara-head' },
        h('h3', { class: 'yara-name' }, h('span', { class: 'y-keyword', text: 'rule ' }), h('code', { text: rule.name })), // prettier-ignore
        rule.private ? h('span', { class: 'yara-flag', attrs: { title: t('yaraPrivateHint') }, text: t('yaraPrivate') }) : null, // prettier-ignore
        rule.global ? h('span', { class: 'yara-flag', attrs: { title: t('yaraGlobalHint') }, text: t('yaraGlobal') }) : null, // prettier-ignore
        rule.tags.length ? h('ul', { class: 'yara-tags', attrs: { 'aria-label': t('yaraTags') } }, ...rule.tags.map((tag) => h('li', { text: tag }))) : null, // prettier-ignore
        lint ? h('span', { class: `yara-verdict ${level}`, part: 'verdict' }, icon(level === 'none' ? 'check' : 'alert'), h('span', { text: verdictText })) : null, // prettier-ignore
        this.feature('copy') && rule.name ? this.copyTextButton(() => rule.name, t('yaraCopyName'), `copy-${rule.name}`) : null, // prettier-ignore
      ),
      lint && rule.findings.length ? this.findingsView(rule.findings) : null,
      rule.meta.length
        ? h('dl', { class: 'yara-meta', part: 'meta', attrs: { 'aria-label': t('yaraMeta') } }, ...rule.meta.flatMap((m) => [h('dt', { text: m.key }), h('dd', { class: `m-${m.kind}`, text: m.value })])) // prettier-ignore
        : null,
      rule.strings.length ? this.stringsView(rule) : null,
      rule.condition.length
        ? h(
            'div',
            { class: 'yara-condition' },
            h('p', { class: 'yara-label', text: t('yaraCondition') }),
            h('pre', { class: 'yara-code', part: 'condition' }, h('code', {}, ...this.colored(rule.condition))), // prettier-ignore
          )
        : null,
      rule.notes.length && this.flag('explain', true)
        ? h(
            'div',
            { class: 'yara-notes', part: 'notes' },
            h('p', { class: 'yara-label', text: t('yaraReadsAs') }),
            h('ul', {}, ...rule.notes.map((n) => h('li', { text: t(/** @type {StringKey} */ (`yaraNote_${n.id}`), n.params) }))), // prettier-ignore
          )
        : null,
    );
  }

  /**
   * @param {Rule} rule
   * @returns {HTMLElement}
   */
  stringsView(rule) {
    const t = this.t;
    const rows = rule.strings.map((s) =>
      h(
        'tr',
        { class: s.used || s.id === '$' || s.id.startsWith('$_') ? '' : 'unused', attrs: { 'data-string': s.id } }, // prettier-ignore
        h('th', { attrs: { scope: 'row' } }, h('code', { class: 'y-ref', text: s.id }), s.used || s.id === '$' || s.id.startsWith('$_') ? null : h('span', { class: 'yara-tag', text: t('yaraUnused') })), // prettier-ignore
        h('td', { class: 'yara-kind', text: t(/** @type {StringKey} */ (`yaraKind_${s.kind}`)) }),
        h('td', {}, h('code', { class: `yara-value ${s.kind}` }, ...this.valueView(s))),
        h(
          'td',
          {},
          h(
            'span',
            { class: 'yara-mods' },
            ...s.modifiers.map((m) => {
              const key = /** @type {StringKey} */ (`yaraMod_${m.name}`);
              const arg = m.arg || (m.name === 'xor' ? t('yaraModAll') : t('yaraModDefault'));
              const hint = Object.hasOwn(strings, key) ? t(key, { arg }) : '';
              return h('span', { class: 'yara-mod', attrs: { title: hint || null } }, h('code', { text: m.arg ? `${m.name}(${m.arg})` : m.name }), hint ? h('span', { class: 'sr-only', text: ` ${hint}` }) : null); // prettier-ignore
            }),
          ),
        ),
      ),
    );
    return h(
      'div',
      { class: 'yara-scroll' },
      h(
        'table',
        { class: 'yara-strings', part: 'strings' },
        h('caption', {
          class: 'yara-label',
          text: t('yaraStrings', { count: rule.strings.length }),
        }),
        h('thead', {}, h('tr', {}, ...[t('yaraString'), t('yaraKind'), t('yaraValue'), t('yaraModifiers')].map((x) => h('th', { attrs: { scope: 'col' }, text: x })))), // prettier-ignore
        h('tbody', {}, ...rows),
      ),
    );
  }

  /**
   * A string's value: hex bytes, wildcards and jumps told apart; text and regex as written.
   *
   * @param {import('./yara.js').YaraString} s
   * @returns {(HTMLElement | string)[]}
   */
  valueView(s) {
    if (s.kind === 'text') return [h('span', { class: 'y-string', text: `"${s.value}"` })];
    if (s.kind === 'regex') return [h('span', { class: 'y-regex', text: s.value })];
    const parts = s.value.match(/\[[^\]]*\]|~?[0-9A-Fa-f?]{2}|[{}()|]|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+|./g) ?? []; // prettier-ignore
    return parts.map((p) => {
      if (/^\s+$/.test(p)) return ' ';
      const cls = p.startsWith('[') ? 'y-jump' : /\?/.test(p) ? 'y-wild' : /^~?[0-9A-Fa-f]{2}$/.test(p) ? 'y-byte' : p.startsWith('/') ? 'y-comment' : 'y-punct'; // prettier-ignore
      return h('span', { class: cls, text: p });
    });
  }

  /**
   * @param {Token[]} tokens
   * @returns {(HTMLElement | string)[]}
   */
  colored(tokens) {
    return tokens.map((token) => (token.type === 'space' || token.type === 'punct' || token.type === 'ident' ? token.text : h('span', { class: `y-${token.type}`, text: token.text }))); // prettier-ignore
  }

  /**
   * @param {Finding[]} findings
   * @returns {HTMLElement}
   */
  findingsView(findings) {
    const t = this.t;
    return h(
      'ul',
      { class: 'yara-findings', part: 'findings', attrs: { 'aria-label': t('yaraFindings') } },
      ...findings.map((f) =>
        h(
          'li',
          { class: `yara-finding ${f.level}`, attrs: { 'data-finding': f.id } },
          icon(f.level === 'info' ? 'help' : 'alert'),
          h('span', { text: t(/** @type {StringKey} */ (`yaraFinding_${f.id}`), f.params) }),
          f.line ? h('span', { class: 'yara-line', text: t('yaraLine', { line: f.line }) }) : null,
        ),
      ),
    );
  }

  /**
   * @param {string} text
   * @returns {HTMLElement}
   */
  sourceView(text) {
    return h('pre', { class: 'yara-code yara-source', part: 'source' }, h('code', {}, ...this.colored(tokenize(text.slice(0, 1024 * 1024))))); // prettier-ignore
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
