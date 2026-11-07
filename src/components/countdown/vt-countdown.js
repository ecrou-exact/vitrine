// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import countdownCss from '../../styles/countdown.css?raw';
import { firstText, isObject, safeLink, text, toTime } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { parseIsoDate } from '../calendar/ics.js';
import { toInstant } from '../calendar/recur.js';
import { isTimeZone } from '../cron/cron.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/**
 * @typedef {object} Countdown
 * @property {number} to - The moment, in milliseconds.
 * @property {string} title
 * @property {string} description
 * @property {string} ended - Text once it has passed.
 * @property {string | null} url
 * @property {string} cta - Text of the link.
 */

/** @type {readonly (readonly [Intl.NumberFormatOptions['unit'] & string, number])[]} */
const UNITS = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/**
 * A date; one without an offset is read in a time zone.
 *
 * @param {unknown} value
 * @param {string | null} timeZone
 * @returns {number | null}
 */
export function readMoment(value, timeZone) {
  if (typeof value === 'string' && timeZone && isTimeZone(timeZone)) {
    const date = parseIsoDate(value, timeZone);
    if (date) return toInstant(date, timeZone);
  }
  return toTime(value);
}

/**
 * Reads one countdown or a list: then the next one that has not passed is used, or the last.
 *
 * @param {string} source
 * @param {number} now
 * @param {string | null} timeZone
 * @returns {Countdown | null}
 */
export function parseCountdown(source, now, timeZone) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    data = source.trim();
  }
  /** @type {unknown[]} */
  let list = [data];
  if (Array.isArray(data)) list = data;
  else if (isObject(data) && Array.isArray(data.events)) list = data.events;
  /** @type {Countdown[]} */
  const found = [];
  for (const entry of list.slice(0, 1000)) {
    const item = isObject(entry) ? entry : { to: entry };
    const zone = text(item.timezone ?? item.timeZone, 100) || timeZone;
    const to = readMoment(item.to ?? item.date ?? item.target ?? item.start, zone);
    if (to === null) continue;
    found.push({
      to,
      title: firstText(item, ['title', 'name'], 300),
      description: text(item.description, 1000),
      ended: firstText(item, ['ended', 'expired', 'done'], 300),
      url: safeLink(item.url ?? item.href),
      cta: firstText(item, ['cta', 'action', 'link'], 100),
    });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.to - b.to);
  return found.find((item) => item.to > now) ?? found[found.length - 1];
}

/**
 * @param {number} milliseconds
 * @param {string[]} [units] - The units to use, largest first.
 * @returns {{ unit: string, value: number }[]} Time split into units; the last unit takes the rest.
 */
export function splitTime(milliseconds, units = UNITS.map(([unit]) => unit)) {
  let left = Math.max(0, Math.floor(milliseconds / 1000));
  return UNITS.filter(([unit]) => units.includes(unit)).map(([unit, size]) => {
    const value = Math.floor(left / size);
    left -= value * size;
    return { unit, value };
  });
}

/**
 * Counts down to a date: a launch, an event, the end of an offer.
 *
 * The time is written in the words of the reader's language. It is not read out every second:
 * screen readers hear it when they reach it, and when it ends.
 *
 * @element vt-countdown
 * @since 0.11.0
 *
 * @attr {string} to - The date, when there is no content (ISO 8601).
 * @attr {string} timezone - Time zone of a date written without an offset. Default: the reader's.
 * @attr {string} units - Units to show, among `days hours minutes seconds` (default all).
 * @attr {string} now - Date used as the current time; the countdown then stays still.
 *
 * @prop {string} content - The date, or JSON.
 * @prop {any} data - The countdown or a list of them, as a value.
 * @prop {Countdown | null} countdown - The countdown shown (read-only).
 * @prop {boolean} ended - Whether the date has passed (read-only).
 *
 * @fires vt-ready - Countdown rendered. Detail: `{ type: "countdown" }`.
 * @fires vt-countdown-end - The date was reached while the page was open. Detail: `{ to }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart title - The title.
 * @csspart timer - The time left.
 * @csspart unit - One unit of the time left.
 * @csspart value - The number of a unit.
 * @csspart unit-name - The name of a unit.
 * @csspart ended - The text once the date has passed.
 * @csspart action - The link.
 *
 * @example
 * <vt-countdown json='{"to":"2027-01-01T00:00:00Z","title":"Launch"}'></vt-countdown>
 */
export class VtCountdown extends VtDataElement {
  static type = 'countdown';

  static allowEmpty = true;

  static componentAttributes = Object.freeze(['to', 'timezone', 'units', 'now']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, countdownCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.timer = undefined;
    /** @type {Map<string, { value: HTMLElement, name: HTMLElement }>} */
    this.cells = new Map();
    this.wasEnded = false;
  }

  /** @returns {string | null} */
  get timeZone() {
    return this.getAttribute('timezone')?.trim() || null;
  }

  /** @type {Countdown | null} */
  get countdown() {
    const source = this.text?.trim() || this.getAttribute('to')?.trim() || '';
    return source ? parseCountdown(source, this.now, this.timeZone) : null;
  }

  /** @type {boolean} */
  get ended() {
    const countdown = this.countdown;
    return countdown !== null && countdown.to <= this.now;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.timer);
    this.timer = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.wasEnded = false;
  }

  /** @returns {string[]} */
  get units() {
    const names = (this.getAttribute('units') ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .map((name) => name.replace(/s$/, ''))
      .filter((name) => UNITS.some(([unit]) => unit === name));
    return names.length ? names : UNITS.map(([unit]) => unit);
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    clearInterval(this.timer);
    this.timer = undefined;
    const countdown = this.countdown;
    const body = h('div', { class: 'body data-body countdown-body', part: 'body' });
    if (!countdown) body.append(h('p', { class: 'data-none', text: this.t('countdownNoDate') }));
    else this.renderCountdown(body, countdown);
    this.frameWith(frame, body, this.panelId, { file: '', download: false });
  }

  /**
   * @param {HTMLElement} body
   * @param {Countdown} countdown
   */
  renderCountdown(body, countdown) {
    const t = this.t;
    const ended = countdown.to <= this.now;
    this.wasEnded = ended;
    if (countdown.title)
      body.append(h('h3', { class: 'countdown-title', part: 'title', text: countdown.title }));
    if (countdown.description)
      body.append(h('p', { class: 'countdown-text', text: countdown.description }));
    if (ended) {
      body.append(
        h('p', {
          class: 'countdown-ended',
          part: 'ended',
          text: countdown.ended || t('countdownEnded'),
        }),
      );
    } else {
      body.append(this.timerView(countdown));
      body.append(
        h('time', {
          class: 'countdown-date',
          text: t('countdownOn', {
            date: this.formatDate(countdown.to, {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: this.validZone,
            }),
          }),
          attrs: { datetime: new Date(countdown.to).toISOString() },
        }),
      );
      // A fixed `now` is for documentation and tests: nothing moves.
      if (!this.getAttribute('now')) this.timer = setInterval(() => this.tick(countdown), 1000);
    }
    if (countdown.url) {
      body.append(
        h('a', {
          class: 'countdown-action',
          part: 'action',
          text: countdown.cta || countdown.url,
          attrs: { href: countdown.url, rel: 'noopener noreferrer' },
        }),
      );
    }
  }

  /** @returns {string | undefined} */
  get validZone() {
    const zone = this.timeZone;
    return zone && isTimeZone(zone) ? zone : undefined;
  }

  /**
   * @param {Countdown} countdown
   * @returns {HTMLElement}
   */
  timerView(countdown) {
    this.cells = new Map();
    const parts = splitTime(countdown.to - this.now, this.units);
    return h(
      'div',
      {
        class: 'countdown-timer',
        part: 'timer',
        attrs: { role: 'timer', 'aria-label': this.t('countdownTime') },
      },
      ...parts.map(({ unit, value }) => {
        const number = h('span', { class: 'countdown-value', part: 'value' });
        const name = h('span', { class: 'countdown-unit', part: 'unit-name' });
        this.cells.set(unit, { value: number, name });
        this.write(unit, value);
        return h('span', { class: 'countdown-cell', part: 'unit' }, number, name);
      }),
    );
  }

  /**
   * Writes a unit with the number and the word of the reader's language.
   *
   * @param {string} unit
   * @param {number} value
   */
  write(unit, value) {
    const cell = this.cells.get(unit);
    if (!cell) return;
    let number = String(value);
    let name = unit;
    try {
      const parts = new Intl.NumberFormat(this.locale, {
        style: 'unit',
        unit,
        unitDisplay: 'long',
      }).formatToParts(value);
      number = parts.filter((part) => part.type !== 'unit' && part.type !== 'literal').map((part) => part.value).join(''); // prettier-ignore
      name = parts.find((part) => part.type === 'unit')?.value ?? unit;
    } catch {
      // The number and the English word.
    }
    if (cell.value.textContent !== number) cell.value.textContent = number;
    if (cell.name.textContent !== name) cell.name.textContent = name;
  }

  /**
   * @param {Countdown} countdown
   */
  tick(countdown) {
    const left = countdown.to - this.now;
    if (left > 0) {
      for (const { unit, value } of splitTime(left, this.units)) this.write(unit, value);
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    this.render();
    this.announce(countdown.ended || this.t('countdownEnded'));
    emit(this, EVENTS.COUNTDOWN_END, { to: new Date(countdown.to).toISOString() });
  }
}
