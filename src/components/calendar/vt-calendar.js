// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import calendarCss from '../../styles/calendar.css?raw';
import { cleanFileName, parseEnum, parseInteger } from '../../core/attributes.js';
import { downloadText } from '../../core/actions.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, iconButton, noticeView } from '../../core/ui.js';
import { daysInMonth, isTimeZone, localTimeZone } from '../cron/cron.js';
import { LIMITS, parseCalendar, toIcs, utcDate } from './ics.js';
import { dayNumber, dayOf, fromDayNumber, occurrences, weekdayOf } from './recur.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./ics.js').Calendar} Calendar */
/** @typedef {import('./ics.js').CalendarEvent} CalendarEvent */
/** @typedef {import('./ics.js').CalendarResult} CalendarResult */
/** @typedef {import('./recur.js').Occurrence} Occurrence */

const VIEWS = /** @type {const} */ (['month', 'agenda']);
const DAY_MS = 864e5;
/** Days of events the agenda looks ahead. */
const AGENDA_DAYS = 366;

/**
 * Displays events from an iCalendar file or JSON, as a month grid or an agenda.
 *
 * Recurring events are expanded (`RRULE`, `EXDATE`, `RECURRENCE-ID`), times are shown in the
 * time zone of the reader or of the `timezone` attribute, and each event can be added to the
 * calendar of the reader as an `.ics` file. Text from the source is rendered with DOM text
 * APIs, and links keep safe URL schemes only.
 *
 * @element vt-calendar
 * @since 0.10.0
 *
 * @attr {"month"|"agenda"} view - The first view (default `month`).
 * @attr {string} date - The first date shown, `YYYY-MM` or `YYYY-MM-DD`. Default: today.
 * @attr {string} timezone - Time zone of the times shown. Default: the one of the reader.
 * @attr {number} first-day - First day of the week, 0 (Sunday) to 6. Default: from the language.
 * @attr {number} max-per-day - Events written in a day of the grid (default 3).
 * @attr {number} limit - Events listed by the agenda before "Show more" (default 20).
 * @attr {boolean} views - Month / Agenda tabs. Full variant: on.
 * @attr {boolean} add-to-calendar - "Add to calendar" on each event. Default: on.
 * @attr {string} now - Date used as today (ISO 8601 or seconds). Default: the current time.
 *
 * @prop {string} content - The iCalendar or JSON text.
 * @prop {Calendar | null} calendar - The parsed calendar (read-only), `null` when it cannot be read.
 *
 * @fires vt-ready - Calendar rendered. Detail: `{ type: "calendar" }`.
 * @fires vt-copy - Source copied. Detail: `{ text }`.
 * @fires vt-tab-change - The view changed. Detail: `{ tab }`.
 * @fires vt-date-change - The period shown changed. Detail: `{ date, view }`.
 * @fires vt-event-select - An event was opened. Detail: `{ uid, title, start, end, allDay, url }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart nav - The bar with the period and its buttons.
 * @csspart period - The name of the period.
 * @csspart grid - The month grid.
 * @csspart day - A day of the grid.
 * @csspart chip - An event in a day of the grid.
 * @csspart agenda - The list of days of the agenda or of the selected day.
 * @csspart event - An event in a list.
 * @csspart event-details - The details of an open event.
 *
 * @example
 * <vt-calendar variant="full" src="/events.ics" timezone="Europe/Paris"></vt-calendar>
 */
export class VtCalendar extends VtDataElement {
  static type = 'calendar';

  static editorLanguage = 'plaintext';

  static componentAttributes = Object.freeze([
    'view',
    'date',
    'timezone',
    'first-day',
    'max-per-day',
    'limit',
    'views',
    'add-to-calendar',
    'now',
  ]);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, views: true },
  };

  static styles = [syntaxCss, codeCss, calendarCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {'month' | 'agenda' | null} View chosen with the tabs; `null` follows `view`. */
    this.viewState = null;
    /** @type {number | null} Day number of the period shown; `null` follows `date`. */
    this.anchor = null;
    /** @type {number | null} */
    this.selectedDay = null;
    /** @type {number | null} */
    this.focusDay = null;
    /** @type {string | null} */
    this.openId = null;
    this.agendaLimit = 0;
    /** @type {{ text: string, result: CalendarResult } | null} */
    this.parsed = null;
  }

  contentChanged() {
    // Occurrence ids depend on the position of the event in the source.
    this.openId = null;
    this.agendaLimit = 0;
  }

  /** @returns {CalendarResult} The parsed source, kept while the text stays the same. */
  get result() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseCalendar(text) };
    return this.parsed.result;
  }

  /** @type {Calendar | null} */
  get calendar() {
    const result = this.result;
    return result.ok ? result.calendar : null;
  }

  /** @returns {'month' | 'agenda'} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'month');
  }

  /** @returns {string} The time zone of the times shown. */
  get timeZone() {
    const value = this.getAttribute('timezone')?.trim();
    return value && isTimeZone(value) ? value : localTimeZone();
  }

  /** @returns {number} Today, as a day number. */
  get today() {
    return dayOf(this.now, this.timeZone);
  }

  /** @returns {number} First day of the week, 0 (Sunday) to 6. */
  get firstDay() {
    const fixed = parseInteger(this.getAttribute('first-day'), { min: 0, max: 6, fallback: -1 });
    if (fixed >= 0) return fixed;
    try {
      /** @type {any} */
      const locale = new Intl.Locale(this.locale);
      const info = locale.getWeekInfo?.() ?? locale.weekInfo;
      return info ? info.firstDay % 7 : 1;
    } catch {
      return 1;
    }
  }

  /** @returns {number} The day the period shown starts from. */
  get anchorDay() {
    return this.anchor ?? readDate(this.getAttribute('date')) ?? this.today;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'date' && oldValue !== newValue) this.anchor = null;
    if (name === 'view' && oldValue !== newValue) this.viewState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /**
   * Shows the period of a date.
   *
   * @param {string} date - `YYYY-MM` or `YYYY-MM-DD`.
   */
  goTo(date) {
    const day = readDate(date);
    if (day !== null) this.moveTo(day);
  }

  /**
   * @param {number} day
   */
  moveTo(day) {
    this.anchor = day;
    this.agendaLimit = 0;
    this.render();
    const { year, month } = fromDayNumber(day);
    emit(this, EVENTS.DATE_CHANGE, {
      date: `${year}-${String(month).padStart(2, '0')}`,
      view: this.view,
    });
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.result;
    const body = h('div', { class: 'body calendar-body', part: 'body' });
    if (result.ok) {
      const { calendar } = result;
      if (calendar.skipped)
        body.append(noticeView(t('calendarSkipped', { count: calendar.skipped })));
      body.append(this.navBar());
      if (this.view === 'month') body.append(...this.monthView(calendar));
      else body.append(this.agendaView(calendar));
      if (calendar.events.some((event) => !event.start.allDay))
        body.append(
          h('p', {
            class: 'calendar-zone',
            text: t('calendarTimeZone', { zone: this.timeZone.replace(/_/g, ' ') }),
          }),
        );
    } else {
      body.append(
        noticeView(
          result.error === 'json'
            ? t('calendarInvalidJson', { message: result.message })
            : t('calendarInvalidFormat'),
        ),
      );
    }
    const { panel, history } = this.previewPanel(body, this.panelId);
    frame.append(...this.chrome(this.chromeOptions(result, history)), panel);
    this.editor?.align();
  }

  /**
   * @param {CalendarResult} result
   * @param {HTMLButtonElement[]} history
   * @returns {Parameters<VtDataElement['chrome']>[0]}
   */
  chromeOptions(result, history) {
    const t = this.t;
    const calendar = result.ok ? result.calendar : null;
    return {
      badge: calendar?.format === 'ics' ? 'ICS' : 'JSON',
      tabs:
        calendar && this.feature('views')
          ? createTabs({
              tabs: [
                { id: 'month', label: t('calendarMonth') },
                { id: 'agenda', label: t('calendarAgenda') },
              ],
              selected: this.view,
              label: t('calendarViews'),
              panelId: this.panelId,
              onSelect: (id) => this.setView(/** @type {'month' | 'agenda'} */ (id)),
            })
          : null,
      actions: [
        ...history,
        this.editToggleButton(),
        this.fullscreenButton(),
        this.feature('download') && calendar
          ? this.downloadButton(
              () => this.icsText(calendar),
              this.downloadName('calendar.ics'),
              'text/calendar',
            )
          : null,
        this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
      ],
    };
  }

  /**
   * @param {Calendar} calendar
   * @returns {string} The file to download: the source when it is iCalendar.
   */
  icsText(calendar) {
    return calendar.format === 'ics' ? (this.text ?? '') : toIcs(calendar.events, Date.now());
  }

  /**
   * @param {'month' | 'agenda'} view
   */
  setView(view) {
    if (view === this.view) return;
    this.viewState = view;
    this.render();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="tab-${view}"]`)
    )?.focus();
  }

  // ---------------------------------------------------------------- navigation

  /** @returns {HTMLElement} The period and the buttons that change it. */
  navBar() {
    const t = this.t;
    return h(
      'div',
      { class: 'calendar-nav', part: 'nav' },
      h('h3', { class: 'calendar-period', part: 'period', text: this.periodName() }),
      h(
        'div',
        { class: 'calendar-buttons' },
        h('button', {
          class: 'text-btn',
          text: t('calendarToday'),
          attrs: { type: 'button', 'data-focus-key': 'today' },
          on: {
            click: () => {
              this.focusDay = this.today;
              this.moveTo(this.today);
            },
          },
        }),
        iconButton({
          icon: 'chevron-left',
          label: t('calendarPrevious'),
          key: 'previous',
          onClick: () => this.moveTo(this.shifted(-1)),
        }),
        iconButton({
          icon: 'chevron-right',
          label: t('calendarNext'),
          key: 'next',
          onClick: () => this.moveTo(this.shifted(1)),
        }),
      ),
    );
  }

  /** @returns {string} */
  periodName() {
    const day = this.anchorDay;
    if (this.view === 'agenda') return this.t('calendarFrom', { date: this.dayName(day, 'long') });
    return this.formatDate(day * DAY_MS, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /**
   * @param {number} months
   * @returns {number} The first day of a month after or before the one shown; in the agenda,
   *   the same day of that month.
   */
  shifted(months) {
    const { year, month, day } = fromDayNumber(this.anchorDay);
    const index = year * 12 + month - 1 + months;
    const nextYear = Math.floor(index / 12);
    const nextMonth = (index % 12) + 1;
    const target = this.view === 'agenda' ? Math.min(day, daysInMonth(nextYear, nextMonth)) : 1;
    return dayNumber(nextYear, nextMonth, target);
  }

  // ---------------------------------------------------------------- month

  /**
   * @param {Calendar} calendar
   * @returns {HTMLElement[]}
   */
  monthView(calendar) {
    const t = this.t;
    const { year, month } = fromDayNumber(this.anchorDay);
    const first = dayNumber(year, month, 1);
    const last = first + daysInMonth(year, month) - 1;
    const firstDay = this.firstDay;
    const gridStart = first - ((weekdayOf(first) - firstDay + 7) % 7);
    const gridEnd = last + (6 - ((weekdayOf(last) - firstDay + 7) % 7));
    const list = occurrences(calendar.events, gridStart, gridEnd, this.timeZone);
    const inMonth = list.some((o) => o.endDay >= first && o.startDay <= last);
    return [
      this.grid(list, { first, last, gridStart, gridEnd }),
      inMonth ? null : h('p', { class: 'calendar-none', text: t('calendarNoEventsMonth') }),
      this.selectedDay !== null ? this.dayPanel(list, this.selectedDay) : null,
    ].filter((node) => node !== null);
  }

  /**
   * @param {Occurrence[]} list
   * @param {{ first: number, last: number, gridStart: number, gridEnd: number }} range
   * @returns {HTMLElement}
   */
  grid(list, { first, last, gridStart, gridEnd }) {
    const today = this.today;
    const focus = this.gridFocus(first, last, today);
    const weeks = [];
    for (let start = gridStart; start <= gridEnd; start += 7) {
      const cells = [];
      for (let day = start; day < start + 7; day++) {
        const events = list.filter((o) => o.startDay <= day && o.endDay >= day);
        cells.push(this.dayCell(day, events, { first, last, today, focus }));
      }
      weeks.push(h('tr', {}, ...cells));
    }
    return h(
      'table',
      {
        class: 'calendar-grid',
        part: 'grid',
        attrs: { role: 'grid', 'aria-label': this.periodName() },
        on: {
          click: (event) => this.gridClick(/** @type {MouseEvent} */ (event)),
          keydown: (event) => this.gridKey(/** @type {KeyboardEvent} */ (event), focus),
        },
      },
      h('thead', {}, h('tr', {}, ...this.weekdayHeads(gridStart))),
      h('tbody', {}, ...weeks),
    );
  }

  /**
   * @param {number} first
   * @param {number} last
   * @param {number} today
   * @returns {number} The day of the grid that takes the focus.
   */
  gridFocus(first, last, today) {
    for (const day of [this.focusDay, this.selectedDay, today])
      if (day !== null && day >= first && day <= last) return day;
    return first;
  }

  /**
   * @param {number} gridStart
   * @returns {HTMLElement[]}
   */
  weekdayHeads(gridStart) {
    const heads = [];
    for (let day = gridStart; day < gridStart + 7; day++) {
      const time = day * DAY_MS;
      heads.push(
        h('th', {
          text: this.formatDate(time, { weekday: 'short', timeZone: 'UTC' }),
          attrs: {
            scope: 'col',
            abbr: this.formatDate(time, { weekday: 'long', timeZone: 'UTC' }),
          },
        }),
      );
    }
    return heads;
  }

  /**
   * @param {number} day
   * @param {Occurrence[]} events
   * @param {{ first: number, last: number, today: number, focus: number }} context
   * @returns {HTMLElement}
   */
  dayCell(day, events, { first, last, today, focus }) {
    const t = this.t;
    const max = parseInteger(this.getAttribute('max-per-day'), { min: 0, max: 20, fallback: 3 });
    const classes = ['calendar-day'];
    if (day < first || day > last) classes.push('outside');
    if (day === today) classes.push('today');
    if (day === this.selectedDay) classes.push('selected');
    const count =
      events.length === 1
        ? t('calendarOneEvent')
        : events.length
          ? t('calendarEventCount', { count: events.length })
          : t('calendarNoEvents');
    const hidden = events.length - max;
    return h(
      'td',
      {
        class: classes.join(' '),
        part: 'day',
        attrs: {
          role: 'gridcell',
          tabindex: day === focus ? '0' : '-1',
          'data-day': String(day),
          'data-focus-key': `day-${day}`,
          'aria-selected': String(day === this.selectedDay),
          'aria-current': day === today ? 'date' : null,
        },
      },
      // The name comes from the content (the full date, then the events as shown), so
      // everything visible in the cell is in its name.
      h('span', {
        class: 'calendar-number',
        text: String(fromDayNumber(day).day),
        attrs: { 'aria-hidden': 'true' },
      }),
      h('span', { class: 'sr-only', text: `${this.dayName(day, 'full')}, ${count}` }),
      events.length
        ? h(
            'div',
            { class: 'calendar-chips' },
            ...events.slice(0, max).map((o) => this.chip(o, day)),
            hidden > 0
              ? h('span', { class: 'calendar-more', text: t('calendarMore', { count: hidden }) })
              : null,
          )
        : null,
    );
  }

  /**
   * @param {Occurrence} occurrence
   * @param {number} day
   * @returns {HTMLElement}
   */
  chip(occurrence, day) {
    const classes = ['calendar-chip'];
    if (occurrence.allDay) classes.push('all-day');
    if (occurrence.event.cancelled) classes.push('cancelled');
    const time =
      occurrence.allDay || occurrence.startDay !== day ? '' : this.timeText(occurrence.start);
    return h(
      'span',
      {
        class: classes.join(' '),
        part: 'chip',
        attrs: { 'data-occurrence': occurrence.id, title: occurrence.event.title },
      },
      time ? h('span', { class: 'calendar-chip-time', text: time }) : null,
      h('span', { class: 'calendar-chip-title', text: occurrence.event.title }),
    );
  }

  /**
   * @param {MouseEvent} event
   */
  gridClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const cell = /** @type {HTMLElement | null} */ (target.closest('[data-day]'));
    if (!cell) return;
    const chip = /** @type {HTMLElement | null} */ (target.closest('[data-occurrence]'));
    this.selectDay(Number(cell.dataset.day), chip?.dataset.occurrence ?? null);
  }

  /**
   * @param {KeyboardEvent} event
   * @param {number} focus
   */
  gridKey(event, focus) {
    const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-day]');
    if (!(cell instanceof HTMLElement)) return;
    const day = Number(cell.dataset.day);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDay(day, null);
      return;
    }
    const next = this.keyTarget(event.key, day);
    if (next === null) return;
    event.preventDefault();
    this.focusGridDay(next, focus);
  }

  /**
   * @param {string} key
   * @param {number} day
   * @returns {number | null}
   */
  keyTarget(key, day) {
    const position = (weekdayOf(day) - this.firstDay + 7) % 7;
    if (key === 'ArrowLeft') return day - 1;
    if (key === 'ArrowRight') return day + 1;
    if (key === 'ArrowUp') return day - 7;
    if (key === 'ArrowDown') return day + 7;
    if (key === 'Home') return day - position;
    if (key === 'End') return day + 6 - position;
    if (key === 'PageUp' || key === 'PageDown') {
      const { year, month, day: date } = fromDayNumber(day);
      const index = year * 12 + month - 1 + (key === 'PageUp' ? -1 : 1);
      const nextYear = Math.floor(index / 12);
      const nextMonth = (index % 12) + 1;
      return dayNumber(nextYear, nextMonth, Math.min(date, daysInMonth(nextYear, nextMonth)));
    }
    return null;
  }

  /**
   * Moves the focus to a day, changing the month when it is in another one.
   *
   * @param {number} day
   * @param {number} [previous]
   */
  focusGridDay(day, previous) {
    this.focusDay = day;
    const shown = fromDayNumber(this.anchorDay);
    const target = fromDayNumber(day);
    if (shown.year !== target.year || shown.month !== target.month) this.moveTo(day);
    else if (previous !== undefined) {
      this.root.querySelector(`[data-day="${previous}"]`)?.setAttribute('tabindex', '-1');
      this.root.querySelector(`[data-day="${day}"]`)?.setAttribute('tabindex', '0');
    }
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-day="${day}"]`))?.focus();
  }

  /**
   * @param {number} day
   * @param {string | null} occurrenceId - The event to open.
   */
  selectDay(day, occurrenceId) {
    this.selectedDay = day;
    this.focusDay = day;
    this.openId = occurrenceId;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-day="${day}"]`))?.focus({
      preventScroll: true,
    });
    if (occurrenceId) this.emitSelect(occurrenceId);
  }

  /**
   * @param {string} id
   */
  emitSelect(id) {
    const calendar = this.calendar;
    if (!calendar) return;
    const match = /^(\d+)-(-?\d+)$/.exec(id);
    const event = match ? calendar.events[Number(match[1])] : null;
    if (!match || !event) return;
    const day = Number(match[2]);
    const [occurrence] = occurrences([event], day - 1, day + 1, this.timeZone).filter(
      (o) => o.id === `0-${day}`,
    );
    if (!occurrence) return;
    emit(this, EVENTS.EVENT_SELECT, {
      uid: event.uid,
      title: event.title,
      start: new Date(occurrence.start).toISOString(),
      end: new Date(occurrence.end).toISOString(),
      allDay: occurrence.allDay,
      url: event.url,
    });
  }

  /**
   * The events of the selected day, under the grid.
   *
   * @param {Occurrence[]} list
   * @param {number} day
   * @returns {HTMLElement}
   */
  dayPanel(list, day) {
    const events = list.filter((o) => o.startDay <= day && o.endDay >= day);
    return h(
      'section',
      {
        class: 'calendar-list',
        part: 'agenda',
        attrs: { 'aria-label': this.dayName(day, 'full') },
      },
      h('h4', { class: 'calendar-day-title', text: this.dayName(day, 'full') }),
      events.length
        ? h('ul', { class: 'calendar-events' }, ...events.map((o) => this.eventView(o)))
        : h('p', { class: 'calendar-none', text: this.t('calendarNoEvents') }),
    );
  }

  // ---------------------------------------------------------------- agenda

  /**
   * Events from the date shown, by day.
   *
   * @param {Calendar} calendar
   * @returns {HTMLElement}
   */
  agendaView(calendar) {
    const t = this.t;
    const from = this.anchorDay;
    const base = parseInteger(this.getAttribute('limit'), {
      min: 1,
      max: LIMITS.events,
      fallback: 20,
    });
    const limit = this.agendaLimit || base;
    const list = occurrences(calendar.events, from, from + AGENDA_DAYS, this.timeZone);
    const section = h('section', { class: 'calendar-list', part: 'agenda' });
    if (!list.length) {
      section.append(h('p', { class: 'calendar-none', text: t('calendarNoEventsAhead') }));
      return section;
    }
    /** @type {Map<number, Occurrence[]>} */
    const days = new Map();
    for (const occurrence of list.slice(0, limit)) {
      const day = Math.max(occurrence.startDay, from);
      const events = days.get(day);
      if (events) events.push(occurrence);
      else days.set(day, [occurrence]);
    }
    for (const [day, events] of days) {
      section.append(
        h(
          'div',
          { class: 'calendar-agenda-day' },
          h('h4', { class: 'calendar-day-title', text: this.dayName(day, 'full') }),
          h('ul', { class: 'calendar-events' }, ...events.map((o) => this.eventView(o))),
        ),
      );
    }
    if (list.length > limit) {
      section.append(
        h('button', {
          class: 'text-btn calendar-show-more',
          text: t('calendarShowMore'),
          attrs: { type: 'button', 'data-focus-key': 'show-more' },
          on: {
            click: () => {
              this.agendaLimit = limit + base;
              this.render();
            },
          },
        }),
      );
    }
    return section;
  }

  // ---------------------------------------------------------------- events

  /**
   * @param {Occurrence} occurrence
   * @returns {HTMLElement}
   */
  eventView(occurrence) {
    const t = this.t;
    const { event, id } = occurrence;
    const open = this.openId === id;
    const detailsId = `${this.panelId}-${id}`;
    return h(
      'li',
      { class: `calendar-event${event.cancelled ? ' cancelled' : ''}`, part: 'event' },
      h(
        'button',
        {
          class: 'calendar-event-toggle',
          attrs: {
            type: 'button',
            'aria-expanded': String(open),
            'aria-controls': open ? detailsId : null,
            'data-focus-key': `event-${id}`,
          },
          on: { click: () => this.toggleEvent(id) },
        },
        h('span', { class: 'calendar-event-when', text: this.whenText(occurrence) }),
        h(
          'span',
          { class: 'calendar-event-name' },
          h('span', { class: 'calendar-event-title', text: event.title }),
          event.cancelled
            ? h('span', { class: 'calendar-tag', text: t('calendarCancelled') })
            : null,
          event.location && !open
            ? h('span', { class: 'calendar-event-place', text: event.location })
            : null,
        ),
        icon(open ? 'chevron-up' : 'chevron-down'),
      ),
      open ? this.eventDetails(occurrence, detailsId) : null,
    );
  }

  /**
   * @param {string} id
   */
  toggleEvent(id) {
    const opening = this.openId !== id;
    this.openId = opening ? id : null;
    this.render();
    if (opening) this.emitSelect(id);
  }

  /**
   * @param {Occurrence} occurrence
   * @param {string} id
   * @returns {HTMLElement}
   */
  eventDetails(occurrence, id) {
    const t = this.t;
    const { event } = occurrence;
    return h(
      'div',
      { class: 'calendar-details', part: 'event-details', attrs: { id } },
      h('p', { class: 'calendar-range', text: this.rangeText(occurrence) }),
      event.location ? h('p', { class: 'calendar-place', text: event.location }) : null,
      event.description ? h('p', { class: 'calendar-text', text: event.description }) : null,
      event.categories.length
        ? h(
            'ul',
            { class: 'calendar-categories' },
            ...event.categories.map((category) => h('li', { text: category })),
          )
        : null,
      h(
        'div',
        { class: 'calendar-actions' },
        this.flag('add-to-calendar')
          ? h('button', {
              class: 'text-btn',
              text: t('calendarAdd'),
              attrs: { type: 'button', 'data-focus-key': `add-${occurrence.id}` },
              on: { click: () => this.addToCalendar(occurrence) },
            })
          : null,
        event.url
          ? h('a', {
              class: 'calendar-link',
              text: t('calendarDetails'),
              attrs: { href: event.url, rel: 'noopener noreferrer' },
            })
          : null,
      ),
    );
  }

  /**
   * Downloads one occurrence, with its instants in UTC, as an `.ics` file.
   *
   * @param {Occurrence} occurrence
   */
  addToCalendar({ event, allDay, start, end }) {
    const single = { ...event, rule: null, excluded: [], replaces: null, duration: null };
    single.start = allDay ? { ...utcDate(start), allDay: true, zone: null } : utcDate(start);
    single.end = allDay ? { ...utcDate(end), allDay: true, zone: null } : utcDate(end);
    downloadText(
      toIcs([single], Date.now()),
      cleanFileName(`${event.title || 'event'}.ics`, 'event.ics'),
      'text/calendar',
    );
  }

  // ---------------------------------------------------------------- text

  /**
   * @param {number} day
   * @param {'long' | 'full'} style
   * @returns {string}
   */
  dayName(day, style) {
    return this.formatDate(day * DAY_MS, { dateStyle: style, timeZone: 'UTC' });
  }

  /**
   * @param {number} time
   * @returns {string}
   */
  timeText(time) {
    return this.formatDate(time, { timeStyle: 'short', timeZone: this.timeZone });
  }

  /**
   * The short time of an event in a list.
   *
   * @param {Occurrence} occurrence
   * @returns {string}
   */
  whenText(occurrence) {
    if (occurrence.allDay) return this.t('calendarAllDay');
    const start = this.timeText(occurrence.start);
    return occurrence.end > occurrence.start
      ? `${start} – ${this.timeText(occurrence.end)}`
      : start;
  }

  /**
   * The full dates of an event.
   *
   * @param {Occurrence} occurrence
   * @returns {string}
   */
  rangeText(occurrence) {
    const { startDay, endDay } = occurrence;
    if (occurrence.allDay) {
      const first = this.dayName(startDay, 'full');
      return endDay > startDay ? `${first} – ${this.dayName(endDay, 'full')}` : first;
    }
    const options = /** @type {Intl.DateTimeFormatOptions} */ ({
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: this.timeZone,
    });
    const start = this.formatDate(occurrence.start, options);
    if (occurrence.end <= occurrence.start) return start;
    return endDay > startDay
      ? `${start} – ${this.formatDate(occurrence.end, options)}`
      : `${start} – ${this.timeText(occurrence.end)}`;
  }
}

/**
 * @param {string | null} value - `YYYY-MM` or `YYYY-MM-DD`.
 * @returns {number | null} A day number.
 */
function readDate(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 1)];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return dayNumber(year, month, day);
}
