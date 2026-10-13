// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import gitCss from '../../styles/git.css?raw';
import { VtBase } from '../../core/base-element.js';
import { deferChunk, fillChunk } from '../../core/chunks.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { GitError, findCommit, layoutGraph, listRefs, reachable, readCommits } from './history.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./history.js').Commit} Commit */
/** @typedef {import('./history.js').GitRef} GitRef */
/** @typedef {import('./history.js').GraphLayout} GraphLayout */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Lane width and row height of the graph, in pixels (kept in sync with git.css). */
const LANE = 16;
const ROW = 30;
/** Rows per block; blocks get their rows when they come near the screen. */
const CHUNK = 100;
/** Most branch buttons shown. */
const MAX_BRANCHES = 24;
const COLORS = 8;

/**
 * Shows a commit history as a graph: one lane per branch, merges and branch points drawn
 * as curves, branch and tag labels, and the hash, subject, author and date of each commit.
 *
 * Reads `git log --pretty=format:'%H|%P|%an|%ad|%D|%s'`, `git log --graph --oneline
 * --decorate`, or JSON (`[{ hash, parents, author, date, subject, refs, body }]`). The lanes
 * are computed from the parents. A commit opens a details panel; branch buttons show only
 * the commits a branch contains.
 *
 * @element vt-git
 * @since 0.9.0
 *
 * @attr {boolean} branch-filter - Branch buttons with counts. Full variant: on.
 * @attr {string} branch - Branch shown at first (default: all).
 * @attr {boolean} author - Author column (default on).
 * @attr {boolean} date - Date column (default on).
 * @attr {"relative"|"absolute"} date-format - Dates as "3 days ago" or in full (default `relative`).
 * @attr {number} hash-length - Characters of the hash shown (default 7).
 * @attr {string} selected - Hash (or prefix) of the commit selected at first.
 *
 * @prop {string} content - The history, as `git log` output or JSON.
 * @prop {Commit[]} commits - Commits read from the content (read-only copies).
 *
 * @fires vt-select - A commit was selected. Detail: `{ commit }`.
 * @fires vt-filter-change - The branch shown changed. Detail: `{ branch, shown }`.
 *
 * @csspart graph - The list of commits.
 * @csspart commit - A row (also `commit-selected`).
 * @csspart lanes - The drawing of a row.
 * @csspart hash - The short hash.
 * @csspart ref - A branch or tag label (also `ref-head`, `ref-remote`, `ref-tag`).
 * @csspart subject - The subject of a commit.
 * @csspart details - The details panel of the selected commit.
 * @csspart branch-filter - A branch button in the header.
 *
 * @cssprop --vt-git-1 - Color of the first lane (up to `--vt-git-8`; defaults to the chart colors).
 *
 * @example
 * <vt-git variant="full" src="/history.txt"></vt-git>
 */
export class VtGit extends VtBase {
  static type = 'git';

  static componentAttributes = Object.freeze([
    'branch-filter', 'branch', 'author', 'date', 'date-format', 'hash-length', 'selected',
  ]); // prettier-ignore

  static presets = {
    simple: { author: true, date: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      author: true, date: true, 'branch-filter': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, gitCss];

  constructor() {
    super();
    /** @type {{ text: string, commits: Commit[], error: Error | null } | null} */
    this.parsed = null;
    /** @type {string | null} Branch chosen with the buttons (`''`: all, `null`: the attribute). */
    this.branchChoice = null;
    /** @type {string | null} Hash of the selected commit. */
    this.selectedHash = null;
    this.selectionRead = false;
    /** Index of the row that takes Tab focus. */
    this.active = 0;
    this.query = '';
    /** @type {number[]} Indexes of the shown commits that match the search. */
    this.found = [];
    this.listId = uid('git');
    /** @type {HTMLElement | null} */
    this.listHost = null;
    /** @type {HTMLElement | null} */
    this.detailsHost = null;
    /** @type {HTMLElement[]} */
    this.chunks = [];
    /** @type {{ branch: string, commits: Commit[], layout: GraphLayout } | null} */
    this.view = null;
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
    this.view = null;
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ commits: Commit[], error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, commits: readCommits(text), error: null };
    } catch (error) {
      this.parsed = {
        text,
        commits: [],
        error: error instanceof Error ? error : new GitError(String(error)),
      };
    }
    this.view = null;
    return this.parsed;
  }

  /** @returns {Commit[]} */
  get commits() {
    return structuredClone(this.parse().commits);
  }

  /** @returns {string} Branch shown, or `''` for all. */
  get branch() {
    return this.branchChoice ?? this.getAttribute('branch') ?? '';
  }

  /** Commits of the current branch, and their lanes. */
  shown() {
    const { commits } = this.parse();
    const branch = this.branch;
    if (this.view && this.view.branch === branch) return this.view;
    const tip = branch ? listRefs(commits).find((entry) => entry.ref.name === branch) : undefined;
    const keep = tip ? reachable(commits, tip.hash) : null;
    const list = keep ? commits.filter((commit) => keep.has(commit.hash)) : commits;
    this.view = { branch, commits: list, layout: layoutGraph(list) };
    return this.view;
  }

  /** @returns {number} */
  get hashLength() {
    const value = Number(this.getAttribute('hash-length'));
    return Number.isInteger(value) && value >= 4 && value <= 64 ? value : 7;
  }

  /**
   * @param {Commit} commit
   * @returns {boolean}
   */
  matchesQuery(commit) {
    if (!this.query) return false;
    const q = this.query.toLowerCase();
    return (
      commit.hash.toLowerCase().startsWith(q) ||
      [commit.subject, commit.author, commit.body, ...commit.refs.map((r) => r.name)].some((v) =>
        v.toLowerCase().includes(q),
      )
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { commits, error } = this.parse();
    if (!this.selectionRead) {
      this.selectionRead = true;
      const wanted = this.getAttribute('selected');
      if (wanted) this.selectedHash = findCommit(commits, wanted)?.hash ?? null;
    }
    const panel = h('div', { class: 'panel' });
    const body = h('div', { class: 'body git-body', part: 'body' });

    if (error) body.append(noticeView(t('gitInvalid', { message: error.message })));
    else if (!commits.length)
      body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else {
      this.listHost = h('div', {
        class: 'git-list',
        part: 'graph',
        attrs: { id: this.listId, role: 'listbox', 'aria-label': this.heading || t('gitHistory') },
        on: { keydown: (event) => this.onKey(/** @type {KeyboardEvent} */ (event)) },
      });
      this.detailsHost = h('div', { class: 'git-details-host' });
      body.append(this.listHost, this.detailsHost);
      this.renderList();
    }

    /** @type {HTMLElement[]} */
    let extra = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('git-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.renderList();
        return { total: this.found.length, capped: this.found.length >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        // Focus stays in the search field; the match is only marked.
        for (const row of this.listHost?.querySelectorAll('.git-row.current') ?? [])
          row.classList.remove('current');
        const row = this.row(this.found[index]);
        row?.classList.add('current');
        row?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderList();
      },
    };

    const json = /^\s*[[{]/.test(this.text ?? '');
    const actions = [
      this.searchButton(target),
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(json ? 'git-log.json' : 'git-log.txt'),
            json ? 'application/json' : 'text/plain',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copy')) : null,
    ];
    const badge = commits.length
      ? t('gitCount', { count: formatNumber(commits.length, this.locale) })
      : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    if (this.feature('branch-filter') && commits.length && !error) {
      const bar = this.branchBar(commits);
      if (bar) panel.prepend(bar);
    }
    this.editor?.align();
  }

  /**
   * @param {Commit[]} commits
   * @returns {HTMLElement | null}
   */
  branchBar(commits) {
    const refs = listRefs(commits).filter((entry) => entry.ref.type !== 'tag');
    if (!refs.length) return null;
    const bar = h('div', {
      class: 'branch-bar',
      attrs: { role: 'group', 'aria-label': this.t('gitBranches') },
    });
    const current = this.branch;
    const button = (
      /** @type {string} */ name,
      /** @type {GitRef | null} */ ref,
      /** @type {number} */ count,
    ) =>
      h(
        'button',
        {
          class: `branch-chip${ref ? ` ref-${ref.type}` : ''}`,
          part: 'branch-filter',
          attrs: {
            type: 'button',
            'aria-pressed': String(current === name),
            'data-focus-key': `branch-${name}`,
          },
          on: {
            click: () => {
              this.branchChoice = name;
              this.active = 0;
              this.render();
              emit(this, EVENTS.FILTER_CHANGE, {
                branch: name,
                shown: this.shown().commits.length,
              });
            },
          },
        },
        name || this.t('gitAllBranches'),
        h('span', { class: 'chip-count', text: formatNumber(count, this.locale) }),
      );
    bar.append(button('', null, commits.length));
    for (const { ref, hash } of refs.slice(0, MAX_BRANCHES)) {
      bar.append(button(ref.name, ref, reachable(commits, hash).size));
    }
    return bar;
  }

  /** Renders the rows of the current branch, in blocks built as they scroll into view. */
  renderList() {
    const host = this.listHost;
    if (!host) return;
    const { commits, layout } = this.shown();
    this.found = [];
    commits.forEach((commit, i) => {
      if (this.found.length < MAX_MATCHES && this.matchesQuery(commit)) this.found.push(i);
    });
    if (!commits.length) {
      host.replaceChildren(h('div', { class: 'empty', part: 'empty', text: this.t('gitNoMatch') }));
      this.renderDetails();
      return;
    }
    const selected = commits.findIndex((commit) => commit.hash === this.selectedHash);
    if (selected >= 0) this.active = selected;
    this.active = Math.min(this.active, commits.length - 1);
    host.style.setProperty('--_lanes', String(Math.max(1, layout.width)));
    const matchSet = new Set(this.found);
    this.chunks = [];
    for (let first = 0; first < commits.length; first += CHUNK) {
      const last = Math.min(commits.length, first + CHUNK);
      const chunk = h('div', {
        class: 'git-chunk',
        attrs: { 'data-pending': '', 'data-first': String(first), role: 'presentation' },
      });
      chunk.style.setProperty('--_rows', String(last - first));
      // The rows near the selection and the first block are built now: they get focus.
      const fill = () => {
        chunk.removeAttribute('data-pending');
        chunk.style.removeProperty('--_rows');
        for (let i = first; i < last; i += 1)
          chunk.append(this.rowElement(commits[i], i, layout, matchSet.has(i)));
      };
      this.chunks.push(chunk);
      if (first === 0 || (this.active >= first && this.active < last)) fill();
      else deferChunk(chunk, fill);
    }
    host.replaceChildren(...this.chunks);
    this.renderDetails();
  }

  /**
   * The row of a commit, building its block first when needed.
   *
   * @param {number | undefined} index
   * @returns {HTMLElement | null}
   */
  row(index) {
    if (index === undefined || index < 0) return null;
    const chunk = this.chunks[Math.floor(index / CHUNK)];
    if (!chunk) return null;
    fillChunk(chunk);
    return /** @type {HTMLElement | null} */ (chunk.children[index % CHUNK] ?? null);
  }

  /**
   * @param {Commit} commit
   * @param {number} index
   * @param {GraphLayout} layout
   * @param {boolean} match
   * @returns {HTMLElement}
   */
  rowElement(commit, index, layout, match) {
    const selected = commit.hash === this.selectedHash;
    const classes = ['git-row'];
    if (selected) classes.push('selected');
    if (match) classes.push('match');
    if (commit.parents.length > 1) classes.push('merge');
    const row = h(
      'div',
      {
        class: classes.join(' '),
        part: selected ? 'commit commit-selected' : 'commit',
        attrs: {
          id: `${this.listId}-${index}`,
          role: 'option',
          tabindex: index === this.active ? '0' : '-1',
          'aria-selected': String(selected),
          'data-index': String(index),
          'data-focus-key': `commit-${commit.hash}`,
        },
        on: {
          click: (event) => {
            if (event.target instanceof Element && event.target.closest('button')) return;
            this.select(index, true);
          },
        },
      },
      lanes(
        layout,
        index,
        commit.refs.some((ref) => ref.head),
      ),
      h('span', { class: 'git-hash', part: 'hash', text: commit.hash.slice(0, this.hashLength) }),
      h(
        'span',
        { class: 'git-message' },
        ...commit.refs.map((ref) => refLabel(ref)),
        h('span', { class: 'git-subject', part: 'subject', text: commit.subject }),
      ),
    );
    if (this.feature('author') && commit.author)
      row.append(h('span', { class: 'git-author', text: commit.author }));
    if (this.feature('date') && commit.date) row.append(this.dateElement(commit, 'git-date'));
    return row;
  }

  /**
   * @param {Commit} commit
   * @param {string} className
   * @returns {HTMLElement}
   */
  dateElement(commit, className) {
    if (commit.time === null) return h('span', { class: className, text: commit.date });
    const date = new Date(commit.time);
    const full = new Intl.DateTimeFormat(this.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
    const relative = this.getAttribute('date-format') !== 'absolute';
    return h('time', {
      class: className,
      attrs: { datetime: date.toISOString(), title: relative ? full : null },
      text: relative ? relativeTime(commit.time, this.locale) : full,
    });
  }

  /** Details of the selected commit, under the list. */
  renderDetails() {
    const host = this.detailsHost;
    if (!host) return;
    const commit = this.shown().commits.find((c) => c.hash === this.selectedHash);
    if (!commit) {
      host.replaceChildren();
      return;
    }
    const t = this.t;
    const facts = h('dl', { class: 'git-facts' });
    const fact = (/** @type {string} */ label, /** @type {(Node | string)[]} */ ...value) =>
      facts.append(h('div', {}, h('dt', { text: label }), h('dd', {}, ...value)));
    fact(
      t('gitCommit'),
      h('code', { text: commit.hash }),
      this.copyButton(() => commit.hash, t('gitCopyHash'), 'copy-hash'),
    );
    if (commit.parents.length) {
      fact(
        t('gitParents'),
        ...commit.parents.map((parent) =>
          h('button', {
            class: 'git-parent',
            attrs: { type: 'button', 'data-focus-key': `parent-${parent}` },
            text: parent.slice(0, this.hashLength),
            on: { click: () => this.jump(parent) },
          }),
        ),
      );
    }
    if (commit.author) fact(t('gitAuthor'), commit.author);
    if (commit.date) fact(t('gitDate'), this.dateElement(commit, 'git-full-date'));
    if (commit.refs.length) fact(t('gitRefs'), ...commit.refs.map((ref) => refLabel(ref)));
    const panel = h(
      'section',
      { class: 'git-details', part: 'details', attrs: { 'aria-label': t('gitDetails') } },
      h(
        'div',
        { class: 'git-details-head' },
        h('h3', { text: commit.subject || commit.hash }),
        iconButton({
          icon: 'close',
          label: t('gitCloseDetails'),
          key: 'close-details',
          onClick: () => {
            this.selectedHash = null;
            this.renderList();
            this.row(this.active)?.focus();
          },
        }),
      ),
      facts,
    );
    if (commit.body) panel.append(h('pre', { class: 'git-body-text', text: commit.body }));
    host.replaceChildren(panel);
  }

  // ------------------------------------------------------------------ interaction

  /**
   * @param {number} index
   * @param {boolean} focus
   */
  select(index, focus) {
    const commit = this.shown().commits[index];
    if (!commit) return;
    this.selectedHash = commit.hash;
    this.active = index;
    this.renderList();
    if (focus) this.row(index)?.focus();
    emit(this, EVENTS.SELECT, { commit: structuredClone(commit) });
  }

  /**
   * Selects a parent, showing every branch when the current one does not contain it.
   *
   * @param {string} hash
   */
  jump(hash) {
    let index = this.shown().commits.findIndex((c) => c.hash === hash);
    if (index === -1 && this.branch) {
      this.branchChoice = '';
      this.render();
      index = this.shown().commits.findIndex((c) => c.hash === hash);
    }
    if (index === -1) return;
    this.select(index, true);
    this.row(index)?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Arrow keys move between commits; Enter or Space selects one.
   *
   * @param {KeyboardEvent} event
   */
  onKey(event) {
    const rowEl = event.target instanceof HTMLElement ? event.target.closest('.git-row') : null;
    if (!rowEl || event.target !== rowEl) return;
    const index = Number(rowEl.getAttribute('data-index'));
    const count = this.shown().commits.length;
    const page = Math.max(1, Math.floor((this.listHost?.clientHeight || ROW * 10) / ROW) - 1);
    /** @type {Record<string, number>} */
    const moves = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + page,
      PageUp: index - page,
      Home: 0,
      End: count - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      this.moveTo(Math.max(0, Math.min(count - 1, moves[event.key])));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(index, true);
    }
  }

  /**
   * @param {number} index
   */
  moveTo(index) {
    const previous = this.row(this.active);
    const next = this.row(index);
    if (!next) return;
    previous?.setAttribute('tabindex', '-1');
    next.setAttribute('tabindex', '0');
    this.active = index;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const json = /^\s*[[{]/.test(this.text ?? '');
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: json ? 'json' : 'plaintext',
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
      this.view = null;
      this.render();
    }, 400);
  }
}

/**
 * @param {GitRef} ref
 * @returns {HTMLElement}
 */
function refLabel(ref) {
  const kind = ref.head ? 'head' : ref.type;
  return h('span', {
    class: `git-ref ref-${kind}`,
    part: `ref ref-${kind}`,
    text:
      ref.type === 'tag'
        ? ref.name
        : ref.head && ref.type === 'branch'
          ? `HEAD → ${ref.name}`
          : ref.name,
  });
}

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 * @returns {SVGElement}
 */
function svg(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

/**
 * The drawing of one row: lanes passing through, lanes ending on the commit, edges to its
 * parents, and the commit dot.
 *
 * @param {GraphLayout} layout
 * @param {number} index
 * @param {boolean} head
 * @returns {SVGElement}
 */
function lanes(layout, index, head) {
  const { rows, width } = layout;
  const row = rows[index];
  const mid = ROW / 2;
  const x = (/** @type {number} */ k) => LANE / 2 + k * LANE;
  const box = svg('svg', {
    class: 'git-lanes',
    width: Math.max(1, width) * LANE,
    height: ROW,
    viewBox: `0 0 ${Math.max(1, width) * LANE} ${ROW}`,
    'aria-hidden': 'true',
    focusable: 'false',
    part: 'lanes',
  });
  const line = (/** @type {string} */ d, /** @type {number | undefined} */ color) =>
    box.append(svg('path', { d, class: `lane lane-${(color ?? 0) % COLORS}` }));
  for (const k of row.passes) line(`M${x(k)} 0V${ROW}`, row.top[k]);
  for (const k of row.into) {
    line(
      k === row.col
        ? `M${x(k)} 0V${mid}`
        : `M${x(k)} 0C${x(k)} ${mid * 0.9} ${x(row.col)} ${mid * 0.4} ${x(row.col)} ${mid}`,
      row.top[k],
    );
  }
  for (const k of row.out) {
    line(
      k === row.col
        ? `M${x(k)} ${mid}V${ROW}`
        : `M${x(row.col)} ${mid}C${x(row.col)} ${ROW - mid * 0.4} ${x(k)} ${ROW - mid * 0.9} ${x(k)} ${ROW}`,
      row.bottom[k],
    );
  }
  const color = (row.bottom[row.col] ?? row.top[row.col] ?? 0) % COLORS;
  box.append(
    svg('circle', {
      cx: x(row.col),
      cy: mid,
      r: head ? 5 : 4,
      class: `dot lane-${color}${head ? ' head' : ''}`,
    }),
  );
  return box;
}

/**
 * "3 days ago", in the page language.
 *
 * @param {number} time
 * @param {string} locale
 * @returns {string}
 */
export function relativeTime(time, locale) {
  const seconds = (time - Date.now()) / 1000;
  /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds), 'second');
}
