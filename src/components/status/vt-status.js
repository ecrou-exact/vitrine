// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import statusCss from '../../styles/status.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { getConfig } from '../../core/config.js';
import { fetchContent, isAbortError } from '../../core/content.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import {
  LIMITS,
  componentDays,
  isOpen,
  maintenancePhase,
  overallState,
  parseStatus,
  uptimePercent,
} from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').State} State */
/** @typedef {import('./model.js').StatusPage} StatusPage */
/** @typedef {import('./model.js').StatusComponent} StatusComponent */
/** @typedef {import('./model.js').StatusDay} StatusDay */
/** @typedef {import('./model.js').StatusIncident} StatusIncident */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Shortest time between two refreshes, in seconds. */
const MIN_REFRESH = 15;

/** @type {Record<State, Parameters<typeof icon>[0]>} */
const STATE_ICONS = {
  operational: 'status-success',
  degraded: 'alert',
  partial: 'alert',
  major: 'status-failure',
  maintenance: 'status-circle',
  unknown: 'status-circle',
};

/**
 * Displays the status of a service: an overall banner, components with their uptime and a bar
 * per day, open incidents with their updates, scheduled maintenance and past incidents.
 *
 * Reads its own JSON format or an Atlassian Statuspage summary (`/api/v2/summary.json`).
 * Every value is rendered with DOM text APIs, and links keep safe URL schemes only.
 *
 * @element vt-status
 * @since 0.10.0
 *
 * @attr {number} days - Days of history per component (default 90, at most 365).
 * @attr {number} refresh - Reloads `src` every N seconds (at least 15). Off by default.
 * @attr {number} max-incidents - Past incidents shown before "Show all" (default 5).
 * @attr {boolean} bars - Bars per day and uptime. Default: on.
 * @attr {boolean} incidents - Incidents and maintenance. Default: on.
 * @attr {string} now - Date used as the current time (ISO 8601 or seconds). Default: the current time.
 *
 * @prop {string} content - The JSON text.
 * @prop {StatusPage | null} page - The parsed status page (read-only), `null` when it cannot be read.
 * @prop {State | null} state - The overall state (read-only).
 *
 * @fires vt-ready - Status rendered. Detail: `{ type: "status" }`.
 * @fires vt-copy - JSON copied. Detail: `{ text }`.
 * @fires vt-status-change - The overall state changed. Detail: `{ status, previous }`.
 * @fires vt-error - Content too large, loading or refresh failure. Detail: `{ message, cause }`.
 *
 * @csspart banner - The overall state.
 * @csspart group - A group of components.
 * @csspart component - A component.
 * @csspart days - The bars of a component.
 * @csspart day - One bar.
 * @csspart uptime - The uptime of a component.
 * @csspart incident - An incident or a maintenance.
 * @csspart update - An update of an incident.
 *
 * @example
 * <vt-status variant="full" src="/status.json" refresh="60"></vt-status>
 */
export class VtStatus extends VtDataElement {
  static type = 'status';

  static componentAttributes = Object.freeze([
    'days',
    'refresh',
    'max-incidents',
    'bars',
    'incidents',
    'now',
  ]);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, statusCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {State | null} */
    this.lastState = null;
    this.stale = false;
    this.showAllIncidents = false;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.refreshTimer = undefined;
    /** @type {AbortController | null} */
    this.refreshAbort = null;
  }

  /** @type {StatusPage | null} */
  get page() {
    const result = parseStatus(this.text ?? '');
    return result.ok ? result.page : null;
  }

  /** @type {State | null} */
  get state() {
    const page = this.page;
    return page ? overallState(page, this.now) : null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.startRefresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.refreshTimer);
    this.refreshAbort?.abort();
    this.refreshAbort = null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue !== newValue && (name === 'refresh' || name === 'src') && this.isConnected)
      this.startRefresh();
  }

  /** Starts or stops the timer that reloads `src`. */
  startRefresh() {
    clearInterval(this.refreshTimer);
    const seconds = parseInteger(this.getAttribute('refresh'), {
      min: MIN_REFRESH,
      max: 86400,
      fallback: 0,
    });
    if (seconds && this.getAttribute('src')?.trim())
      this.refreshTimer = setInterval(() => this.refresh(), seconds * 1000);
  }

  /**
   * Loads `src` again without a loading state. When it fails, the last status stays on screen
   * with a notice. Pages in the background and edited content are not refreshed.
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    const src = this.getAttribute('src')?.trim();
    if (!src || this._content !== undefined || this.editing || document.hidden) return;
    this.refreshAbort?.abort();
    const controller = new AbortController();
    this.refreshAbort = controller;
    const config = getConfig();
    try {
      const text = await fetchContent(src, {
        allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
        maxSize: config.maxSize,
        timeout: config.fetchTimeout,
        signal: controller.signal,
      });
      this.stale = false;
      if (text.replace(/\r\n?/g, '\n') !== this.text) this.setText(text);
      else this.requestRender();
    } catch (error) {
      if (isAbortError(error)) return;
      this.stale = true;
      this.requestRender();
      emit(this, EVENTS.ERROR, { message: this.t('statusStale'), cause: error });
    }
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = parseStatus(this.text ?? '');
    const body = h('div', { class: 'body status-body', part: 'body' });
    let badge = 'JSON';
    if (result.ok) {
      const state = overallState(result.page, this.now);
      badge = t(/** @type {StringKey} */ (`statusState_${state}`));
      this.noteState(state);
      if (this.stale) body.append(noticeView(t('statusStale')));
      body.append(this.banner(result.page, state));
      if (this.flag('incidents')) body.append(...this.openSections(result.page));
      body.append(this.componentList(result.page));
      if (this.flag('incidents')) body.append(this.pastIncidents(result.page));
    } else {
      body.append(
        noticeView(
          result.error === 'json'
            ? t('statusInvalidJson', { message: result.message })
            : t('statusInvalidShape'),
        ),
      );
    }
    const { panel, history } = this.previewPanel(body, this.panelId);
    frame.append(
      ...this.chrome({
        badge,
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download')
            ? this.downloadButton(
                () => this.text ?? '',
                this.downloadName('status.json'),
                'application/json',
              )
            : null,
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * Tells listeners and screen readers when the overall state changes.
   *
   * @param {State} state
   */
  noteState(state) {
    const previous = this.lastState;
    this.lastState = state;
    if (previous === null || previous === state) return;
    this.announce(this.t(/** @type {StringKey} */ (`statusBanner_${state}`)));
    emit(this, EVENTS.STATUS_CHANGE, { status: state, previous });
  }

  /**
   * @param {StatusPage} page
   * @param {State} state
   * @returns {HTMLElement}
   */
  banner(page, state) {
    const t = this.t;
    const word = t(/** @type {StringKey} */ (`statusBanner_${state}`));
    return h(
      'div',
      { class: `status-banner tone-${state}`, part: 'banner' },
      icon(STATE_ICONS[state]),
      h(
        'div',
        { class: 'status-banner-text' },
        h('h3', { class: 'status-banner-title', text: word }),
        page.message ? h('p', { text: page.message }) : null,
      ),
      page.updated !== null
        ? h('time', {
            class: 'status-updated',
            text: t('statusUpdated', { relative: this.relativeTime(page.updated) }),
            attrs: { datetime: new Date(page.updated).toISOString() },
          })
        : null,
    );
  }

  /**
   * Open incidents, then maintenance in progress or to come.
   *
   * @param {StatusPage} page
   * @returns {HTMLElement[]}
   */
  openSections(page) {
    const now = this.now;
    const open = page.incidents.filter(isOpen);
    const maintenance = page.maintenances.filter((m) => maintenancePhase(m, now) !== 'past');
    return [
      open.length ? this.section('statusOpenIncidents', open) : null,
      maintenance.length ? this.section('statusMaintenance', maintenance, true) : null,
    ].filter((section) => section !== null);
  }

  /**
   * @param {StringKey} titleKey
   * @param {StatusIncident[]} incidents
   * @param {boolean} [scheduled]
   * @returns {HTMLElement}
   */
  section(titleKey, incidents, scheduled = false) {
    return h(
      'section',
      { class: 'status-section', attrs: { 'aria-label': this.t(titleKey) } },
      h('h3', { class: 'status-title', text: this.t(titleKey) }),
      ...incidents.map((incident) => this.incidentView(incident, scheduled)),
    );
  }

  /**
   * @param {StatusPage} page
   * @returns {HTMLElement}
   */
  pastIncidents(page) {
    const t = this.t;
    const past = page.incidents.filter((incident) => !isOpen(incident));
    const max = parseInteger(this.getAttribute('max-incidents'), {
      min: 0,
      max: LIMITS.incidents,
      fallback: 5,
    });
    const shown = this.showAllIncidents ? past : past.slice(0, max);
    const section = h(
      'section',
      { class: 'status-section', attrs: { 'aria-label': t('statusPastIncidents') } },
      h('h3', { class: 'status-title', text: t('statusPastIncidents') }),
      ...shown.map((incident) => this.incidentView(incident)),
    );
    if (!past.length)
      section.append(h('p', { class: 'status-none', text: t('statusNoIncidents') }));
    if (shown.length < past.length) {
      section.append(
        h('button', {
          class: 'text-btn status-more',
          text: t('statusShowAll', { count: past.length }),
          attrs: { type: 'button', 'data-focus-key': 'show-all' },
          on: {
            click: () => {
              this.showAllIncidents = true;
              this.render();
            },
          },
        }),
      );
    }
    return section;
  }

  /**
   * @param {StatusIncident} incident
   * @param {boolean} [scheduled]
   * @returns {HTMLElement}
   */
  incidentView(incident, scheduled = false) {
    const t = this.t;
    const tone = scheduled ? 'maintenance' : isOpen(incident) ? incident.impact : 'resolved';
    const facts = this.incidentFacts(incident, scheduled);
    return h(
      'article',
      { class: `status-incident tone-${tone}`, part: 'incident' },
      h(
        'div',
        { class: 'status-incident-head' },
        h('h4', { text: incident.title }),
        incident.state ? h('span', { class: 'status-tag', text: readable(incident.state) }) : null,
      ),
      facts.length ? h('p', { class: 'status-facts', text: facts.join(' · ') }) : null,
      incident.components.length
        ? h('p', {
            class: 'status-facts',
            text: t('statusAffected', { names: incident.components.join(', ') }),
          })
        : null,
      incident.updates.length
        ? h('ol', { class: 'status-updates' }, ...incident.updates.map((u) => this.updateView(u)))
        : null,
      incident.url ? link(incident.url, t('statusDetails'), 'status-link') : null,
    );
  }

  /**
   * @param {StatusIncident} incident
   * @param {boolean} scheduled
   * @returns {string[]}
   */
  incidentFacts(incident, scheduled) {
    const t = this.t;
    /** @type {string[]} */
    const facts = [];
    if (incident.start !== null) {
      const date = this.formatDate(incident.start);
      facts.push(scheduled ? t('statusStarts', { date }) : date);
    }
    if (incident.end !== null) {
      const date = this.formatDate(incident.end);
      facts.push(t(scheduled ? 'statusEnds' : 'statusResolvedAt', { date }));
    }
    return facts;
  }

  /**
   * @param {import('./model.js').StatusUpdate} update
   * @returns {HTMLElement}
   */
  updateView(update) {
    return h(
      'li',
      { class: 'status-update', part: 'update' },
      h(
        'div',
        { class: 'status-update-head' },
        update.state ? h('strong', { text: readable(update.state) }) : null,
        update.time !== null
          ? h('time', {
              text: this.formatDate(update.time),
              attrs: { datetime: new Date(update.time).toISOString() },
            })
          : null,
      ),
      update.text ? h('p', { text: update.text }) : null,
    );
  }

  /**
   * Components, in their groups.
   *
   * @param {StatusPage} page
   * @returns {HTMLElement}
   */
  componentList(page) {
    /** @type {Map<string, StatusComponent[]>} */
    const groups = new Map();
    for (const component of page.components) {
      const list = groups.get(component.group);
      if (list) list.push(component);
      else groups.set(component.group, [component]);
    }
    let index = 0;
    const section = h('section', {
      class: 'status-section',
      attrs: { 'aria-label': this.t('statusComponents') },
    });
    for (const [group, components] of groups) {
      section.append(
        h(
          'div',
          { class: 'status-group', part: 'group' },
          group ? h('h3', { class: 'status-title', text: group }) : null,
          h(
            'ul',
            { class: 'status-components' },
            ...components.map((component) => this.componentView(component, index++)),
          ),
        ),
      );
    }
    return section;
  }

  /**
   * @param {StatusComponent} component
   * @param {number} index
   * @returns {HTMLElement}
   */
  componentView(component, index) {
    const count = parseInteger(this.getAttribute('days'), {
      min: 1,
      max: LIMITS.days,
      fallback: 90,
    });
    const showBars = this.flag('bars');
    return h(
      'li',
      { class: 'status-component', part: 'component' },
      h(
        'div',
        { class: 'status-component-head' },
        h(
          'div',
          { class: 'status-name' },
          component.url ? link(component.url, component.name) : h('span', { text: component.name }),
          component.description
            ? h('p', { class: 'status-description', text: component.description })
            : null,
        ),
        h(
          'span',
          { class: `status-state tone-${component.state}` },
          icon(STATE_ICONS[component.state]),
          this.t(/** @type {StringKey} */ (`statusState_${component.state}`)),
        ),
      ),
      showBars ? this.dayBars(component, componentDays(component, count, this.now), index) : null,
    );
  }

  /**
   * The bars of a component, as one stop for the keyboard: arrows move between the days and the
   * line under the bars reads the day under the pointer or the focus.
   *
   * @param {StatusComponent} component
   * @param {StatusDay[]} days
   * @param {number} index
   * @returns {HTMLElement}
   */
  dayBars(component, days, index) {
    const t = this.t;
    const uptime = uptimePercent(component, days);
    const resting = uptime === null ? '' : t('statusUptime', { percent: this.percent(uptime) });
    const info = h('span', { class: 'status-day-info', part: 'uptime', text: resting });
    let current = days.length - 1;
    const bars = h(
      'div',
      {
        class: 'status-days',
        part: 'days',
        attrs: {
          role: 'slider',
          tabindex: '0',
          'data-focus-key': `days-${index}`,
          'aria-label': t('statusHistory', { name: component.name }),
          'aria-valuemin': '0',
          'aria-valuemax': String(days.length - 1),
          'aria-valuenow': String(current),
          'aria-valuetext': this.dayText(days[current]),
        },
      },
      ...days.map((day, i) =>
        h('span', {
          class: `status-day tone-${day.state}`,
          part: 'day',
          attrs: { 'data-index': String(i) },
        }),
      ),
    );
    /** @param {number} next */
    const show = (next) => {
      current = next;
      bars.setAttribute('aria-valuenow', String(next));
      bars.setAttribute('aria-valuetext', this.dayText(days[next]));
      info.textContent = this.dayText(days[next]);
      for (const bar of bars.children) bar.classList.remove('current');
      bars.children[next].classList.add('current');
    };
    const rest = () => {
      info.textContent = resting;
      for (const bar of bars.children) bar.classList.remove('current');
    };
    bars.addEventListener('pointermove', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.dataset.index) show(Number(target.dataset.index));
    });
    bars.addEventListener('pointerleave', () => {
      if (this.root.activeElement === bars) show(current);
      else rest();
    });
    bars.addEventListener('focus', () => show(current));
    bars.addEventListener('blur', rest);
    bars.addEventListener('keydown', (event) => {
      const next = nextDay(event.key, current, days.length);
      if (next === null) return;
      event.preventDefault();
      show(next);
    });
    return h(
      'div',
      { class: 'status-history' },
      bars,
      h(
        'div',
        { class: 'status-days-foot' },
        h('span', { text: t('statusDaysAgo', { count: days.length }) }),
        info,
        h('span', { text: t('statusToday') }),
      ),
    );
  }

  /**
   * @param {StatusDay} day
   * @returns {string}
   */
  dayText(day) {
    const t = this.t;
    return [
      this.formatDate(Date.parse(`${day.date}T00:00:00Z`), {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }),
      t(/** @type {StringKey} */ (`statusState_${day.state}`)),
      day.minutes ? t('statusDowntime', { minutes: day.minutes }) : '',
      day.note,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /**
   * Two decimals, rounded down so that an outage never reads as 100%.
   *
   * @param {number} value
   * @returns {string}
   */
  percent(value) {
    const floored = Math.floor(value * 100) / 10000;
    try {
      return new Intl.NumberFormat(this.locale, {
        style: 'percent',
        maximumFractionDigits: 2,
      }).format(floored);
    } catch {
      return `${floored * 100}%`;
    }
  }
}

/**
 * @param {string} key
 * @param {number} current
 * @param {number} length
 * @returns {number | null} The day a key moves to, `null` for other keys.
 */
function nextDay(key, current, length) {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - 1);
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(length - 1, current + 1);
  if (key === 'PageDown') return Math.max(0, current - 7);
  if (key === 'PageUp') return Math.min(length - 1, current + 7);
  if (key === 'Home') return 0;
  return key === 'End' ? length - 1 : null;
}

/**
 * "in_progress" as "In progress".
 *
 * @param {string} word
 * @returns {string}
 */
function readable(word) {
  const spaced = word.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * @param {string} href - Already checked with `isSafeUrl`.
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLAnchorElement}
 */
function link(href, text, className) {
  return h('a', { class: className, text, attrs: { href, rel: 'noopener noreferrer' } });
}
