// @ts-check
import traceCss from '../../styles/trace.css?raw';
import { parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { append, h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { TraceError, formatMicros, parseTraces, tickLabel, tickStep } from './trace.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./trace.js').Trace} Trace */
/** @typedef {import('./trace.js').Span} Span */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Service colors: a class each, cycled. */
const COLORS = 8;
/** Rows built at once; the rest come with "Show more". */
const PAGE = 2000;

/**
 * Shows a distributed trace as a waterfall: each span on its own row, indented under its
 * parent, with a bar for when it ran, its service and its duration. Choosing a span shows
 * its attributes, events and ids.
 *
 * Reads OpenTelemetry traces (OTLP JSON, also one document per line as the collector's file
 * exporter writes them), Jaeger (UI download or API), Zipkin v2, or a plain list of spans
 * (`[{ id, parent, name, service, start, duration }]`, in milliseconds). A file with several
 * traces shows one at a time. Everything is shown as text; nothing is fetched.
 *
 * @element vt-trace
 * @since 0.14.0
 *
 * @attr {string} trace - Id of the trace shown at first, when the file has several (default: the first).
 * @attr {string} selected - Id of the span selected at first.
 * @attr {number} depth - Levels open at first (default: all, 3 above 500 spans).
 * @attr {boolean} details - The details of the selected span (default on).
 * @attr {boolean} legend - The services, with their colors (default on).
 * @attr {boolean} expand-buttons - Buttons that open or close every span. Full variant: on.
 *
 * @prop {string} content - The trace, as JSON.
 * @prop {Trace[]} traces - Traces read from the content (read-only copies).
 * @prop {string} selected - Id of the selected span; setting it selects the span.
 *
 * @fires vt-select - A span was selected. Detail: `{ id, traceId, name, service, start, duration, status }` (times in milliseconds).
 * @fires vt-toggle - A span was opened or closed. Detail: `{ id, expanded }`.
 *
 * @csspart summary - Trace id, start, duration, spans and errors.
 * @csspart legend - The services and their colors.
 * @csspart waterfall - The rows of spans.
 * @csspart ruler - The time scale above the rows.
 * @csspart span - A row (also `span-error`, `span-selected`).
 * @csspart bar - The bar of a span.
 * @csspart details - The details of the selected span.
 *
 * @example
 * <vt-trace variant="full" src="/traces/checkout.json"></vt-trace>
 */
export class VtTrace extends VtBase {
  static type = 'trace';

  static componentAttributes = Object.freeze([
    'trace', 'selected', 'depth', 'details', 'legend', 'expand-buttons',
  ]); // prettier-ignore

  static presets = {
    simple: { details: true, legend: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      details: true, legend: true, 'expand-buttons': true,
    },
  }; // prettier-ignore

  static styles = [traceCss];

  static upgradeProperties = ['content', 'selected'];

  constructor() {
    super();
    /** @type {{ text: string, traces: Trace[], error: Error | null } | null} */
    this.parsed = null;
    /** @type {string | null} Trace chosen in the list. */
    this.traceChoice = null;
    /** @type {string | null} Selected span; `null` follows `selected`. */
    this.selection = null;
    /** @type {Set<string> | null} Closed spans; `null` until the first render of a trace. */
    this.collapsed = null;
    /** @type {string} Id of the span with the keyboard focus. */
    this.focusId = '';
    this.query = '';
    /** @type {string[]} Spans matching the search. */
    this.matchIds = [];
    this.limit = PAGE;
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.rowsHost = null;
    /** @type {HTMLElement | null} */
    this.detailsHost = null;
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
    this.collapsed = null;
    this.limit = PAGE;
  }

  /** @returns {{ traces: Trace[], error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, traces: parseTraces(text), error: null };
    } catch (error) {
      this.parsed = { text, traces: [], error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Trace[]} */
  get traces() {
    return structuredClone(this.parse().traces);
  }

  /** @returns {Trace | null} The trace shown. */
  get current() {
    const traces = this.parse().traces;
    const id = this.traceChoice ?? this.getAttribute('trace')?.trim().toLowerCase();
    return traces.find((trace) => trace.id.toLowerCase() === id) ?? traces[0] ?? null;
  }

  /** @type {string} */
  get selected() {
    return this.selection ?? this.getAttribute('selected') ?? '';
  }

  set selected(id) {
    this.selection = id == null ? null : String(id);
    if (this._connected) this.requestRender();
  }

  /**
   * Closed spans, set from `depth` the first time a trace is shown.
   *
   * @param {Trace} trace
   * @returns {Set<string>}
   */
  closedSpans(trace) {
    if (this.collapsed) return this.collapsed;
    const fallback = trace.spans.length > 500 ? 3 : 1000;
    const depth = parseInteger(this.getAttribute('depth'), { min: 1, max: 1000, fallback });
    this.collapsed = new Set(trace.spans.filter((s) => s.depth >= depth - 1 && s.children.length).map((s) => s.id)); // prettier-ignore
    return this.collapsed;
  }

  /**
   * Spans shown: those whose parents are all open. During a search, the parents of
   * matching spans are opened.
   *
   * @param {Trace} trace
   * @returns {Span[]}
   */
  visibleSpans(trace) {
    const closed = this.closedSpans(trace);
    /** @type {Span[]} */
    const rows = [];
    let hiddenBelow = Infinity;
    for (const span of trace.spans) {
      if (span.depth > hiddenBelow) continue;
      hiddenBelow = Infinity;
      rows.push(span);
      if (closed.has(span.id)) hiddenBelow = span.depth;
    }
    return rows;
  }

  /**
   * @param {Span} span
   * @returns {boolean}
   */
  spanMatches(span) {
    const q = this.query.toLowerCase();
    if (!q) return false;
    return (
      span.name.toLowerCase().includes(q) ||
      span.service.toLowerCase().includes(q) ||
      span.id.toLowerCase() === q ||
      span.attributes.some((a) => a.value.toLowerCase().includes(q) || a.key.toLowerCase() === q)
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { traces, error } = this.parse();
    const trace = this.current;
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body tc-body', part: 'body' });
    this.rowsHost = null;
    this.detailsHost = null;

    if (error || !trace) body.append(noticeView(this.errorText(error)));
    else {
      body.append(this.summaryView(trace, traces));
      body.append(this.waterfall(trace));
      if (this.feature('details')) {
        this.detailsHost = h('div', { class: 'tc-details-host' });
        body.append(this.detailsHost);
        this.renderDetails(trace);
      }
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('tc-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        const current = this.current;
        this.matchIds = current ? current.spans.filter((s) => this.spanMatches(s)).map((s) => s.id) : []; // prettier-ignore
        if (current) this.openParentsOf(current, this.matchIds);
        this.renderRows();
        return { total: this.matchIds.length, capped: false };
      },
      /** @param {number} index */
      go: (index) => {
        const id = this.matchIds[index];
        for (const row of this.rowsHost?.querySelectorAll('.tc-row.current') ?? []) row.classList.remove('current'); // prettier-ignore
        const row = this.rowFor(id);
        row?.classList.add('current');
        row?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.matchIds = [];
        this.renderRows();
      },
    };

    const expandable = trace?.spans.some((s) => s.children.length);
    const actions = [
      this.searchButton(target),
      ...history,
      this.feature('expand-buttons') && expandable && !this.editing
        ? iconButton({ icon: 'expand-all', label: t('expandAll'), key: 'expand-all', onClick: () => this.setAll(false) }) // prettier-ignore
        : null,
      this.feature('expand-buttons') && expandable && !this.editing
        ? iconButton({ icon: 'collapse-all', label: t('collapseAll'), key: 'collapse-all', onClick: () => this.setAll(true) }) // prettier-ignore
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('trace.json'),
            'application/json',
          )
        : null,
      this.feature('copy') && trace
        ? this.copyButton(() => JSON.stringify(exportSpans(trace), null, 2), t('traceCopyJson'))
        : null,
    ];
    const badge = trace
      ? `${trace.spans.length === 1 ? t('traceSpan') : t('traceSpans', { count: formatNumber(trace.spans.length, this.locale) })} · ${formatMicros(trace.duration, this.locale)}` // prettier-ignore
      : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof TraceError) {
      if (error.message === 'empty') return t('traceInvalidEmpty');
      if (error.message === 'format') return t('traceInvalidFormat');
      if (error.message === 'noSpans') return t('traceInvalidNoSpans');
    }
    return t('traceInvalid', { message: error?.message ?? '' });
  }

  /**
   * @param {Trace} trace
   * @param {Trace[]} traces
   * @returns {HTMLElement}
   */
  summaryView(trace, traces) {
    const t = this.t;
    const errors = trace.spans.filter((s) => s.status === 'error').length;
    const summary = h('div', { class: 'tc-summary', part: 'summary' });
    if (traces.length > 1) {
      const selectId = `${this.panelId}-trace`;
      const select = h('select', {
        class: 'tc-select',
        attrs: { id: selectId, 'data-focus-key': 'trace-select' },
        on: {
          change: () => {
            this.traceChoice = select.value;
            this.collapsed = null;
            this.selection = null;
            this.limit = PAGE;
            this.render();
          },
        },
      });
      for (const item of traces) {
        const root = item.spans[0];
        const option = h('option', { text: `${root?.name || item.id} · ${formatMicros(item.duration, this.locale)}`, attrs: { value: item.id } }); // prettier-ignore
        if (item === trace) option.selected = true;
        select.append(option);
      }
      summary.append(h('label', { class: 'tc-fact', attrs: { for: selectId } }, h('span', { class: 'tc-key', text: t('traceChoose') }), select)); // prettier-ignore
    }
    /** @param {string} key @param {Node | string} value */
    const fact = (key, value) =>
      h('span', { class: 'tc-fact' }, h('span', { class: 'tc-key', text: key }), value);
    if (trace.id) {
      summary.append(
        fact(t('traceId'), h('code', { class: 'tc-id', text: trace.id })),
        this.copyTextButton(() => trace.id, t('traceCopyId'), 'copy-trace-id'),
      );
    }
    if (trace.startedAt !== null) summary.append(fact(t('traceStarted'), this.formatDate(trace.startedAt))); // prettier-ignore
    summary.append(fact(t('traceDuration'), formatMicros(trace.duration, this.locale)));
    if (errors) {
      summary.append(
        h('span', { class: 'tc-fact tc-errors' }, icon('alert'), errors === 1 ? t('traceError') : t('traceErrors', { count: formatNumber(errors, this.locale) })), // prettier-ignore
      );
    }
    if (!this.feature('legend') || !trace.services.length) return summary;
    const legend = h('ul', { class: 'tc-legend', part: 'legend', attrs: { 'aria-label': t('traceServices') } }); // prettier-ignore
    trace.services.forEach((service, index) => {
      legend.append(h('li', { class: `svc-${index % COLORS}` }, h('span', { class: 'tc-swatch', attrs: { 'aria-hidden': 'true' } }), service)); // prettier-ignore
    });
    return h('div', {}, summary, legend);
  }

  /**
   * @param {number} time
   * @returns {string}
   */
  formatDate(time) {
    try {
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(time); // prettier-ignore
    } catch {
      return new Date(time).toISOString();
    }
  }

  /**
   * @param {Trace} trace
   * @returns {HTMLElement}
   */
  waterfall(trace) {
    const ruler = h('div', { class: 'tc-ruler', part: 'ruler', attrs: { 'aria-hidden': 'true' } });
    const lane = h('div', { class: 'tc-ruler-lane' });
    const step = tickStep(trace.duration);
    for (let at = 0; at <= trace.duration + step / 1000; at += step) {
      const tick = h('span', { class: 'tc-tick', text: tickLabel(at, step, this.locale) });
      tick.style.insetInlineStart = `${trace.duration ? (at / trace.duration) * 100 : 0}%`;
      lane.append(tick);
      if (step <= 0) break;
    }
    ruler.append(h('span', { class: 'tc-ruler-label' }), lane);
    this.rowsHost = h('div', {
      class: 'tc-rows',
      attrs: { role: 'tree', 'aria-label': this.t('traceWaterfall') },
      on: { keydown: (event) => this.onKey(/** @type {KeyboardEvent} */ (event)) },
    });
    this.renderRows();
    return h('div', { class: 'tc-waterfall', part: 'waterfall' }, ruler, this.rowsHost);
  }

  /** Builds the rows for the current trace, search and open spans. */
  renderRows() {
    const host = this.rowsHost;
    const trace = this.current;
    if (!host || !trace) return;
    const rows = this.visibleSpans(trace);
    const selected = this.selected;
    if (!rows.some((s) => s.id === this.focusId)) this.focusId = (rows.find((s) => s.id === selected) ?? rows[0])?.id ?? ''; // prettier-ignore
    const services = trace.services;
    const matches = new Set(this.matchIds);
    const closed = this.closedSpans(trace);
    /** @type {HTMLElement[]} */
    const items = [];
    for (const span of rows.slice(0, this.limit)) {
      const open = !closed.has(span.id);
      const isSelected = span.id === selected;
      const color = Math.max(0, services.indexOf(span.service)) % COLORS;
      const row = h('div', {
        class: `tc-row svc-${color}${span.status === 'error' ? ' error' : ''}${isSelected ? ' selected' : ''}${matches.has(span.id) ? ' match' : this.query ? ' dimmed' : ''}`, // prettier-ignore
        part: `span${span.status === 'error' ? ' span-error' : ''}${isSelected ? ' span-selected' : ''}`,
        attrs: {
          role: 'treeitem',
          'aria-level': span.depth + 1,
          'aria-expanded': span.children.length ? String(open) : null,
          'aria-selected': String(isSelected),
          tabindex: span.id === this.focusId ? '0' : '-1',
          'data-id': span.id,
          'data-focus-key': `span-${span.id}`,
          title: `${span.name} · ${span.service ? `${span.service} · ` : ''}${formatMicros(span.duration, this.locale)}`, // prettier-ignore
        },
        on: { click: (event) => this.onRowClick(span, /** @type {MouseEvent} */ (event)) },
      });
      const label = h('span', { class: 'tc-label' });
      label.style.setProperty('--_depth', String(Math.min(span.depth, 30)));
      append(label, [
        span.children.length
          ? h('span', { class: `tc-toggle${open ? ' open' : ''}`, attrs: { 'aria-hidden': 'true', 'data-toggle': '' } }, icon('chevron-right')) // prettier-ignore
          : h('span', { class: 'tc-toggle none', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'tc-swatch', attrs: { 'aria-hidden': 'true' } }),
        span.status === 'error' ? icon('alert') : null,
        h('span', { class: 'tc-name', text: span.name || span.id }),
        span.service ? h('span', { class: 'tc-service', text: span.service }) : null,
      ]);
      const bar = h('span', { class: 'tc-bar', part: 'bar' });
      const total = trace.duration || 1;
      bar.style.insetInlineStart = `${(span.start / total) * 100}%`;
      bar.style.width = `${(span.duration / total) * 100}%`;
      const lane = h('span', { class: 'tc-lane' }, bar);
      for (const event of span.events.slice(0, 50)) {
        const mark = h('span', { class: 'tc-event', attrs: { title: event.name } });
        mark.style.insetInlineStart = `${(event.time / total) * 100}%`;
        lane.append(mark);
      }
      const time = h('span', { class: 'tc-time', text: formatMicros(span.duration, this.locale) });
      // The end of the bar past the middle: the duration is written before it.
      if ((span.start + span.duration) / total > 0.7) time.classList.add('before');
      time.style.insetInlineStart = `${((time.classList.contains('before') ? span.start : span.start + span.duration) / total) * 100}%`; // prettier-ignore
      lane.append(time);
      row.append(label, lane);
      items.push(row);
    }
    if (rows.length > this.limit) {
      items.push(
        h('button', {
          class: 'text-btn tc-more',
          text: this.t('traceShowMore', { count: formatNumber(Math.min(PAGE, rows.length - this.limit), this.locale) }), // prettier-ignore
          attrs: { type: 'button', 'data-focus-key': 'more' },
          on: {
            click: () => {
              this.limit += PAGE;
              this.renderRows();
            },
          },
        }),
      );
    }
    if (this.query && !this.matchIds.length) items.unshift(h('p', { class: 'tc-none', text: this.t('traceNoMatch') })); // prettier-ignore
    host.replaceChildren(...items);
  }

  /**
   * @param {string} id
   * @returns {HTMLElement | null}
   */
  rowFor(id) {
    return /** @type {HTMLElement | null} */ (this.rowsHost?.querySelector(`[data-id="${CSS.escape(id)}"]`) ?? null); // prettier-ignore
  }

  /**
   * @param {Span} span
   * @param {MouseEvent} event
   */
  onRowClick(span, event) {
    this.focusId = span.id;
    const target = /** @type {Element} */ (event.target);
    if (target.closest('[data-toggle]')) {
      this.toggle(span.id);
      return;
    }
    this.select(span.id);
  }

  /**
   * Selects a span and shows its details.
   *
   * @param {string} id
   */
  select(id) {
    const trace = this.current;
    const span = trace?.spans.find((s) => s.id === id);
    if (!trace || !span) return;
    this.selection = id;
    this.focusId = id;
    this.renderRows();
    this.renderDetails(trace);
    this.rowFor(id)?.focus();
    emit(this, EVENTS.SELECT, {
      id: span.id,
      traceId: trace.id,
      name: span.name,
      service: span.service,
      start: span.start / 1000,
      duration: span.duration / 1000,
      status: span.status,
    });
  }

  /**
   * Opens or closes a span.
   *
   * @param {string} id
   * @param {boolean} [open] - Default: the other state.
   */
  toggle(id, open) {
    const trace = this.current;
    if (!trace) return;
    const closed = this.closedSpans(trace);
    const expanded = open ?? closed.has(id);
    if (expanded === !closed.has(id)) return;
    if (expanded) closed.delete(id);
    else closed.add(id);
    this.focusId = id;
    this.renderRows();
    this.rowFor(id)?.focus();
    emit(this, EVENTS.TOGGLE, { id, expanded });
  }

  /**
   * Opens or closes every span.
   *
   * @param {boolean} close
   */
  setAll(close) {
    const trace = this.current;
    if (!trace) return;
    this.collapsed = new Set(close ? trace.spans.filter((s) => s.children.length).map((s) => s.id) : []); // prettier-ignore
    this.renderRows();
  }

  /**
   * Opens the parents of spans, so they can be seen.
   *
   * @param {Trace} trace
   * @param {string[]} ids
   */
  openParentsOf(trace, ids) {
    const closed = this.closedSpans(trace);
    const byId = new Map(trace.spans.map((s) => [s.id, s]));
    for (const id of ids) {
      for (let span = byId.get(id); span?.parentId; span = byId.get(span.parentId)) {
        if (!byId.has(span.parentId)) break;
        closed.delete(span.parentId);
      }
    }
  }

  /**
   * The tree view keys of WAI-ARIA.
   *
   * @param {KeyboardEvent} event
   */
  onKey(event) {
    const trace = this.current;
    if (!trace) return;
    const rows = this.visibleSpans(trace).slice(0, this.limit);
    const index = rows.findIndex((s) => s.id === this.focusId);
    if (index < 0) return;
    const span = rows[index];
    const closed = this.closedSpans(trace);
    /** @type {Span | undefined} */
    let next;
    switch (event.key) {
      case 'ArrowDown':
        next = rows[index + 1];
        break;
      case 'ArrowUp':
        next = rows[index - 1];
        break;
      case 'Home':
        next = rows[0];
        break;
      case 'End':
        next = rows[rows.length - 1];
        break;
      case 'ArrowRight':
        if (span.children.length && closed.has(span.id)) {
          event.preventDefault();
          this.toggle(span.id, true);
          return;
        }
        if (span.children.length) next = rows[index + 1];
        break;
      case 'ArrowLeft':
        if (span.children.length && !closed.has(span.id)) {
          event.preventDefault();
          this.toggle(span.id, false);
          return;
        }
        next = rows.find((s) => s.id === span.parentId);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(span.id);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!next) return;
    const previous = this.rowFor(this.focusId);
    previous?.setAttribute('tabindex', '-1');
    this.focusId = next.id;
    const row = this.rowFor(next.id);
    row?.setAttribute('tabindex', '0');
    row?.focus();
  }

  /**
   * @param {Trace} trace
   */
  renderDetails(trace) {
    const host = this.detailsHost;
    if (!host) return;
    const span = trace.spans.find((s) => s.id === this.selected);
    if (!span) {
      host.replaceChildren();
      return;
    }
    const t = this.t;
    const statusKey = /** @type {StringKey} */ (`traceStatus${span.status[0].toUpperCase()}${span.status.slice(1)}`); // prettier-ignore
    const color = Math.max(0, trace.services.indexOf(span.service)) % COLORS;
    const facts = h('dl', { class: 'tc-facts' });
    /** @param {string} key @param {string | Node} value */
    const add = (key, value) => facts.append(h('dt', { text: key }), h('dd', {}, value));
    if (span.service) add(t('traceService'), span.service);
    if (span.kind) add(t('traceKind'), span.kind);
    add(t('traceStart'), `+${formatMicros(span.start, this.locale)}`);
    add(t('traceDuration'), formatMicros(span.duration, this.locale));
    add(
      t('traceStatus'),
      span.statusMessage ? `${t(statusKey)}: ${span.statusMessage}` : t(statusKey),
    );
    add(t('traceSpanId'), h('code', { text: span.id }));
    if (span.parentId) add(t('traceParentId'), h('code', { text: span.parentId }));
    if (span.links) add(t('traceLinks'), formatNumber(span.links, this.locale));

    const details = h(
      'section',
      { class: `tc-details svc-${color}${span.status === 'error' ? ' error' : ''}`, part: 'details', attrs: { 'aria-label': t('traceDetails') } }, // prettier-ignore
      h(
        'div',
        { class: 'tc-details-head' },
        h('span', { class: 'tc-swatch', attrs: { 'aria-hidden': 'true' } }),
        h('h3', { class: 'tc-details-title', text: span.name || span.id }),
        iconButton({
          icon: 'close',
          label: t('traceClose'),
          key: 'details-close',
          onClick: () => {
            this.selection = '';
            this.renderRows();
            this.renderDetails(trace);
            this.rowFor(span.id)?.focus();
          },
        }),
      ),
      span.orphan ? h('p', { class: 'tc-note', text: t('traceOrphan') }) : null,
      facts,
    );
    if (span.attributes.length) {
      const table = h('table', { class: 'tc-attrs' });
      const body = h('tbody');
      for (const a of span.attributes) body.append(h('tr', {}, h('th', { attrs: { scope: 'row' }, text: a.key }), h('td', { text: a.value }))); // prettier-ignore
      table.append(body);
      details.append(h('h4', { text: t('traceAttributes') }), table);
    }
    if (span.events.length) {
      const list = h('ul', { class: 'tc-events' });
      for (const event of span.events) {
        const item = h('li', {}, h('span', { class: 'tc-event-time', text: `+${formatMicros(event.time, this.locale)}` }), h('strong', { text: event.name })); // prettier-ignore
        if (event.attributes.length)
          item.append(h('span', { class: 'tc-event-attrs', text: event.attributes.map((a) => `${a.key}=${a.value}`).join('  ') })); // prettier-ignore
        list.append(item);
      }
      details.append(h('h4', { text: t('traceEvents') }), list);
    }
    host.replaceChildren(details);
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'json',
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
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}

/**
 * The spans of a trace as plain JSON, times in milliseconds.
 *
 * @param {Trace} trace
 */
function exportSpans(trace) {
  return trace.spans.map((s) => ({
    id: s.id,
    parent: s.parentId || null,
    traceId: trace.id,
    name: s.name,
    service: s.service,
    kind: s.kind || undefined,
    start: s.start / 1000,
    duration: s.duration / 1000,
    status: s.status,
    attributes: Object.fromEntries(s.attributes.map((a) => [a.key, a.value])),
  }));
}
