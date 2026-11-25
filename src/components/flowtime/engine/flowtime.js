// @ts-nocheck
// Migrated Flowtime engine. The public contract is typed in flowtime.d.ts;
// behavior is covered by tests/flowtime and the vt-flowtime integration tests.
import { normalizeViews, CustomViewHost } from './views.js';
import { ActivityFilter } from './activity.js';
import { english } from '../strings.js';
import {
  DEFAULT_GROUPS,
  normalizeEvents,
  filterEvents,
  extent,
  packEvents,
  timeTicks,
  normalizeDateRange,
} from './model.js';

const MIN_SPAN = 1000;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 86;
const ROW_HEIGHT = 110;
const LANE_LABEL_WIDTH = 150;
const CARD_GUTTER = CARD_WIDTH / 2 + 8;
const MAX_SPAN = 86400_000 * 365 * 10000;
const TEXT_SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
function validateTextScale(scale) {
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 1.5)
    throw new TypeError('textScale must be a number between 0.5 and 1.5.');
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
// `named` false: the visible content names the button, the title is only a tooltip.
function button(label, className, handler, title = label, named = true) {
  const node = el('button', className, label);
  node.type = 'button';
  node.title = title;
  if (named) node.setAttribute('aria-label', title);
  node.addEventListener('click', handler);
  return node;
}

function normalizeActions(actions, name) {
  if (!Array.isArray(actions)) throw new TypeError(`${name} must be an array.`);
  const ids = new Set();
  return actions.map((action) => {
    if (!action || typeof action.id !== 'string' || !action.id.trim() || ids.has(action.id))
      throw new TypeError(`${name} needs unique, nonempty string IDs.`);
    if (
      typeof action.label !== 'string' ||
      !action.label.trim() ||
      typeof action.onClick !== 'function'
    )
      throw new TypeError(`Action ${action.id} needs a label and onClick callback.`);
    for (const key of ['visible', 'disabled'])
      if (
        action[key] !== undefined &&
        typeof action[key] !== 'boolean' &&
        typeof action[key] !== 'function'
      )
        throw new TypeError(`Action ${action.id}: ${key} must be a boolean or function.`);
    for (const key of ['icon', 'title'])
      if (action[key] !== undefined && typeof action[key] !== 'string')
        throw new TypeError(`Action ${action.id}: ${key} must be text.`);
    if (action.variant !== undefined && !['default', 'primary', 'danger'].includes(action.variant))
      throw new TypeError(`Action ${action.id} has an invalid variant.`);
    ids.add(action.id);
    return { ...action };
  });
}
function actionFlag(value, context, fallback) {
  return value === undefined
    ? fallback
    : typeof value === 'function'
      ? Boolean(value(context))
      : value;
}

/** A locally scoped, dependency-free timeline. All event content is rendered as text. */
export class Flowtime {
  /**
   * Interface text: the host translator when given, English otherwise.
   * @param {string} key
   * @param {Record<string, string>} [params]
   */
  s(key, params) {
    return (this.options?.t ?? english)(key, params);
  }

  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new TypeError('Flowtime needs a valid container.');
    this.options = {
      locale: 'en-GB',
      timeZone: 'UTC',
      animationDuration: 220,
      textScale: 1,
      showTextScaleControl: true,
      ...options,
    };
    if (this.options.t != null && typeof this.options.t !== 'function')
      throw new TypeError('t must be a function.');
    validateTextScale(this.options.textScale);
    if (typeof this.options.showTextScaleControl !== 'boolean')
      throw new TypeError('showTextScaleControl must be a boolean.');
    if (!Number.isFinite(this.options.animationDuration) || this.options.animationDuration < 0)
      throw new TypeError('animationDuration must be a nonnegative number.');
    this.options.actions = normalizeActions(options.actions ?? [], 'actions');
    this.options.eventActions = normalizeActions(options.eventActions ?? [], 'eventActions');
    this.options.customViews = normalizeViews(options.customViews ?? []);
    // Validate format settings before attaching DOM or listeners.
    this.dateFormat = new Intl.DateTimeFormat(this.options.locale, {
      timeZone: this.options.timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    this.timeFormat = new Intl.DateTimeFormat(this.options.locale, {
      timeZone: this.options.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    this.secondFormat = new Intl.DateTimeFormat(this.options.locale, {
      timeZone: this.options.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    this.events = normalizeEvents(options.events ?? []);
    this.groups = this.resolveGroups(options.groups ?? DEFAULT_GROUPS);
    this.activeGroups = new Set(this.groups.map((group) => group.id));
    this.view = [
      'timeline',
      'feed',
      'combined',
      ...this.options.customViews.map((view) => view.id),
    ].includes(options.view)
      ? options.view
      : 'timeline';
    this.query = '';
    this.dateRange = { start: null, end: null };
    this.pendingActions = new Set();
    this.pendingToolbarActions = new Set();
    this.toolbarActionError = '';
    this.selectedId = null;
    this.customViewHost = new CustomViewHost(
      () => this.getActionContext(),
      (detail) => this.emit('viewerror', detail),
      (key, params) => this.s(key, params),
    );
    [this.from, this.to] = extent(this.events);
    this.abort = new AbortController();
    this.mount();
    this.fitBounds();
    this.render();
    this.observer = new ResizeObserver(() => {
      this.activityFilter?.renderAxis();
      if (this.content.clientWidth !== this.contentWidth) this.renderContent();
    });
    this.observer.observe(this.content);
  }

  resolveGroups(groups) {
    const result = groups.map((group) => ({ ...group, id: String(group.id) }));
    if (new Set(result.map((group) => group.id)).size !== result.length)
      throw new TypeError('Group IDs must be unique.');
    for (const event of this.events)
      if (!result.some((group) => group.id === event.group))
        result.push({
          id: event.group,
          label: event.group,
          color: '#7c8b92',
          icon: '•',
        });
    return result;
  }

  mount() {
    this.root = el('section', 'ft');
    this.root.setAttribute('aria-label', this.options.label || this.s('flowtimeLabel'));
    this.root.dataset.theme = this.options.theme || 'light';
    this.toolbar = el('div', 'ft-toolbar');
    const switcher = el('div', 'ft-switch');
    switcher.setAttribute('aria-label', this.s('flowtimeViews'));
    this.timelineButton = button('⌁  Timeline', '', () => this.setView('timeline'));
    this.combinedButton = button('⌁  Combined timeline', '', () => this.setView('combined'));
    this.feedButton = button('☷  Chronological feed', '', () => this.setView('feed'));
    switcher.append(this.timelineButton, this.combinedButton, this.feedButton);
    this.customViewButtons = new Map();
    for (const view of this.options.customViews) {
      const node = button(`${view.icon ? view.icon + '  ' : ''}${view.label}`, '', () =>
        this.setView(view.id),
      );
      this.customViewButtons.set(view.id, node);
      switcher.append(node);
    }
    this.search = el('input', 'ft-search');
    this.search.type = 'search';
    this.search.placeholder = this.s('flowtimeSearch');
    this.search.setAttribute('aria-label', this.s('flowtimeSearchLabel'));
    this.search.addEventListener('input', () => this.setFilter({ query: this.search.value }));
    this.toolbar.append(switcher, this.search);
    this.actionBar = el('div', 'ft-actions-bar');
    this.actionButtons = el('div', 'ft-toolbar-actions');
    this.actionButtons.setAttribute('role', 'group');
    this.actionButtons.setAttribute('aria-label', this.s('flowtimeActions'));
    this.toolbarError = el('p', 'ft-toolbar-action-error');
    this.toolbarError.setAttribute('role', 'alert');
    this.actionBar.append(this.actionButtons, this.toolbarError);
    this.activityFilter = new ActivityFilter({
      s: (key, params) => this.s(key, params),
      onChange: (range) => this.setDateRange(range),
      formatDate: (time) => this.formatDate(time),
      formatTime: (time) => this.formatTime(time),
      timeZone: this.options.timeZone,
      colorFor: (id) => this.safeColor(this.groups.find((group) => group.id === id)?.color),
      signal: this.abort.signal,
    });
    this.filters = el('div', 'ft-filters');
    this.filterButtons = this.groups.map((group) => {
      const node = button(
        '',
        'ft-filter',
        () => {
          const groups = new Set(this.activeGroups);
          groups.has(group.id) ? groups.delete(group.id) : groups.add(group.id);
          this.setFilter({ groups: [...groups] });
        },
        `Filter ${group.label}`,
        false,
      );
      node.style.setProperty('--ft-group', this.safeColor(group.color));
      node.append(el('span', 'ft-dot'), el('span', '', group.label), el('span', 'ft-filter-count'));
      this.filters.append(node);
      return node;
    });
    this.count = el('span', 'ft-count');
    this.count.setAttribute('role', 'status');
    this.filters.append(this.count);
    this.workspace = el('div', 'ft-workspace');
    this.content = el('div', 'ft-content');
    this.details = el('aside', 'ft-details');
    this.details.setAttribute('aria-label', this.s('flowtimeDetails'));
    this.content.tabIndex = -1;
    this.workspace.append(this.content, this.details);
    this.syncInspectorVisibility();
    this.footer = el('div', 'ft-footer');
    this.rangeLabel = el('span', 'ft-range');
    const controls = el('div', 'ft-zoom');
    this.panLeftButton = button('←', '', () => this.pan(-0.3), this.s('flowtimeEarlier'));
    this.zoomOutButton = button('−', '', () => this.zoom(0.65), this.s('flowtimeZoomOut'));
    this.zoomInButton = button('+', '', () => this.zoom(1.55), this.s('flowtimeZoomIn'));
    this.panRightButton = button('→', '', () => this.pan(0.3), this.s('flowtimeLater'));
    controls.append(
      this.panLeftButton,
      this.zoomOutButton,
      button(this.s('flowtimeFit'), 'ft-fit', () => this.fit()),
      this.zoomInButton,
      this.panRightButton,
    );
    this.textScaleControl = el('label', 'ft-text-size');
    this.textScaleControl.append(el('span', '', this.s('flowtimeTextSize')));
    this.textScaleSelect = el('select');
    this.textScaleSelect.setAttribute('aria-label', this.s('flowtimeTextSize'));
    this.textScaleSelect.addEventListener('change', () =>
      this.setTextScale(Number(this.textScaleSelect.value)),
    );
    this.textScaleControl.append(this.textScaleSelect);
    this.textScaleControl.hidden = !this.options.showTextScaleControl;
    this.syncTextScale();
    const viewportControls = el('div', 'ft-viewport-controls');
    viewportControls.append(controls, this.textScaleControl);
    this.footer.append(
      this.rangeLabel,
      viewportControls,
      el('span', 'ft-zone', this.options.timeZone),
    );
    this.root.append(
      this.toolbar,
      this.actionBar,
      this.activityFilter.root,
      this.filters,
      this.workspace,
      this.footer,
    );
    this.container.append(this.root);
    this.root.addEventListener(
      'keydown',
      (event) => {
        if (event.target.closest('input, textarea, select, [contenteditable="true"], .ft-activity'))
          return;
        if (event.target.closest('.ft-custom-view, .ft-switch')) return;
        if (event.key === 'Escape' && this.selectedId !== null) {
          event.preventDefault();
          this.clearSelection();
          return;
        }
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const events = this.visibleEvents;
        if (!events.length) return;
        const index = events.findIndex((item) => item.id === this.selectedId);
        const next = Math.max(
          0,
          Math.min(events.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
        );
        event.preventDefault();
        this.select(events[next].id, { reveal: true });
        this.focusSelectedEvent();
      },
      { signal: this.abort.signal },
    );
    this.attachPan();
  }

  safeColor(value) {
    return typeof value === 'string' && CSS.supports('color', value) ? value : '#7c8b92';
  }
  get textScale() {
    return this.options.textScale ?? 1;
  }
  syncTextScale() {
    this.textScaleSelect.replaceChildren();
    const scales = [...new Set([...TEXT_SCALES, this.textScale])].sort((a, b) => a - b);
    for (const scale of scales) {
      const option = el('option', '', `${Math.round(scale * 100)}%`);
      option.value = String(scale);
      this.textScaleSelect.append(option);
    }
    this.textScaleSelect.value = String(this.textScale);
  }
  setTextScale(scale) {
    validateTextScale(scale);
    if (scale === this.textScale) return;
    this.options.textScale = scale;
    this.syncTextScale();
    this.renderContent();
    this.emit('textscalechange', { textScale: scale });
  }
  get visibleEvents() {
    return filterEvents(this.events, this.query, this.activeGroups, this.dateRange);
  }
  groupFor(event) {
    return this.groups.find((group) => group.id === event.group);
  }
  formatDate(time) {
    return this.dateFormat.format(time);
  }
  formatTime(time) {
    return this.timeFormat.format(time);
  }

  customView() {
    return this.options.customViews?.find((view) => view.id === this.view);
  }
  isTimelineView() {
    return this.view === 'timeline' || this.view === 'combined';
  }

  render() {
    this.renderToolbarActions();
    this.timelineButton.setAttribute('aria-pressed', String(this.view === 'timeline'));
    this.combinedButton.setAttribute('aria-pressed', String(this.view === 'combined'));
    this.feedButton.setAttribute('aria-pressed', String(this.view === 'feed'));
    for (const [id, node] of this.customViewButtons)
      node.setAttribute('aria-pressed', String(this.view === id));
    this.filterButtons.forEach((node, index) => {
      const group = this.groups[index];
      node.setAttribute('aria-pressed', String(this.activeGroups.has(group.id)));
      node.lastChild.textContent = this.events.filter((event) => event.group === group.id).length;
    });
    this.count.textContent = `${this.visibleEvents.length} of ${this.events.length} events`;
    this.activityFilter.render(this.events, this.query, this.activeGroups, this.dateRange);
    const filters = this.customView()?.filters !== false;
    this.search.hidden = this.filters.hidden = !filters;
    this.activityFilter.root.hidden = !filters || !this.events.length;
    this.syncInspectorVisibility();
    this.renderContent();
    this.renderDetails();
  }

  renderContent() {
    if (this.destroyed) return;
    this.stopMotion();
    this.timelineScene = null;
    this.contentWidth = this.content.clientWidth;
    const custom = this.customView();
    this.content.dataset.view = custom ? 'custom' : this.view;
    this.content.style.setProperty('--ft-text-scale', this.isTimelineView() ? this.textScale : 1);
    this.footer.hidden = Boolean(custom);
    this.footer.dataset.view = this.view;
    if (custom) {
      this.customViewHost.render(custom, this.content);
      return;
    }
    this.customViewHost?.stop();
    this.content.replaceChildren();
    this.rangeLabel.textContent =
      this.view !== 'feed'
        ? this.formatDate(this.from) === this.formatDate(this.to)
          ? `${this.formatDate(this.from)} · ${this.formatTime(this.from)} — ${this.formatTime(this.to)}`
          : `${this.formatDate(this.from)} ${this.formatTime(this.from)} — ${this.formatDate(this.to)} ${this.formatTime(this.to)}`
        : 'Chronological order · oldest first';
    if (!this.visibleEvents.length) {
      const empty = el('div', 'ft-empty');
      empty.append(
        el('span', 'ft-empty-icon', '⌁'),
        el('h3', '', this.events.length ? this.s('flowtimeNoMatch') : this.s('flowtimeEmpty')),
        el(
          'p',
          '',
          this.events.length
            ? 'Try another search, enable a source, or clear the date range.'
            : 'Pass events to Flowtime or import a dataset to begin.',
        ),
      );
      this.content.append(empty);
      return;
    }
    if (this.view === 'feed') {
      this.renderFeed();
      return;
    }
    this.renderTimeline();
  }

  renderTimeline() {
    const combined = this.view === 'combined';
    const scroll = el('div', 'ft-timeline-scroll');
    scroll.dataset.layout = combined ? 'combined' : 'sources';
    const width = Math.max(
      390 * this.textScale,
      this.content.clientWidth - LANE_LABEL_WIDTH * this.textScale,
    );
    const axis = el('div', 'ft-axis');
    const ticks = el('div', 'ft-ticks');
    axis.append(el('div', 'ft-axis-label', 'SOURCE / TIME'), ticks);
    scroll.append(axis);
    const visible = this.visibleEvents;
    const scene = {
      width,
      axis,
      ticks,
      tickNodes: new Map(),
      lanes: [],
      events: visible,
    };
    const lanes = combined
      ? [{ label: this.s('flowtimeAllEvents'), icon: '⌁', events: visible }]
      : this.groups
          .filter((group) => this.activeGroups.has(group.id))
          .map((group) => ({
            ...group,
            events: visible.filter((event) => event.group === group.id),
          }))
          .filter((group) => group.events.length);
    for (const group of lanes) {
      const lane = el('div', 'ft-lane');
      lane.style.setProperty('--ft-group', this.safeColor(group.color));
      const label = el('div', 'ft-lane-label');
      const events = group.events;
      label.append(
        el('span', 'ft-lane-icon', group.icon || '•'),
        el('strong', '', group.label),
        el('small', '', `${events.length} events`),
      );
      const track = el('div', 'ft-track');
      // Keep the same nodes and rows while panning. Offscreen cards are clipped,
      // rather than clamped to the edges, so they move with their time markers.
      const nodes = events.map((event) => {
        const card = this.eventButton(event, 'ft-event');
        card.style.left = '0';
        card.title = `${event.title}\n${this.formatDate(event.start)} ${this.formatTime(event.start)}`;
        const time = el('span', 'ft-event-time', this.formatTime(event.start));
        if (combined) {
          const meta = el('span', 'ft-event-meta');
          const source = el('span', 'ft-event-source', this.groupFor(event)?.label || event.group);
          meta.append(time, source);
          card.append(meta);
        } else card.append(time);
        card.append(el('strong', '', event.title));
        const color = this.safeColor(this.groupFor(event)?.color);
        const marker = el('span', 'ft-marker');
        marker.style.left = '0';
        marker.style.setProperty('--ft-group', color);
        const duration = event.end === null ? null : el('span', 'ft-duration');
        if (duration) {
          duration.style.setProperty('--ft-group', color);
          track.append(duration);
        }
        track.append(marker, card);
        return { event, card, marker, duration };
      });
      scene.lanes.push({ track, events, nodes, lines: new Map() });
      lane.append(label, track);
      scroll.append(lane);
    }
    scene.outside = el('div', 'ft-outside');
    scene.outside.append(
      el('span', '', this.s('flowtimeOutside')),
      button(this.s('flowtimeFit'), '', () => this.fit()),
    );
    scroll.append(scene.outside);
    this.content.append(scroll);
    this.timelineScene = scene;
    this.paintViewport(true);
  }

  paintViewport(repack = false) {
    const scene = this.timelineScene;
    if (!scene || this.destroyed || !this.isTimelineView()) return;
    const span = this.to - this.from;
    const position = (time) => ((time - this.from) / span) * scene.width;
    const scale = this.textScale;
    const cardWidth = CARD_WIDTH * scale;
    const times = timeTicks(this.from, this.to, scene.width / scale);
    const activeTicks = new Set(times);
    for (const [time, node] of scene.tickNodes) {
      if (!activeTicks.has(time)) {
        node.remove();
        scene.tickNodes.delete(time);
      }
    }
    const seconds = span <= 120000;
    for (const time of times) {
      let tick = scene.tickNodes.get(time);
      if (!tick) {
        tick = el('div', 'ft-tick');
        tick.append(el('span'), el('small', '', this.formatDate(time)));
        const following = times.find(
          (candidate) => candidate > time && scene.tickNodes.has(candidate),
        );
        scene.tickNodes.set(time, tick);
        scene.ticks.insertBefore(tick, scene.tickNodes.get(following) ?? null);
      }
      if (tick.dataset.seconds !== String(seconds)) {
        tick.firstChild.textContent = seconds
          ? this.secondFormat.format(time)
          : this.formatTime(time);
        tick.dataset.seconds = String(seconds);
      }
      tick.style.left = `${Math.max(44 * scale, Math.min(scene.width - 44 * scale, position(time)))}px`;
    }
    for (const lane of scene.lanes) {
      for (const [time, line] of lane.lines) {
        if (!activeTicks.has(time)) {
          line.remove();
          lane.lines.delete(time);
        }
      }
      for (const time of times) {
        let line = lane.lines.get(time);
        if (!line) {
          line = el('span', 'ft-grid-line');
          lane.lines.set(time, line);
          lane.track.prepend(line);
        }
        line.style.left = `${position(time)}px`;
      }
      if (repack) {
        const packed = packEvents(lane.events, this.from, this.to, scene.width, cardWidth, false);
        lane.track.style.height = `${Math.max(135, packed.reduce((rows, item) => Math.max(rows, item.row + 1), 1) * ROW_HEIGHT + 25) * scale}px`;
        packed.forEach(({ row }, index) => {
          const node = lane.nodes[index];
          node.card.style.top = `${(18 + row * ROW_HEIGHT) * scale}px`;
          node.marker.style.top = `${(12 + row * ROW_HEIGHT) * scale}px`;
          if (node.duration)
            node.duration.style.top = `${(18 + CARD_HEIGHT + 6 + row * ROW_HEIGHT) * scale}px`;
        });
      }
      for (const node of lane.nodes) {
        const { event, card, marker, duration } = node;
        const x = position(event.start);
        const end = event.end === null ? x : position(event.end);
        const labelX = event.end !== null && x < 0 && end >= 0 ? 8 * scale : x - cardWidth / 2;
        const inViewport = labelX + cardWidth >= 0 && labelX <= scene.width;
        if (node.inViewport !== inViewport) {
          card.style.visibility = marker.style.visibility = inViewport ? 'visible' : 'hidden';
          if (duration) duration.style.visibility = inViewport ? 'visible' : 'hidden';
          node.inViewport = inViewport;
        }
        if (!inViewport) continue;
        card.style.transform = `translate3d(${labelX}px, 0, 0)`;
        marker.style.transform = `translate3d(${x}px, 0, 0)`;
        if (duration) {
          duration.style.left = `${Math.max(0, x)}px`;
          duration.style.width = `${Math.max(0, Math.min(scene.width, end) - Math.max(0, x))}px`;
        }
      }
    }
    scene.outside.hidden = scene.events.some(
      (event) => (event.end ?? event.start) >= this.from && event.start <= this.to,
    );
    this.rangeLabel.textContent =
      this.formatDate(this.from) === this.formatDate(this.to)
        ? `${this.formatDate(this.from)} · ${this.formatTime(this.from)} — ${this.formatTime(this.to)}`
        : `${this.formatDate(this.from)} ${this.formatTime(this.from)} — ${this.formatDate(this.to)} ${this.formatTime(this.to)}`;
    if (this.focusPending) this.focusSelectedEvent();
    if (this.revealPending) this.revealSelectedEvent();
  }

  requestFrame(callback) {
    return requestAnimationFrame(callback);
  }
  cancelFrame(id) {
    if (id != null) cancelAnimationFrame(id);
  }
  motionReduced() {
    return (
      this.options.animationDuration === 0 ||
      (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    );
  }

  cancelNavigation() {
    this.cancelFrame(this.animationFrame);
    this.animationFrame = null;
    this.navigationTarget = null;
    this.revealPending = false;
  }
  stopMotion() {
    this.cancelNavigation();
    this.cancelFrame(this.paintFrame);
    this.paintFrame = null;
    const drag = this.drag;
    this.drag = null;
    this.focusPending = false;
    if (drag && this.content?.hasPointerCapture?.(drag.pointerId))
      this.content.releasePointerCapture(drag.pointerId);
    this.root?.classList.remove('ft-is-dragging');
  }
  queueViewportPaint() {
    if (this.paintFrame != null) return;
    this.paintFrame = this.requestFrame(() => {
      this.paintFrame = null;
      this.paintViewport();
    });
  }
  navigateTo(from, to) {
    this.cancelNavigation();
    const duration = this.options.animationDuration ?? 220;
    if (!this.timelineScene || !this.isTimelineView() || duration === 0 || this.motionReduced()) {
      this.from = from;
      this.to = to;
      if (this.timelineScene) this.paintViewport(true);
      else this.renderContent();
      return;
    }
    const startFrom = this.from,
      startTo = this.to;
    this.navigationTarget = [from, to];
    let started;
    const frame = (time) => {
      if (this.destroyed) return;
      started ??= time;
      const progress = Math.min(1, (time - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      this.from = startFrom + (from - startFrom) * eased;
      this.to = startTo + (to - startTo) * eased;
      if (progress === 1) {
        this.from = from;
        this.to = to;
        this.animationFrame = null;
        this.navigationTarget = null;
        this.paintViewport(true);
      } else {
        this.paintViewport();
        this.animationFrame = this.requestFrame(frame);
      }
    };
    this.animationFrame = this.requestFrame(frame);
  }

  attachPan() {
    const options = { signal: this.abort.signal };
    this.root.addEventListener(
      'pointerdown',
      (event) => {
        this.suppressDragClick = false;
        const track = event.target.closest('.ft-track');
        if (!track || event.button !== 0 || event.isPrimary === false) return;
        this.stopMotion();
        this.drag = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          from: this.from,
          to: this.to,
          width: track.clientWidth,
          moved: false,
        };
      },
      options,
    );
    const move = (event) => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(event.clientY - drag.y)) return;
        drag.moved = true;
        this.content.setPointerCapture(event.pointerId);
        this.root.classList.add('ft-is-dragging');
      }
      const delta = (dx / drag.width) * (drag.to - drag.from);
      this.from = drag.from - delta;
      this.to = drag.to - delta;
      this.queueViewportPaint();
    };
    this.content.addEventListener('pointermove', move, options);
    const finish = (event) => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved && event.type === 'pointerup') move(event);
      this.drag = null;
      this.suppressDragClick = drag.moved && event.type === 'pointerup';
      this.cancelFrame(this.paintFrame);
      this.paintFrame = null;
      if (drag.moved) this.paintViewport();
      this.root.classList.remove('ft-is-dragging');
      if (this.content.hasPointerCapture(event.pointerId))
        this.content.releasePointerCapture(event.pointerId);
    };
    this.content.addEventListener('pointerup', finish, options);
    this.content.addEventListener('pointercancel', finish, options);
    this.content.addEventListener('lostpointercapture', finish, options);
    this.content.addEventListener(
      'pointerleave',
      (event) => {
        if (this.drag && !this.drag.moved) finish(event);
      },
      options,
    );
    this.root.addEventListener(
      'click',
      (event) => {
        if (this.suppressDragClick && event.detail > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.suppressDragClick = false;
        }
      },
      { ...options, capture: true },
    );
    this.content.addEventListener(
      'wheel',
      (event) => {
        if (!event.target.closest('.ft-track') || (!event.ctrlKey && !event.metaKey)) return;
        event.preventDefault();
        this.zoom(event.deltaY < 0 ? 1.2 : 0.83);
      },
      { ...options, passive: false },
    );
  }

  focusSelectedEvent() {
    const card = this.content.querySelector('[data-selected="true"]');
    if (card && card.style.visibility !== 'hidden') {
      card.focus({ preventScroll: true });
      this.focusPending = false;
    } else this.focusPending = true;
  }
  revealSelectedEvent() {
    const card = this.content.querySelector('[data-selected="true"]');
    if (!card) return;
    if (this.isTimelineView() && this.navigationTarget) {
      // Wait for horizontal recentering before asking the browser to reveal the
      // card, otherwise scrollIntoView would scroll a clipped lane sideways.
      this.revealPending = true;
      return;
    }
    this.revealPending = false;
    card.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: this.motionReduced() ? 'auto' : 'smooth',
    });
  }

  eventButton(event, className) {
    const node = button('', className, () => this.select(event.id), event.title, false);
    node.dataset.eventId = event.id;
    node.dataset.selected = String(event.id === this.selectedId);
    node.setAttribute('aria-pressed', String(event.id === this.selectedId));
    node.style.setProperty('--ft-group', this.safeColor(this.groupFor(event)?.color));
    return node;
  }

  renderFeed() {
    const feed = el('div', 'ft-feed');
    let currentDate = '';
    for (const event of this.visibleEvents) {
      const date = this.formatDate(event.start);
      if (date !== currentDate) {
        feed.append(el('h3', 'ft-feed-date', date));
        currentDate = date;
      }
      const row = this.eventButton(event, 'ft-feed-event');
      const text = el('span', 'ft-feed-text');
      text.append(el('strong', '', event.title));
      if (event.description) text.append(el('span', '', event.description));
      row.append(
        el('time', '', this.formatTime(event.start)),
        el('span', 'ft-feed-dot'),
        text,
        el('span', 'ft-feed-source', this.groupFor(event)?.label),
      );
      feed.append(row);
    }
    this.content.append(feed);
  }

  syncInspectorVisibility() {
    const open =
      this.customView()?.inspector !== false &&
      this.selectedId !== null &&
      this.visibleEvents.some((event) => event.id === this.selectedId);
    const state = open ? 'open' : 'closed';
    const changed = this.workspace.dataset.inspector !== state;
    this.workspace.dataset.inspector = state;
    this.details.hidden = !open;
    return changed;
  }

  clearSelection() {
    if (this.selectedId === null) return;
    const previousId = this.selectedId;
    const previousEvent = this.events.find((event) => event.id === previousId) ?? null;
    const restoreFocus =
      this.details.contains?.(
        this.root?.getRootNode?.()?.activeElement ?? this.root?.ownerDocument?.activeElement,
      ) ?? false;
    this.selectedId = null;
    this.stopMotion();
    this.syncInspectorVisibility();
    this.renderContent();
    this.renderDetails();
    if (restoreFocus) {
      const previousCard = [...this.content.querySelectorAll('[data-event-id]')].find(
        (node) => node.dataset.eventId === previousId && node.style.visibility !== 'hidden',
      );
      (previousCard ?? this.content).focus({ preventScroll: true });
    }
    this.renderToolbarActions();
    this.emit('deselect', { event: previousEvent });
  }

  renderDetails() {
    this.details.replaceChildren();
    const event = this.visibleEvents.find((item) => item.id === this.selectedId);
    this.syncInspectorVisibility();
    if (!event || this.customView()?.inspector === false) return;
    const header = el('div', 'ft-detail-header');
    header.append(
      el('div', 'ft-detail-kicker', 'EVENT INSPECTOR'),
      button('×', 'ft-close-inspector', () => this.clearSelection(), this.s('flowtimeClose')),
    );
    this.details.append(header);
    const group = this.groupFor(event);
    const badge = el(
      'div',
      'ft-detail-badge',
      `${group?.icon || '•'}  ${group?.label || event.group}`,
    );
    badge.style.setProperty('--ft-group', this.safeColor(group?.color));
    this.details.append(badge, el('h3', '', event.title));
    const date = el('div', 'ft-detail-date');
    date.append(
      el('span', '', this.formatDate(event.start)),
      el('strong', '', `${this.formatTime(event.start)} ${this.options.timeZone}`),
    );
    if (event.end !== null)
      date.append(
        el(
          'small',
          '',
          this.s('flowtimeUntil', {
            date: `${this.formatDate(event.end)} · ${this.formatTime(event.end)}`,
          }),
        ),
      );
    this.details.append(date);
    const actions = el('div', 'ft-detail-actions');
    for (const [kind, label] of [
      ['Edit', this.s('flowtimeEdit')],
      ['Delete', this.s('flowtimeDelete')],
    ]) {
      if (typeof this.options[`on${kind}`] !== 'function') continue;
      const action = button(label, kind === 'Delete' ? 'ft-action-danger' : '', () =>
        this.runAction(kind, event),
      );
      action.disabled = this.pendingActions.has(event.id);
      actions.append(action);
    }
    const context = this.getActionContext(event);
    for (const action of this.options.eventActions ?? [])
      if (actionFlag(action.visible, context, true))
        actions.append(this.customActionButton(action, 'event', context));
    if (actions.childElementCount) this.details.append(actions);
    this.actionError = el('p', 'ft-action-error');
    this.actionError.setAttribute('role', 'alert');
    this.details.append(this.actionError);
    this.details.append(
      el('h4', '', this.s('flowtimeNotes')),
      el('p', 'ft-detail-description', event.description || this.s('flowtimeNoNotes')),
    );
    if (event.metadata && typeof event.metadata === 'object') {
      const entries = Object.entries(event.metadata).filter(([, value]) => value != null);
      if (entries.length) this.details.append(el('h4', '', this.s('flowtimeContext')));
      const list = el('dl', 'ft-metadata');
      for (const [key, value] of entries)
        list.append(
          el('dt', '', key),
          el('dd', '', typeof value === 'object' ? JSON.stringify(value) : String(value)),
        );
      this.details.append(list);
    }
    const index = this.visibleEvents.findIndex((item) => item.id === event.id);
    const nav = el('div', 'ft-detail-nav');
    const previous = button('← Previous', '', () =>
      this.select(this.visibleEvents[index - 1].id, { reveal: true }),
    );
    previous.disabled = index === 0;
    const next = button('Next →', '', () =>
      this.select(this.visibleEvents[index + 1].id, { reveal: true }),
    );
    next.disabled = index === this.visibleEvents.length - 1;
    nav.append(previous, next);
    this.details.append(nav);
  }

  emit(name, detail) {
    this.root.dispatchEvent(new CustomEvent(`flowtime:${name}`, { detail, bubbles: true }));
    if (name === 'select') this.options.onSelect?.(detail.event);
  }
  select(id, { reveal = false } = {}) {
    const event = this.visibleEvents.find((item) => item.id === String(id));
    if (!event) return;
    const restoreFocus =
      this.content.contains?.(
        this.root?.getRootNode?.()?.activeElement ?? this.root?.ownerDocument?.activeElement,
      ) ?? false;
    this.selectedId = event.id;
    const layoutChanged = this.syncInspectorVisibility();
    if (layoutChanged) this.renderContent();
    if (this.isTimelineView() && reveal) {
      const [from, to] = this.navigationTarget ?? [this.from, this.to];
      const span = to - from;
      const margin =
        (span * CARD_GUTTER * this.textScale) / (this.timelineScene?.width ?? 390 * this.textScale);
      if (event.start < from + margin || event.start > to - margin)
        this.navigateTo(event.start - span / 2, event.start + span / 2);
    }
    // Update in place so focused cards and screen reader position are preserved.
    for (const node of this.content.querySelectorAll('[data-event-id]')) {
      const selected = node.dataset.eventId === event.id;
      node.dataset.selected = String(selected);
      node.setAttribute('aria-pressed', String(selected));
    }
    if (reveal) this.revealSelectedEvent();
    this.renderDetails();
    if (layoutChanged && restoreFocus) this.focusSelectedEvent();
    this.renderToolbarActions();
    if (!layoutChanged) this.customViewHost?.update();
    this.emit('select', { event });
  }
  setView(view) {
    if (
      ![
        'timeline',
        'combined',
        'feed',
        ...(this.options.customViews ?? []).map((item) => item.id),
      ].includes(view)
    )
      throw new TypeError(`Unknown view: ${view}. Register custom views in customViews.`);
    this.stopMotion();
    this.view = view;
    this.render();
    this.emit('viewchange', { view });
  }
  setDateRange(dateRange = {}) {
    this.setFilter({ dateRange });
  }
  setFilter({
    query = this.query,
    groups = [...this.activeGroups],
    dateRange = this.dateRange,
  } = {}) {
    const range = normalizeDateRange(dateRange);
    this.stopMotion();
    const rangeChanged = range.start !== this.dateRange.start || range.end !== this.dateRange.end;
    this.query = String(query);
    this.search.value = this.query;
    this.activeGroups = new Set(groups.map(String));
    this.dateRange = range;
    if (!this.visibleEvents.some((event) => event.id === this.selectedId)) this.selectedId = null;
    if (rangeChanged) this.fitBounds();
    this.render();
    this.emit('filterchange', {
      query: this.query,
      groups: [...this.activeGroups],
      dateRange: { ...range },
      count: this.visibleEvents.length,
    });
  }
  getActionContext(event = this.visibleEvents.find((item) => item.id === this.selectedId) ?? null) {
    return {
      viewer: this,
      event: event ? { ...event } : null,
      events: this.getEvents(),
      visibleEvents: this.visibleEvents.map((item) => ({ ...item })),
      view: this.view,
      textScale: this.textScale,
      filter: {
        query: this.query,
        groups: [...this.activeGroups],
        dateRange: { ...this.dateRange },
      },
    };
  }
  customActionButton(action, location, context) {
    const node = button(
      '',
      `ft-custom-action ft-action-${action.variant ?? 'default'}`,
      () => this.runCustomAction(action.id, location, context.event?.id),
      action.title ?? action.label,
    );
    node.dataset.actionId = action.id;
    if (action.icon) {
      const icon = el('span', 'ft-action-icon', action.icon);
      icon.setAttribute('aria-hidden', 'true');
      node.append(icon);
    }
    node.append(el('span', '', action.label));
    node.disabled =
      (location === 'toolbar'
        ? this.pendingToolbarActions.has(action.id)
        : this.pendingActions.has(context.event.id)) || actionFlag(action.disabled, context, false);
    return node;
  }
  renderToolbarActions() {
    if (!this.actionBar) return;
    const context = this.getActionContext();
    this.actionButtons.replaceChildren();
    for (const action of this.options.actions ?? [])
      if (actionFlag(action.visible, context, true))
        this.actionButtons.append(this.customActionButton(action, 'toolbar', context));
    this.toolbarError.textContent = this.toolbarActionError;
    this.actionBar.hidden = !this.actionButtons.childElementCount && !this.toolbarActionError;
  }
  syncActionButtons() {
    const context = this.getActionContext();
    for (const node of this.actionButtons?.querySelectorAll('[data-action-id]') ?? []) {
      const action = this.options.actions.find((item) => item.id === node.dataset.actionId);
      if (action)
        node.disabled =
          this.pendingToolbarActions.has(action.id) || actionFlag(action.disabled, context, false);
    }
    for (const node of this.details.querySelectorAll('.ft-detail-actions button')) {
      const action = (this.options.eventActions ?? []).find(
        (item) => item.id === node.dataset?.actionId,
      );
      node.disabled =
        this.pendingActions.has(this.selectedId) ||
        Boolean(action && actionFlag(action.disabled, context, false));
    }
  }
  setActions({
    actions = this.options.actions ?? [],
    eventActions = this.options.eventActions ?? [],
  } = {}) {
    const toolbar = normalizeActions(actions, 'actions');
    const inspector = normalizeActions(eventActions, 'eventActions');
    this.options.actions = toolbar;
    this.options.eventActions = inspector;
    this.renderToolbarActions();
    this.renderDetails();
  }
  async runCustomAction(id, location, eventId) {
    if (this.destroyed) return;
    const action = (location === 'toolbar' ? this.options.actions : this.options.eventActions).find(
      (item) => item.id === id,
    );
    if (!action) return;
    const event =
      location === 'event' ? this.visibleEvents.find((item) => item.id === eventId) : undefined;
    if (location === 'event' && !event) return;
    const context = this.getActionContext(event);
    if (!actionFlag(action.visible, context, true) || actionFlag(action.disabled, context, false))
      return;
    const pending = location === 'toolbar' ? this.pendingToolbarActions : this.pendingActions;
    const key = location === 'toolbar' ? id : event.id;
    if (pending.has(key)) return;
    pending.add(key);
    if (location === 'toolbar') this.toolbarActionError = this.toolbarError.textContent = '';
    else this.actionError.textContent = '';
    this.syncActionButtons();
    this.emit('action', { action: id, location, context });
    try {
      await action.onClick(context);
    } catch (error) {
      if (!this.destroyed) {
        const message = `Unable to ${action.label.toLowerCase()}. Please try again.`;
        if (location === 'toolbar') {
          this.toolbarActionError = this.toolbarError.textContent = message;
          if (this.actionBar) this.actionBar.hidden = false;
        } else if (this.selectedId === event.id) this.actionError.textContent = message;
        this.emit('actionerror', {
          action: id,
          location,
          event: context.event,
          error,
        });
      }
    } finally {
      pending.delete(key);
      if (!this.destroyed) this.syncActionButtons();
    }
  }

  async runAction(kind, event) {
    if (this.pendingActions.has(event.id)) return;
    this.pendingActions.add(event.id);
    this.details.querySelectorAll('.ft-detail-actions button').forEach((node) => {
      node.disabled = true;
    });
    this.actionError.textContent = '';
    this.syncActionButtons();
    try {
      await this.options[`on${kind}`](event);
    } catch (error) {
      if (!this.destroyed && this.selectedId === event.id)
        this.actionError.textContent = `Unable to ${kind.toLowerCase()} this event. Please try again.`;
      this.emit('actionerror', { action: kind.toLowerCase(), event, error });
    } finally {
      this.pendingActions.delete(event.id);
      if (!this.destroyed) this.syncActionButtons();
    }
  }
  setEvents(events) {
    const normalized = normalizeEvents(events); // Validate atomically before replacing existing data.
    this.stopMotion();
    this.events = normalized;
    this.groups = this.resolveGroups(this.options.groups ?? DEFAULT_GROUPS);
    this.activeGroups = new Set(this.groups.map((group) => group.id));
    this.selectedId = this.visibleEvents.some((event) => event.id === this.selectedId)
      ? this.selectedId
      : null;
    this.fitBounds();
    this.customViewHost?.stop();
    this.activityFilter?.destroy();
    this.root.remove();
    this.abort.abort();
    this.observer.disconnect();
    this.abort = new AbortController();
    this.mount();
    this.search.value = this.query;
    this.render();
    this.observer.observe(this.content);
  }
  fitBounds() {
    const [from, to] = extent(this.visibleEvents);
    const width = Math.max(
      390 * this.textScale,
      (this.content?.clientWidth ?? 540 * this.textScale) - LANE_LABEL_WIDTH * this.textScale,
    );
    const gutter = (CARD_GUTTER * this.textScale) / width;
    // Reserve room for centered card labels when fitting the full dataset.
    // Explicit date bounds remain exact.
    const padding = ((to - from) * gutter) / (1 - 2 * gutter);
    this.from = this.dateRange.start ?? from - padding;
    this.to = this.dateRange.end ?? to + padding;
    if (this.to <= this.from) {
      const span = Math.max(MIN_SPAN, to - from);
      if (this.dateRange.end === null) this.to = this.from + span;
      else if (this.dateRange.start === null) this.from = this.to - span;
      else {
        this.from -= MIN_SPAN / 2;
        this.to += MIN_SPAN / 2;
      }
    }
  }
  fit() {
    const from = this.from,
      to = this.to;
    this.fitBounds();
    const target = [this.from, this.to];
    this.from = from;
    this.to = to;
    this.navigateTo(...target);
  }
  zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0)
      throw new TypeError('Zoom factor must be positive.');
    const [from, to] = this.navigationTarget ?? [this.from, this.to];
    const center = (from + to) / 2;
    const span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, (to - from) / factor));
    this.navigateTo(center - span / 2, center + span / 2);
  }
  pan(fraction) {
    if (!Number.isFinite(fraction)) throw new TypeError('Pan fraction must be finite.');
    const [from, to] = this.navigationTarget ?? [this.from, this.to];
    const delta = (to - from) * fraction;
    this.navigateTo(from + delta, to + delta);
  }
  getEvents() {
    return this.events.map((event) => ({ ...event }));
  }
  destroy() {
    this.destroyed = true;
    this.stopMotion();
    this.customViewHost?.stop();
    this.activityFilter?.destroy();
    this.abort.abort();
    this.observer.disconnect();
    this.root.remove();
  }
}
export default Flowtime;
