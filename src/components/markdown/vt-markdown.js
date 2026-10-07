// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import markdownCss from '../../styles/markdown.css?raw';
import { parseBoolean, parseEnum, parseList } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { TextSearch, combineSearches } from '../../core/search.js';
import { createTabs } from '../../core/ui.js';
import { renderMarkdown } from './render.js';

const TABS = /** @type {const} */ (['preview', 'source', 'split']);
const TAB_ICONS = { preview: 'eye', source: 'code', split: 'columns' };

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
 *
 * @prop {string} content - The Markdown source.
 *
 * @fires vt-ready - Markdown rendered. Detail: `{ type: "markdown" }`.
 * @fires vt-tab-change - Active tab changed. Detail: `{ tab }`.
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
  ]); // prettier-ignore

  static presets = {
    simple: { 'line-numbers': true },
    full: {
      header: true,
      dot: true,
      copy: true,
      search: true,
      download: true,
      toc: true,
      anchors: true,
      'line-numbers': true,
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
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'default-tab' || name === 'tabs') this.tab = null;
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
    const fallback = allowed.includes('preview') ? 'preview' : allowed[0];
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
        this.cache = { key, result: null, error };
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
    if (tab === 'source' || tab === 'split') {
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

    const target = combineSearches(searches, (mark) =>
      mark.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
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
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('document.md'),
            'text/markdown',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copySource')) : null,
    ];

    const panel = h('div', {
      class: tab === 'split' ? 'panel split' : 'panel',
      attrs: { id: this.panelId, role: tabList ? 'tabpanel' : null },
    });
    if (preview) panel.append(preview);
    if (source) panel.append(source);
    frame.append(...this.chrome({ tabs: tabList, actions }), panel);
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
