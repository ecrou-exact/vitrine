// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import diffCss from '../../styles/diff.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import {
  VitrineError,
  assertSize,
  fetchContent,
  isAbortError,
  readContainer,
} from '../../core/content.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { emit, EVENTS } from '../../core/events.js';
import {
  highlight,
  isLanguageLoaded,
  loadLanguage,
  resolveLanguage,
} from '../../core/highlighter.js';
import { formatNumber } from '../../core/i18n.js';
import { splitLines, plainLines } from '../../core/lines.js';
import { TextSearch } from '../../core/search.js';
import { revealMatch } from '../../core/code-view.js';
import { createTabs, emptyView, iconButton, loadingView, noticeView } from '../../core/ui.js';
import { diffTexts, foldLines, parsePatch, toPatch } from './diff.js';

const VIEWS = /** @type {const} */ (['split', 'unified']);

/** @typedef {typeof VIEWS[number]} View */
/** @typedef {import('./diff.js').Line} Line */
/** @typedef {import('./diff.js').Row} Row */

/**
 * Compares two texts, or shows a unified patch, side by side or in one column.
 *
 * Give it two texts (`original` and `modified` properties, `original-src` and
 * `modified-src` URLs, or `<template data-original>` and `<template data-modified>`
 * children), or a unified patch as content (for example the output of `git diff`).
 * Changed words are marked inside modified lines, unchanged regions are folded, and the
 * comparison can be copied or downloaded as a standard patch.
 *
 * @element vt-diff
 * @since 0.6.0
 *
 * @attr {string} language - Language for syntax highlighting (`js`, `python`, `json`…).
 * @attr {"split"|"unified"} view - Side by side (default in the full variant) or one column.
 * @attr {boolean} tabs - Split / Unified tabs. Full variant: on.
 * @attr {number|"all"} context - Unchanged lines kept around changes (default 3; `all` keeps everything).
 * @attr {boolean} line-numbers - Line numbers (default on).
 * @attr {boolean} wrap - Wraps long lines in the unified view (always on side by side).
 * @attr {string} original-src - URL of the original text.
 * @attr {string} modified-src - URL of the modified text.
 * @attr {string} original-label - Name of the original in the patch (default `original`).
 * @attr {string} modified-label - Name of the modified text in the patch (default `modified`).
 *
 * @prop {string} original - The original text.
 * @prop {string} modified - The modified text.
 * @prop {string} patch - The comparison as a unified patch (read-only).
 *
 * @csspart diff - The diff grid.
 * @csspart row - A line of the diff (also `row-insert`, `row-delete`, `row-context`).
 * @csspart line-number - A line number cell.
 * @csspart word-change - A changed word inside a modified line.
 * @csspart fold - "Show unchanged lines" button.
 *
 * @example
 * <vt-diff language="js" variant="full">
 *   <template data-original>const a = 1;</template>
 *   <template data-modified>const a = 2;</template>
 * </vt-diff>
 */
export class VtDiff extends VtBase {
  static type = 'diff';

  static componentAttributes = Object.freeze([
    'language', 'view', 'tabs', 'context', 'line-numbers', 'wrap', 'original-src', 'modified-src',
    'original-label', 'modified-label',
  ]); // prettier-ignore

  static presets = {
    simple: { 'line-numbers': true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, tabs: true,
      'line-numbers': true, fullscreen: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, diffCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'original', 'modified'];

  constructor() {
    super();
    /** @type {string | undefined} */
    this._original = undefined;
    /** @type {string | undefined} */
    this._modified = undefined;
    /** @type {{ original?: string, modified?: string }} */
    this.inline = {};
    /** @type {{ original?: string, modified?: string }} */
    this.remote = {};
    this.sidesLoading = 0;
    /** @type {AbortController | null} */
    this.sidesAbort = null;
    /** @type {Set<number>} */
    this.expanded = new Set();
    /** @type {View | null} */
    this.viewState = null;
    this.panelId = uid('panel');
    /** @type {{ key: string, lines: Line[], simplified: boolean, names: [string, string] } | null} */
    this.cache = null;
    /** @type {HTMLElement | null} */
    this.diffHost = null;
    /** @type {CodeEditor[]} */
    this.editors = [];
    /** @type {CodeEditor | null} */
    this.activeEditor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.diffTimer = undefined;
    /** @type {(() => void) | null} */
    this.updateHistoryButtons = null;
    /** @type {import('../../core/history.js').EditHistory[]} */
    this.histories = [];
  }

  // ------------------------------------------------------------------ sources

  /** @returns {string} */
  get original() {
    return this.sides()?.original ?? '';
  }

  set original(value) {
    this._original = value === null || value === undefined ? undefined : String(value);
    this.sidesChanged();
  }

  /** @returns {string} */
  get modified() {
    return this.sides()?.modified ?? '';
  }

  set modified(value) {
    this._modified = value === null || value === undefined ? undefined : String(value);
    this.sidesChanged();
  }

  /** @returns {string} */
  get patch() {
    // A patch given as content is returned as written (hunk positions included).
    if (!this.sides()) return this.text ?? '';
    const result = this.compare();
    if (!result) return '';
    return toPatch(result.lines, { originalName: result.names[0], modifiedName: result.names[1] });
  }

  /**
   * The two texts to compare, or `null` in patch mode.
   *
   * @returns {{ original: string, modified: string } | null}
   */
  sides() {
    const original = this._original ?? this.remote.original ?? this.inline.original;
    const modified = this._modified ?? this.remote.modified ?? this.inline.modified;
    if (original === undefined && modified === undefined) return null;
    return { original: original ?? '', modified: modified ?? '' };
  }

  /**
   * Inline content: `<template data-original>` / `<template data-modified>` go to the
   * two sides; any other container is a patch.
   *
   * @returns {string | null}
   */
  readInline() {
    this.inline = {};
    /** @type {string | null} */
    let patch = null;
    for (const child of Array.from(this.children)) {
      const text = readContainer(child);
      if (text === null) continue;
      if (child.hasAttribute('data-original')) this.inline.original = text;
      else if (child.hasAttribute('data-modified')) this.inline.modified = text;
      else patch ??= text;
    }
    if (
      patch === null &&
      this.inline.original === undefined &&
      this.inline.modified === undefined
    ) {
      return super.readInline();
    }
    return patch;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadSides();
  }

  disconnectedCallback() {
    this.sidesAbort?.abort();
    clearTimeout(this.diffTimer);
    for (const editor of this.editors) editor.destroy();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    if (name === 'context') this.expanded.clear();
    if (
      (name === 'original-src' || name === 'modified-src') &&
      oldValue !== newValue &&
      this._connected
    )
      this.loadSides();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** Loads `original-src` and `modified-src`. */
  loadSides() {
    this.sidesAbort?.abort();
    const controller = new AbortController();
    this.sidesAbort = controller;
    this.remote = {};
    const config = getConfig();
    const sides = /** @type {const} */ (['original', 'modified']);
    this.sidesLoading = 0;
    for (const side of sides) {
      const src = this.getAttribute(`${side}-src`);
      if (!src) continue;
      this.sidesLoading += 1;
      fetchContent(src, {
        allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
        maxSize: config.maxSize,
        timeout: config.fetchTimeout,
        signal: controller.signal,
      }).then(
        (text) => {
          if (controller.signal.aborted) return;
          this.remote[side] = text;
          this.sidesLoading -= 1;
          this.sidesChanged();
        },
        (error) => {
          if (isAbortError(error) || controller.signal.aborted) return;
          this.sidesLoading -= 1;
          this.setError(error);
        },
      );
    }
    if (this.sidesLoading) this.requestRender();
  }

  /** One of the two texts changed. */
  sidesChanged() {
    this.cache = null;
    this.histories = [];
    this.expanded.clear();
    if (this._connected) this.requestRender();
  }

  contentChanged() {
    this.cache = null;
    this.expanded.clear();
  }

  // ------------------------------------------------------------------ comparison

  /**
   * The compared lines (cached).
   *
   * @returns {{ lines: Line[], simplified: boolean, names: [string, string] } | null}
   */
  compare() {
    const sides = this.sides();
    const key = sides
      ? `${sides.original}\u0000${sides.modified}`
      : `patch\u0000${this.text ?? ''}`;
    if (this.cache?.key === key) return this.cache;
    const names = /** @type {[string, string]} */ ([
      this.getAttribute('original-label') || 'original',
      this.getAttribute('modified-label') || 'modified',
    ]);
    if (sides) {
      const maxSize = getConfig().maxSize;
      assertSize(sides.original, maxSize);
      assertSize(sides.modified, maxSize);
      const { lines, simplified } = diffTexts(sides.original, sides.modified);
      this.cache = { key, lines, simplified, names };
    } else if (this.text) {
      const parsed = parsePatch(this.text);
      this.cache = {
        key,
        lines: parsed.lines,
        simplified: false,
        names: [parsed.originalName || names[0], parsed.modifiedName || names[1]],
      };
    } else return null;
    return this.cache;
  }

  /** @returns {View} */
  get view() {
    return (
      this.viewState ??
      parseEnum(this.getAttribute('view'), VIEWS, this.variant === 'full' ? 'split' : 'unified')
    );
  }

  /** @returns {number} */
  get context() {
    const value = (this.getAttribute('context') ?? '').trim().toLowerCase();
    if (value === 'all') return -1;
    return parseInteger(value || null, { min: -1, max: 1000, fallback: 3 });
  }

  /** @returns {{ name: string, label: string }} */
  language() {
    const requested = this.getAttribute('language')?.trim().toLowerCase() || '';
    const name = resolveLanguage(requested);
    if (!name) return { name: 'plaintext', label: '' };
    if (!isLanguageLoaded(name)) {
      loadLanguage(name).then((ok) => ok && this.requestRender());
      return { name: 'plaintext', label: name };
    }
    return { name, label: name };
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    if (this.sidesLoading > 0) {
      frame.append(...this.chrome(null), h('div', { class: 'body', part: 'body' }, loadingView(t)));
      return;
    }
    /** @type {ReturnType<VtDiff['compare']>} */
    let result;
    try {
      result = this.compare();
    } catch (error) {
      this.setError(error instanceof Error ? error : new VitrineError('tooLarge'));
      return;
    }
    if (!result && !this.editing) {
      frame.append(...this.chrome(null), emptyView(t));
      return;
    }
    const view = this.view;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'split', label: t('splitView'), icon: 'columns' },
            { id: 'unified', label: t('unifiedView'), icon: 'rows' },
          ],
          selected: view,
          label: t('tabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const stats = result ? this.stats(result.lines) : '';
    this.diffHost = h('div', { class: 'diff-host' });
    const panel = h('div', {
      class: 'panel',
      attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null },
    });
    if (this.editing) panel.append(this.renderEditors());
    if (result?.simplified) panel.append(noticeView(t('diffSimplified')));
    panel.append(this.diffHost);
    this.renderDiff();

    const search = () =>
      new TextSearch(
        /** @type {Element} */ (this.diffHost?.querySelector('.diff') ?? this.diffHost),
        { skip: '.num, .sign' },
      );
    /** @type {TextSearch | null} */
    let active = null;
    const target = {
      /** @param {string} query */
      run: (query) => {
        active = search();
        return active.run(query);
      },
      /** @param {number} index */
      go: (index) => revealMatch(active?.go(index) ?? null),
      clear: () => active?.clear(),
    };
    const actions = [
      this.searchButton(target),
      ...(this.editing ? this.diffHistoryButtons() : []),
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.patch, this.downloadName('changes.diff'), 'text/x-diff')
        : null,
      this.feature('copy') ? this.copyButton(() => this.patch, t('copyPatch')) : null,
    ];
    frame.append(...this.chrome({ badge: stats, tabs, actions }), panel);
    for (const editor of this.editors) editor.align();
  }

  /**
   * @param {Line[]} lines
   * @returns {string} e.g. "+12 −3".
   */
  stats(lines) {
    const added = lines.filter((l) => l.type === 'insert').length;
    const removed = lines.filter((l) => l.type === 'delete').length;
    return this.t('diffStats', {
      added: formatNumber(added, this.locale),
      removed: formatNumber(removed, this.locale),
    });
  }

  /** Renders the comparison into its host (also called after edits). */
  renderDiff() {
    const host = this.diffHost;
    if (!host) return;
    /** @type {ReturnType<VtDiff['compare']>} */
    let result;
    try {
      result = this.compare();
    } catch {
      host.replaceChildren(
        noticeView(
          this.t('tooLarge', { size: '', limit: formatNumber(getConfig().maxSize, this.locale) }),
        ),
      );
      return;
    }
    if (!result || !result.lines.some((line) => line.type !== 'context')) {
      host.replaceChildren(
        h('div', { class: 'empty', part: 'empty', text: this.t('noDifferences') }),
      );
      return;
    }
    const view = this.view;
    const lang = this.language();
    const fragments = this.highlightSides(result.lines, lang.name);
    const rows = foldLines(result.lines, this.context, this.expanded);
    const numbers = this.feature('line-numbers');
    const wrapped = view === 'split' || this.feature('wrap');
    const digits = String(
      Math.max(1, ...result.lines.map((l) => Math.max(l.oldNo ?? 0, l.newNo ?? 0))),
    ).length;
    const grid = h('div', {
      class: `diff ${view}${wrapped ? ' wrapped' : ''}${numbers ? '' : ' no-numbers'}`,
      part: 'diff',
      attrs: { role: 'table', 'aria-label': this.heading || this.t('changes') },
    });
    grid.style.setProperty('--_digits', String(digits));
    /** Last original line shown, to mark lines skipped between hunks of a patch. */
    let lastOld = 0;
    /** @type {HTMLElement[]} */
    const open = [];
    for (const row of rows) {
      if (row.type === 'fold') {
        grid.append(this.foldRow(row));
        lastOld = 0;
        open.length = 0;
        continue;
      }
      // Patches skip unchanged regions between hunks: show where lines are missing.
      const oldNo = row.line.oldNo;
      if (oldNo !== null && lastOld && oldNo > lastOld + 1) {
        grid.append(
          h('div', {
            class: 'gap',
            part: 'hunk',
            attrs: { role: 'row', 'aria-hidden': 'true' },
            text: '⋯',
          }),
        );
      }
      if (oldNo !== null) lastOld = oldNo;
      if (view === 'unified') grid.append(this.unifiedRow(row.line, fragments));
      else this.splitRows(row.line, fragments, grid, open);
    }
    host.replaceChildren(
      h('div', { class: 'body diff-body', part: 'body', attrs: { tabindex: '0' } }, grid),
    );
  }

  /**
   * Highlights both sides once and returns the fragment of each line.
   *
   * @param {Line[]} lines
   * @param {string} language
   * @returns {Map<Line, DocumentFragment>}
   */
  highlightSides(lines, language) {
    /** @type {Map<Line, DocumentFragment>} */
    const map = new Map();
    for (const side of /** @type {const} */ (['old', 'new'])) {
      const sideLines = lines.filter((l) =>
        side === 'old' ? l.type !== 'insert' : l.type !== 'delete',
      );
      const text = sideLines.map((l) => l.text).join('\n');
      const fragments =
        language !== 'plaintext' && text.length <= getConfig().highlightLimit
          ? splitLines(highlight(text, language))
          : plainLines(text);
      sideLines.forEach((line, index) => {
        // Context lines exist on both sides: keep the first (identical) fragment.
        if (!map.has(line)) map.set(line, fragments[index] ?? document.createDocumentFragment());
      });
    }
    return map;
  }

  /**
   * @param {Line} line
   * @param {Map<Line, DocumentFragment>} fragments
   * @returns {HTMLElement}
   */
  codeCell(line, fragments) {
    const cell = h('span', { class: 'code-cell', attrs: { role: 'cell' } });
    const fragment = /** @type {DocumentFragment} */ (
      fragments.get(line)?.cloneNode(true) ?? document.createDocumentFragment()
    );
    cell.append(fragment);
    if (line.ranges?.length) markRanges(cell, line.ranges);
    return cell;
  }

  /**
   * @param {number | null} value
   * @returns {HTMLElement}
   */
  numberCell(value) {
    return h('span', {
      class: 'num',
      part: 'line-number',
      attrs: { role: 'cell', 'aria-hidden': 'true', 'data-n': value ?? '' },
    });
  }

  /**
   * @param {Line} line
   * @param {boolean} [nested] - Inside the code cell (split view): not a cell itself.
   * @returns {HTMLElement}
   */
  signCell(line, nested = false) {
    const label =
      line.type === 'insert' ? this.t('added') : line.type === 'delete' ? this.t('removed') : '';
    return h(
      'span',
      { class: 'sign', attrs: { role: nested ? null : 'cell' } },
      label ? h('span', { class: 'sr-only', text: `${label}: ` }) : null,
    );
  }

  /**
   * @param {Line} line
   * @param {Map<Line, DocumentFragment>} fragments
   * @returns {HTMLElement}
   */
  unifiedRow(line, fragments) {
    const row = h('div', {
      class: `row ${line.type}`,
      part: `row row-${line.type}`,
      attrs: { role: 'row' },
    });
    if (this.feature('line-numbers'))
      row.append(this.numberCell(line.oldNo), this.numberCell(line.newNo));
    row.append(this.signCell(line), this.codeCell(line, fragments));
    return row;
  }

  /**
   * Side by side: context lines on both sides; within a change block, removed lines on the
   * left and added lines on the right, paired in order (first removed with first added).
   *
   * @param {Line} line
   * @param {Map<Line, DocumentFragment>} fragments
   * @param {HTMLElement} grid
   * @param {HTMLElement[]} open - Rows of removed lines still waiting for an added line.
   */
  splitRows(line, fragments, grid, open) {
    if (line.type === 'context') {
      open.length = 0;
      grid.append(
        h(
          'div',
          { class: 'row context', part: 'row row-context', attrs: { role: 'row' } },
          ...this.half(line, 'left', fragments),
          ...this.half(line, 'right', fragments),
        ),
      );
      return;
    }
    if (line.type === 'insert' && open.length) {
      const row = /** @type {HTMLElement} */ (open.shift());
      for (const cell of row.querySelectorAll('.right')) cell.remove();
      row.append(...this.half(line, 'right', fragments));
      row.classList.add('insert');
      row.setAttribute('part', 'row row-delete row-insert');
      return;
    }
    const row = h('div', {
      class: `row ${line.type}`,
      part: `row row-${line.type}`,
      attrs: { role: 'row' },
    });
    if (line.type === 'delete') {
      row.append(...this.half(line, 'left', fragments), ...this.half(null, 'right', fragments));
      open.push(row);
    } else {
      open.length = 0;
      row.append(...this.half(null, 'left', fragments), ...this.half(line, 'right', fragments));
    }
    grid.append(row);
  }

  /**
   * Cells of one side of a split row (number and code), or empty cells.
   *
   * @param {Line | null} line
   * @param {"left" | "right"} side
   * @param {Map<Line, DocumentFragment>} fragments
   * @returns {HTMLElement[]}
   */
  half(line, side, fragments) {
    /** @type {HTMLElement[]} */
    const cells = [];
    if (this.feature('line-numbers'))
      cells.push(this.numberCell(line ? (side === 'left' ? line.oldNo : line.newNo) : null));
    if (line) {
      const code = this.codeCell(line, fragments);
      code.prepend(this.signCell(line, true));
      cells.push(code);
    } else cells.push(h('span', { class: 'code-cell filler', attrs: { role: 'cell' } }));
    for (const cell of cells) cell.classList.add(side);
    return cells;
  }

  /**
   * @param {{ from: number, to: number, count: number }} fold
   * @returns {HTMLElement}
   */
  foldRow(fold) {
    return h(
      'div',
      { class: 'fold-row', attrs: { role: 'row' } },
      h('button', {
        class: 'fold',
        part: 'fold',
        text: this.t('unchangedLines', { count: formatNumber(fold.count, this.locale) }),
        attrs: { type: 'button', 'data-focus-key': `fold-${fold.from}` },
        on: {
          click: () => {
            this.expanded.add(fold.from);
            this.renderDiff();
          },
        },
      }),
    );
  }

  // ------------------------------------------------------------------ editing

  /** @returns {HTMLElement} One editor per side (or one for a patch). */
  renderEditors() {
    for (const editor of this.editors) editor.destroy();
    this.editors = [];
    const lang = this.language();
    const sides = this.sides();
    const make = (
      /** @type {string} */ text,
      /** @type {string} */ label,
      /** @type {(text: string) => void} */ onInput,
      /** @type {string} */ language,
    ) => {
      const index = this.editors.length;
      const editor = new CodeEditor({
        text,
        language,
        history: this.histories[index],
        lineNumbers: this.feature('line-numbers'),
        wrap: true,
        highlightLimit: getConfig().highlightLimit,
        label,
        onInput,
        onChange: () => emit(this, EVENTS.CHANGE, this.editValue()),
      });
      editor.textarea.addEventListener('focus', () => {
        this.activeEditor = editor;
        this.updateHistoryButtons?.();
      });
      this.editors.push(editor);
      // Keep each side's undo history across re-renders.
      this.histories[index] = editor.history;
      return h(
        'div',
        { class: 'diff-editor' },
        h('div', { class: 'diff-editor-label', text: label }),
        h('div', { class: 'body editor-body', part: 'body' }, editor.element),
      );
    };
    if (!sides) {
      const patch = make(
        this.text ?? '',
        this.t('patch'),
        (text) => {
          this.text = text;
          this._content = text;
          this.editedDiff();
        },
        'diff',
      );
      this.activeEditor = this.editors[0];
      return h('div', { class: 'diff-editors single' }, patch);
    }
    const left = make(
      sides.original,
      this.t('original'),
      (text) => {
        this._original = text;
        this.editedDiff();
      },
      lang.name,
    );
    const right = make(
      sides.modified,
      this.t('modified'),
      (text) => {
        this._modified = text;
        this.editedDiff();
      },
      lang.name,
    );
    this.activeEditor = this.editors[1];
    return h('div', { class: 'diff-editors' }, left, right);
  }

  /** @returns {{ value: string, original?: string, modified?: string }} */
  editValue() {
    const sides = this.sides();
    return sides
      ? { value: this.patch, original: sides.original, modified: sides.modified }
      : { value: this.text ?? '' };
  }

  /** A side was edited: recompute the comparison shortly after typing stops. */
  editedDiff() {
    this.cache = null;
    emit(this, EVENTS.INPUT, this.editValue());
    clearTimeout(this.diffTimer);
    this.diffTimer = setTimeout(() => {
      this.expanded.clear();
      this.renderDiff();
      const result = this.compare();
      const badge = this.root.querySelector('[part="badge"]');
      if (badge && result) badge.textContent = this.stats(result.lines);
      if (this.searchOpen && this.searchQuery) this.searchBar?.run();
    }, 200);
  }

  /** @returns {HTMLButtonElement[]} Undo / redo for the editor that last had focus. */
  diffHistoryButtons() {
    if (parseBoolean(this.getAttribute('history')) === false) return [];
    const undo = iconButton({
      icon: 'undo',
      label: this.t('undo'),
      key: 'undo',
      part: 'undo-button',
      onClick: () => this.activeEditor?.undo(),
    });
    const redo = iconButton({
      icon: 'redo',
      label: this.t('redo'),
      key: 'redo',
      part: 'redo-button',
      onClick: () => this.activeEditor?.redo(),
    });
    this.updateHistoryButtons = () => {
      undo.disabled = !this.activeEditor?.history.canUndo;
      redo.disabled = !this.activeEditor?.history.canRedo;
    };
    for (const editor of this.editors)
      editor.history.subscribe(() => this.updateHistoryButtons?.());
    this.updateHistoryButtons();
    return [undo, redo];
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
}

/**
 * Wraps character ranges of a cell's text in `<mark class="word-change">` elements.
 *
 * @param {HTMLElement} cell
 * @param {import('./diff.js').Range[]} ranges
 */
export function markRanges(cell, ranges) {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  /** @type {{ node: Text, start: number }[]} */
  const nodes = [];
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('.sign')) continue;
    nodes.push({ node: /** @type {Text} */ (node), start: offset });
    offset += (node.nodeValue ?? '').length;
  }
  // From the end, so earlier offsets stay valid while splitting.
  for (let r = ranges.length - 1; r >= 0; r -= 1) {
    const [start, end] = ranges[r];
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const { node, start: nodeStart } = nodes[i];
      const length = (node.nodeValue ?? '').length;
      const from = Math.max(start, nodeStart) - nodeStart;
      const to = Math.min(end, nodeStart + length) - nodeStart;
      if (to <= from) continue;
      const middle = node.splitText(from);
      middle.splitText(to - from);
      const mark = document.createElement('mark');
      mark.className = 'word-change';
      mark.setAttribute('part', 'word-change');
      middle.replaceWith(mark);
      mark.append(middle);
    }
  }
}
