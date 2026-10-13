// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import timelineCss from '../../styles/timeline.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import {
  KINDS,
  TimelineError,
  countKinds,
  formatDuration,
  readEvents,
  sortEvents,
} from './events.js';

/** @typedef {import('./events.js').TimelineEvent} TimelineEvent */

const ORDERS = /** @type {const} */ (['newest', 'oldest']);
const GROUPS = /** @type {const} */ (['day', 'month', 'year', 'none']);

/**
 * Shows events on a vertical timeline: incident timelines, release history, changelogs.
 *
 * Reads a JSON array of events (`time`, `title`, `description` in Markdown, `kind`,
 * `tags`, `link`) or a Keep a Changelog Markdown file, where each `## [version] - date`
 * becomes an event. Events are grouped by day, month or year, with the time elapsed
 * between them, and can be filtered by kind and searched.
 *
 * @element vt-timeline
 * @since 0.8.0
 *
 * @attr {"newest"|"oldest"} order - Order of events (default `newest`).
 * @attr {"day"|"month"|"year"|"none"} group - Groups events by date (default `day`, `month` for changelogs).
 * @attr {string} kinds - Kinds shown at first, separated by spaces (default: all).
 * @attr {boolean} kind-filter - Kind buttons with counts. Full variant: on.
 * @attr {boolean} durations - Time elapsed between events (default on).
 * @attr {boolean} markdown - Descriptions as Markdown with `<vt-markdown>` (default on).
 * @attr {number} collapse - Lines of description shown before "Show more" (default 6, 0: all).
 *
 * @prop {string} content - The events, as JSON or a changelog.
 * @prop {TimelineEvent[]} events - Events read from the content (read-only copies).
 *
 * @fires vt-select - An event was chosen. Detail: `{ event }`.
 * @fires vt-filter-change - Kinds shown or search changed. Detail: `{ kinds, query, shown }`.
 *
 * @csspart timeline - The list of events.
 * @csspart group - A date heading.
 * @csspart event - An event (also `event-danger`, `event-release`…).
 * @csspart dot - The marker of an event.
 * @csspart time - The time of an event.
 * @csspart title - The title of an event.
 * @csspart duration - The time elapsed since the previous event.
 * @csspart kind-filter - A kind button in the header.
 *
 * @example
 * <vt-timeline variant="full" src="/incidents/2026-10-01.json"></vt-timeline>
 */
export class VtTimeline extends VtBase {
  static type = 'timeline';

  static componentAttributes = Object.freeze([
    'order', 'group', 'kinds', 'kind-filter', 'durations', 'markdown', 'collapse',
  ]); // prettier-ignore

  static presets = {
    simple: { durations: true, markdown: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      durations: true, markdown: true, 'kind-filter': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, timelineCss];

  constructor() {
    super();
    /** @type {{ text: string, events: TimelineEvent[], error: Error | null } | null} */
    this.parsed = null;
    /** @type {string | null} Kind chosen with the buttons (`''`: all, `null`: the attribute). */
    this.kindChoice = null;
    /** @type {"newest" | "oldest" | null} Order chosen with the button. */
    this.orderChoice = null;
    this.query = '';
    this.matchCount = 0;
    /** @type {Set<string>} Long descriptions opened by the reader. */
    this.opened = new Set();
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.listHost = null;
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
    this.opened.clear();
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ events: TimelineEvent[], error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, events: readEvents(text), error: null };
    } catch (error) {
      this.parsed = {
        text,
        events: [],
        error: error instanceof Error ? error : new TimelineError(String(error)),
      };
    }
    return this.parsed;
  }

  /** @returns {TimelineEvent[]} */
  get events() {
    return structuredClone(this.parse().events);
  }

  /** @returns {"newest" | "oldest"} */
  get order() {
    return this.orderChoice ?? parseEnum(this.getAttribute('order'), ORDERS, 'newest');
  }

  /** @returns {"day" | "month" | "year" | "none"} */
  get grouping() {
    const changelog = this.parse().events.some((event) => event.kind === 'release');
    return parseEnum(this.getAttribute('group'), GROUPS, changelog ? 'month' : 'day');
  }

  /** @returns {Set<string> | null} Kinds shown, or `null` for all. */
  get shownKinds() {
    if (this.kindChoice !== null) return this.kindChoice ? new Set([this.kindChoice]) : null;
    const value = this.getAttribute('kinds');
    return value?.trim() ? new Set(value.toLowerCase().split(/[\s,]+/)) : null;
  }

  /**
   * @param {TimelineEvent} event
   * @returns {boolean}
   */
  visible(event) {
    const kinds = this.shownKinds;
    if (kinds && !kinds.has(event.kind)) return false;
    if (!this.query) return true;
    const q = this.query.toLowerCase();
    return [event.title, event.description, event.time, event.kind, ...event.tags].some((v) =>
      v.toLowerCase().includes(q),
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { events, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body tl-body', part: 'body' });

    if (error) body.append(noticeView(t('timelineInvalid', { message: error.message })));
    else if (!events.length)
      body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else {
      this.listHost = h('ol', { class: 'tl', part: 'timeline' });
      body.append(this.listHost);
      this.renderList();
    }

    /** @type {HTMLElement[]} */
    let extra = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('tl-edit');
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
        this.filterChanged();
        return { total: this.matchCount, capped: this.matchCount >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        // Focus stays in the search field; the match is only marked.
        const items = this.listHost?.querySelectorAll('.tl-event') ?? [];
        for (const item of items) item.classList.remove('current');
        items[index]?.classList.add('current');
        items[index]?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderList();
      },
    };

    const json = /^\s*[[{]/.test(this.text ?? '');
    const order = this.order;
    const actions = [
      this.searchButton(target),
      ...extra,
      events.length && !this.editing
        ? iconButton({
            icon: order === 'newest' ? 'sort-down' : 'sort-up',
            label: order === 'newest' ? t('timelineNewest') : t('timelineOldest'),
            key: 'order',
            part: 'order-button',
            onClick: () => {
              this.orderChoice = order === 'newest' ? 'oldest' : 'newest';
              this.render();
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(json ? 'timeline.json' : 'CHANGELOG.md'),
            json ? 'application/json' : 'text/markdown',
          )
        : null,
      this.feature('copy')
        ? this.copyButton(
            () => JSON.stringify(this.visibleEvents(), null, 2),
            t('timelineCopyJson'),
          )
        : null,
    ];
    const badge = events.length
      ? t('timelineCount', { count: formatNumber(events.length, this.locale) })
      : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    if (this.feature('kind-filter') && events.length && !error) {
      panel.prepend(this.kindBar(events));
    }
    this.editor?.align();
  }

  /** @returns {TimelineEvent[]} */
  visibleEvents() {
    return sortEvents(this.parse().events, this.order).filter((event) => this.visible(event));
  }

  /**
   * Buttons to show every kind or one.
   *
   * @param {TimelineEvent[]} events
   * @returns {HTMLElement}
   */
  kindBar(events) {
    const counts = countKinds(events);
    const bar = h('div', {
      class: 'kind-bar',
      attrs: { role: 'group', 'aria-label': this.t('timelineKinds') },
    });
    const kinds = this.shownKinds;
    const current = this.kindChoice ?? (kinds && kinds.size === 1 ? [...kinds][0] : '');
    const button = (/** @type {string} */ name, /** @type {number} */ count) =>
      h(
        'button',
        {
          class: `kind-chip${name ? ` kind-${name}` : ''}`,
          part: 'kind-filter',
          attrs: {
            type: 'button',
            'aria-pressed': String(current === name),
            'data-focus-key': `kind-${name}`,
          },
          on: {
            click: () => {
              this.kindChoice = name;
              this.render();
              this.filterChanged();
            },
          },
        },
        name ? h('span', { class: 'kind-dot', attrs: { 'aria-hidden': 'true' } }) : null,
        name ? this.kindLabel(name) : this.t('timelineAll'),
        h('span', { class: 'chip-count', text: formatNumber(count, this.locale) }),
      );
    bar.append(button('', events.length));
    for (const kind of KINDS) if (counts[kind]) bar.append(button(kind, counts[kind]));
    return bar;
  }

  /**
   * @param {string} kind
   * @returns {string}
   */
  kindLabel(kind) {
    const key = /** @type {any} */ (`timelineKind${kind[0].toUpperCase()}${kind.slice(1)}`);
    const label = this.t(key);
    return label === key ? kind : label;
  }

  filterChanged() {
    const kinds = this.shownKinds;
    emit(this, EVENTS.FILTER_CHANGE, {
      kinds: kinds ? [...kinds] : [...KINDS],
      query: this.query,
      shown: this.matchCount,
    });
  }

  /** Renders the events for the current filter, search and order. */
  renderList() {
    const host = this.listHost;
    if (!host) return;
    const events = this.visibleEvents();
    this.matchCount = events.length;
    if (!events.length) {
      host.replaceChildren(
        h('li', { class: 'empty', part: 'empty', text: this.t('timelineNoMatch') }),
      );
      return;
    }
    const grouping = this.grouping;
    const durations = this.feature('durations');
    /** @type {HTMLElement[]} */
    const items = [];
    let lastGroup = '';
    /** @type {TimelineEvent | null} */
    let previous = null;
    for (const event of events) {
      const group = this.groupLabel(event, grouping);
      if (group && group !== lastGroup) {
        items.push(
          h(
            'li',
            { class: 'tl-group', part: 'group', attrs: { role: 'presentation' } },
            h('h3', { text: group }),
          ),
        );
        lastGroup = group;
      }
      if (
        durations &&
        previous?.date != null &&
        event.date != null &&
        previous.date !== event.date
      ) {
        items.push(
          h(
            'li',
            { class: 'tl-duration', part: 'duration', attrs: { 'aria-hidden': 'true' } },
            formatDuration(event.date - previous.date),
          ),
        );
      }
      items.push(this.eventItem(event));
      previous = event;
    }
    host.replaceChildren(...items);
  }

  /**
   * @param {TimelineEvent} event
   * @param {"day" | "month" | "year" | "none"} grouping
   * @returns {string}
   */
  groupLabel(event, grouping) {
    if (grouping === 'none' || event.date === null) return '';
    /** @type {Intl.DateTimeFormatOptions} */
    const options =
      grouping === 'year'
        ? { year: 'numeric' }
        : grouping === 'month'
          ? { year: 'numeric', month: 'long' }
          : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    return new Intl.DateTimeFormat(this.locale, options).format(event.date);
  }

  /**
   * @param {TimelineEvent} event
   * @returns {string}
   */
  timeLabel(event) {
    if (event.date === null) return event.time;
    // Dates written without a time (changelogs) show the date only.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(event.time.trim());
    /** @type {Intl.DateTimeFormatOptions} */
    const options = dateOnly
      ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
      : this.grouping === 'day'
        ? { hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat(this.locale, options).format(event.date);
  }

  /**
   * @param {TimelineEvent} event
   * @returns {HTMLElement}
   */
  eventItem(event) {
    const head = h(
      'div',
      { class: 'tl-head' },
      h(
        'time',
        {
          class: 'tl-time',
          part: 'time',
          attrs: { datetime: event.date === null ? null : new Date(event.date).toISOString() },
        },
        this.timeLabel(event),
      ),
      h('span', { class: 'tl-kind', text: this.kindLabel(event.kind) }),
    );
    const title = event.link
      ? h(
          'a',
          {
            class: 'tl-title',
            part: 'title',
            attrs: { href: event.link, target: '_blank', rel: 'noopener noreferrer' },
          },
          event.title || event.time,
          icon('link'),
        )
      : h('span', { class: 'tl-title', part: 'title', text: event.title || event.time });
    const card = h(
      'div',
      {
        class: 'tl-card',
        attrs: { tabindex: '0', 'data-focus-key': `event-${event.id}` },
        on: {
          click: (e) => {
            if (!(e.target instanceof Element && e.target.closest('a, button'))) this.select(event);
          },
          keydown: (e) => {
            if (/** @type {KeyboardEvent} */ (e).key === 'Enter' && e.target === e.currentTarget)
              this.select(event);
          },
        },
      },
      head,
      h('h4', { class: 'tl-heading' }, title),
    );
    if (event.tags.length) {
      card.append(
        h(
          'div',
          { class: 'tl-tags' },
          ...event.tags.map((tag) => h('span', { class: 'tl-tag', text: tag })),
        ),
      );
    }
    if (event.description) card.append(this.description(event));
    return h(
      'li',
      { class: `tl-event kind-${event.kind}`, part: `event event-${event.kind}` },
      h('span', { class: 'tl-dot', part: 'dot', attrs: { 'aria-hidden': 'true' } }),
      card,
    );
  }

  /**
   * The description, folded after `collapse` lines.
   *
   * @param {TimelineEvent} event
   * @returns {HTMLElement}
   */
  description(event) {
    const limit = parseInteger(this.getAttribute('collapse'), { min: 0, max: 1000, fallback: 6 });
    const lines = event.description.split('\n');
    const folded = limit > 0 && lines.length > limit + 1 && !this.opened.has(event.id);
    const text = folded ? lines.slice(0, limit).join('\n') : event.description;
    const box = h('div', { class: 'tl-description' }, this.prose(text));
    if (limit > 0 && lines.length > limit + 1) {
      box.append(
        h(
          'button',
          {
            class: 'tl-more',
            attrs: {
              type: 'button',
              'aria-expanded': String(!folded),
              'data-focus-key': `more-${event.id}`,
            },
            on: {
              click: () => {
                if (folded) this.opened.add(event.id);
                else this.opened.delete(event.id);
                this.renderList();
                this.restoreFocus(`more-${event.id}`);
              },
            },
          },
          folded ? this.t('timelineMore') : this.t('timelineLess'),
        ),
      );
    }
    return box;
  }

  /**
   * @param {string} text
   * @returns {HTMLElement}
   */
  prose(text) {
    if (this.feature('markdown') && customElements.get('vt-markdown')) {
      const markdown = document.createElement('vt-markdown');
      markdown.className = 'prose';
      // Images in event descriptions are blocked: they could track readers.
      markdown.setAttribute('images', 'block');
      /** @type {any} */ (markdown).content = text;
      return markdown;
    }
    return h('p', { class: 'prose plain', text });
  }

  /**
   * @param {TimelineEvent} event
   */
  select(event) {
    emit(this, EVENTS.SELECT, { event: structuredClone(event) });
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const json = /^\s*[[{]/.test(this.text ?? '');
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: json ? 'json' : 'markdown',
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
      this.render();
    }, 400);
  }
}
