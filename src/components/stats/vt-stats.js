// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import statsCss from '../../styles/stats.css?raw';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { changeTone, parseStats, plotPoints } from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').Stat} Stat */

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 240;
const HEIGHT = 48;
const MARGIN = 5;

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 * @returns {SVGElement}
 */
function svg(tag, attrs) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}

/**
 * Displays key figures as tiles: a value, how it changed, and its history as a small line.
 *
 * A change is always written out with a word and an arrow, never shown by color alone. Every
 * value is rendered with DOM text APIs, and links keep safe URL schemes only.
 *
 * @element vt-stats
 * @since 0.11.0
 *
 * @attr {number} columns - Fixed number of columns. Default: as many as fit.
 * @attr {boolean} trend - The small line of each figure. Default: on.
 * @attr {boolean} changes - How each figure changed. Default: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The figures, as a value.
 * @prop {Stat[]} stats - The figures read (read-only).
 *
 * @fires vt-ready - Figures rendered. Detail: `{ type: "stats" }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart stat - A figure.
 * @csspart label - The name of a figure.
 * @csspart value - The value of a figure.
 * @csspart change - How a figure changed.
 * @csspart trend - The small line of a figure.
 *
 * @example
 * <vt-stats json='[{"label":"Visitors","value":48210,"previous":41200,"format":"compact"}]'></vt-stats>
 */
export class VtStats extends VtDataElement {
  static type = 'stats';

  static componentAttributes = Object.freeze(['columns', 'trend', 'changes']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, statsCss];

  constructor() {
    super();
    this.panelId = uid('panel');
  }

  /** @type {Stat[]} */
  get stats() {
    const result = parseStats(this.text ?? '');
    return result.ok ? result.stats : [];
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = parseStats(this.text ?? '');
    const body = h('div', { class: 'body data-body stats-body', part: 'body' });
    if (!result.ok) body.append(this.dataNotice(result));
    else if (!result.stats.length)
      body.append(h('p', { class: 'data-none', text: this.t('statsEmpty') }));
    else {
      const list = h(
        'ul',
        { class: 'stats-grid' },
        ...result.stats.map((stat, index) => this.statView(stat, index)),
      );
      const columns = Number(this.getAttribute('columns'));
      if (Number.isInteger(columns) && columns >= 1 && columns <= 12)
        list.style.setProperty('--_columns', String(columns));
      body.append(list);
    }
    this.frameWith(frame, body, this.panelId, { file: 'stats.json' });
  }

  /**
   * @param {Stat} stat
   * @param {number} index
   * @returns {HTMLElement}
   */
  statView(stat, index) {
    const name = h('span', { class: 'stats-label', part: 'label', text: stat.label });
    return h(
      'li',
      { class: 'stats-tile', part: 'stat' },
      stat.url ? h('a', { attrs: { href: stat.url, rel: 'noopener noreferrer' } }, name) : name,
      h('span', { class: 'stats-value', part: 'value', text: this.valueText(stat, stat.value) }),
      stat.change !== null && this.flag('changes') ? this.changeView(stat) : null,
      stat.series.length > 1 && this.flag('trend') ? this.trendView(stat, index) : null,
      stat.description ? h('p', { class: 'stats-note', text: stat.description }) : null,
    );
  }

  /**
   * @param {Stat} stat
   * @param {number | null} value
   * @returns {string}
   */
  valueText(stat, value) {
    const shown = value === null ? stat.display : this.formatValue(stat, value);
    return stat.unit ? `${shown} ${stat.unit}` : shown;
  }

  /**
   * @param {Stat} stat
   * @param {number} value
   * @returns {string}
   */
  formatValue(stat, value) {
    /** @type {Intl.NumberFormatOptions} */
    const digits = stat.digits === null ? {} : { minimumFractionDigits: stat.digits, maximumFractionDigits: stat.digits }; // prettier-ignore
    try {
      switch (stat.format) {
        case 'compact':
          return this.number(value, { notation: 'compact', maximumFractionDigits: 1, ...digits });
        case 'currency':
          return this.number(value, { style: 'currency', currency: stat.currency, ...digits });
        case 'percent':
          return this.number(value / 100, {
            style: 'percent',
            maximumFractionDigits: 1,
            ...digits,
          });
        case 'bytes':
          return this.bytes(value);
        case 'duration':
          return this.duration(value);
        default:
          return this.number(value, digits);
      }
    } catch {
      return String(value);
    }
  }

  /**
   * @param {number} value
   * @param {Intl.NumberFormatOptions} options
   * @returns {string}
   */
  number(value, options) {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  /**
   * @param {number} value
   * @returns {string}
   */
  bytes(value) {
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'];
    const size = Math.abs(value);
    const power = Math.min(
      units.length - 1,
      size < 1 ? 0 : Math.floor(Math.log(size) / Math.log(1000)),
    );
    return this.number(value / 1000 ** power, {
      style: 'unit',
      unit: units[power],
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    });
  }

  /**
   * @param {number} seconds
   * @returns {string}
   */
  duration(seconds) {
    /** @type {[string, number][]} */
    const units = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]; // prettier-ignore
    const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[3];
    return this.number(seconds / size, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    });
  }

  /**
   * @param {Stat} stat
   * @returns {HTMLElement}
   */
  changeView(stat) {
    const t = this.t;
    const change = /** @type {number} */ (stat.change);
    const tone = changeTone(change, stat.good);
    const amount = this.number(Math.abs(change) / 100, {
      style: 'percent',
      maximumFractionDigits: 1,
    });
    let words = t('statsFlat');
    if (change > 0) words = t('statsUp', { change: amount });
    else if (change < 0) words = t('statsDown', { change: amount });
    return h(
      'span',
      { class: `stats-change ${tone}`, part: 'change' },
      change ? icon(change > 0 ? 'chevron-up' : 'chevron-down') : null,
      h('span', {
        text: stat.against ? t('statsAgainst', { change: words, against: stat.against }) : words,
      }),
    );
  }

  /**
   * The history of a figure as one line, one stop for the keyboard: arrows move between the
   * points, and the line under it reads the point under the pointer or the focus.
   *
   * @param {Stat} stat
   * @param {number} index
   * @returns {HTMLElement}
   */
  trendView(stat, index) {
    const t = this.t;
    const { series } = stat;
    const points = plotPoints(series, WIDTH, HEIGHT, MARGIN);
    const read = (/** @type {number} */ i) =>
      `${series[i].label || t('statsPoint', { n: i + 1 })}: ${this.valueText(stat, series[i].value)}`;
    let current = series.length - 1;
    const line = svg('polyline', {
      class: 'stats-line',
      points: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    });
    const guide = svg('line', { class: 'stats-guide', y1: 0, y2: HEIGHT, x1: 0, x2: 0 });
    const marker = svg('circle', { class: 'stats-marker', r: 4 });
    const drawing = svg('svg', {
      class: 'stats-svg',
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      'aria-hidden': 'true',
    });
    drawing.append(guide, line, marker);
    const info = h('span', { class: 'stats-point' });
    const box = h(
      'div',
      {
        class: 'stats-trend',
        part: 'trend',
        attrs: {
          role: 'slider',
          tabindex: '0',
          'data-focus-key': `trend-${index}`,
          'aria-label': t('statsHistory', { name: stat.label }),
          'aria-valuemin': '0',
          'aria-valuemax': String(series.length - 1),
        },
      },
      drawing,
    );
    /** @param {number} i @param {boolean} [active] */
    const show = (i, active = true) => {
      current = i;
      marker.setAttribute('cx', String(points[i].x));
      marker.setAttribute('cy', String(points[i].y));
      guide.setAttribute('x1', String(points[i].x));
      guide.setAttribute('x2', String(points[i].x));
      box.classList.toggle('active', active);
      box.setAttribute('aria-valuenow', String(i));
      box.setAttribute('aria-valuetext', read(i));
      info.textContent = active ? read(i) : ' ';
    };
    show(current, false);
    box.addEventListener('pointermove', (event) => {
      const rect = box.getBoundingClientRect();
      const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 1;
      show(Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1)))));
    });
    box.addEventListener('pointerleave', () =>
      show(series.length - 1, this.root.activeElement === box),
    );
    box.addEventListener('focus', () => show(current));
    box.addEventListener('blur', () => show(series.length - 1, false));
    box.addEventListener('keydown', (event) => {
      const next = stepKey(event.key, current, series.length);
      if (next === null) return;
      event.preventDefault();
      show(next);
    });
    return h('div', { class: 'stats-history' }, box, info);
  }
}

/**
 * @param {string} key
 * @param {number} current
 * @param {number} length
 * @returns {number | null}
 */
function stepKey(key, current, length) {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - 1);
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(length - 1, current + 1);
  if (key === 'Home') return 0;
  return key === 'End' ? length - 1 : null;
}
