// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import testimonialsCss from '../../styles/testimonials.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import {
  firstText,
  initials,
  parseList,
  safeImage,
  safeLink,
  toNumber,
  toTime,
} from '../../core/data.js';

export { initials };
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { defineStrings } from '../../core/i18n.js';
import { iconButton } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/**
 * @typedef {object} Testimonial
 * @property {string} quote
 * @property {string} author
 * @property {string} role
 * @property {string | null} avatar
 * @property {number | null} rating - 0 to 5.
 * @property {string | null} url
 * @property {number | null} date
 */

const LAYOUTS = /** @type {const} */ (['grid', 'list', 'carousel']);
/** Shortest time a testimonial stays on screen, in seconds: people must have time to read it. */
const MIN_INTERVAL = 5;

/**
 * @param {string} source
 * @returns {{ ok: true, items: Testimonial[] } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseTestimonials(source) {
  const result = parseList(source, ['items', 'testimonials', 'reviews', 'quotes']);
  if (!result.ok) return result;
  /** @type {Testimonial[]} */
  const items = [];
  for (const item of result.items) {
    const quote = firstText(item, ['quote', 'text', 'review', 'content', 'body'], 4000);
    if (!quote) continue;
    const rating = toNumber(item.rating ?? item.stars);
    const company = firstText(item, ['company', 'organization'], 200);
    const role = firstText(item, ['role', 'title', 'position'], 200);
    items.push({
      quote,
      author: firstText(item, ['author', 'name'], 200),
      role: [role, company].filter(Boolean).join(', '),
      avatar: safeImage(item.avatar ?? item.image ?? item.photo),
      rating: rating === null ? null : Math.max(0, Math.min(5, rating)),
      url: safeLink(item.url ?? item.source ?? item.href),
      date: toTime(item.date),
    });
  }
  return { ok: true, items };
}

/**
 * @param {Testimonial[]} items
 * @returns {{ rating: number, count: number } | null} The average of the ratings.
 */
export function averageRating(items) {
  const ratings = items.map((item) => item.rating).filter((rating) => rating !== null);
  if (!ratings.length) return null;
  return { rating: ratings.reduce((sum, r) => sum + r, 0) / ratings.length, count: ratings.length };
}

/**
 * Displays testimonials and reviews as a grid, a list or a carousel, with ratings and their
 * average.
 *
 * A carousel only moves by itself with `interval`, stops on hover and focus, has a pause button,
 * and never moves when the reader prefers reduced motion. Every value is rendered with DOM text
 * APIs; links and images keep safe URL schemes only.
 *
 * @element vt-testimonials
 * @since 0.11.0
 *
 * @attr {"grid"|"list"|"carousel"} layout - How they are arranged (default `grid`).
 * @attr {number} interval - Seconds between two testimonials in a carousel (at least 5). Off by default.
 * @attr {boolean} summary - The average of the ratings, from two ratings on. Default: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The testimonials, as a value.
 * @prop {Testimonial[]} items - The testimonials read (read-only).
 *
 * @fires vt-ready - Testimonials rendered. Detail: `{ type: "testimonials" }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The average of the ratings.
 * @csspart item - A testimonial.
 * @csspart quote - The text of a testimonial.
 * @csspart author - Its author.
 * @csspart avatar - The picture or initials of the author.
 * @csspart rating - A rating.
 * @csspart controls - The buttons of a carousel.
 *
 * @example
 * <vt-testimonials json='[{"quote":"It just works.","author":"Ada Lovelace","rating":5}]'></vt-testimonials>
 */
export class VtTestimonials extends VtDataElement {
  static type = 'testimonials';

  static componentAttributes = Object.freeze(['layout', 'interval', 'summary']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, testimonialsCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.index = 0;
    this.playing = true;
    this.held = false;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.timer = undefined;
  }

  /** @type {Testimonial[]} */
  get items() {
    const result = parseTestimonials(this.text ?? '');
    return result.ok ? result.items : [];
  }

  /** @returns {boolean} Whether this carousel may move by itself. */
  get canPlay() {
    return (
      parseInteger(this.getAttribute('interval'), { min: MIN_INTERVAL, max: 3600, fallback: 0 }) >
        0 &&
      !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.frame.addEventListener('pointerenter', () => (this.held = true));
    this.frame.addEventListener('pointerleave', () => (this.held = false));
    this.frame.addEventListener('focusin', () => (this.held = true));
    this.frame.addEventListener('focusout', () => (this.held = false));
    this.startTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue !== newValue && this.isConnected && (name === 'interval' || name === 'layout'))
      this.startTimer();
  }

  contentChanged() {
    this.index = 0;
  }

  startTimer() {
    clearInterval(this.timer);
    const seconds = parseInteger(this.getAttribute('interval'), {
      min: MIN_INTERVAL,
      max: 3600,
      fallback: 0,
    });
    if (!seconds || !this.canPlay || this.layout !== 'carousel') return;
    this.timer = setInterval(() => {
      if (!this.playing || this.held || document.hidden) return;
      const total = this.items.length;
      if (total > 1) this.go(1, total);
    }, seconds * 1000);
  }

  /** @returns {'grid' | 'list' | 'carousel'} */
  get layout() {
    return parseEnum(this.getAttribute('layout'), LAYOUTS, 'grid');
  }

  /**
   * @param {number} step
   * @param {number} total
   */
  go(step, total) {
    this.index = (this.index + step + total) % total;
    this.render();
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = parseTestimonials(this.text ?? '');
    const body = h('div', { class: 'body data-body testimonials-body', part: 'body' });
    if (!result.ok) body.append(this.dataNotice(result));
    else if (!result.items.length)
      body.append(h('p', { class: 'data-none', text: this.t('testimonialsEmpty') }));
    else this.renderItems(body, result.items);
    this.frameWith(frame, body, this.panelId, { file: 'testimonials.json' });
  }

  /**
   * @param {HTMLElement} body
   * @param {Testimonial[]} items
   */
  renderItems(body, items) {
    const average = averageRating(items);
    if (average && average.count > 1 && this.flag('summary'))
      body.append(this.summaryView(average));
    if (this.layout === 'carousel') body.append(this.carousel(items));
    else
      body.append(
        h(
          'ul',
          { class: `testimonials-list ${this.layout}` },
          ...items.map((item) => h('li', {}, this.itemView(item))),
        ),
      );
  }

  /**
   * @param {{ rating: number, count: number }} average
   * @returns {HTMLElement}
   */
  summaryView({ rating, count }) {
    const rounded = this.oneDecimal(rating);
    return h(
      'p',
      { class: 'testimonials-summary', part: 'summary' },
      this.stars(rating),
      h('span', { text: this.t('testimonialsSummary', { rating: rounded, count }) }),
    );
  }

  /**
   * @param {number} value
   * @returns {string}
   */
  oneDecimal(value) {
    try {
      return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 1 }).format(value);
    } catch {
      return value.toFixed(1);
    }
  }

  /**
   * Five stars filled up to a rating, drawn twice: the fill is clipped to its share.
   *
   * @param {number} rating
   * @returns {HTMLElement}
   */
  stars(rating) {
    const fill = h('span', { class: 'testimonials-fill', text: '★★★★★' });
    fill.style.setProperty('--_value', `${(rating / 5) * 100}%`);
    return h(
      'span',
      {
        class: 'testimonials-stars',
        part: 'rating',
        attrs: {
          role: 'img',
          'aria-label': this.t('testimonialsRating', { rating: this.oneDecimal(rating) }),
        },
      },
      h('span', { class: 'testimonials-empty', text: '★★★★★' }),
      fill,
    );
  }

  /**
   * @param {Testimonial} item
   * @returns {HTMLElement}
   */
  itemView(item) {
    const t = this.t;
    return h(
      'figure',
      { class: 'testimonials-item', part: 'item' },
      item.rating !== null ? this.stars(item.rating) : null,
      h('blockquote', { class: 'testimonials-quote', part: 'quote', text: item.quote }),
      h(
        'figcaption',
        { class: 'testimonials-author', part: 'author' },
        item.author || item.avatar ? this.avatarView(item) : null,
        h(
          'span',
          { class: 'testimonials-who' },
          item.author ? h('strong', { text: item.author }) : null,
          item.role ? h('span', { text: item.role }) : null,
          item.date !== null
            ? h('time', {
                text: this.formatDate(item.date, { dateStyle: 'medium' }),
                attrs: { datetime: new Date(item.date).toISOString() },
              })
            : null,
          item.url
            ? h('a', {
                text: t('testimonialsSource'),
                attrs: { href: item.url, rel: 'noopener noreferrer' },
              })
            : null,
        ),
      ),
    );
  }

  /**
   * @param {Testimonial} item
   * @returns {HTMLElement}
   */
  avatarView(item) {
    const fallback = () =>
      h('span', {
        class: 'testimonials-avatar',
        part: 'avatar',
        text: initials(item.author),
        attrs: { 'aria-hidden': 'true' },
      });
    if (!item.avatar) return fallback();
    const image = h('img', {
      class: 'testimonials-avatar',
      part: 'avatar',
      attrs: {
        src: item.avatar,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
      },
      on: { error: () => image.replaceWith(fallback()) },
    });
    return image;
  }

  /**
   * One testimonial at a time, with the buttons that change it.
   *
   * @param {Testimonial[]} items
   * @returns {HTMLElement}
   */
  carousel(items) {
    const t = this.t;
    const total = items.length;
    const index = Math.min(this.index, total - 1);
    const moving = this.canPlay && total > 1;
    return h(
      'section',
      {
        class: 'testimonials-carousel',
        attrs: { 'aria-roledescription': 'carousel', 'aria-label': t('testimonialsCarousel') },
      },
      h(
        'div',
        {
          class: 'testimonials-slide',
          // A slide that changes by itself is not read out over what the reader is doing.
          attrs: { 'aria-live': moving && this.playing ? 'off' : 'polite' },
        },
        this.itemView(items[index]),
      ),
      total > 1
        ? h(
            'div',
            { class: 'testimonials-controls', part: 'controls' },
            iconButton({
              icon: 'chevron-left',
              label: t('testimonialsPrevious'),
              key: 'previous',
              onClick: () => this.go(-1, total),
            }),
            h('span', {
              class: 'testimonials-position',
              text: t('testimonialsPosition', { n: index + 1, total }),
            }),
            iconButton({
              icon: 'chevron-right',
              label: t('testimonialsNext'),
              key: 'next',
              onClick: () => this.go(1, total),
            }),
            moving
              ? h('button', {
                  class: 'text-btn',
                  text: t(this.playing ? 'testimonialsPause' : 'testimonialsPlay'),
                  attrs: { type: 'button', 'data-focus-key': 'play' },
                  on: {
                    click: () => {
                      this.playing = !this.playing;
                      this.render();
                    },
                  },
                })
              : null,
          )
        : null,
    );
  }
}
