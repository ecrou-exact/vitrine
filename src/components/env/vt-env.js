// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import envCss from '../../styles/env.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH, TextSearch } from '../../core/search.js';
import { createTabs, iconButton, noticeView } from '../../core/ui.js';
import { isSecretName, maskValue } from '../http/secrets.js';
import { FORMATS, parseEnv, splitReferences } from './parser.js';

/** @typedef {import('./parser.js').EnvEntry} EnvEntry */
/** @typedef {import('./parser.js').EnvResult} EnvResult */

const VIEWS = /** @type {const} */ (['table', 'raw']);
/** @typedef {typeof VIEWS[number]} View */

const BADGES = { dotenv: '.env', ini: 'INI', properties: 'PROPERTIES' };

/**
 * Displays configuration files: dotenv (`.env`), INI and Java `.properties`, as a table of
 * keys and values grouped by section, with secrets masked until revealed.
 *
 * Quotes, `export`, comments, multi-line quoted values and continued lines are read.
 * `${VAR}` references are marked, and link to the variable when it is defined in the
 * same file. Values whose key names a secret (`PASSWORD`, `TOKEN`, `API_KEY`…) are masked
 * in the table, the raw view, copy and download until the reader reveals them.
 *
 * @element vt-env
 * @since 0.9.0
 *
 * @attr {"auto"|"dotenv"|"ini"|"properties"} format - File format (default `auto`, detected).
 * @attr {boolean} mask-secrets - Masks secret values until revealed (default on).
 * @attr {string} secret-keys - More key names to mask, separated by spaces or commas.
 * @attr {boolean} tabs - Table / Raw tabs. Full variant: on.
 * @attr {"table"|"raw"} view - Initial view (default `table`, `raw` in edit mode).
 * @attr {boolean} comments - Comments next to their entry (default on).
 * @attr {boolean} line-numbers - Line numbers. Full variant: on.
 *
 * @prop {string} content - The file text.
 * @prop {EnvEntry[]} entries - Parsed entries (read-only copies, never masked).
 * @prop {"dotenv"|"ini"|"properties"} format - Format read (read-only).
 *
 * @fires vt-tab-change - Table / Raw changed. Detail: `{ tab }`.
 *
 * @csspart table - The table of entries.
 * @csspart section - An INI section heading row.
 * @csspart key - A key.
 * @csspart value - A value.
 * @csspart secret - A masked value.
 * @csspart reference - A `${VAR}` reference.
 * @csspart comment - A comment.
 * @csspart secrets-button - Show / hide secrets button.
 *
 * @example
 * <vt-env variant="full" src="/config/.env.example"></vt-env>
 */
export class VtEnv extends VtBase {
  static type = 'env';

  static componentAttributes = Object.freeze([
    'format', 'mask-secrets', 'secret-keys', 'tabs', 'view', 'comments', 'line-numbers',
  ]); // prettier-ignore

  static presets = {
    simple: { 'mask-secrets': true, comments: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      tabs: true, 'mask-secrets': true, comments: true, 'line-numbers': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, envCss];

  static allowEmpty = true;

  constructor() {
    super();
    /** @type {{ text: string, format: string, result: EnvResult } | null} */
    this.parsed = null;
    this.revealed = false;
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    this.query = '';
    this.matchCount = 0;
    /** @type {HTMLElement | null} */
    this.tableHost = null;
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

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    if (name === 'format') this.parsed = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.parsed = null;
  }

  // ------------------------------------------------------------------ model

  /** @returns {EnvResult} */
  parse() {
    const text = this.text ?? '';
    const format = parseEnum(this.getAttribute('format'), ['auto', ...FORMATS], 'auto');
    if (this.parsed?.text !== text || this.parsed.format !== format) {
      this.parsed = { text, format, result: parseEnv(text, format) };
    }
    return this.parsed.result;
  }

  /** @returns {EnvEntry[]} */
  get entries() {
    return this.parse().entries.map((entry) => ({ ...entry }));
  }

  /** @returns {"dotenv"|"ini"|"properties"} */
  get format() {
    return this.parse().format;
  }

  /** @returns {View} */
  get view() {
    return (
      this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, this.editing ? 'raw' : 'table')
    );
  }

  /** @returns {boolean} */
  get masking() {
    return this.feature('mask-secrets') && !this.revealed;
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  isSecret(key) {
    const extra = (this.getAttribute('secret-keys') ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    const name = key.toLowerCase();
    return isSecretName(name) || extra.includes(name);
  }

  /**
   * @param {EnvEntry} entry
   * @returns {boolean}
   */
  masked(entry) {
    return this.masking && Boolean(entry.value) && this.isSecret(entry.key);
  }

  /** @returns {string} The text with secret values masked (when masking). */
  displayText() {
    const text = (this.text ?? '').replace(/\r\n?/g, '\n');
    if (!this.masking) return text;
    const lines = text.split('\n');
    for (const entry of this.parse().entries) {
      if (!this.masked(entry)) continue;
      const first = entry.line - 1;
      const mask = maskValue(entry.value);
      const at = lines[first].search(/[=:]/);
      if (entry.lines > 1 || at < 0) {
        lines[first] = `${lines[first].slice(0, at + 1)}${mask}`;
        for (let i = 1; i < entry.lines; i += 1) lines[first + i] = '';
      } else {
        const head = lines[first].slice(0, at + 1);
        const tail = lines[first].slice(at + 1);
        const value = entry.quote ? `${entry.quote}${entry.value}${entry.quote}` : entry.value;
        const index = tail.indexOf(value);
        const shown = entry.quote ? `${entry.quote}${mask}${entry.quote}` : mask;
        lines[first] =
          index < 0
            ? `${head}${shown}`
            : `${head}${tail.slice(0, index)}${shown}${tail.slice(index + value.length)}`;
      }
    }
    return lines.join('\n');
  }

  /**
   * @param {EnvEntry} entry
   * @returns {boolean}
   */
  visible(entry) {
    if (!this.query) return true;
    const q = this.query.toLowerCase();
    return [entry.key, entry.section, entry.comment, this.masked(entry) ? '' : entry.value].some(
      (value) => value.toLowerCase().includes(q),
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const view = this.view;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'table', label: t('table'), icon: 'table' },
            { id: 'raw', label: t('raw'), icon: 'code' },
          ],
          selected: view,
          label: t('tabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const panel = h('div', {
      class: 'panel',
      attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null },
    });
    /** @type {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} */
    let target;
    /** @type {(HTMLElement | null)[]} */
    let extra = [];

    if (view === 'raw' && this.editing) {
      const editor = this.createEditor();
      panel.append(h('div', { class: 'body editor-body', part: 'body' }, editor.element));
      /** @type {TextSearch | null} */
      let search = null;
      target = {
        run: (query) => {
          search = new TextSearch(/** @type {Element} */ (editor.layer.querySelector('pre.code')));
          return search.run(query);
        },
        go: (index) => revealMatch(search?.go(index) ?? null),
        clear: () => search?.clear(),
      };
      extra = this.historyButtons(editor);
    } else if (view === 'raw') {
      const codeView = buildCodeView(this.displayText(), {
        language: 'plaintext',
        lineNumbers: this.feature('line-numbers'),
        startLine: 1,
        highlightRanges: [],
        diff: false,
        highlightLimit: getConfig().highlightLimit,
      });
      panel.append(
        h(
          'div',
          {
            class: 'body',
            part: 'body',
            attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('env') },
          },
          codeView.element,
        ),
      );
      const search = new TextSearch(codeView.code);
      target = {
        run: (query) => search.run(query),
        go: (index) => revealMatch(search.go(index)),
        clear: () => search.clear(),
      };
    } else {
      this.tableHost = h('div', {
        class: 'body env-body',
        part: 'body',
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('env') },
      });
      panel.append(...this.notices(), this.tableHost);
      this.renderTable();
      target = {
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

    const result = this.parse();
    const secrets =
      this.feature('mask-secrets') && result.entries.some((e) => e.value && this.isSecret(e.key));
    const actions = [
      this.searchButton(target),
      ...extra,
      secrets && !this.editing
        ? iconButton({
            icon: this.revealed ? 'eye-off' : 'eye',
            label: t(this.revealed ? 'hideSecrets' : 'showSecrets'),
            key: 'secrets',
            part: 'secrets-button',
            pressed: this.revealed,
            onClick: () => {
              this.revealed = !this.revealed;
              this.render();
              this.announce(t(this.revealed ? 'secretsShown' : 'secretsHidden'));
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.displayText(),
            this.downloadName(result.format === 'dotenv' ? '.env' : `config.${result.format}`),
            'text/plain',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.displayText(), t('copy')) : null,
    ];
    const badge = tabs ? '' : this.text ? BADGES[result.format] : '';
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
    this.editor?.align();
  }

  /** @returns {HTMLElement[]} Lines that could not be read. */
  notices() {
    const { invalid } = this.parse();
    if (!invalid.length) return [];
    return [
      noticeView(
        this.t('envInvalid', {
          count: formatNumber(invalid.length, this.locale),
          line: invalid[0].line,
        }),
      ),
    ];
  }

  /** Builds the table for the current search. */
  renderTable() {
    const host = this.tableHost;
    if (!host) return;
    const t = this.t;
    const { entries } = this.parse();
    const defined = new Set(entries.map((entry) => entry.key));
    const numbered = this.feature('line-numbers');
    const comments = this.feature('comments');
    this.matchCount = 0;
    const body = h('tbody');
    /** @type {string | null} */
    let section = null;
    for (const entry of entries) {
      if (!this.visible(entry)) continue;
      if (entry.section !== section) {
        section = entry.section;
        if (section)
          body.append(
            h(
              'tr',
              { class: 'section', part: 'section' },
              h('th', {
                text: `[${section}]`,
                attrs: { colspan: numbered ? 3 : 2, scope: 'colgroup' },
              }),
            ),
          );
      }
      this.matchCount += 1;
      body.append(this.row(entry, defined, numbered, comments));
    }
    if (!this.matchCount) {
      host.replaceChildren(
        h('div', {
          class: 'empty',
          part: 'empty',
          text: entries.length ? t('envNoMatch') : t('empty'),
        }),
      );
      return;
    }
    const head = h(
      'tr',
      {},
      numbered ? h('th', { class: 'num', attrs: { scope: 'col' }, text: '#' }) : null,
      h('th', { attrs: { scope: 'col' }, text: t('envKey') }),
      h('th', { attrs: { scope: 'col' }, text: t('envValue') }),
    );
    host.replaceChildren(
      h('table', { class: 'env-table', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /**
   * @param {EnvEntry} entry
   * @param {Set<string>} defined
   * @param {boolean} numbered
   * @param {boolean} comments
   * @returns {HTMLElement}
   */
  row(entry, defined, numbered, comments) {
    const key = h(
      'th',
      { class: 'key', attrs: { scope: 'row', id: this.keyId(entry) } },
      entry.exported ? h('span', { class: 'export', text: 'export ' }) : null,
      h('code', { part: 'key', text: entry.key }),
    );
    const value = h('td', { class: 'value' });
    if (this.masked(entry)) {
      value.append(
        h('code', {
          class: 'secret',
          part: 'value secret',
          text: maskValue(entry.value),
          attrs: { title: this.t('envSecret') },
        }),
      );
    } else if (!entry.value) {
      value.append(h('span', { class: 'blank', text: this.t('envEmpty') }));
    } else {
      const code = h('code', { class: `quote-${entry.quote ? 'yes' : 'no'}`, part: 'value' });
      for (const part of splitReferences(entry.value)) {
        if (!part.ref || entry.quote === "'") code.append(part.text);
        else if (defined.has(part.ref)) {
          code.append(
            h('a', {
              class: 'ref',
              part: 'reference',
              text: part.text,
              attrs: { href: `#${this.keyId({ key: part.ref })}` },
              on: { click: (event) => this.goToKey(event, part.ref ?? '') },
            }),
          );
        } else code.append(h('span', { class: 'ref', part: 'reference', text: part.text }));
      }
      value.append(code);
    }
    if (comments && entry.comment) {
      value.append(h('span', { class: 'comment', part: 'comment', text: entry.comment }));
    }
    const row = h(
      'tr',
      { class: 'entry', attrs: { 'data-line': entry.line } },
      numbered
        ? h('td', { class: 'num', attrs: { 'aria-hidden': 'true', 'data-n': entry.line } })
        : null,
      key,
      value,
    );
    if (this.query) highlight(row, this.query);
    return row;
  }

  /**
   * @param {{ key: string }} entry
   * @returns {string}
   */
  keyId(entry) {
    return `${this.panelId}-k-${entry.key.replace(/[^\w-]/g, '_')}`;
  }

  /**
   * Scrolls to the entry a reference points to.
   *
   * @param {Event} event
   * @param {string} name
   */
  goToKey(event, name) {
    event.preventDefault();
    const cell = this.root.getElementById?.(this.keyId({ key: name }));
    const row = cell?.closest('tr');
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.classList.add('current');
    setTimeout(() => row.classList.remove('current'), 1200);
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

  // ------------------------------------------------------------------ editing

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
    this.previewTimer = setTimeout(() => {
      this.parsed = null;
    }, 150);
  }
}

/**
 * Marks a query in the text of a row (keys, values, comments).
 *
 * @param {Element} root
 * @param {string} query
 */
function highlight(root, query) {
  const q = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('.secret, .num')) continue;
    nodes.push(/** @type {Text} */ (node));
  }
  for (const node of nodes) {
    let current = node;
    let index = (current.nodeValue ?? '').toLowerCase().indexOf(q);
    while (index >= 0) {
      const match = current.splitText(index);
      const rest = match.splitText(q.length);
      const mark = h('mark', { class: 'match', part: 'match' });
      match.replaceWith(mark);
      mark.append(match);
      current = rest;
      index = (current.nodeValue ?? '').toLowerCase().indexOf(q);
    }
  }
}
