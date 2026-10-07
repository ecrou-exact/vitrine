// @ts-check
/**
 * Base class shared by every Vitrine element.
 *
 * Responsibilities:
 * - content loading (`content` property › `src` › `<template>` / `<script type="text/plain">` › text);
 * - size limits, cancellation of stale loads, error and empty states;
 * - variant presets and boolean feature attributes;
 * - theme, locale, max height;
 * - header, copy / download / search actions, live announcements, events;
 * - batched rendering with focus restoration.
 *
 * @module core/base-element
 */
import tokensCss from '../styles/tokens.css?raw';
import baseCss from '../styles/base.css?raw';
import syntaxCss from '../styles/syntax.css?raw';
import {
  cleanFileName,
  cleanLabel,
  parseBoolean,
  parseCssLength,
  parseEnum,
} from './attributes.js';
import { copyText, downloadText } from './actions.js';
import { getConfig, onConfigChange } from './config.js';
import {
  VitrineError,
  assertSize,
  fetchContent,
  isAbortError,
  readInlineContent,
} from './content.js';
import { h } from './dom.js';
import { EVENTS, emit } from './events.js';
import { formatNumber, onLocaleChange, translator } from './i18n.js';
import { getTheme, onThemeChange, resolveTheme, themeSheet } from './themes.js';
import { loadSyntaxTheme, loadedSyntaxTheme, resolveSyntaxTheme } from './syntax-themes.js';
import { SearchBar, emptyView, errorView, flashButton, iconButton, loadingView } from './ui.js';

/** @type {Map<string, CSSStyleSheet>} */
const sheetCache = new Map();

/**
 * Returns a constructable stylesheet for a CSS string (cached and shared).
 * Constructable stylesheets work under a strict `style-src` CSP.
 *
 * @param {string} css
 * @returns {CSSStyleSheet}
 */
export function sheet(css) {
  let result = sheetCache.get(css);
  if (!result) {
    result = new CSSStyleSheet();
    result.replaceSync(css);
    sheetCache.set(css, result);
  }
  return result;
}

/** Attributes shared by every component. */
export const COMMON_ATTRIBUTES = Object.freeze([
  'variant', 'theme', 'src', 'allow-remote', 'max-height', 'copy', 'search', 'download',
  'header', 'dot', 'title', 'label', 'lang-ui', 'mode', 'edit-toggle', 'placeholder',
  'syntax-theme', 'syntax-theme-dark',
]); // prettier-ignore

/** @typedef {Record<string, boolean>} Preset */
/** @typedef {import('./ui.js').Translate} Translate */

/**
 * Abstract base element. Subclasses implement {@link VtBase#renderContent}.
 *
 * @attr {"simple"|"full"} variant - Feature preset. Individual attributes override it.
 * @attr {string} theme - Theme name (`light`, `dark`, `dim`, `paper`, `high-contrast`, a registered theme) or `auto`.
 * @attr {string} src - URL to load the content from (same-origin unless `allow-remote`).
 * @attr {boolean} allow-remote - Allows `src` to point to another origin (CORS required).
 * @attr {string} max-height - Maximum height of the scrollable area (e.g. `400px`, `60vh`).
 * @attr {boolean} copy - Shows a copy button.
 * @attr {boolean} search - Shows a search button and bar.
 * @attr {boolean|string} download - Shows a download button; the value is the file name.
 * @attr {boolean} header - Shows the header bar.
 * @attr {boolean} dot - Shows the status dot in the header.
 * @attr {string} label - Header title (e.g. a file name). Preferred over `title`.
 * @attr {string} title - Header title. Note: browsers also show it as a tooltip.
 * @attr {string} lang-ui - UI locale (`en`, `fr`, or a registered locale).
 * @attr {"view"|"edit"} mode - `edit` turns the content into an editable, highlighted field
 *   (default `view`).
 * @attr {boolean} edit-toggle - Shows a button that switches between view and edit.
 * @attr {string} placeholder - Text shown in the empty editor.
 * @attr {string} syntax-theme - Syntax highlighting theme from the highlight.js collection
 *   (e.g. `github`, `monokai`, `base16-dracula`), loaded on demand.
 * @attr {string} syntax-theme-dark - Syntax theme used instead when the interface theme is dark.
 *
 * @fires vt-ready - Content rendered. Detail: `{ type }`.
 * @fires vt-copy - Text copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Content could not be loaded or displayed. Detail: `{ message, cause }`.
 * @fires vt-input - The content was edited. Detail: `{ value }`.
 * @fires vt-change - The editor lost focus after edits. Detail: `{ value }`.
 * @fires vt-mode-change - The edit toggle switched the mode. Detail: `{ mode }`.
 *
 * @cssprop --vt-bg - Page background (used by the website and fallbacks).
 * @cssprop --vt-surface - Container and header background.
 * @cssprop --vt-surface-sunken - Code, JSON and input background.
 * @cssprop --vt-surface-raised - Raised elements (keyboard keys in Markdown).
 * @cssprop --vt-border - Hairlines and dividers.
 * @cssprop --vt-border-strong - Input and button borders.
 * @cssprop --vt-fg - Main text color.
 * @cssprop --vt-fg-muted - Secondary text: line numbers, badges, counts.
 * @cssprop --vt-accent - Accent fills: status dot, focus ring, active tab underline.
 * @cssprop --vt-accent-fg - Accent text and links.
 * @cssprop --vt-on-accent - Text on accent fills.
 * @cssprop --vt-accent-soft - Hover and selection background.
 * @cssprop --vt-highlight - Search match background.
 * @cssprop --vt-highlight-current - Current search match background.
 * @cssprop --vt-line-highlight - Background of emphasized lines.
 * @cssprop --vt-success - Success color (copied, added lines).
 * @cssprop --vt-warning - Warning color.
 * @cssprop --vt-danger - Error color (invalid JSON, removed lines).
 * @cssprop --vt-info - Info color (diff hunks).
 * @cssprop --vt-diff-added - Background of added diff lines.
 * @cssprop --vt-diff-removed - Background of removed diff lines.
 * @cssprop --vt-syntax-keyword - Keywords, literals (`true`, `null`).
 * @cssprop --vt-syntax-string - Strings.
 * @cssprop --vt-syntax-number - Numbers.
 * @cssprop --vt-syntax-function - Function and section titles.
 * @cssprop --vt-syntax-type - Types and classes.
 * @cssprop --vt-syntax-comment - Comments.
 * @cssprop --vt-syntax-attr - Attributes, properties, JSON keys.
 * @cssprop --vt-syntax-tag - Tags and selectors.
 * @cssprop --vt-syntax-meta - Punctuation and meta.
 * @cssprop --vt-font-ui - Interface font stack.
 * @cssprop --vt-font-mono - Code font stack.
 * @cssprop --vt-font-size - Code font size (default 14px).
 * @cssprop --vt-font-size-small - Line numbers and badges (default 12px).
 * @cssprop --vt-font-size-ui - Interface font size (default 13px).
 * @cssprop --vt-line-height - Code line height (default 1.6).
 * @cssprop --vt-radius - Container corner radius (default 10px).
 * @cssprop --vt-radius-sm - Buttons, inputs and badges radius (default 6px).
 * @cssprop --vt-header-height - Header height (default 40px).
 * @cssprop --vt-margin - Vertical margin around the element (default 0).
 *
 * @csspart container - The outer frame.
 * @csspart header - Header bar (title, badge, tabs, actions).
 * @csspart status-dot - Accent dot at the start of the header.
 * @csspart title - Header title.
 * @csspart badge - Language / type badge.
 * @csspart toolbar - Group of action buttons.
 * @csspart button - Every icon button.
 * @csspart search - Search bar.
 * @csspart body - Scrollable content area.
 * @csspart error - Error message.
 * @csspart empty - Empty state.
 * @csspart loading - Loading skeleton.
 * @csspart match - Search match.
 */
export class VtBase extends HTMLElement {
  /** Component type reported in events (`code`, `markdown`, `json`). */
  static type = 'base';

  /** Component-specific observed attributes. */
  /** @type {readonly string[]} */
  static componentAttributes = [];

  /** Feature presets per variant. */
  /** @type {{ simple: Preset, full: Preset }} */
  static presets = { simple: {}, full: {} };

  /** Properties that may be set before the element is defined. */
  /** @type {readonly string[]} */
  static upgradeProperties = ['content'];

  /** Component stylesheets (CSS text). */
  /** @type {readonly string[]} */
  static styles = [];

  static get observedAttributes() {
    return [...COMMON_ATTRIBUTES, ...this.componentAttributes];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.frame = h('div', { class: 'vt', part: 'container' });
    /** @type {string | null} Resolved syntax theme name. */
    this.syntaxTheme = null;
    this.updateSheets(null);
    this.live = h('div', {
      class: 'sr-only',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    this.root.append(this.frame, this.live);

    /** @type {string | undefined} Content set through the `content` property. */
    this._content = undefined;
    /** @type {string | null} Current text, once loaded. */
    this.text = null;
    /** @type {unknown} */
    this.error = null;
    this.loading = false;
    this.searchOpen = false;
    this.searchQuery = '';
    /** @type {SearchBar | null} */
    this.searchBar = null;
    /** @type {Translate} */
    this.t = translator('en');
    this._loadToken = 0;
    /** @type {AbortController | null} */
    this._abort = null;
    this._renderQueued = false;
    this._readyPending = false;
    /** @type {(() => void)[]} */
    this._cleanups = [];
    /** @type {MutationObserver | null} */
    this._observer = null;
    /** `true` between connectedCallback and disconnectedCallback. */
    this._connected = false;
    /** @type {"view" | "edit" | null} Mode chosen with the toggle; `null` follows `mode`. */
    this.modeState = null;
  }

  /**
   * The displayed text. Setting it overrides `src` and inline content;
   * set `null` to go back to them. Recommended for user-provided data.
   *
   * @type {string}
   */
  get content() {
    return this.text ?? '';
  }

  set content(value) {
    this._content = value === null || value === undefined ? undefined : String(value);
    if (this._connected) this.reload();
  }

  /**
   * Properties set on the element before its definition loaded (frameworks often do this)
   * are own data properties that shadow the class accessors: re-apply them through the setters.
   *
   * @param {string} name
   */
  upgradeProperty(name) {
    if (Object.prototype.hasOwnProperty.call(this, name)) {
      const value = /** @type {any} */ (this)[name];
      delete (/** @type {any} */ (this)[name]);
      /** @type {any} */ (this)[name] = value;
    }
  }

  connectedCallback() {
    for (const name of /** @type {typeof VtBase} */ (this.constructor).upgradeProperties)
      this.upgradeProperty(name);
    this._cleanups.push(
      onConfigChange((changed) => (changed.has('maxSize') ? this.reload() : this.requestRender())),
      onThemeChange(() => this.applyTheme()),
      onLocaleChange(() => this.requestRender()),
    );
    this._observer = new MutationObserver(() => {
      if (this._content === undefined && !this.hasAttribute('src')) this.reload();
    });
    this._observer.observe(this, { childList: true, characterData: true, subtree: true });
    this._connected = true;
    this.reload();
  }

  disconnectedCallback() {
    this._connected = false;
    for (const cleanup of this._cleanups.splice(0)) cleanup();
    this._observer?.disconnect();
    this._observer = null;
    this._abort?.abort();
    this._abort = null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'mode') this.modeState = null;
    if (name === 'src' || name === 'allow-remote') this.reload();
    else if (name === 'theme') this.applyTheme();
    else this.requestRender();
  }

  // ---------------------------------------------------------------- content

  /** Reloads the content from its source and re-renders. */
  reload() {
    const token = ++this._loadToken;
    this._abort?.abort();
    this._abort = null;
    const config = getConfig();
    const src = this.getAttribute('src');
    if (this._content !== undefined) {
      this.setText(this._content);
    } else if (src !== null && src.trim() !== '') {
      this.loading = true;
      this.error = null;
      this.requestRender();
      const controller = new AbortController();
      this._abort = controller;
      fetchContent(src, {
        allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
        maxSize: config.maxSize,
        timeout: config.fetchTimeout,
        signal: controller.signal,
      }).then(
        (text) => token === this._loadToken && this.setText(text),
        (error) => token === this._loadToken && !isAbortError(error) && this.setError(error),
      );
    } else {
      this.setText(readInlineContent(this) ?? '');
    }
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this.loading = false;
    try {
      assertSize(text, getConfig().maxSize);
    } catch (error) {
      this.setError(error);
      return;
    }
    this.text = text.replace(/\r\n?/g, '\n');
    this.error = null;
    this.contentChanged();
    this._readyPending = true;
    this.requestRender();
  }

  /**
   * Shows an error and dispatches `vt-error`.
   *
   * @param {unknown} error
   */
  setError(error) {
    this.loading = false;
    this._readyPending = false;
    this.error = error;
    this.text = null;
    this.contentChanged();
    this.requestRender();
    const { title, detail } = this.describeError(error);
    emit(this, EVENTS.ERROR, { message: detail || title, cause: error });
  }

  /**
   * Turns an error into translated, user-facing text.
   *
   * @param {unknown} error
   * @returns {{ title: string, detail: string }}
   */
  describeError(error) {
    const t = this.t;
    if (error instanceof VitrineError) {
      /** @type {Record<string, string | number>} */
      const params = { ...error.params };
      for (const key of ['size', 'limit']) {
        if (typeof params[key] === 'number')
          params[key] = formatNumber(Number(params[key]), this.locale);
      }
      return { title: t('errorTitle'), detail: t(error.code, params) };
    }
    return {
      title: t('errorTitle'),
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  /** @returns {boolean} Whether the content is shown in an editor. */
  get editing() {
    const mode =
      this.modeState ??
      parseEnum(this.getAttribute('mode'), /** @type {const} */ (['view', 'edit']), 'view');
    return mode === 'edit';
  }

  /**
   * Text typed in an editor: updates `content` without re-rendering (the caret stays put)
   * and dispatches `vt-input`.
   *
   * @param {string} text
   */
  edited(text) {
    this.text = text;
    this._content = text;
    this.contentEdited(text);
    emit(this, EVENTS.INPUT, { value: text });
  }

  /**
   * Hook: the user edited the text (refresh dependent views, e.g. a preview).
   *
   * @param {string} text
   */
  // eslint-disable-next-line no-unused-vars
  contentEdited(text) {}

  /**
   * Button switching between view and edit (with the `edit-toggle` attribute).
   *
   * @returns {HTMLButtonElement | null}
   */
  editToggleButton() {
    if (!this.feature('edit-toggle')) return null;
    return iconButton({
      icon: this.editing ? 'eye' : 'pencil',
      label: this.t(this.editing ? 'stopEditing' : 'edit'),
      key: 'edit-toggle',
      part: 'edit-button',
      pressed: this.editing,
      onClick: () => {
        this.modeState = this.editing ? 'view' : 'edit';
        this.render();
        emit(this, EVENTS.MODE_CHANGE, { mode: this.modeState });
        if (this.modeState === 'edit')
          /** @type {HTMLElement | null} */ (this.root.querySelector('.editor-input'))?.focus();
      },
    });
  }

  /** Hook: the text changed (clear caches). */
  contentChanged() {}

  // ---------------------------------------------------------------- features

  /** @returns {"simple"|"full"} */
  get variant() {
    return parseEnum(
      this.getAttribute('variant'),
      /** @type {const} */ (['simple', 'full']),
      'simple',
    );
  }

  /**
   * Resolves a boolean feature: explicit attribute first, then the variant preset.
   *
   * @param {string} name
   * @returns {boolean}
   */
  feature(name) {
    const explicit = parseBoolean(this.getAttribute(name));
    if (explicit !== null) return explicit;
    const ctor = /** @type {typeof VtBase} */ (this.constructor);
    return ctor.presets[this.variant][name] ?? false;
  }

  /** UI locale code. */
  get locale() {
    const value = this.getAttribute('lang-ui')?.trim();
    return value && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value) ? value : getConfig().lang;
  }

  /** Header title from `label` or `title`. */
  get heading() {
    return cleanLabel(this.getAttribute('label') ?? this.getAttribute('title'));
  }

  // ---------------------------------------------------------------- rendering

  /** Schedules a render in a microtask; several changes are batched. */
  requestRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    queueMicrotask(() => {
      this._renderQueued = false;
      if (this.isConnected) this.render();
    });
  }

  /** Applies the resolved theme (and syntax theme) without re-rendering. */
  applyTheme() {
    const theme = resolveTheme(this.getAttribute('theme'));
    this.frame.dataset.theme = theme;
    this.applySyntaxTheme(getTheme(theme)?.colorScheme === 'dark');
  }

  /**
   * Picks the syntax theme for the current color scheme and loads it if needed.
   *
   * @param {boolean} dark - Whether the interface theme is dark.
   */
  applySyntaxTheme(dark) {
    const config = getConfig();
    const requested =
      (dark && (this.getAttribute('syntax-theme-dark') || config.syntaxThemeDark)) ||
      this.getAttribute('syntax-theme') ||
      config.syntaxTheme;
    const name = resolveSyntaxTheme(requested);
    this.syntaxTheme = name;
    if (!name) {
      this.updateSheets(null);
      return;
    }
    const ready = loadedSyntaxTheme(name);
    if (ready) {
      this.updateSheets(ready);
      return;
    }
    loadSyntaxTheme(name).then((loadedSheet) => {
      if (loadedSheet && this.syntaxTheme === name) this.updateSheets(loadedSheet);
    });
  }

  /**
   * Sets the shadow root stylesheets. A syntax theme replaces the built-in syntax colors.
   *
   * @param {CSSStyleSheet | null} syntaxTheme
   */
  updateSheets(syntaxTheme) {
    const ctor = /** @type {typeof VtBase} */ (this.constructor);
    const own = ctor.styles.map(sheet);
    const sheets = [sheet(tokensCss), themeSheet, sheet(baseCss), ...own];
    this.frame.toggleAttribute('data-syntax-theme', Boolean(syntaxTheme));
    this.root.adoptedStyleSheets = syntaxTheme
      ? [...sheets.filter((s) => s !== sheet(syntaxCss)), syntaxTheme]
      : sheets;
  }

  /** Renders the whole component. */
  render() {
    const focusKey = this.activeFocusKey();
    const active = this.root.activeElement;
    const selection =
      active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
    this.t = translator(this.locale);
    this.applyTheme();
    const maxHeight = parseCssLength(this.getAttribute('max-height'));
    if (maxHeight) this.frame.style.setProperty('--_max-height', maxHeight);
    else this.frame.style.removeProperty('--_max-height');
    this.searchBar = null;
    this.frame.replaceChildren();

    if (this.loading) {
      this.frame.append(
        ...this.chrome(null),
        h('div', { class: 'body', part: 'body' }, loadingView(this.t)),
      );
      this.frame.setAttribute('aria-busy', 'true');
      return;
    }
    this.frame.removeAttribute('aria-busy');
    if (this.error) {
      const { title, detail } = this.describeError(this.error);
      this.frame.append(...this.chrome(null), errorView(title, detail));
      return;
    }
    if (!this.text) {
      this.frame.append(...this.chrome(null), emptyView(this.t));
    } else {
      this.renderContent(this.frame);
      // renderContent() may have created the search bar.
      const bar = /** @type {SearchBar | null} */ (this.searchBar);
      if (this.searchOpen && this.searchQuery) bar?.run();
    }
    this.restoreFocus(focusKey);
    const field = this.root.activeElement;
    if (selection && field instanceof HTMLTextAreaElement)
      field.setSelectionRange(selection[0], selection[1]);
    if (this._readyPending) {
      this._readyPending = false;
      emit(this, EVENTS.READY, { type: /** @type {typeof VtBase} */ (this.constructor).type });
    }
  }

  /**
   * Renders the content. Implemented by subclasses.
   *
   * @param {HTMLElement} frame
   */
  // eslint-disable-next-line no-unused-vars
  renderContent(frame) {
    throw new Error('renderContent() must be implemented.');
  }

  /**
   * Builds the header (and the search bar when open).
   *
   * @param {{ badge?: string, tabs?: HTMLElement | null, actions?: (HTMLElement | null)[] } | null} options
   *   `null` renders a minimal header without content actions.
   * @returns {HTMLElement[]}
   */
  chrome(options) {
    const actions = (options?.actions ?? []).filter((action) => action !== null);
    const toolbar = actions.length
      ? h(
          'div',
          {
            class: 'toolbar',
            part: 'toolbar',
            attrs: { role: 'toolbar', 'aria-label': this.t('actions') },
          },
          ...actions,
        )
      : null;
    if (!this.feature('header')) {
      // No header: actions float over the top-right corner of the body.
      toolbar?.classList.add('floating');
      return [toolbar, options?.tabs ?? null, this.searchBar?.element ?? null].filter(
        (node) => node !== null,
      );
    }
    const heading = this.heading;
    const header = h(
      'div',
      { class: 'header', part: 'header' },
      this.feature('dot')
        ? h('span', { class: 'dot', part: 'status-dot', attrs: { 'aria-hidden': 'true' } })
        : null,
      heading
        ? h('span', { class: 'title', part: 'title', text: heading, attrs: { title: heading } })
        : null,
      options?.tabs ?? null,
      heading ? null : h('span', { class: 'spacer' }),
      options?.badge ? h('span', { class: 'badge', part: 'badge', text: options.badge }) : null,
    );
    if (toolbar) header.append(toolbar);
    return this.searchBar ? [header, this.searchBar.element] : [header];
  }

  // ---------------------------------------------------------------- actions

  /**
   * Copy button. The text is read at click time.
   *
   * @param {() => string} getText
   * @param {string} [label]
   * @param {string} [key]
   * @returns {HTMLButtonElement}
   */
  copyButton(getText, label = this.t('copy'), key = 'copy') {
    const button = iconButton({
      icon: 'copy',
      label,
      key,
      part: 'copy-button',
      onClick: async () => {
        const text = getText();
        const ok = await copyText(text, this.root);
        flashButton(button, 'copy', ok);
        this.announce(this.t(ok ? 'copied' : 'copyFailed'));
        if (ok) emit(this, EVENTS.COPY, { text });
      },
    });
    return button;
  }

  /**
   * Copy button with a visible text label (used where several copy actions sit together).
   *
   * @param {() => string} getText
   * @param {string} label
   * @param {string} key
   * @returns {HTMLButtonElement}
   */
  copyTextButton(getText, label, key) {
    const button = h('button', {
      class: 'text-btn',
      part: 'copy-button',
      text: label,
      attrs: { type: 'button', 'data-focus-key': key },
      on: {
        click: async () => {
          const text = getText();
          const ok = await copyText(text, this.root);
          button.textContent = this.t(ok ? 'copied' : 'copyFailed');
          button.classList.toggle('done', ok);
          setTimeout(() => {
            button.textContent = label;
            button.classList.remove('done');
          }, 1500);
          this.announce(this.t(ok ? 'copied' : 'copyFailed'));
          if (ok) emit(this, EVENTS.COPY, { text });
        },
      },
    });
    return button;
  }

  /**
   * Download file name: the `download` attribute value, else a label that looks like a
   * file name (`app.js`), else `fallback`. Always sanitized.
   *
   * @param {string} fallback
   * @returns {string}
   */
  downloadName(fallback) {
    const value = this.getAttribute('download');
    const explicit =
      value && parseBoolean(value) !== false && !/^(?:true|on|yes)$/i.test(value.trim())
        ? value
        : null;
    const heading = /\.[a-z0-9]{1,10}$/i.test(this.heading) ? this.heading : null;
    return cleanFileName(explicit ?? heading, fallback);
  }

  /**
   * Download button.
   *
   * @param {() => string} getText
   * @param {string} fileName - Already sanitized.
   * @param {string} mimeType
   * @returns {HTMLButtonElement}
   */
  downloadButton(getText, fileName, mimeType) {
    return iconButton({
      icon: 'download',
      label: this.t('download'),
      key: 'download',
      part: 'download-button',
      onClick: () => downloadText(getText(), fileName, mimeType),
    });
  }

  /**
   * Search toggle button, and the search bar when open.
   *
   * @param {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} target
   * @returns {HTMLButtonElement | null}
   */
  searchButton(target) {
    if (!this.feature('search')) return null;
    if (this.searchOpen) {
      this.searchBar = new SearchBar(
        this.t,
        {
          run: (query) => {
            this.searchQuery = query;
            return target.run(query);
          },
          go: (index) => target.go(index),
          onResult: (query, total, capped) => {
            if (query)
              this.announce(
                total
                  ? this.t('searchResults', { total: capped ? `${total}+` : total })
                  : this.t('searchNone'),
              );
            emit(this, EVENTS.SEARCH, { query, matches: total });
          },
          onClose: () => {
            target.clear();
            this.searchOpen = false;
            this.searchQuery = '';
            this.render();
            /** @type {HTMLElement | null} */ (
              this.root.querySelector('[data-focus-key="search"]')
            )?.focus();
          },
        },
        this.searchQuery,
      );
    }
    return iconButton({
      icon: 'search',
      label: this.t('search'),
      key: 'search',
      part: 'search-button',
      pressed: this.searchOpen,
      onClick: () => {
        this.searchOpen = !this.searchOpen;
        if (!this.searchOpen) this.searchQuery = '';
        this.render();
        if (this.searchOpen) this.searchBar?.focus();
      },
    });
  }

  /**
   * Announces a message to screen readers.
   *
   * @param {string} message
   */
  announce(message) {
    this.live.textContent = '';
    setTimeout(() => {
      this.live.textContent = message;
    }, 50);
  }

  // ---------------------------------------------------------------- focus

  /** @returns {string | null} */
  activeFocusKey() {
    const active = this.root.activeElement;
    return active instanceof HTMLElement ? (active.dataset.focusKey ?? null) : null;
  }

  /**
   * @param {string | null} key
   */
  restoreFocus(key) {
    if (!key) return;
    const target = this.root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }
}
