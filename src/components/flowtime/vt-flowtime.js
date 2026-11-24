// @ts-check
import { VtBase } from '../../core/base-element.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { parseBoolean } from '../../core/attributes.js';
import { Flowtime } from './engine/flowtime.js';
import flowtimeCss from './engine/flowtime.css?raw';
import componentCss from '../../styles/flowtime.css?raw';

/** @typedef {import('./engine/flowtime.js').FlowtimeOptions} FlowtimeOptions */
/** @typedef {import('./engine/flowtime.js').TimelineEvent} TimelineEvent */
/** @typedef {import('./engine/flowtime.js').Group} Group */

/**
 * Investigation workspace with source lanes, a combined timeline, a chronological
 * feed, activity filtering and an event inspector. The host owns writes and custom views.
 *
 * @element vt-flowtime
 * @since 0.15.0
 * @attr {"timeline"|"combined"|"feed"} view - Initial view (default timeline).
 * @attr {string} time-zone - Display time zone (default UTC).
 * @attr {number} text-scale - Timeline text multiplier, 0.5–1.5 (default 1).
 * @attr {boolean} text-size-control - Show timeline text controls (default true).
 * @prop {FlowtimeOptions} options - Events, groups, actions, callbacks and custom views. Functions are assigned as properties.
 * @prop {Flowtime|null} viewer - Mounted viewer API; null while disconnected, loading or in error.
 * @fires vt-select - An event was selected. Detail: `{ event }`.
 * @fires vt-deselect - The inspector was dismissed. Detail: `{ event }`.
 * @fires vt-tab-change - The view changed. Detail: `{ view }`.
 * @fires vt-filter-change - Search, groups or activity range changed.
 * @fires vt-text-scale-change - Timeline text size changed. Detail: `{ textScale }`.
 * @csspart workspace - The investigation viewer.
 * @csspart timeline - The timeline or feed content.
 * @csspart inspector - The selected event inspector.
 * @csspart toolbar - View switcher and search.
 * @csspart controls - Time navigation and timeline text size.
 * @example
 * <vt-flowtime src="/events.json" view="combined"></vt-flowtime>
 */
export class VtFlowtime extends VtBase {
  static type = 'flowtime';
  static allowEmpty = true;
  static componentAttributes = Object.freeze([
    'view',
    'time-zone',
    'text-scale',
    'text-size-control',
  ]);
  static upgradeProperties = [...VtBase.upgradeProperties, 'options'];
  static presets = { simple: {}, full: { header: true, dot: true, fullscreen: true } };
  static styles = [flowtimeCss, componentCss];

  constructor() {
    super();
    /** @type {FlowtimeOptions} */
    this._options = {};
    /** @type {Flowtime | null} */
    this._viewer = null;
    /** @type {string | null} */
    this._settings = null;
    /** @type {string | null} */
    this._lastText = null;
    this._revision = 0;
    this._viewerError = false;
    this.mountPoint = h('div', { part: 'workspace' });
    this.bindViewerEvents();
  }

  /** @returns {FlowtimeOptions} A shallow copy of the host configuration. */
  get options() {
    return { ...this._options };
  }

  /** @param {FlowtimeOptions} value Host callbacks and custom views stay as functions. */
  set options(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Flowtime options must be an object.');
    this.clearViewerError();
    this._options = { ...value };
    this._revision++;
    this.requestRender();
  }

  /** @returns {Flowtime | null} The live viewer, without creating another instance. */
  get viewer() {
    return this._viewer;
  }

  /** Release observers, animation frames, pending actions and custom renderers. */
  disconnectedCallback() {
    this.destroyViewer();
    super.disconnectedCallback();
  }

  /** Keep the viewer stable during ordinary theme/header changes. */
  render() {
    if (this.loading || this.error) this.destroyViewer();
    super.render();
  }

  /** @param {HTMLElement} frame Vitrine owns the shell, Flowtime owns its workspace. */
  renderContent(frame) {
    frame.append(...this.chrome(null), this.mountPoint);
    try {
      const options = this.viewerOptions();
      const settings = JSON.stringify([
        options.groups,
        this._revision,
        this.getAttribute('view'),
        this.getAttribute('time-zone'),
        this.getAttribute('text-scale'),
        this.getAttribute('text-size-control'),
        this.locale,
      ]);
      if (!this._viewer || settings !== this._settings) {
        this.destroyViewer();
        this._viewer = new Flowtime(this.mountPoint, options);
        this._settings = settings;
      } else if (this.text !== this._lastText) {
        this._viewer.setEvents(options.events ?? []);
      }
      this._viewerError = false;
      this._lastText = this.text;
      this.setViewerParts();
    } catch (error) {
      this.destroyViewer();
      this._viewerError = true;
      this.setError(error);
    }
  }

  /**
   * Retry component validation when the host corrects an invalid attribute.
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && VtFlowtime.componentAttributes.includes(name))
      this.clearViewerError();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** Only configuration errors are cleared; failed content loads keep their error. */
  clearViewerError() {
    if (this._viewerError) this.error = null;
    this._viewerError = false;
  }

  /** @returns {FlowtimeOptions} JSON can provide data; only the host supplies callbacks. */
  viewerOptions() {
    const input = this.text?.trim() ? JSON.parse(this.text) : [];
    if (!Array.isArray(input) && (!input || !Array.isArray(input.events)))
      throw new TypeError('Expected an event array or { events: [], groups?: [] }.');
    const view = this.getAttribute('view');
    const scale = this.getAttribute('text-scale');
    return {
      events: Array.isArray(input) ? input : input.events,
      ...(Array.isArray(input.groups) ? { groups: input.groups } : {}),
      locale: this.locale,
      label: this.heading || 'Investigation timeline',
      ...this._options,
      ...(view ? { view } : {}),
      ...(this.hasAttribute('time-zone')
        ? { timeZone: this.getAttribute('time-zone') || 'UTC' }
        : {}),
      ...(scale !== null ? { textScale: Number(scale) } : {}),
      ...(this.hasAttribute('text-size-control')
        ? { showTextScaleControl: parseBoolean(this.getAttribute('text-size-control')) !== false }
        : {}),
    };
  }

  /** Translate shadow-local engine events into composed Vitrine events. */
  bindViewerEvents() {
    for (const [source, target] of Object.entries({
      select: EVENTS.SELECT,
      deselect: 'vt-deselect',
      viewchange: EVENTS.TAB_CHANGE,
      filterchange: EVENTS.FILTER_CHANGE,
      textscalechange: 'vt-text-scale-change',
    })) {
      this.mountPoint.addEventListener(`flowtime:${source}`, (event) => {
        emit(this, target, /** @type {CustomEvent} */ (event).detail);
      });
    }
    for (const name of ['actionerror', 'viewerror']) {
      this.mountPoint.addEventListener(`flowtime:${name}`, (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        emit(this, EVENTS.ERROR, {
          ...detail,
          message: String(detail.error?.message || 'Viewer action failed'),
        });
      });
    }
  }

  /** Public style hooks survive dataset refreshes, which replace the engine root. */
  setViewerParts() {
    for (const [selector, part] of [
      ['.ft-content', 'timeline'],
      ['.ft-details', 'inspector'],
      ['.ft-toolbar', 'toolbar'],
      ['.ft-footer', 'controls'],
    ])
      this.mountPoint.querySelector(selector)?.setAttribute('part', part);
  }

  /** Stop the old renderer before reconnecting or changing structural options. */
  destroyViewer() {
    this._viewer?.destroy();
    this._viewer = null;
    this._settings = null;
    this._lastText = null;
  }
}
