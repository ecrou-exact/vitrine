// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import roadmapCss from '../../styles/roadmap.css?raw';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { parseEnum } from '../../core/attributes.js';
import { parseRoadmap } from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').RoadmapItem} RoadmapItem */
/** @typedef {import('./model.js').RoadmapColumn} RoadmapColumn */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const LAYOUTS = /** @type {const} */ (['board', 'list']);
const NAMED = ['planned', 'next', 'in-progress', 'beta', 'done'];

/**
 * Displays a public roadmap as a board or a list: items by status, with tags, dates, progress
 * and votes.
 *
 * Every value is rendered with DOM text APIs, and links keep safe URL schemes only.
 *
 * @element vt-roadmap
 * @since 0.11.0
 *
 * @attr {"board"|"list"} layout - Columns side by side (default), or one under the other.
 * @attr {boolean} tag-filter - Tag buttons, when items have tags. Default: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The roadmap, as a value.
 * @prop {RoadmapItem[]} items - The items read (read-only).
 *
 * @fires vt-ready - Roadmap rendered. Detail: `{ type: "roadmap" }`.
 * @fires vt-filter-change - The tag shown changed. Detail: `{ tag, shown }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart column - A column.
 * @csspart column-title - The title of a column.
 * @csspart item - An item.
 * @csspart progress - The progress bar of an item.
 * @csspart tag - A tag of an item.
 * @csspart tag-filter - A tag button.
 *
 * @example
 * <vt-roadmap json='[{"title":"Dark mode","status":"in-progress","progress":60}]'></vt-roadmap>
 */
export class VtRoadmap extends VtDataElement {
  static type = 'roadmap';

  static componentAttributes = Object.freeze(['layout', 'tag-filter']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, roadmapCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {string | null} */
    this.tag = null;
  }

  /** @type {RoadmapItem[]} */
  get items() {
    const result = parseRoadmap(this.text ?? '');
    return result.ok ? result.items : [];
  }

  contentChanged() {
    this.tag = null;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = parseRoadmap(this.text ?? '');
    const body = h('div', { class: 'body data-body roadmap-body', part: 'body' });
    if (!result.ok) body.append(this.dataNotice(result));
    else if (!result.items.length)
      body.append(h('p', { class: 'data-none', text: this.t('roadmapNone') }));
    else this.renderBoard(body, result.items, result.columns);
    this.frameWith(frame, body, this.panelId, { file: 'roadmap.json' });
  }

  /**
   * @param {HTMLElement} body
   * @param {RoadmapItem[]} items
   * @param {RoadmapColumn[]} columns
   */
  renderBoard(body, items, columns) {
    const tags = [...new Set(items.flatMap((item) => item.tags))];
    if (tags.length && this.flag('tag-filter')) body.append(this.tagChips(tags));
    const shown =
      this.tag === null ? items : items.filter((item) => item.tags.includes(this.tag ?? ''));
    const layout = parseEnum(this.getAttribute('layout'), LAYOUTS, 'board');
    const board = h(
      'div',
      { class: `roadmap-board ${layout}` },
      ...columns.map((column) =>
        this.columnView(
          column,
          shown.filter((item) => item.status === column.id),
        ),
      ),
    );
    board.style.setProperty('--_count', String(Math.max(1, columns.length)));
    body.append(
      layout === 'board'
        ? h(
            'div',
            {
              class: 'roadmap-scroll',
              attrs: { role: 'region', tabindex: '0', 'aria-label': this.t('roadmapBoard') },
            },
            board,
          )
        : board,
    );
  }

  /**
   * @param {string[]} tags
   * @returns {HTMLElement}
   */
  tagChips(tags) {
    const t = this.t;
    /** @type {[string, string | null][]} */
    const options = [
      [t('roadmapAll'), null],
      ...tags.map((tag) => /** @type {[string, string | null]} */ ([tag, tag])),
    ];
    return h(
      'div',
      { class: 'data-chips', attrs: { role: 'group', 'aria-label': t('roadmapTags') } },
      ...options.map(([label, value], index) =>
        h('button', {
          class: 'data-chip',
          part: 'tag-filter',
          text: label,
          attrs: {
            type: 'button',
            'aria-pressed': String(this.tag === value),
            'data-focus-key': `tag-${index}`,
          },
          on: {
            click: () => {
              this.tag = value;
              this.render();
              const shown =
                value === null
                  ? this.items.length
                  : this.items.filter((item) => item.tags.includes(value)).length;
              emit(this, EVENTS.FILTER_CHANGE, { tag: value, shown });
            },
          },
        }),
      ),
    );
  }

  /**
   * @param {RoadmapColumn} column
   * @returns {string}
   */
  columnTitle(column) {
    if (column.title) return column.title;
    if (NAMED.includes(column.id))
      return this.t(/** @type {StringKey} */ (`roadmapStatus_${column.id}`));
    return column.id.charAt(0).toUpperCase() + column.id.slice(1);
  }

  /**
   * @param {RoadmapColumn} column
   * @param {RoadmapItem[]} items
   * @returns {HTMLElement}
   */
  columnView(column, items) {
    return h(
      'section',
      { class: `roadmap-column status-${NAMED.includes(column.id) ? column.id : 'other'}`, part: 'column', attrs: { 'aria-label': this.columnTitle(column) } }, // prettier-ignore
      h(
        'h3',
        { class: 'roadmap-title', part: 'column-title' },
        h('span', { text: this.columnTitle(column) }),
        h('span', { class: 'roadmap-count', text: String(items.length) }),
      ),
      items.length
        ? h('ul', { class: 'roadmap-items' }, ...items.map((item) => this.itemView(item)))
        : h('p', { class: 'data-none', text: this.t('roadmapEmpty') }),
    );
  }

  /**
   * @param {RoadmapItem} item
   * @returns {HTMLElement}
   */
  itemView(item) {
    const t = this.t;
    const meta = [
      item.when,
      item.votes === null ? '' : t('roadmapVotes', { count: item.votes }),
    ].filter(Boolean);
    return h(
      'li',
      { class: 'roadmap-item', part: 'item' },
      h(
        'h4',
        { class: 'roadmap-name' },
        item.url
          ? h('a', { text: item.title, attrs: { href: item.url, rel: 'noopener noreferrer' } })
          : item.title,
      ),
      item.description ? h('p', { class: 'roadmap-text', text: item.description }) : null,
      item.progress !== null ? this.progressView(item.progress) : null,
      item.tags.length
        ? h(
            'ul',
            { class: 'roadmap-tags' },
            ...item.tags.map((tag) => h('li', { part: 'tag', text: tag })),
          )
        : null,
      meta.length ? h('p', { class: 'roadmap-meta', text: meta.join(' · ') }) : null,
    );
  }

  /**
   * @param {number} progress
   * @returns {HTMLElement}
   */
  progressView(progress) {
    const rounded = Math.round(progress);
    const label = this.t('roadmapProgress', { percent: rounded });
    const bar = h('span', { class: 'roadmap-fill' });
    bar.style.setProperty('--_value', `${rounded}%`);
    return h(
      'div',
      { class: 'roadmap-progress-wrap' },
      h(
        'span',
        {
          class: 'roadmap-progress',
          part: 'progress',
          attrs: {
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': String(rounded),
            'aria-label': label,
          },
        },
        bar,
      ),
      h('span', { class: 'roadmap-meta', text: label }),
    );
  }
}
