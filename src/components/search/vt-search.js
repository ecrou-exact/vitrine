// @ts-check
import dataCss from '../../styles/data.css?raw';
import searchCss from '../../styles/search.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { getConfig } from '../../core/config.js';
import { fetchContent, isAbortError } from '../../core/content.js';
import { isObject, text } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { isSafeUrl } from '../../core/urls.js';
import { entryUrl, parseIndex, searchIndex, toResult, words } from './engine.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./engine.js').SearchEntry} SearchEntry */
/** @typedef {import('./engine.js').SearchResult} SearchResult */
/** @typedef {import('./engine.js').Ranges} Ranges */

const LAYOUTS = /** @type {const} */ (['dialog', 'inline']);
/** Recent searches kept. */
const RECENT = 6;
/** Delay before asking `search-src`, in milliseconds. */
const REMOTE_DELAY = 220;
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * A site search ready for a menu: a button with its keyboard shortcut opens a dialog that
 * searches as you type, results grouped by section with the words found highlighted, recent
 * searches and suggestions. It can also sit in the page as a search field.
 *
 * Entries come from a JSON index (loaded the first time the search opens) or from your API.
 * Each entry has an id, such as a UUID: its address is its `url`, or `url-template` with
 * `{id}` replaced. Choosing a result fires a cancelable event, so a single-page app can route
 * it itself. Text is rendered with DOM text APIs, and addresses keep safe schemes only.
 *
 * @element vt-search
 * @since 0.12.0
 *
 * @attr {string} index-src - Address of the JSON index, loaded when the search first opens.
 * @attr {string} search-src - Address of a search API, with `{query}`; it answers entries as JSON.
 * @attr {string} url-template - Address of an entry without `url`, with `{id}`, such as `/docs/{id}`.
 * @attr {string} shortcut - Keys that open the search, separated by spaces (default `mod+k /`;
 *   `mod` is ⌘ on Apple devices and Ctrl elsewhere; `none` for no shortcut).
 * @attr {"dialog"|"inline"} layout - A button that opens a dialog (default), or a field in the page.
 * @attr {number} limit - Results shown (default 12).
 * @attr {boolean} recent - Remembers the last results chosen, in this browser. Default: on.
 * @attr {boolean} group - Results grouped by section. Default: on.
 * @attr {"_self"|"_blank"} link-target - Where results open (default `_self`).
 *
 * @prop {string} content - The index, as JSON.
 * @prop {any} data - The index, as a value.
 * @prop {SearchEntry[]} entries - The entries read (read-only).
 *
 * @fires vt-search - Results were shown. Detail: `{ query, matches }`.
 * @fires vt-select - A result was chosen (cancelable: cancel it to route it yourself).
 *   Detail: `{ id, url, title, section, query }`.
 * @fires vt-toggle - The dialog opened or closed. Detail: `{ expanded }`.
 *
 * @csspart trigger - The button that opens the search.
 * @csspart shortcut - The shortcut written on it.
 * @csspart dialog - The dialog.
 * @csspart input - The search field.
 * @csspart results - The list of results.
 * @csspart result - A result.
 * @csspart match - A word found.
 *
 * @example
 * <vt-search index-src="/search.json" url-template="/docs/{id}"></vt-search>
 */
export class VtSearch extends VtDataElement {
  static type = 'search';

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'index-src', 'search-src', 'url-template', 'shortcut', 'layout', 'limit', 'recent', 'group',
    'link-target',
  ]); // prettier-ignore

  static presets = { simple: {}, full: {} };

  static styles = [dataCss, searchCss];

  constructor() {
    super();
    this.ids = { dialog: uid('search'), list: uid('results'), input: uid('query') };
    this.query = '';
    this.isOpen = false;
    /** @type {SearchResult[]} */
    this.results = [];
    this.active = 0;
    /** @type {string | null} Index loaded from `index-src`. */
    this.loaded = null;
    this.loading = false;
    this.failed = false;
    /** @type {{ text: string, entries: SearchEntry[] } | null} */
    this.cache = null;
    /** @type {AbortController | null} */
    this.request = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    /** @type {HTMLInputElement | null} */
    this.input = null;
    /** @type {HTMLElement | null} */
    this.list = null;
    /** @type {HTMLDialogElement | null} */
    this.dialogNode = null;
    this.onShortcut = this.onShortcut.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.onShortcut);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onShortcut);
    this.request?.abort();
    clearTimeout(this.timer);
  }

  /** @returns {'dialog' | 'inline'} */
  get layout() {
    return parseEnum(this.getAttribute('layout'), LAYOUTS, 'dialog');
  }

  /** @type {SearchEntry[]} */
  get entries() {
    const source = this.loaded ?? this.text ?? '';
    if (this.cache?.text !== source) {
      const result = parseIndex(source);
      this.cache = { text: source, entries: result.ok ? result.entries : [] };
    }
    return this.cache.entries;
  }

  /** @returns {string} Where recent searches are kept. */
  get storageKey() {
    const source = this.getAttribute('index-src') ?? this.getAttribute('search-src') ?? 'default';
    return `vitrine-search:${source}`;
  }

  // ---------------------------------------------------------------- shortcut

  /** @returns {{ key: string, mod: boolean, shift: boolean, alt: boolean }[]} */
  get shortcuts() {
    const value = (this.getAttribute('shortcut') ?? 'mod+k /').trim().toLowerCase();
    if (value === 'none' || !value) return [];
    return value
      .split(/\s+/)
      .slice(0, 4)
      .map((spec) => {
        const parts = spec.split('+');
        const key = parts.pop() ?? '';
        return { key, mod: parts.includes('mod') || parts.includes('ctrl') || parts.includes('meta'), shift: parts.includes('shift'), alt: parts.includes('alt') }; // prettier-ignore
      });
  }

  /** @returns {string} The first shortcut as written on the button: "⌘K", "Ctrl K", "/". */
  get shortcutLabel() {
    const first = this.shortcuts[0];
    if (!first) return '';
    const key = first.key.length === 1 ? first.key.toUpperCase() : first.key;
    if (!first.mod) return key === '/' ? '/' : key;
    return MAC ? `⌘${key}` : `Ctrl ${key}`;
  }

  /** @param {KeyboardEvent} event */
  onShortcut(event) {
    if (event.defaultPrevented) return;
    const target = /** @type {HTMLElement | undefined} */ (event.composedPath()[0]);
    const typing =
      target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
    const mod = MAC ? event.metaKey : event.ctrlKey;
    for (const shortcut of this.shortcuts) {
      if (
        event.key.toLowerCase() !== shortcut.key ||
        mod !== shortcut.mod ||
        event.altKey !== shortcut.alt
      )
        continue;
      if (
        shortcut.shift !== event.shiftKey &&
        shortcut.key.length === 1 &&
        /[a-z]/.test(shortcut.key)
      )
        continue;
      // A key without a modifier is text while typing.
      if (!shortcut.mod && typing) return;
      event.preventDefault();
      if (this.layout === 'inline') this.input?.focus();
      else if (this.isOpen) this.close();
      else this.open();
      return;
    }
  }

  // ---------------------------------------------------------------- open and close

  /** Opens the search. */
  open() {
    if (this.layout === 'inline') {
      this.input?.focus();
      return;
    }
    if (this.isOpen) return;
    this.isOpen = true;
    this.query = '';
    this.render();
    emit(this, EVENTS.TOGGLE, { expanded: true });
  }

  /** Closes the search. */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.request?.abort();
    this.dialogNode?.close();
    this.render();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector('[data-focus-key="trigger"]')
    )?.focus();
    emit(this, EVENTS.TOGGLE, { expanded: false });
  }

  /** Loads `index-src` once. */
  loadIndex() {
    const src = this.getAttribute('index-src')?.trim();
    if (!src || this.loaded !== null || this.loading) return;
    this.loading = true;
    this.failed = false;
    const config = getConfig();
    fetchContent(src, {
      allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
      maxSize: config.maxSize,
      timeout: config.fetchTimeout,
    }).then(
      (json) => {
        this.loading = false;
        this.loaded = json;
        this.update();
      },
      (error) => {
        this.loading = false;
        this.failed = true;
        console.warn('[vitrine] Could not load index-src.', error);
        this.update();
      },
    );
  }

  // ---------------------------------------------------------------- render

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const inline = this.layout === 'inline';
    this.input = null;
    this.list = null;
    this.dialogNode = null;
    if (inline) {
      frame.append(this.box(false));
      this.update();
      return;
    }
    frame.append(this.trigger());
    if (!this.isOpen) return;
    const dialog = h(
      'dialog',
      {
        class: 'search-dialog',
        part: 'dialog',
        attrs: {
          id: this.ids.dialog,
          'aria-label': this.getAttribute('label') || this.t('searchOpen'),
        },
        on: {
          close: () => this.isOpen && this.close(),
          click: (event) => event.target === dialog && this.close(),
        },
      },
      this.box(true),
    );
    this.dialogNode = /** @type {HTMLDialogElement} */ (dialog);
    frame.append(dialog);
    if (typeof this.dialogNode.showModal === 'function') this.dialogNode.showModal();
    else dialog.setAttribute('open', '');
    this.loadIndex();
    this.update();
    /** @type {HTMLInputElement | null} */ (this.input)?.focus();
  }

  /** @returns {HTMLElement} The button of a menu. */
  trigger() {
    const t = this.t;
    const label = this.getAttribute('label') || t('searchOpen');
    const keys = this.shortcuts.map((s) => `${s.mod ? (MAC ? 'Meta+' : 'Control+') : ''}${s.key.toUpperCase()}`).join(' '); // prettier-ignore
    return h(
      'button',
      {
        class: 'search-trigger',
        part: 'trigger',
        attrs: {
          type: 'button',
          'aria-haspopup': 'dialog',
          'aria-expanded': String(this.isOpen),
          'aria-keyshortcuts': keys || null,
          'data-focus-key': 'trigger',
        },
        on: { click: () => this.open() },
      },
      icon('search'),
      h('span', { class: 'search-trigger-label', text: label }),
      this.shortcutLabel ? h('kbd', { class: 'search-kbd', part: 'shortcut', text: this.shortcutLabel, attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
    );
  }

  /**
   * The field, the results and, in the dialog, the keys.
   *
   * @param {boolean} dialog
   * @returns {HTMLElement}
   */
  box(dialog) {
    const t = this.t;
    const input = h('input', {
      class: 'search-input',
      part: 'input',
      attrs: {
        id: this.ids.input,
        type: 'search',
        value: this.query,
        placeholder: this.getAttribute('placeholder') || t('searchPlaceholder'),
        role: 'combobox',
        'aria-label': this.getAttribute('label') || t('searchOpen'),
        'aria-autocomplete': 'list',
        'aria-controls': this.ids.list,
        'aria-expanded': String(dialog),
        autocomplete: 'off',
        spellcheck: 'false',
        enterkeyhint: 'search',
        'data-focus-key': 'input',
      },
      on: {
        input: () => {
          this.query = input.value.slice(0, 200);
          this.active = 0;
          this.update();
        },
        keydown: (event) => this.inputKey(/** @type {KeyboardEvent} */ (event)),
        focus: () => {
          if (dialog) return;
          this.loadIndex();
          this.showPopup(true);
        },
        blur: () => !dialog && setTimeout(() => this.showPopup(false), 120),
      },
    });
    this.input = /** @type {HTMLInputElement} */ (input);
    const list = h('ul', { class: 'search-results', part: 'results', attrs: { id: this.ids.list, role: 'listbox', 'aria-label': t('searchResults') } }); // prettier-ignore
    this.list = list;
    return h(
      'div',
      { class: `search-box${dialog ? ' in-dialog' : ' inline'}` },
      h(
        'div',
        { class: 'search-field' },
        icon('search'),
        input,
        dialog
          ? h('button', { class: 'search-esc', text: 'Esc', attrs: { type: 'button', 'aria-label': t('searchClose') }, on: { click: () => this.close() } }) // prettier-ignore
          : null,
      ),
      h(
        'div',
        { class: `search-popup${dialog ? '' : ' hidden'}` },
        list,
        dialog ? this.hints() : null,
      ),
    );
  }

  /** @returns {HTMLElement} */
  hints() {
    const t = this.t;
    return h(
      'p',
      { class: 'search-hints', attrs: { 'aria-hidden': 'true' } },
      h('kbd', { text: '↑' }), h('kbd', { text: '↓' }), ` ${t('searchHintMove')} `,
      h('kbd', { text: '↵' }), ` ${t('searchHintOpen')} `,
      h('kbd', { text: 'Esc' }), ` ${t('searchHintClose')}`,
    ); // prettier-ignore
  }

  /**
   * @param {boolean} show
   */
  showPopup(show) {
    const popup = this.root.querySelector('.search-popup');
    popup?.classList.toggle('hidden', !show || (!this.query && !this.recent().length));
    this.input?.setAttribute('aria-expanded', String(show));
  }

  // ---------------------------------------------------------------- results

  /** Searches and shows the results, without a render: the field keeps its caret. */
  update() {
    if (!this.list) return;
    const query = this.query.trim();
    const remote = this.getAttribute('search-src')?.trim();
    if (remote && query) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.remote(remote, query), REMOTE_DELAY);
      return;
    }
    const limit = parseInteger(this.getAttribute('limit'), { min: 1, max: 100, fallback: 12 });
    this.results = query ? searchIndex(this.entries, query, limit) : [];
    this.show();
  }

  /**
   * Asks the search API; only the answer to the latest query is shown.
   *
   * @param {string} template
   * @param {string} query
   */
  remote(template, query) {
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    const config = getConfig();
    const limit = parseInteger(this.getAttribute('limit'), { min: 1, max: 100, fallback: 12 });
    fetchContent(template.replace(/\{query\}/g, encodeURIComponent(query)), {
      allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
      maxSize: config.maxSize,
      timeout: config.fetchTimeout,
      signal: controller.signal,
    }).then(
      (json) => {
        if (controller.signal.aborted) return;
        const result = parseIndex(json);
        const wanted = words(query);
        this.results = result.ok
          ? result.entries.slice(0, limit).map((entry) => toResult(entry, 1, wanted))
          : [];
        this.failed = !result.ok;
        this.show();
      },
      (error) => {
        if (isAbortError(error)) return;
        this.failed = true;
        this.results = [];
        this.show();
      },
    );
  }

  /** Writes the results, or recent searches and suggestions before anything is typed. */
  show() {
    const list = /** @type {HTMLElement} */ (this.list);
    const t = this.t;
    const query = this.query.trim();
    list.replaceChildren();
    if (!query) {
      this.results = this.recent().map((entry) => toResult(entry, 1, []));
      if (this.results.length) this.group(list, this.results, t('searchRecent'), true);
      else {
        this.results = this.entries
          .filter((entry) => entry.featured)
          .slice(0, 8)
          .map((entry) => toResult(entry, 1, []));
        if (this.results.length) this.group(list, this.results, t('searchSuggested'));
      }
    } else if (this.results.length) {
      const grouped = this.flag('group');
      /** @type {Map<string, SearchResult[]>} */
      const sections = new Map();
      for (const result of this.results) {
        const key = grouped ? result.entry.section : '';
        sections.set(key, [...(sections.get(key) ?? []), result]);
      }
      // Results keep their order inside a section; sections come in the order of their best result.
      this.results = [...sections.values()].flat();
      for (const [section, results] of sections)
        this.group(list, results, grouped ? section || t('searchOther') : '');
    } else {
      const message = this.loading
        ? t('searchLoading')
        : this.failed
          ? t('searchFailed')
          : t('searchNone', { query });
      list.append(
        h('li', { class: 'search-empty', text: message, attrs: { role: 'presentation' } }),
      );
    }
    this.active = Math.min(this.active, Math.max(0, this.results.length - 1));
    this.mark();
    if (this.layout === 'inline') this.showPopup(this.root.activeElement === this.input);
    if (query) {
      this.announce(
        this.results.length === 1
          ? t('searchOne')
          : t('searchCount', { count: this.results.length }),
      );
      emit(this, EVENTS.SEARCH, { query, matches: this.results.length });
    }
  }

  /**
   * @param {HTMLElement} list
   * @param {SearchResult[]} results
   * @param {string} heading
   * @param {boolean} [clearable]
   */
  group(list, results, heading, clearable = false) {
    const offset = list.querySelectorAll('[role="option"]').length;
    if (heading)
      list.append(
        h(
          'li',
          { class: 'search-section', attrs: { role: 'presentation' } },
          h('span', { text: heading }),
          clearable
            ? h('button', {
                class: 'text-btn search-clear',
                text: this.t('searchClearRecent'),
                attrs: { type: 'button', tabindex: '-1' },
                on: {
                  mousedown: (event) => event.preventDefault(),
                  click: () => {
                    this.store([]);
                    this.update();
                  },
                },
              })
            : null,
        ),
      );
    results.forEach((result, index) => list.append(this.option(result, offset + index)));
  }

  /**
   * @param {SearchResult} result
   * @param {number} index
   * @returns {HTMLElement}
   */
  option(result, index) {
    const { entry } = result;
    return h(
      'li',
      {
        class: 'search-result',
        part: 'result',
        attrs: { id: `${this.ids.list}-${index}`, role: 'option', 'aria-selected': 'false' },
        on: {
          mousedown: (event) => event.preventDefault(),
          click: (event) => this.select(result, /** @type {MouseEvent} */ (event).ctrlKey || /** @type {MouseEvent} */ (event).metaKey), // prettier-ignore
          pointermove: () => {
            if (this.active === index) return;
            this.active = index;
            this.mark();
          },
        },
      },
      h('span', { class: 'search-title' }, ...highlight(entry.title, result.title)),
      result.extract ? h('span', { class: 'search-extract' }, ...highlight(result.extract, result.extractRanges)) : null, // prettier-ignore
      entry.section && !this.flag('group')
        ? h('span', { class: 'search-where', text: entry.section })
        : null,
      icon('arrow-right'),
    );
  }

  /** Marks the active result. */
  mark() {
    const options = this.list ? [...this.list.querySelectorAll('[role="option"]')] : [];
    options.forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === this.active));
      if (index === this.active) option.scrollIntoView({ block: 'nearest' });
    });
    if (options[this.active])
      this.input?.setAttribute('aria-activedescendant', options[this.active].id);
    else this.input?.removeAttribute('aria-activedescendant');
  }

  /** @param {KeyboardEvent} event */
  inputKey(event) {
    const count = this.results.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!count) return;
      this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      this.mark();
    } else if (event.key === 'Enter') {
      const result = this.results[this.active];
      if (!result) return;
      event.preventDefault();
      this.select(result, event.ctrlKey || event.metaKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // A search input clears itself on Escape and keeps the key from the dialog: close it here.
      if (this.layout === 'dialog') {
        this.close();
        return;
      }
      if (this.query) {
        this.query = '';
        /** @type {HTMLInputElement} */ (this.input).value = '';
        this.update();
      } else this.input?.blur();
    }
  }

  /**
   * Opens a result: listeners may route it themselves by canceling the event.
   *
   * @param {SearchResult} result
   * @param {boolean} newTab
   */
  select(result, newTab) {
    const { entry } = result;
    const url = entryUrl(entry, this.getAttribute('url-template'));
    this.remember(entry, url);
    const go = emit(this, EVENTS.SELECT, { id: entry.id, url, title: entry.title, section: entry.section, query: this.query.trim() }); // prettier-ignore
    if (this.layout === 'dialog') this.close();
    if (!go || !url || !isSafeUrl(url)) return;
    const target = parseEnum(
      this.getAttribute('link-target'),
      /** @type {const} */ (['_self', '_blank']),
      '_self',
    );
    if (newTab || target === '_blank') window.open(url, '_blank', 'noopener,noreferrer');
    else location.assign(url);
  }

  // ---------------------------------------------------------------- recent

  /** @returns {SearchEntry[]} Entries chosen lately, newest first. */
  recent() {
    if (!this.flag('recent')) return [];
    try {
      const list = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      if (!Array.isArray(list)) return [];
      return list
        .filter(isObject)
        .slice(0, RECENT)
        .map((item) => ({
          id: text(item.id, 200),
          title: text(item.title, 300),
          url: text(item.url, 2000),
          section: text(item.section, 100),
          content: '',
          keywords: [],
          featured: false,
        })) // prettier-ignore
        .filter((entry) => entry.id && entry.title && (!entry.url || isSafeUrl(entry.url)));
    } catch {
      return [];
    }
  }

  /**
   * @param {SearchEntry} entry
   * @param {string | null} url
   */
  remember(entry, url) {
    if (!this.flag('recent')) return;
    const kept = this.recent().filter((item) => item.id !== entry.id);
    this.store(
      [{ id: entry.id, title: entry.title, url: url ?? '', section: entry.section }, ...kept].slice(
        0,
        RECENT,
      ),
    );
  }

  /** @param {unknown[]} list */
  store(list) {
    try {
      if (list.length) localStorage.setItem(this.storageKey, JSON.stringify(list));
      else localStorage.removeItem(this.storageKey);
    } catch {
      // Storage blocked: recent searches are simply not kept.
    }
  }
}

/**
 * Text with its matches in `<mark>`, built from text nodes.
 *
 * @param {string} value
 * @param {Ranges} ranges - In code points.
 * @returns {(string | HTMLElement)[]}
 */
export function highlight(value, ranges) {
  const chars = Array.from(value);
  /** @type {(string | HTMLElement)[]} */
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at || end > chars.length) continue;
    if (start > at) parts.push(chars.slice(at, start).join(''));
    parts.push(h('mark', { part: 'match', text: chars.slice(start, end).join('') }));
    at = end;
  }
  if (at < chars.length) parts.push(chars.slice(at).join(''));
  return parts;
}
