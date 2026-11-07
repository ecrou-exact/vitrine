// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import faqCss from '../../styles/faq.css?raw';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { filterFaq, faqStructuredData, parseFaq } from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').FaqItem} FaqItem */

/** Questions from which the search field appears by itself. */
const SEARCH_FROM = 6;

/**
 * Displays questions and answers as an accordion, with a search, categories and links to a
 * question.
 *
 * Answers are Markdown shown by `<vt-markdown>` when it is defined, with images blocked, and
 * plain text otherwise. Everything else is rendered with DOM text APIs.
 *
 * @element vt-faq
 * @since 0.11.0
 *
 * @attr {boolean} filter - The search field. Default: from six questions on.
 * @attr {boolean} categories - Category buttons, when questions have categories. Default: on.
 * @attr {boolean} single - Opening a question closes the others.
 * @attr {string} open - Questions open at first: `first`, `all`, or ids separated by spaces.
 * @attr {boolean} markdown - Answers as Markdown. Default: on.
 * @attr {boolean} links - Opens the question named by the page address (`#id`). Default: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The questions, as a value.
 * @prop {FaqItem[]} items - The questions read (read-only).
 * @prop {Record<string, unknown>} structuredData - schema.org FAQPage data, for search engines (read-only).
 *
 * @fires vt-ready - Questions rendered. Detail: `{ type: "faq" }`.
 * @fires vt-toggle - A question was opened or closed. Detail: `{ id, expanded }`.
 * @fires vt-search - The search changed. Detail: `{ query, matches }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart item - A question and its answer.
 * @csspart question - The button of a question.
 * @csspart answer - An answer.
 * @csspart filter - The search field.
 * @csspart category - A category button.
 *
 * @example
 * <vt-faq json='[{"question":"Is it free?","answer":"Yes, **always**."}]'></vt-faq>
 */
export class VtFaq extends VtDataElement {
  static type = 'faq';

  static componentAttributes = Object.freeze([
    'filter',
    'categories',
    'single',
    'open',
    'markdown',
    'links',
  ]);

  static presets = {
    simple: { markdown: true },
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, markdown: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, faqCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.idPrefix = uid('faq');
    /** @type {Set<string> | null} Open questions; `null` until the first render of a content. */
    this.opened = null;
    this.query = '';
    /** @type {string | null} */
    this.category = null;
  }

  /** @type {FaqItem[]} */
  get items() {
    const result = parseFaq(this.text ?? '');
    return result.ok ? result.items : [];
  }

  /** @type {Record<string, unknown>} */
  get structuredData() {
    return faqStructuredData(this.items);
  }

  connectedCallback() {
    super.connectedCallback();
    const onHash = () => {
      if (this.flag('links') && this.openFromAddress(this.items)) this.render();
    };
    window.addEventListener('hashchange', onHash);
    this._cleanups.push(() => window.removeEventListener('hashchange', onHash));
  }

  contentChanged() {
    this.opened = null;
  }

  /**
   * @param {FaqItem[]} items
   * @returns {boolean} Whether the address named a question, which is now open.
   */
  openFromAddress(items) {
    const id = decodeHash(location.hash);
    if (!id || !items.some((item) => item.id === id)) return false;
    this.opened ??= new Set();
    if (this.hasAttribute('single')) this.opened.clear();
    this.opened.add(id);
    this.category = null;
    this.query = '';
    return true;
  }

  /**
   * @param {FaqItem[]} items
   * @returns {Set<string>}
   */
  firstOpened(items) {
    const value = this.getAttribute('open')?.trim() ?? '';
    if (value === 'all') return new Set(items.map((item) => item.id));
    if (value === 'first') return new Set(items.slice(0, 1).map((item) => item.id));
    return new Set(value.split(/\s+/).filter(Boolean));
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = parseFaq(this.text ?? '');
    const body = h('div', { class: 'body data-body faq-body', part: 'body' });
    if (!result.ok) body.append(this.dataNotice(result));
    else this.renderItems(body, result.items);
    this.frameWith(frame, body, this.panelId, { file: 'faq.json' });
  }

  /**
   * @param {HTMLElement} body
   * @param {FaqItem[]} items
   */
  renderItems(body, items) {
    const t = this.t;
    if (this.opened === null) {
      this.opened = this.firstOpened(items);
      if (this.flag('links')) this.openFromAddress(items);
    }
    const categories = [...new Set(items.map((item) => item.category).filter(Boolean))];
    const hasFilter = this.hasAttribute('filter')
      ? this.flag('filter')
      : items.length >= SEARCH_FROM;
    if (hasFilter) body.append(this.filterField());
    if (categories.length > 1 && this.flag('categories'))
      body.append(this.categoryChips(categories));
    const shown = filterFaq(items, this.query, this.category);
    if (shown.length) {
      body.append(h('div', { class: 'faq-list' }, ...shown.map((item) => this.itemView(item))));
    } else if (items.length) {
      body.append(h('p', { class: 'data-none', text: t('faqNone') }));
    }
  }

  /** @returns {HTMLElement} */
  filterField() {
    const t = this.t;
    return h('input', {
      class: 'data-input',
      part: 'filter',
      attrs: {
        type: 'search',
        value: this.query,
        placeholder: t('faqSearch'),
        'aria-label': t('faqSearch'),
        'data-focus-key': 'filter',
      },
      on: {
        input: (event) => {
          this.query = /** @type {HTMLInputElement} */ (event.target).value.slice(0, 200);
          this.render();
          const matches = filterFaq(this.items, this.query, this.category).length;
          this.announce(matches ? t('faqCount', { count: matches }) : t('faqNone'));
          emit(this, EVENTS.SEARCH, { query: this.query, matches });
        },
      },
    });
  }

  /**
   * @param {string[]} categories
   * @returns {HTMLElement}
   */
  categoryChips(categories) {
    const t = this.t;
    /** @type {[string, string | null][]} */
    const options = [
      [t('faqAll'), null],
      ...categories.map((name) => /** @type {[string, string | null]} */ ([name, name])),
    ];
    return h(
      'div',
      { class: 'data-chips', attrs: { role: 'group', 'aria-label': t('faqCategories') } },
      ...options.map(([label, value], index) =>
        h('button', {
          class: 'data-chip',
          part: 'category',
          text: label,
          attrs: {
            type: 'button',
            'aria-pressed': String(this.category === value),
            'data-focus-key': `category-${index}`,
          },
          on: {
            click: () => {
              this.category = value;
              this.render();
            },
          },
        }),
      ),
    );
  }

  /**
   * @param {FaqItem} item
   * @returns {HTMLElement}
   */
  itemView(item) {
    const open = this.opened?.has(item.id) ?? false;
    const panel = `${this.idPrefix}-${item.id}`;
    return h(
      'div',
      { class: `faq-item${open ? ' open' : ''}`, part: 'item', attrs: { 'data-id': item.id } },
      h(
        'h3',
        { class: 'faq-heading' },
        h(
          'button',
          {
            class: 'faq-question',
            part: 'question',
            attrs: {
              type: 'button',
              'aria-expanded': String(open),
              'aria-controls': open ? panel : null,
              'data-focus-key': `question-${item.id}`,
            },
            on: { click: () => this.toggle(item.id) },
          },
          h('span', { text: item.question }),
          icon(open ? 'chevron-up' : 'chevron-down'),
        ),
      ),
      open
        ? h(
            'div',
            { class: 'faq-answer', part: 'answer', attrs: { id: panel } },
            this.answerView(item.answer),
          )
        : null,
    );
  }

  /**
   * @param {string} answer
   * @returns {HTMLElement}
   */
  answerView(answer) {
    if (this.feature('markdown') && customElements.get('vt-markdown')) {
      const markdown = document.createElement('vt-markdown');
      markdown.setAttribute('images', 'block');
      // The answer follows this element's theme and language, not the page's.
      markdown.setAttribute('theme', this.frame.dataset.theme ?? 'auto');
      markdown.setAttribute('lang-ui', this.locale);
      /** @type {any} */ (markdown).content = answer;
      return markdown;
    }
    return h('p', { class: 'faq-text', text: answer });
  }

  /**
   * @param {string} id
   */
  toggle(id) {
    this.opened ??= new Set();
    const expanded = !this.opened.has(id);
    if (this.hasAttribute('single') && this.flag('single')) this.opened.clear();
    if (expanded) this.opened.add(id);
    else this.opened.delete(id);
    this.render();
    emit(this, EVENTS.TOGGLE, { id, expanded });
  }
}

/**
 * @param {string} hash
 * @returns {string}
 */
function decodeHash(hash) {
  try {
    return decodeURIComponent(hash.slice(1)).slice(0, 100);
  } catch {
    return '';
  }
}
