// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import ansiCss from '../../styles/ansi.css?raw';
import logCss from '../../styles/log.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { deferChunk } from '../../core/chunks.js';
import { CHUNK_LINES, CHUNK_THRESHOLD } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton } from '../../core/ui.js';
import { parseAnsi } from '../terminal/ansi.js';
import { segmentNode } from '../terminal/ansi-dom.js';
import { LEVELS, LogParser, countLevels } from './parser.js';

/** @typedef {import('./parser.js').LogEntry} LogEntry */
/** @typedef {import('./parser.js').Level} Level */
/** @typedef {Level | "none"} LevelKey */

const TIME_MODES = /** @type {const} */ (['full', 'short', 'none']);
const LABELS = /** @type {Record<LevelKey, string>} */ ({
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO',
  notice: 'NOTICE',
  warn: 'WARN',
  error: 'ERROR',
  fatal: 'FATAL',
  none: 'OTHER',
});

/**
 * Displays application logs: levels, timestamps, structured fields and stack traces, with
 * level filters, a search that filters entries, and live streaming.
 *
 * Plain text, JSON lines (pino, bunyan, winston, Logstash…) and logfmt are recognized
 * line by line. Stack traces and multi-line messages stay with their entry. ANSI colors
 * are shown. New lines can be streamed with `write()`, and the view follows them.
 *
 * @element vt-log
 * @since 0.8.0
 *
 * @attr {string} levels - Levels shown at first, separated by spaces (default: all).
 * @attr {boolean} level-filter - Level buttons with counts in the header. Full variant: on.
 * @attr {boolean} follow - Keeps the newest line in view as lines are appended.
 * @attr {"full"|"short"|"none"} time - Timestamps as written, the time of day only, or hidden (default `full`).
 * @attr {boolean} fields - Fields of structured lines (default on).
 * @attr {boolean} colors - ANSI colors (default on).
 * @attr {boolean} line-numbers - Line numbers. Full variant: on.
 * @attr {boolean} wrap - Wraps long lines (default on).
 * @attr {number} collapse - Continuation lines shown before "Show N more lines" (default 6, 0: all).
 * @attr {number} max-entries - Oldest entries are dropped beyond this number (default 50,000).
 *
 * @prop {string} content - The log text.
 * @prop {LogEntry[]} entries - Parsed entries (read-only copies).
 * @prop {Record<string, number>} counts - Entries per level, `none` for entries without one (read-only).
 *
 * @method write - `write(text)` adds text at the end (live logs); `clear()` removes everything.
 *
 * @fires vt-filter-change - Levels shown or search changed. Detail: `{ levels, query, shown }`.
 *
 * @csspart log - The list of entries.
 * @csspart entry - An entry (also `entry-error`, `entry-warn`…).
 * @csspart time - A timestamp.
 * @csspart level - A level badge.
 * @csspart message - A message.
 * @csspart field - A structured field.
 * @csspart stack - Continuation lines (stack trace).
 * @csspart level-filter - A level button in the header.
 *
 * @example
 * <vt-log variant="full" max-height="400px" src="/logs/app.log"></vt-log>
 */
export class VtLog extends VtBase {
  static type = 'log';

  static componentAttributes = Object.freeze([
    'levels', 'level-filter', 'follow', 'time', 'fields', 'colors', 'line-numbers', 'wrap',
    'collapse', 'max-entries',
  ]); // prettier-ignore

  static presets = {
    simple: { fields: true, colors: true, wrap: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      fields: true, colors: true, wrap: true, 'level-filter': true, 'line-numbers': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, ansiCss, logCss];

  static keepCarriageReturns = true;

  static allowEmpty = true;

  constructor() {
    super();
    /** @type {LogParser} */
    this.parser = new LogParser();
    /** Text the parser has read (to know when `content` was replaced). */
    this.parsedText = '';
    /** @type {Set<LevelKey> | null} Levels hidden by the user; `null` follows `levels`. */
    this.levelFilter = null;
    this.query = '';
    /** @type {Set<LogEntry>} Entries whose continuation lines are expanded. */
    this.expanded = new Set();
    /** @type {HTMLElement | null} */
    this.list = null;
    /** @type {HTMLElement | null} */
    this.body = null;
    /** Index in `entries` of the next entry to render (streaming). */
    this.rendered = 0;
    /** @type {HTMLElement | null} */
    this.lastChunk = null;
    this.chunkCount = 0;
    this.matchCount = 0;
    /** @type {boolean | null} Follow chosen with the button; `null` follows the attribute. */
    this.following = null;
    /** @type {Map<LevelKey, HTMLButtonElement>} */
    this.chips = new Map();
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
    this.reset();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'levels') this.levelFilter = null;
    if (name === 'follow') this.following = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  reset() {
    this.parser = new LogParser();
    this.parsedText = '';
    this.expanded.clear();
  }

  /** @returns {LogEntry[]} */
  model() {
    const text = this.text ?? '';
    if (this.parsedText !== text) {
      if (this.parsedText && text.startsWith(this.parsedText)) {
        // Written with write(): only the new text is read; an unfinished last line waits.
        this.parser.push(text.slice(this.parsedText.length));
      } else {
        this.reset();
        this.parser.push(text, true);
      }
      this.parsedText = text;
      this.trim();
    }
    return this.parser.entries;
  }

  /** Drops the oldest entries beyond `max-entries` (in batches, so streaming stays cheap). */
  trim() {
    const max = parseInteger(this.getAttribute('max-entries'), {
      min: 100,
      max: 1_000_000,
      fallback: 50_000,
    });
    const entries = this.parser.entries;
    if (entries.length <= max) return false;
    entries.splice(0, entries.length - Math.floor(max * 0.9));
    this.rendered = 0;
    return true;
  }

  /** @returns {LogEntry[]} */
  get entries() {
    return this.model().map((entry) => ({
      ...entry,
      fields: [...entry.fields],
      more: [...entry.more],
    }));
  }

  /** @returns {Record<string, number>} */
  get counts() {
    return countLevels(this.model());
  }

  /** @returns {Set<LevelKey>} */
  get hiddenLevels() {
    if (this.levelFilter) return this.levelFilter;
    const value = this.getAttribute('levels');
    if (!value) return new Set();
    const shown = new Set(value.toLowerCase().split(/[\s,]+/));
    return new Set(
      /** @type {LevelKey[]} */ ([...LEVELS, 'none']).filter((level) => !shown.has(level)),
    );
  }

  /** @returns {boolean} */
  get follow() {
    return this.following ?? this.feature('follow');
  }

  /**
   * @param {LogEntry} entry
   * @returns {boolean}
   */
  visible(entry) {
    if (this.hiddenLevels.has(entry.level ?? 'none')) return false;
    if (!this.query) return true;
    const q = this.query.toLowerCase();
    return (
      entry.message.toLowerCase().includes(q) ||
      entry.time.toLowerCase().includes(q) ||
      entry.fields.some(([k, v]) => `${k}=${v}`.toLowerCase().includes(q)) ||
      entry.more.some((line) => line.toLowerCase().includes(q))
    );
  }

  // ------------------------------------------------------------------ streaming

  /**
   * Adds text at the end of the log (live logs). Each line is shown once its line break
   * has arrived.
   *
   * @param {string} text
   */
  write(text) {
    const chunk = String(text ?? '').replace(/\r\n/g, '\n');
    if (!chunk) return;
    const next = `${this.content ?? ''}${chunk}`;
    this.text = next;
    this._content = next;
    if (!this.list || this.editing) {
      this.requestRender();
      return;
    }
    const before = this.parser.entries.length;
    const firstChanged = Math.max(0, before - 1);
    this.model();
    if (this.rendered === 0 && before > 0) {
      // Entries were dropped (max-entries): draw everything again.
      this.renderList();
    } else {
      // The last entry may have grown (stack trace): redraw it, then add the new ones.
      this.list.querySelector(`[data-index="${firstChanged}"]`)?.remove();
      this.rendered = Math.min(this.rendered, firstChanged);
      this.appendRows();
    }
    this.updateChips();
    if (this.follow) this.scrollToEnd();
  }

  /** Removes every entry. */
  clear() {
    this.content = '';
  }

  scrollToEnd() {
    const body = this.body;
    if (body) body.scrollTop = body.scrollHeight;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const panel = h('div', { class: 'panel' });
    /** @type {HTMLElement[]} */
    let extra = [];

    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('log-edit');
      this.body = h('div', { class: 'body log-body log-preview', part: 'body preview' });
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        this.body,
      );
      extra = this.historyButtons(editor);
    } else {
      this.body = h('div', {
        class: 'body log-body',
        part: 'body',
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('log') },
        on: { scroll: () => this.onScroll() },
      });
      panel.append(this.body);
    }
    this.renderList();

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.renderList();
        this.changed();
        return { total: this.matchCount, capped: this.matchCount >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        const marks = this.list?.querySelectorAll('mark.match') ?? [];
        for (const mark of marks) mark.classList.remove('current');
        const mark = marks[index];
        if (!mark) return;
        mark.classList.add('current');
        mark.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderList();
      },
    };

    const actions = [
      ...(this.feature('level-filter') && !this.editing ? this.levelChips() : []),
      this.searchButton(target),
      ...extra,
      !this.editing
        ? iconButton({
            icon: 'follow',
            label: t('followLog'),
            key: 'follow',
            part: 'follow-button',
            pressed: this.follow,
            onClick: () => {
              this.following = !this.follow;
              this.render();
              if (this.following) this.scrollToEnd();
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.text ?? '', this.downloadName('app.log'), 'text/plain')
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copy')) : null,
    ];
    frame.append(...this.chrome({ badge: '', actions }), panel);
    this.editor?.align();
    if (this.follow) requestAnimationFrame(() => this.scrollToEnd());
  }

  /** Follow stops when the reader scrolls up, and starts again at the bottom. */
  onScroll() {
    const body = this.body;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    if (atBottom !== this.follow && (this.following !== null || this.feature('follow'))) {
      this.following = atBottom;
      const button = this.root.querySelector('[data-focus-key="follow"]');
      button?.setAttribute('aria-pressed', String(atBottom));
    }
  }

  /** @returns {HTMLButtonElement[]} One button per level present, with its count. */
  levelChips() {
    const counts = countLevels(this.model());
    this.chips.clear();
    const hidden = this.hiddenLevels;
    /** @type {LevelKey[]} */
    const order = ['fatal', 'error', 'warn', 'notice', 'info', 'debug', 'trace', 'none'];
    return order
      .filter((level) => counts[level] > 0)
      .map((level) => {
        const button = h(
          'button',
          {
            class: `level-chip level-${level}`,
            part: 'level-filter',
            attrs: {
              type: 'button',
              'aria-pressed': String(!hidden.has(level)),
              'data-focus-key': `level-${level}`,
              title: this.t('levelToggle', { level: LABELS[level] }),
            },
            on: { click: () => this.toggleLevel(level) },
          },
          h('span', { class: 'chip-name', text: LABELS[level] }),
          h('span', { class: 'chip-count', text: formatNumber(counts[level], this.locale) }),
        );
        this.chips.set(level, /** @type {HTMLButtonElement} */ (button));
        return /** @type {HTMLButtonElement} */ (button);
      });
  }

  /** Updates the counts of the level buttons (after appending). */
  updateChips() {
    if (!this.feature('level-filter')) return;
    const counts = countLevels(this.parser.entries);
    const missing = Object.entries(counts).some(
      ([level, count]) => count > 0 && !this.chips.has(/** @type {LevelKey} */ (level)),
    );
    if (missing) {
      // A new level appeared: rebuild the header, keeping the scroll position.
      const top = this.body?.scrollTop ?? 0;
      this.render();
      if (this.body) this.body.scrollTop = top;
      return;
    }
    for (const [level, chip] of this.chips) {
      const count = chip.querySelector('.chip-count');
      if (count) count.textContent = formatNumber(counts[level], this.locale);
    }
  }

  /**
   * @param {LevelKey} level
   */
  toggleLevel(level) {
    const hidden = new Set(this.hiddenLevels);
    if (hidden.has(level)) hidden.delete(level);
    else hidden.add(level);
    this.levelFilter = hidden;
    this.chips.get(level)?.setAttribute('aria-pressed', String(!hidden.has(level)));
    this.renderList();
    this.changed();
  }

  changed() {
    const shown = /** @type {LevelKey[]} */ ([...LEVELS, 'none']).filter(
      (level) => !this.hiddenLevels.has(level),
    );
    emit(this, EVENTS.FILTER_CHANGE, {
      levels: shown,
      query: this.query,
      shown: this.list?.querySelectorAll('[data-index]').length ?? 0,
    });
  }

  /** Builds the list of entries for the current filters. */
  renderList() {
    const body = this.body;
    if (!body) return;
    const entries = this.model();
    this.matchCount = 0;
    this.rendered = 0;
    this.lastChunk = null;
    this.chunkCount = 0;
    const time = parseEnum(this.getAttribute('time'), TIME_MODES, 'full');
    this.list = h('div', {
      class: [
        'log',
        this.feature('wrap') ? 'wrapped' : '',
        this.feature('line-numbers') ? 'numbered' : '',
        time === 'none' ? 'no-time' : '',
      ]
        .filter(Boolean)
        .join(' '),
      part: 'log',
      attrs: { role: 'list', 'aria-label': this.heading || this.t('log') },
    });
    // Columns line up: widest line number and timestamp, measured once.
    let lastLine = 1;
    let timeWidth = 0;
    for (const entry of entries) {
      lastLine = Math.max(lastLine, entry.line);
      const shown = time === 'short' ? shortTime(entry.time) : entry.time;
      timeWidth = Math.max(timeWidth, Math.min(40, shown.length));
    }
    this.list.style.setProperty('--_digits', String(String(lastLine).length));
    this.list.style.setProperty('--_time-width', `${timeWidth}ch`);
    body.replaceChildren(this.list);
    this.appendRows();
    if (!this.list.querySelector('[data-index]')) {
      body.append(
        h('div', {
          class: 'empty',
          part: 'empty',
          text: entries.length ? this.t('logNoMatch') : this.t('empty'),
        }),
      );
    }
  }

  /** Adds rows for entries not rendered yet, in blocks built as they scroll into view. */
  appendRows() {
    const list = this.list;
    if (!list) return;
    const entries = this.parser.entries;
    const start = this.rendered;
    /** @type {number[]} */
    const indexes = [];
    for (let i = start; i < entries.length; i += 1) if (this.visible(entries[i])) indexes.push(i);
    this.rendered = entries.length;
    if (!indexes.length) return;
    list.parentElement?.querySelector(':scope > .empty')?.remove();

    const build = (/** @type {Node} */ target, /** @type {number[]} */ rows) => {
      const fragment = document.createDocumentFragment();
      for (const index of rows) fragment.append(this.row(entries[index], index));
      target.appendChild(fragment);
    };
    // Small logs and streamed lines are built at once; big logs block by block.
    if (indexes.length + list.childElementCount < CHUNK_THRESHOLD && !this.chunkCount) {
      build(list, indexes);
      return;
    }
    for (let i = 0; i < indexes.length; i += CHUNK_LINES) {
      const rows = indexes.slice(i, i + CHUNK_LINES);
      const chunk = h('div', { class: 'chunk', attrs: { role: 'presentation' } });
      chunk.style.setProperty('--_chunk-lines', String(rows.length * 1.3));
      list.append(chunk);
      this.chunkCount += 1;
      // The first block and the last one (the newest lines, where follow looks) are built now.
      if (this.chunkCount === 1 || i + CHUNK_LINES >= indexes.length) build(chunk, rows);
      else {
        chunk.setAttribute('data-pending', '');
        deferChunk(chunk, () => {
          chunk.removeAttribute('data-pending');
          build(chunk, rows);
          this.highlightQuery(chunk);
        });
      }
    }
  }

  /**
   * One entry.
   *
   * @param {LogEntry} entry
   * @param {number} index
   * @returns {HTMLElement}
   */
  row(entry, index) {
    const level = entry.level ?? 'none';
    const row = h('div', {
      class: `entry level-${level}`,
      part: `entry entry-${level}`,
      attrs: { role: 'listitem', 'data-index': index },
    });
    if (this.feature('line-numbers'))
      row.append(
        h('span', { class: 'num', attrs: { 'aria-hidden': 'true', 'data-n': entry.line } }),
      );
    const time = parseEnum(this.getAttribute('time'), TIME_MODES, 'full');
    if (time !== 'none') {
      const shown = time === 'short' ? shortTime(entry.time) : entry.time;
      row.append(
        h('span', {
          class: 'time',
          part: 'time',
          text: shown,
          attrs: { title: entry.time && shown !== entry.time ? entry.time : null },
        }),
      );
    }
    row.append(
      h('span', {
        class: `lvl lvl-${level}`,
        part: 'level',
        text: entry.level ? LABELS[level] : '',
      }),
    );
    const message = h('span', { class: 'msg', part: 'message' });
    this.addText(message, entry.message);
    if (this.feature('fields') && entry.fields.length) {
      const fields = h('span', { class: 'fields' });
      for (const [key, value] of entry.fields) {
        fields.append(
          h(
            'span',
            { class: 'field', part: 'field' },
            h('span', { class: 'field-key', text: key }),
            h('span', {
              class: 'field-value',
              text: value.length > 300 ? `${value.slice(0, 300)}…` : value,
            }),
          ),
        );
      }
      message.append(fields);
    }
    row.append(message);
    if (entry.more.length) row.append(this.stack(entry));
    if (this.query) {
      this.matchCount += 1;
      this.highlightQuery(row);
    }
    return row;
  }

  /**
   * Continuation lines, collapsed after `collapse` lines.
   *
   * @param {LogEntry} entry
   * @returns {HTMLElement}
   */
  stack(entry) {
    const limit = parseInteger(this.getAttribute('collapse'), { min: 0, max: 10_000, fallback: 6 });
    const open = limit === 0 || entry.more.length <= limit + 1 || this.expanded.has(entry);
    const shown = open ? entry.more : entry.more.slice(0, limit);
    const block = h('div', { class: 'stack', part: 'stack' });
    for (const line of shown) {
      const text = h('span', { class: 'stack-line' });
      this.addText(text, line);
      block.append(text);
    }
    if (!open) {
      block.append(
        h('button', {
          class: 'stack-more',
          text: this.t('showMoreLines', {
            count: formatNumber(entry.more.length - limit, this.locale),
          }),
          attrs: { type: 'button' },
          on: {
            click: () => {
              this.expanded.add(entry);
              block.replaceWith(this.stack(entry));
            },
          },
        }),
      );
    }
    return block;
  }

  /**
   * Appends text with its ANSI styles (or plain).
   *
   * @param {HTMLElement} target
   * @param {string} text
   */
  addText(target, text) {
    if (!text.includes('\u001b') || !this.feature('colors')) {
      target.append(text.includes('\u001b') ? stripEscapes(text) : text);
      return;
    }
    for (const segment of parseAnsi(text)[0] ?? []) target.append(segmentNode(segment));
  }

  /**
   * Marks the search query in the text of a row or block.
   *
   * @param {Element} root
   */
  highlightQuery(root) {
    if (!this.query) return;
    const q = this.query.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('button, .num')) continue;
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

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: false,
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
    this.previewTimer = setTimeout(() => this.renderList(), 150);
  }
}

/**
 * The time of day of a timestamp (`18:00:00.123`), or the timestamp as written.
 *
 * @param {string} time
 * @returns {string}
 */
export function shortTime(time) {
  const match = /(\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,3})?)?)/.exec(time);
  return match ? match[1] : time;
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripEscapes(text) {
  return (parseAnsi(text)[0] ?? []).map((segment) => segment.text).join('');
}
