// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import markdownCss from '../../styles/markdown.css?raw';
import { parseBoolean, parseEnum, parseList } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { VitrineError } from '../../core/content.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { CodeEditor } from '../../core/editor.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { TextSearch, combineSearches } from '../../core/search.js';
import { createTabs, errorView, iconButton } from '../../core/ui.js';
import { renderMarkdown } from './render.js';
import { ScrollSync } from './scroll-sync.js';

const TABS = /** @type {const} */ (['preview', 'source', 'split']);
const TAB_ICONS = { preview: 'eye', source: 'code', split: 'columns' };
const POSITIONS = /** @type {const} */ (['right', 'left', 'bottom', 'top']);
const SWAPPED = /** @type {const} */ ({
  right: 'left',
  left: 'right',
  bottom: 'top',
  top: 'bottom',
});
const ROTATED = /** @type {const} */ ({
  right: 'bottom',
  bottom: 'right',
  left: 'top',
  top: 'left',
});

/** @typedef {typeof POSITIONS[number]} Position */

/** @typedef {typeof TABS[number]} Tab */
/** @typedef {import('./render.js').RenderedMarkdown} RenderedMarkdown */

/**
 * Renders Markdown (GitHub Flavored Markdown) as sanitized HTML.
 *
 * Raw HTML in the Markdown is shown as text unless `allow-html` is set, and even then
 * it goes through a strict sanitizer: scripts, event handlers, styles, iframes, forms
 * and dangerous URLs are always removed.
 *
 * @element vt-markdown
 * @since 0.2.0
 *
 * @attr {string} tabs - Visible tabs, e.g. `"preview,source,split"`. Full variant: all three.
 * @attr {"preview"|"source"|"split"} default-tab - Initially active tab (default `preview`).
 * @attr {boolean} toc - Shows a table of contents built from the headings. Full variant: on.
 * @attr {boolean} anchors - Adds permalink anchors to headings. Full variant: on.
 * @attr {boolean} allow-html - Renders raw HTML (still sanitized). Default: off.
 * @attr {"new-tab"|"same"} external-links - How external links open (default `new-tab`,
 *   which applies to http(s) links only). External links always get `rel="noopener noreferrer nofollow"`.
 * @attr {"allow"|"block"|"same-origin"} images - Image policy (default `allow`).
 * @attr {boolean} line-numbers - Line numbers in the source tab (default on).
 * @attr {"right"|"left"|"bottom"|"top"} split-preview - Where the preview goes in the split
 *   view, next to the source (default `right`). Below 640px wide, panes are always stacked.
 * @attr {boolean} sync-scroll - Keeps source and preview scrolled to the same block in the
 *   split view (default on).
 * @attr {boolean} split-controls - Buttons to swap and stack the panes and to toggle scroll
 *   sync in the split view. Full variant: on.
 *
 * @prop {string} content - The Markdown source.
 *
 * @fires vt-ready - Markdown rendered. Detail: `{ type: "markdown" }`.
 * @fires vt-tab-change - Active tab changed. Detail: `{ tab }`.
 * @fires vt-layout-change - Split layout changed from its buttons. Detail: `{ preview, sync }`.
 * @fires vt-copy - Source or code block copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Loading or rendering failed. Detail: `{ message, cause }`.
 *
 * @cssprop --vt-font-body - Font of the rendered Markdown (default: inherited from the page).
 * @cssprop --vt-font-size-body - Font size of the rendered Markdown (default: inherited).
 *
 * @csspart markdown - The rendered Markdown article.
 * @csspart toc - Table of contents.
 * @csspart anchor - Heading permalink.
 * @csspart code-block - Wrapper of a fenced code block.
 * @csspart tabs - Tab list.
 * @csspart tab - A tab. The active one also has `tab-active`.
 *
 * @example
 * <vt-markdown variant="full">
 *   <script type="text/plain">
 *     # Title
 *     Some **bold** text.
 *   </script>
 * </vt-markdown>
 */
export class VtMarkdown extends VtBase {
  static type = 'markdown';

  static componentAttributes = Object.freeze([
    'tabs', 'default-tab', 'toc', 'anchors', 'allow-html', 'external-links', 'images', 'line-numbers',
    'split-preview', 'sync-scroll', 'split-controls',
  ]); // prettier-ignore

  static presets = {
    simple: { 'line-numbers': true, 'sync-scroll': true },
    full: {
      header: true,
      dot: true,
      copy: true,
      search: true,
      download: true,
      toc: true,
      anchors: true,
      'line-numbers': true,
      'sync-scroll': true,
      'split-controls': true,
      fullscreen: true,
    },
  };

  static styles = [syntaxCss, codeCss, markdownCss];

  constructor() {
    super();
    /** @type {Tab | null} Tab chosen by the user; `null` follows `default-tab`. */
    this.tab = null;
    this.panelId = uid('panel');
    /** @type {{ key: string, result: RenderedMarkdown | null, error: unknown } | null} */
    this.cache = null;
    /** @type {Position | null} Layout chosen with the buttons; `null` follows `split-preview`. */
    this.position = null;
    /** @type {boolean | null} Sync chosen with the button; `null` follows `sync-scroll`. */
    this.sync = null;
    /** @type {ScrollSync | null} */
    this.scrollSync = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    this.scrollSync?.stop();
    this.scrollSync = null;
    super.disconnectedCallback();
  }

  /** @returns {Position} Where the preview goes in the split view. */
  get previewPosition() {
    return this.position ?? parseEnum(this.getAttribute('split-preview'), POSITIONS, 'right');
  }

  /** @returns {boolean} */
  get syncScroll() {
    return this.sync ?? this.feature('sync-scroll');
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'default-tab' || name === 'tabs') this.tab = null;
    if (name === 'split-preview') this.position = null;
    if (name === 'sync-scroll') this.sync = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.cache = null;
  }

  /** @returns {Tab[]} Tabs shown in the tab list (fewer than 2 means no tab list). */
  get visibleTabs() {
    if (this.hasAttribute('tabs')) return parseList(this.getAttribute('tabs'), TABS) ?? [];
    return this.variant === 'full' ? [...TABS] : [];
  }

  /** @returns {Tab} */
  get activeTab() {
    const tabs = this.visibleTabs;
    const allowed = tabs.length ? tabs : [...TABS];
    // Editing: source and preview side by side, unless told otherwise.
    const preferred = this.editing && allowed.includes('split') ? 'split' : 'preview';
    const fallback = allowed.includes(preferred) ? preferred : allowed[0];
    const requested = this.tab ?? parseEnum(this.getAttribute('default-tab'), TABS, fallback);
    return allowed.includes(requested) ? requested : fallback;
  }

  /**
   * Renders (or reuses) the sanitized Markdown.
   *
   * @returns {RenderedMarkdown}
   */
  rendered() {
    const options = {
      allowHtml: parseBoolean(this.getAttribute('allow-html')) === true,
      images: parseEnum(
        this.getAttribute('images'),
        /** @type {const} */ (['allow', 'block', 'same-origin']),
        'allow',
      ),
      externalLinks: parseEnum(
        this.getAttribute('external-links'),
        /** @type {const} */ (['new-tab', 'same']),
        'new-tab',
      ),
      baseUrl: this.baseUrl(),
      anchors: this.feature('anchors'),
      anchorLabel: this.t('anchor'),
      tableLabel: this.t('table'),
      highlightLimit: getConfig().highlightLimit,
      onLanguageLoaded: () => {
        this.cache = null;
        this.requestRender();
      },
    };
    const key = JSON.stringify({ ...options, onLanguageLoaded: undefined });
    if (!this.cache || this.cache.key !== key) {
      try {
        this.cache = { key, result: renderMarkdown(this.text ?? '', options), error: null };
      } catch (error) {
        // e.g. pathological nesting exhausting the parser stack.
        // A stack overflow means the document is nested too deeply to render.
        this.cache = {
          key,
          result: null,
          error: error instanceof RangeError ? new VitrineError('tooComplex', {}, error) : error,
        };
      }
    }
    if (this.cache.error || !this.cache.result) throw this.cache.error;
    const { fragment, headings } = this.cache.result;
    const copy = /** @type {DocumentFragment} */ (fragment.cloneNode(true));
    return {
      fragment: copy,
      headings,
      codeBlocks: Array.from(copy.querySelectorAll('.code-block')),
    };
  }

  /** Base URL for relative links: the `src` file when loaded from a URL. */
  baseUrl() {
    const src = this.getAttribute('src');
    if (!src || this._content !== undefined) return undefined;
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return undefined;
    }
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const tab = this.activeTab;
    frame.classList.add('md');
    this.scrollSync?.stop();
    this.scrollSync = null;

    /** @type {HTMLElement | null} */
    let preview = null;
    /** @type {HTMLElement | null} */
    let source = null;
    /** @type {TextSearch[]} */
    const searches = [];
    try {
      if (tab === 'preview' || tab === 'split') {
        preview = this.previewPane();
        searches.push(
          new TextSearch(/** @type {Element} */ (preview.querySelector('.markdown')), {
            skip: '.anchor',
          }),
        );
      }
    } catch (error) {
      this.setError(error);
      return;
    }
    if ((tab === 'source' || tab === 'split') && this.editing) {
      source = this.editorPane();
    } else if (tab === 'source' || tab === 'split') {
      const view = buildCodeView(this.text ?? '', {
        language: 'markdown',
        lineNumbers: this.feature('line-numbers'),
        startLine: 1,
        highlightRanges: [],
        diff: false,
        highlightLimit: getConfig().highlightLimit,
      });
      source = h(
        'div',
        {
          class: 'body',
          part: 'body source',
          attrs: { tabindex: '0', role: 'region', 'aria-label': t('source') },
        },
        view.element,
      );
      searches.push(new TextSearch(view.code));
    }

    const target = combineSearches(searches, revealMatch);
    const tabs = this.visibleTabs;
    const tabList =
      tabs.length > 1
        ? createTabs({
            tabs: tabs.map((id) => ({ id, label: t(id), icon: TAB_ICONS[id] })),
            selected: tab,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectTab(/** @type {Tab} */ (id)),
          })
        : null;
    const actions = [
      this.searchButton(target),
      ...(tab === 'split' && this.feature('split-controls') ? this.splitButtons() : []),
      ...(this.editor && this.editing ? this.historyButtons(this.editor) : []),
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('document.md'),
            'text/markdown',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copySource')) : null,
    ];

    const position = this.previewPosition;
    const panel = h('div', {
      class: tab === 'split' ? 'panel split' : 'panel',
      attrs: {
        id: this.panelId,
        role: tabList ? 'tabpanel' : null,
        'data-preview': tab === 'split' ? position : null,
      },
    });
    // Panes are in reading order: the first one is on the left (or on top).
    const previewFirst = position === 'left' || position === 'top';
    for (const pane of previewFirst ? [preview, source] : [source, preview]) {
      if (pane) panel.append(pane);
    }
    frame.append(...this.chrome({ tabs: tabList, actions }), panel);
    this.editor?.align();
    this.startSync();
  }

  /** Starts scroll sync between the panes of the split view, when enabled. */
  startSync() {
    this.scrollSync?.stop();
    this.scrollSync = null;
    const source = /** @type {HTMLElement | null} */ (
      this.root.querySelector('.split > [part~="source"]')
    );
    const preview = /** @type {HTMLElement | null} */ (
      this.root.querySelector('.split > [part~="preview"]')
    );
    if (source && preview && this.syncScroll)
      this.scrollSync = new ScrollSync(source, preview).start();
  }

  /**
   * Source pane in edit mode: a Markdown editor.
   *
   * @returns {HTMLElement}
   */
  editorPane() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'markdown',
      lineNumbers: this.feature('line-numbers'),
      wrap: true,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return h('div', { class: 'body editor-body', part: 'body source' }, this.editor.element);
  }

  /**
   * The source was edited: refresh the preview shortly after typing stops.
   */
  contentEdited() {
    this.cache = null;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.refreshPreview(), 120);
  }

  /** Replaces the preview pane, keeping its scroll position. */
  refreshPreview() {
    const old = /** @type {HTMLElement | null} */ (this.root.querySelector('[part~="preview"]'));
    if (!old) return;
    /** @type {HTMLElement} */
    let fresh;
    try {
      fresh = this.previewPane();
    } catch (error) {
      const { title, detail } = this.describeError(error);
      fresh = h('div', { class: 'body md-body', part: 'body preview' }, errorView(title, detail));
    }
    old.replaceWith(fresh);
    fresh.scrollTop = old.scrollTop;
    this.startSync();
    // The new preview may have a different height: align it on the source again.
    this.scrollSync?.follow(this.scrollSync.source, this.scrollSync.preview);
    if (this.searchOpen && this.searchQuery) this.searchBar?.run();
  }

  /**
   * Swap, stack and sync buttons of the split view.
   *
   * @returns {HTMLButtonElement[]}
   */
  splitButtons() {
    const t = this.t;
    const position = this.previewPosition;
    const stacked = position === 'top' || position === 'bottom';
    return [
      iconButton({
        icon: 'swap',
        label: t('swapPanes'),
        key: 'swap-panes',
        part: 'swap-button',
        onClick: () => this.changeLayout(SWAPPED[position], this.syncScroll),
      }),
      iconButton({
        icon: 'rows',
        label: t('stackPanes'),
        key: 'stack-panes',
        part: 'stack-button',
        pressed: stacked,
        onClick: () => this.changeLayout(ROTATED[position], this.syncScroll),
      }),
      iconButton({
        icon: 'sync-scroll',
        label: t('syncScroll'),
        key: 'sync-scroll',
        part: 'sync-button',
        pressed: this.syncScroll,
        onClick: () => this.changeLayout(position, !this.syncScroll),
      }),
    ];
  }

  /**
   * @param {Position} position
   * @param {boolean} sync
   */
  changeLayout(position, sync) {
    this.position = position;
    this.sync = sync;
    this.render();
    emit(this, EVENTS.LAYOUT_CHANGE, { preview: position, sync });
  }

  /**
   * Builds the preview pane: table of contents and rendered Markdown.
   *
   * @returns {HTMLElement}
   */
  previewPane() {
    const { fragment, headings, codeBlocks } = this.rendered();
    const article = h('div', { class: 'markdown', part: 'markdown' });
    article.append(fragment);
    if (this.feature('copy')) {
      for (const block of codeBlocks) {
        const pre = block.querySelector('pre');
        block.append(
          this.copyButton(
            () => (pre?.textContent ?? '').replace(/\n$/, ''),
            this.t('copyCode'),
            `copy-block-${codeBlocks.indexOf(block)}`,
          ),
        );
      }
    }
    const body = h('div', {
      class: 'body md-body',
      part: 'body preview',
      attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || this.t('preview') },
    });
    if (this.feature('toc') && headings.length > 1) body.append(this.tableOfContents(headings));
    body.append(article);
    body.addEventListener('click', (event) => this.onLinkClick(event));
    return body;
  }

  /**
   * @param {import('./render.js').Heading[]} headings
   * @returns {HTMLElement}
   */
  tableOfContents(headings) {
    const minLevel = Math.min(...headings.map((heading) => heading.level));
    const list = h('ol', { class: 'toc-list' });
    for (const heading of headings) {
      const item = h('li', { class: `toc-level-${Math.min(heading.level - minLevel, 3)}` });
      item.append(h('a', { attrs: { href: `#${heading.id}` }, text: heading.text || '—' }));
      list.append(item);
    }
    return h(
      'nav',
      { class: 'toc', part: 'toc', attrs: { 'aria-label': this.t('toc') } },
      h('details', { attrs: { open: true } }, h('summary', { text: this.t('toc') }), list),
    );
  }

  /**
   * In-document links (`#id`) point inside the shadow root: scroll there ourselves.
   *
   * @param {MouseEvent} event
   */
  onLinkClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    const link = /** @type {Element} */ (event.target).closest?.('a[href^="#"]');
    if (!link) return;
    const id = decodeURIComponent((link.getAttribute('href') ?? '').slice(1));
    const target = id ? this.root.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    target.focus({ preventScroll: true });
  }

  /**
   * @param {Tab} tab
   */
  selectTab(tab) {
    if (tab === this.activeTab) return;
    this.tab = tab;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${tab}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab });
  }
}
