// @ts-check
import csvCss from '../../styles/csv.css?raw';
import flameCss from '../../styles/flame.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { MAX_QUERY_LENGTH } from '../../core/search.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { FlameError, parseProfile, pathOf, toFolded, topFunctions } from './flame.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./flame.js').Frame} Frame */
/** @typedef {import('./flame.js').Profile} Profile */

const TABS = /** @type {const} */ (['graph', 'functions']);
/** Frames narrower than this share of the width are not drawn. */
const MIN_WIDTH = 0.001;
/** Colors, picked by the name of a frame. */
const COLORS = 8;

/**
 * A flame graph of a CPU profile: each function a bar as wide as the time spent in it and in
 * what it called, stacked on its caller. Choosing a bar zooms into it; the search shows how
 * much time matching functions take; the Functions tab lists the costliest functions.
 *
 * Reads folded stacks (`main;parse;tokenize 12`, written by perf with stackcollapse,
 * py-spy, async-profiler, rbspy…), Chrome and Node CPU profiles (`.cpuprofile`), and JSON
 * trees `{ name, value, children }`. Names are shown as text; nothing is run or fetched.
 *
 * @element vt-flame
 * @since 0.15.0
 *
 * @attr {"down"|"up"} direction - `down`: callers on top, as an icicle (default); `up`: callers at the bottom, as flames.
 * @attr {boolean} tabs - Flame graph and Functions tabs. Full variant: on.
 * @attr {"graph"|"functions"} default-tab - Tab shown at first (default `graph`).
 * @attr {string} unit - Unit of the weights, when the profile does not say (default `samples`).
 *
 * @prop {string} content - The profile.
 * @prop {Profile | null} profile - The profile read (read-only).
 *
 * @fires vt-select - A frame was chosen and zoomed into. Detail: `{ name, file, self, total, path }`.
 * @fires vt-tab-change - The tab changed. Detail: `{ tab }`.
 *
 * @csspart graph - The frames.
 * @csspart frame - A frame (also `frame-match` during a search).
 * @csspart crumbs - The path of the frame zoomed into.
 * @csspart details - The frame under the pointer or the focus.
 * @csspart table - The table of functions.
 *
 * @example
 * <vt-flame variant="full" src="/profiles/checkout.cpuprofile"></vt-flame>
 */
export class VtFlame extends VtBase {
  static type = 'flame';

  static componentAttributes = Object.freeze(['direction', 'tabs', 'default-tab', 'unit']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, tabs: true }, // prettier-ignore
  };

  static styles = [csvCss, flameCss];

  constructor() {
    super();
    /** @type {{ text: string, profile: Profile | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {Frame | null} */
    this.zoom = null;
    /** @type {Frame | null} Frame with the keyboard focus. */
    this.focused = null;
    /** @type {"graph" | "functions" | null} */
    this.tab = null;
    this.query = '';
    /** @type {Frame[]} */
    this.matchFrames = [];
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.graphHost = null;
    /** @type {HTMLElement | null} */
    this.details = null;
    /** @type {Map<Frame, HTMLElement>} */
    this.elements = new Map();
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
    this.zoom = null;
    this.focused = null;
  }

  /** @returns {{ profile: Profile | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, profile: parseProfile(text), error: null };
    } catch (error) {
      this.parsed = { text, profile: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Profile | null} */
  get profile() {
    return this.parse().profile;
  }

  /** @returns {"graph" | "functions"} */
  get currentTab() {
    if (!this.feature('tabs')) return 'graph';
    return this.tab ?? parseEnum(this.getAttribute('default-tab'), TABS, 'graph');
  }

  /**
   * A weight with its unit: `12.5 ms`, `340 samples`.
   *
   * @param {number} value
   * @param {Profile} profile
   */
  weight(value, profile) {
    if (profile.unit === 'ms') {
      const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
      return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(value)} ms`;
    }
    const unit = this.getAttribute('unit')?.trim().slice(0, 30);
    const n = formatNumber(Math.round(value * 100) / 100, this.locale);
    if (unit) return `${n} ${unit}`;
    return value === 1 ? this.t('flameSample') : this.t('flameSamples', { count: n });
  }

  /**
   * @param {number} part
   * @param {number} whole
   */
  percent(part, whole) {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 }).format(whole ? part / whole : 0); // prettier-ignore
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { profile, error } = this.parse();
    const tab = this.currentTab;
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: `body fl-body tab-${tab}`, part: 'body' });
    this.graphHost = null;
    if (error || !profile) body.append(noticeView(this.errorText(error)));
    else if (tab === 'functions') body.append(this.functionsView(profile));
    else body.append(this.graphView());

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('fl-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const tabs =
      this.feature('tabs') && profile && !this.editing
        ? createTabs({
            tabs: [
              { id: 'graph', label: t('flameGraph'), icon: 'chart' },
              { id: 'functions', label: t('flameFunctions'), icon: 'table' },
            ],
            selected: tab,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.tab = /** @type {"graph" | "functions"} */ (id);
              this.render();
              /** @type {HTMLElement | null} */ (
                this.root.querySelector(`[data-tab="${id}"]`)
              )?.focus();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    if (tabs) panel.setAttribute('role', 'tabpanel');

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim().toLowerCase();
        this.matchFrames = [];
        if (profile && this.query) {
          /** @type {Frame[]} */
          const stack = [profile.root];
          while (stack.length) {
            const f = /** @type {Frame} */ (stack.pop());
            if (f !== profile.root && f.name.toLowerCase().includes(this.query))
              this.matchFrames.push(f);
            stack.push(...f.children);
          }
        }
        this.renderGraph();
        return { total: this.matchFrames.length, capped: false };
      },
      /** @param {number} index */
      go: (index) => {
        const match = this.matchFrames[index];
        if (match)
          this.elements.get(match)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.matchFrames = [];
        this.renderGraph();
      },
    };
    const actions = [
      tab === 'graph' ? this.searchButton(target) : null,
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName(profile?.format === 'cpuprofile' ? 'profile.cpuprofile' : 'profile.folded'), 'text/plain') : null, // prettier-ignore
      this.feature('copy') && profile ? this.copyButton(() => toFolded(profile.root), t('flameCopyFolded')) : null, // prettier-ignore
    ];
    const badge = profile ? this.weight(profile.root.total, profile) : '';
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof FlameError) {
      if (error.message === 'empty') return t('flameInvalidEmpty');
      if (error.message === 'noSamples') return t('flameInvalidNoSamples');
      if (error.message.startsWith('json:')) return t('flameInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('flameInvalidFormat');
  }

  /** @returns {HTMLElement} */
  graphView() {
    this.graphHost = h('div', { class: 'fl-graph-host' });
    this.details = h('p', {
      class: 'fl-details',
      part: 'details',
      attrs: { 'aria-live': 'polite' },
    });
    const view = h('div', { class: 'fl-view' }, this.graphHost, this.details);
    this.renderGraph();
    return view;
  }

  /** Draws the frames of the frame zoomed into. */
  renderGraph() {
    const host = this.graphHost;
    const profile = this.parse().profile;
    if (!host || !profile) return;
    const t = this.t;
    const zoom = this.zoom ?? profile.root;
    const scale = zoom.total || 1;
    const all = profile.root.total || 1;
    const matches = new Set(this.matchFrames);
    this.elements = new Map();

    // Path of the zoom, as buttons.
    const crumbs = h('nav', { class: 'fl-crumbs', part: 'crumbs', attrs: { 'aria-label': t('flameZoom') } }); // prettier-ignore
    for (const f of pathOf(zoom)) {
      crumbs.append(
        h('button', {
          class: 'text-btn',
          text: f === profile.root ? t('flameReset') : f.name,
          attrs: { type: 'button', 'aria-current': f === zoom ? 'true' : null, 'data-focus-key': `crumb-${f.id}` }, // prettier-ignore
          on: { click: () => this.zoomTo(f === profile.root ? null : f) },
        }),
      );
    }

    // Ancestors of the zoom stay as full-width bars above it.
    /** @type {{ frame: Frame, left: number, width: number }[]} */
    const placed = pathOf(zoom).map((f) => ({ frame: f, left: 0, width: 1 }));
    /** @type {{ frame: Frame, left: number }[]} */
    const queue = [{ frame: zoom, left: 0 }];
    while (queue.length) {
      const { frame, left } = /** @type {{ frame: Frame, left: number }} */ (queue.shift());
      let x = left;
      for (const child of frame.children) {
        const width = child.total / scale;
        if (width >= MIN_WIDTH) {
          placed.push({ frame: child, left: x, width });
          queue.push({ frame: child, left: x });
        }
        x += width;
      }
    }
    const depth = Math.max(...placed.map((p) => p.frame.depth)) + 1;
    const graph = h('div', {
      class: `fl-graph${this.getAttribute('direction') === 'up' ? ' up' : ''}`,
      part: 'graph',
      attrs: { role: 'tree', 'aria-label': t('flameFrames') },
      on: { keydown: (event) => this.onKey(/** @type {KeyboardEvent} */ (event)) },
    });
    // When zoomed in, the root (all) is not drawn: rows start one lower.
    const offset = zoom === profile.root ? 0 : 1;
    graph.style.setProperty('--_rows', String(depth - offset));
    graph.style.setProperty('--_offset', String(offset));
    if (!this.focused || !placed.some((p) => p.frame === this.focused)) this.focused = zoom;
    for (const { frame, left, width } of placed) {
      if (frame === profile.root && zoom !== profile.root) continue;
      const match = matches.has(frame);
      const label = t('flameFrame', {
        name: frame.name,
        total: this.weight(frame.total, profile),
        percent: this.percent(frame.total, all),
        self: this.weight(frame.self, profile),
      });
      const el = h('div', {
        class: `fl-frame c${colorOf(frame.name)}${match ? ' match' : ''}${this.query && !match ? ' dim' : ''}`,
        part: match ? 'frame frame-match' : 'frame',
        attrs: {
          role: 'treeitem',
          'aria-level': frame.depth + 1,
          'aria-label': label,
          'aria-expanded': frame.children.length ? 'true' : null,
          tabindex: frame === this.focused ? '0' : '-1',
          'data-focus-key': `frame-${frame.id}`,
          title: frame.file ? `${label}\n${frame.file}` : label,
        },
        on: {
          click: () => this.zoomTo(frame === profile.root ? null : frame),
          mouseenter: () => this.describe(frame, profile),
          focus: () => this.describe(frame, profile),
        },
      });
      el.style.insetInlineStart = `${left * 100}%`;
      el.style.width = `${width * 100}%`;
      el.style.setProperty('--_depth', String(frame.depth));
      if (width > 0.02) el.append(h('span', { class: 'fl-name', text: frame.name }));
      graph.append(el);
      this.elements.set(frame, el);
    }
    /** @type {Node[]} */
    const parts = [crumbs, h('div', { class: 'fl-scroll' }, graph)];
    if (this.query) {
      const time = this.matchFrames
        .filter((f) => !this.matchFrames.some((g) => g !== f && pathOf(f).includes(g)))
        .reduce((sum, f) => sum + f.total, 0);
      parts.push(h('p', { class: 'fl-match', text: this.matchFrames.length ? t('flameMatches', { percent: this.percent(time, all) }) : t('flameNoMatch') })); // prettier-ignore
    }
    host.replaceChildren(...parts);
  }

  /**
   * @param {Frame} frame
   * @param {Profile} profile
   */
  describe(frame, profile) {
    if (!this.details) return;
    const all = profile.root.total || 1;
    this.details.textContent = `${frame.name} — ${this.weight(frame.total, profile)} (${this.percent(frame.total, all)}), ${this.t('flameSelf').toLowerCase()} ${this.weight(frame.self, profile)}${frame.file ? ` — ${frame.file}` : ''}`; // prettier-ignore
  }

  /**
   * @param {Frame | null} frame - `null` for the whole profile.
   */
  zoomTo(frame) {
    this.zoom = frame;
    this.focused = frame ?? this.parse().profile?.root ?? null;
    this.renderGraph();
    if (this.focused) this.elements.get(this.focused)?.focus();
    if (frame) {
      emit(this, EVENTS.SELECT, {
        name: frame.name,
        file: frame.file,
        self: frame.self,
        total: frame.total,
        path: pathOf(frame)
          .slice(1)
          .map((f) => f.name),
      });
    }
  }

  /**
   * Keys of the tree: ↑ the caller, ↓ the widest callee, ← → the frames beside, Enter zooms in,
   * Escape zooms out.
   *
   * @param {KeyboardEvent} event
   */
  onKey(event) {
    const frame = this.focused;
    const profile = this.parse().profile;
    if (!frame || !profile) return;
    const visible = (/** @type {Frame | null | undefined} */ f) => (f && this.elements.has(f) ? f : null); // prettier-ignore
    const down = this.getAttribute('direction') !== 'up';
    const siblings = frame.parent ? frame.parent.children.filter((f) => this.elements.has(f)) : [];
    const index = siblings.indexOf(frame);
    const widest = [...frame.children].sort((a, b) => b.total - a.total).find((f) => this.elements.has(f)); // prettier-ignore
    /** @type {Frame | null | undefined} */
    let next;
    switch (event.key) {
      case 'ArrowUp':
        next = down ? visible(frame.parent) : visible(widest);
        break;
      case 'ArrowDown':
        next = down ? visible(widest) : visible(frame.parent);
        break;
      case 'ArrowLeft':
        next = siblings[index - 1] ?? null;
        break;
      case 'ArrowRight':
        next = siblings[index + 1] ?? null;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.zoomTo(frame === profile.root ? null : frame);
        return;
      case 'Escape':
        if (!this.zoom) return;
        event.preventDefault();
        event.stopPropagation();
        this.zoomTo(
          this.zoom.parent && this.zoom.parent !== profile.root ? this.zoom.parent : null,
        );
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!next) return;
    this.elements.get(frame)?.setAttribute('tabindex', '-1');
    this.focused = next;
    const el = this.elements.get(next);
    el?.setAttribute('tabindex', '0');
    el?.focus();
  }

  /**
   * @param {Profile} profile
   * @returns {HTMLElement}
   */
  functionsView(profile) {
    const t = this.t;
    const all = profile.root.total || 1;
    const rows = topFunctions(profile.root).slice(0, 300);
    const head = h(
      'tr',
      {},
      h('th', { attrs: { scope: 'col' }, text: t('flameFunction') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('flameSelf') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: '%' }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('flameTotal') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: '%' }),
    );
    const body = h('tbody');
    for (const row of rows) {
      body.append(
        h(
          'tr',
          {},
          h('th', { class: 'fl-fn', attrs: { scope: 'row', title: row.file || null } }, h('span', { class: `fl-swatch c${colorOf(row.name)}`, attrs: { 'aria-hidden': 'true' } }), row.name), // prettier-ignore
          h('td', { class: 'col-number', text: this.weight(row.self, profile) }),
          h('td', { class: 'col-number', text: this.percent(row.self, all) }),
          h('td', { class: 'col-number', text: this.weight(row.total, profile) }),
          h('td', { class: 'col-number', text: this.percent(row.total, all) }),
        ),
      );
    }
    return h(
      'div',
      { class: 'fl-table', attrs: { tabindex: '0', role: 'region', 'aria-label': t('flameFunctions') } }, // prettier-ignore
      h('table', { class: 'grid', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: /^\s*[[{]/.test(this.text ?? '') ? 'json' : 'plaintext',
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
    this.zoom = null;
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}

/**
 * A color for a name, the same at every render.
 *
 * @param {string} name
 * @returns {number}
 */
function colorOf(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % COLORS;
}
