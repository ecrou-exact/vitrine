// @ts-check
import mapCss from '../../styles/map.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { iconButton, loadingView, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { codeOfShape, countryName, findCountry, flag } from './countries.js';
import { distanceKm, formatCoords, geocoderUrl, readGeocoder, readInput, readPlace } from './map.js'; // prettier-ignore
import { loadGeo } from './geo-loader.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {import('./map.js').Item} Item */
/** @typedef {import('./map.js').Place} Place */
/** @typedef {import('./map.js').LatLon} LatLon */
/** @typedef {import('./countries.js').CountryCode} CountryCode */

const SVG = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 540;
const MAX_ZOOM = 60;
const MAX_GEOCODE = 25;

/** Projections, in the order of the menu. Azimuthal ones turn like a globe. */
export const PROJECTIONS = /** @type {const} */ ([
  'natural-earth', 'equal-earth', 'mercator', 'equirectangular', 'globe', 'azimuthal-equal-area',
  'azimuthal-equidistant', 'stereographic', 'gnomonic', 'transverse-mercator', 'conic-equal-area', 'conic-conformal',
]); // prettier-ignore
const AZIMUTHAL = new Set(['globe', 'azimuthal-equal-area', 'azimuthal-equidistant', 'stereographic', 'gnomonic']); // prettier-ignore
/** How far from the centre each azimuthal projection shows, in degrees. */
const CLIP = /** @type {Record<string, number>} */ ({ globe: 90, stereographic: 120, gnomonic: 60, 'azimuthal-equal-area': 179.9, 'azimuthal-equidistant': 179.9 }); // prettier-ignore

/** Color schemes of the base map. `satellite` colors land by climate, as seen from the sky. */
export const BASEMAPS = /** @type {const} */ (['light', 'dark', 'political', 'satellite', 'night', 'blueprint', 'vintage', 'mono']); // prettier-ignore

/** Latitude of the centre of each shape, for its climate. */
const latitudes = new WeakMap();

/** Geocoded addresses, shared by every map of the page. */
const geocoded = new Map();

/**
 * @param {string} tag
 * @param {Record<string, string | number | null>} [attrs]
 * @returns {SVGElement}
 */
function s(tag, attrs = {}) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG, tag));
  for (const [k, v] of Object.entries(attrs)) if (v !== null) el.setAttribute(k, String(v));
  return el;
}

/**
 * A world map: places as pins (coordinates in any common notation, cities, addresses
 * through a geocoder the page chooses), countries highlighted with a color or shaded by a
 * value, routes along great circles, and GeoJSON. Twelve projections, from flat maps to a
 * 3D globe that turns, and eight base maps, from political colors to the Earth seen from
 * the sky. Drag to move, wheel or pinch to zoom, arrow keys and `+` / `-` from the
 * keyboard; a search field finds a place, a list gives every item in words.
 *
 * @element vt-map
 * @since 0.15.0
 *
 * @attr {string} projection - `natural-earth` (default), `equal-earth`, `mercator`, `equirectangular`, `globe`, `azimuthal-equal-area`, `azimuthal-equidistant`, `stereographic`, `gnomonic`, `transverse-mercator`, `conic-equal-area`, `conic-conformal`.
 * @attr {string} basemap - `light` (default, follows the theme), `dark`, `political`, `satellite`, `night`, `blueprint`, `vintage`, `mono`.
 * @attr {string} center - Where the map is centred: coordinates, a city or a country.
 * @attr {number} zoom - Zoom level, from 1 (whole world) to 60.
 * @attr {string} highlight - Countries to highlight, codes or names separated by spaces or commas.
 * @attr {string} geocoder - Finds addresses: `nominatim`, `photon`, `ban` or an https URL template with `{q}`. Off by default: addresses are sent to that service.
 * @attr {boolean} graticule - Lines of latitude and longitude. Default: on.
 * @attr {boolean} labels - Names next to pins and on highlighted countries. Default: on.
 * @attr {boolean} controls - Projection and base map menus, search field. Default: preset.
 * @attr {boolean} list - The list of places, countries and routes under the map. Default: preset.
 * @attr {boolean} pick - A click on the map drops a pin and fires `vt-select` with its coordinates.
 * @attr {boolean} scroll-zoom - The wheel zooms the map. Default: on.
 * @attr {string} coords-format - `decimal` (default) or `dms`.
 * @attr {string} height - CSS height of the map.
 * @attr {string} movie - A film sequence that tracks a target: a button, or `track()`. Its value is the target; empty, the first place.
 *
 * @prop {string} content - One item per line, or JSON / GeoJSON.
 * @prop {{ kind: string, label: string, lat?: number, lon?: number, code?: string, value?: number | null }[]} items - What the map shows (read-only).
 * @prop {{ lat: number, lon: number, zoom: number, projection: string, basemap: string }} view - The current view (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "map" }`.
 * @fires vt-select - A country, a pin or a picked point. Detail: `{ type, label, lat, lon, code?, value? }`.
 * @fires vt-change - The view changed (projection, base map, zoom, centre). Detail: `{ lat, lon, zoom, projection, basemap }`.
 * @fires vt-copy - Places copied. Detail: `{ text }`.
 *
 * @csspart stage - The map area.
 * @csspart map - The SVG map.
 * @csspart controls - The menus and the search field.
 * @csspart legend - The color scale of values.
 * @csspart list - The list of items.
 * @csspart tooltip - The name under the pointer.
 * @csspart hud - The surveillance screen of the film sequence.
 * @csspart track-button - The button that starts the film sequence.
 *
 * @example
 * <vt-map projection="globe" center="Paris" highlight="FR DE IT">
 *   Paris
 *   Office: 35.6762, 139.6503
 *   Paris -> New York
 * </vt-map>
 */
export class VtMap extends VtBase {
  static type = 'map';

  static componentAttributes = Object.freeze(['projection', 'basemap', 'center', 'zoom', 'highlight', 'geocoder', 'graticule', 'labels', 'controls', 'list', 'pick', 'scroll-zoom', 'coords-format', 'height', 'movie']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, controls: true, list: true }, // prettier-ignore
  };

  static styles = [mapCss];

  static allowEmpty = true;

  static upgradeProperties = ['content'];

  constructor() {
    super();
    /** @type {{ lon: number, lat: number, zoom: number } | null} View moved by the user. */
    this.viewState = null;
    /** @type {string | null} */
    this.projectionState = null;
    /** @type {string | null} */
    this.basemapState = null;
    /** @type {boolean | null} */
    this.graticuleState = null;
    /** @type {string | null} Alpha-3 of the selected country. */
    this.selected = null;
    /** @type {{ lat: number, lon: number, label: string }[]} Pins dropped or searched. */
    this.pins = [];
    /** @type {any} */
    this.projection = null;
    /** @type {any} */
    this.path = null;
    /** @type {SVGSVGElement | null} */
    this.svgEl = null;
    /** @type {HTMLElement | null} */
    this.stage = null;
    /** @type {HTMLElement | null} */
    this.tooltip = null;
    /** @type {HTMLElement | null} */
    this.readout = null;
    /** @type {HTMLElement | null} */
    this.statusLine = null;
    /** @type {{ el: SVGElement, feature: any, code: CountryCode, name: string }[]} */
    this.countryEls = [];
    /** @type {(() => void)[]} Updates run on every redraw. */
    this.updaters = [];
    /** @type {number} */
    this.frameRequest = 0;
    /** @type {number} */
    this.flight = 0;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    /** @type {AbortController | null} */
    this.geocoding = null;
    /** @type {AbortController | null} The film sequence running. */
    this.movie = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.changeTimer = undefined;
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frameRequest);
    cancelAnimationFrame(this.flight);
    this.movie?.abort();
    clearTimeout(this.previewTimer);
    clearTimeout(this.changeTimer);
    this.geocoding?.abort();
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  // ---------------------------------------------------------------- input

  /** @returns {import('./map.js').MapInput} */
  input() {
    const parsed = readInput(this.text ?? '', this.locale);
    for (const part of (this.getAttribute('highlight') ?? '').split(/[\s,;]+/).filter(Boolean)) {
      const code = findCountry(part, this.locale);
      if (code && !parsed.items.some((i) => i.kind === 'country' && i.code.a3 === code.a3))
        parsed.items.push({ kind: 'country', code, label: '', color: '', value: null, text: part });
    }
    return parsed;
  }

  get projectionName() {
    const value = (this.projectionState ?? this.getAttribute('projection') ?? '').toLowerCase();
    const alias = /** @type {Record<string, string>} */ ({ orthographic: 'globe', '3d': 'globe', flat: 'natural-earth', 'plate-carree': 'equirectangular', azimuthal: 'azimuthal-equidistant' }); // prettier-ignore
    const name = alias[value] ?? value;
    return /** @type {readonly string[]} */ (PROJECTIONS).includes(name) ? name : 'natural-earth';
  }

  get basemap() {
    const value = (this.basemapState ?? this.getAttribute('basemap') ?? '').toLowerCase();
    const alias = /** @type {Record<string, string>} */ ({ sky: 'satellite', terrain: 'satellite', earth: 'satellite', space: 'night' }); // prettier-ignore
    const name = alias[value] ?? value;
    return /** @type {readonly string[]} */ (BASEMAPS).includes(name) ? name : 'light';
  }

  /** @returns {{ lon: number, lat: number, zoom: number }} */
  initialView() {
    const view = readInput(this.text ?? '', this.locale).view;
    const center = this.getAttribute('center');
    const place = center ? readPlace(center, this.locale) : null;
    /** @type {LatLon | null} */
    let at = view.center ?? null;
    if (place && 'lat' in place) at = place;
    else if (place && 'country' in place) at = this.countryCenter(place.country);
    const zoom = Number(this.getAttribute('zoom') ?? view.zoom ?? 1);
    return {
      lon: at?.lon ?? (this.projectionName === 'globe' ? 10 : 0),
      lat: at?.lat ?? (AZIMUTHAL.has(this.projectionName) ? 30 : 0),
      zoom: Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(1, zoom)) : 1,
    };
  }

  get view() {
    const v = this.viewState ?? this.initialView();
    return { lat: v.lat, lon: v.lon, zoom: v.zoom, projection: this.projectionName, basemap: this.basemap }; // prettier-ignore
  }

  get items() {
    return this.input().items.map((item) => {
      if (item.kind === 'country') return { kind: 'country', label: item.label || countryName(item.code, this.locale), code: item.code.a2 || item.code.a3, value: item.value }; // prettier-ignore
      if (item.kind === 'marker') {
        const at = this.locate(item.place);
        return { kind: 'marker', label: this.markerLabel(item), lat: at?.lat, lon: at?.lon };
      }
      return { kind: item.kind, label: item.label };
    });
  }

  /**
   * Coordinates of a place, when known now.
   *
   * @param {Place} place
   * @returns {LatLon | null}
   */
  locate(place) {
    if ('lat' in place) return place;
    if ('country' in place) return this.countryCenter(place.country);
    const hit = geocoded.get(place.address.toLowerCase());
    return hit && hit !== 'none' && hit !== 'pending' ? hit : null;
  }

  /**
   * @param {import('./map.js').Marker} item
   * @returns {string}
   */
  markerLabel(item) {
    const p = item.place;
    if (item.label) return item.label;
    if ('name' in p && p.name) return p.name;
    if ('address' in p) return p.address;
    if ('country' in p) return countryName(p.country, this.locale);
    return formatCoords(p.lat, p.lon, this.coordsFormat);
  }

  get coordsFormat() {
    return this.getAttribute('coords-format') === 'dms' ? 'dms' : 'decimal';
  }

  // ---------------------------------------------------------------- render

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { items, invalid } = this.input();
    const body = h('div', { class: 'body map-body', part: 'body' });
    if (this.feature('controls')) body.append(this.controlsView());
    this.stage = h('div', { class: 'map-stage', part: 'stage', attrs: { 'data-basemap': this.basemap } }); // prettier-ignore
    const height = this.getAttribute('height');
    if (height && /^[\d.]+(?:px|em|rem|vh|%)$/.test(height)) this.stage.style.height = height;
    body.append(this.stage);
    this.statusLine = h('p', { class: 'map-status', attrs: { role: 'status' } });
    body.append(this.statusLine);
    const legendHost = h('div', { class: 'map-legend-host' });
    body.append(legendHost);
    if (this.feature('list')) body.append(h('div', { class: 'map-list-host' }));
    if (invalid.length) body.append(h('p', { class: 'map-muted', text: t('mapInvalidLines', { list: invalid.slice(0, 5).join(' · ') }) })); // prettier-ignore

    const panel = h('div', { class: 'panel' });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('map-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') ? this.downloadButton(() => this.geoJson(), this.downloadName('map.geojson'), 'application/geo+json') : null, // prettier-ignore
      this.feature('copy') ? this.copyButton(() => this.report(), t('mapCopyPlaces')) : null,
    ];
    const markers = items.filter((i) => i.kind === 'marker').length;
    const badge = markers ? `${t(/** @type {StringKey} */ (`mapProjection_${this.projectionName}`))} · ${t('mapPlaces', { count: markers })}` : t(/** @type {StringKey} */ (`mapProjection_${this.projectionName}`)); // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
    this.draw();
  }

  /** @returns {HTMLElement} */
  controlsView() {
    const t = this.t;
    const select = (
      /** @type {string} */ key,
      /** @type {readonly string[]} */ values,
      /** @type {string} */ current,
      /** @type {StringKey} */ label,
      /** @type {(v: string) => string} */ name,
      /** @type {(v: string) => void} */ onChange,
    ) => {
      // prettier-ignore
      const id = uid(key);
      const el = h(
        'select',
        { class: 'map-select', attrs: { id, 'data-focus-key': key }, on: { change: () => onChange(/** @type {HTMLSelectElement} */ (el).value) } }, // prettier-ignore
        ...values.map((v) => h('option', { text: name(v), attrs: { value: v, selected: v === current } })), // prettier-ignore
      );
      return h('div', { class: 'map-control' }, h('label', { attrs: { for: id }, text: t(label) }), el); // prettier-ignore
    };
    const searchId = uid('place');
    const field = h('input', {
      class: 'map-search-input',
      attrs: { id: searchId, type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: t('mapSearchPlaceholder'), 'data-focus-key': 'place' }, // prettier-ignore
    });
    const form = h(
      'form',
      {
        class: 'map-search',
        attrs: { role: 'search' },
        on: {
          submit: (event) => {
            event.preventDefault();
            this.find(/** @type {HTMLInputElement} */ (field).value);
          },
        },
      },
      h('label', { class: 'sr-only', attrs: { for: searchId }, text: t('mapSearch') }),
      field,
      h('button', { class: 'btn map-go', attrs: { type: 'submit', 'aria-label': t('mapSearch'), title: t('mapSearch') } }, icon('search')), // prettier-ignore
    );
    return h(
      'div',
      { class: 'map-controls', part: 'controls' },
      form,
      select(
        'projection',
        PROJECTIONS,
        this.projectionName,
        'mapProjection',
        (v) => t(/** @type {StringKey} */ (`mapProjection_${v}`)),
        (v) => {
          // prettier-ignore
          const wasAzimuthal = AZIMUTHAL.has(this.projectionName);
          this.projectionState = v;
          if (this.viewState && wasAzimuthal !== AZIMUTHAL.has(v)) this.viewState.zoom = 1;
          this.redrawAll();
          this.changed();
        },
      ),
      select(
        'basemap',
        BASEMAPS,
        this.basemap,
        'mapBasemap',
        (v) => t(/** @type {StringKey} */ (`mapBasemap_${v}`)),
        (v) => {
          // prettier-ignore
          this.basemapState = v;
          this.redrawAll();
          this.changed();
        },
      ),
      h(
        'label',
        { class: 'map-check' },
        h('input', {
          attrs: { type: 'checkbox', checked: this.showGraticule, 'data-focus-key': 'graticule' },
          on: {
            change: (event) => {
              this.graticuleState = /** @type {HTMLInputElement} */ (event.target).checked;
              this.redrawAll();
            },
          },
        }),
        h('span', { text: t('mapGraticule') }),
      ),
    );
  }

  get showGraticule() {
    return this.graticuleState ?? this.flag('graticule', true);
  }

  /** Draws again with the same items (projection or base map changed). */
  redrawAll() {
    if (!this.stage) return;
    this.stage.dataset.basemap = this.basemap;
    this.draw();
    const badge = this.root.querySelector('.badge');
    if (badge) badge.textContent = badge.textContent?.replace(/^[^·]+/, `${this.t(/** @type {StringKey} */ (`mapProjection_${this.projectionName}`))} `).trim() ?? ''; // prettier-ignore
  }

  /** Loads the map library if needed, then builds the SVG. */
  draw() {
    const stage = this.stage;
    if (!stage) return;
    const library = loadGeo();
    if (!library.ready) {
      stage.replaceChildren(loadingView(this.t));
      library.promise.then(
        () => {
          if (this.stage === stage) {
            this.draw();
            this.renderSide();
          }
        },
        (error) => {
          if (this.stage === stage)
            stage.replaceChildren(noticeView(this.t('mapLoadFailed', { message: String(error?.message ?? error) }))); // prettier-ignore
        },
      );
      return;
    }
    this.build(library.geo);
    this.renderSide();
    this.geocodeItems();
  }

  /** @returns {any} */
  get geo() {
    return loadGeo().geo;
  }

  /**
   * Builds the SVG: sphere, graticule, countries, borders, shapes, routes, pins.
   *
   * @param {any} geo
   */
  build(geo) {
    const t = this.t;
    const stage = /** @type {HTMLElement} */ (this.stage);
    const { items } = this.input();
    const name = this.projectionName;
    const ids = { glow: uid('glow'), shade: uid('shade'), clip: uid('clip'), ocean: uid('ocean') };
    this.updaters = [];
    this.countryEls = [];

    const svgEl = /** @type {SVGSVGElement} */ (s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg', part: 'map', role: 'application', 'aria-roledescription': t('mapRole'), tabindex: '0', preserveAspectRatio: 'xMidYMid meet' })); // prettier-ignore
    svgEl.setAttribute('aria-label', this.summary(items));
    const helpId = uid('help');
    svgEl.setAttribute('aria-describedby', helpId);
    this.svgEl = svgEl;

    const defs = s('defs');
    const ocean = s('radialGradient', { id: ids.ocean, cx: '50%', cy: '45%', r: '60%' });
    ocean.append(s('stop', { offset: '0%', class: 'ocean-a' }), s('stop', { offset: '100%', class: 'ocean-b' })); // prettier-ignore
    const shade = s('radialGradient', { id: ids.shade, cx: '35%', cy: '30%', r: '75%' });
    shade.append(s('stop', { offset: '0%', class: 'shade-a' }), s('stop', { offset: '65%', class: 'shade-b' }), s('stop', { offset: '100%', class: 'shade-c' })); // prettier-ignore
    const glow = s('filter', { id: ids.glow, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    glow.append(s('feGaussianBlur', { stdDeviation: '12' }));
    const clip = s('clipPath', { id: ids.clip });
    const clipPath = s('path');
    clip.append(clipPath);
    defs.append(ocean, shade, glow, clip);
    svgEl.append(defs);

    const globeLike = AZIMUTHAL.has(name);
    // Stars around a globe seen from space: fixed, drawn once.
    if (globeLike && (this.basemap === 'night' || this.basemap === 'satellite')) {
      const stars = s('g', { class: 'map-stars', 'aria-hidden': 'true' });
      let seed = 7;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 140; i++) stars.append(s('circle', { cx: (rand() * W).toFixed(1), cy: (rand() * H).toFixed(1), r: (rand() * 1.2 + 0.2).toFixed(2), opacity: (rand() * 0.7 + 0.3).toFixed(2) })); // prettier-ignore
      svgEl.append(stars);
    }
    const sphereGlow = s('path', { class: 'map-atmosphere', filter: `url(#${ids.glow})` });
    const sphere = s('path', { class: 'map-sphere', fill: `url(#${ids.ocean})` });
    const graticule = s('path', { class: 'map-graticule' });
    const land = s('g', { class: 'map-countries', 'clip-path': `url(#${ids.clip})` });
    const borders = s('path', { class: 'map-borders' });
    const overlay = s('g', { class: 'map-overlay', 'clip-path': `url(#${ids.clip})` });
    const shading = s('path', { class: 'map-shading', fill: `url(#${ids.shade})` });
    const pinsLayer = s('g', { class: 'map-pins' });
    const labelsLayer = s('g', { class: 'map-labels', 'aria-hidden': 'true' });
    if (globeLike) svgEl.append(sphereGlow);
    svgEl.append(sphere);
    if (this.showGraticule) svgEl.append(graticule);
    svgEl.append(land, borders, overlay);
    if (name === 'globe') svgEl.append(shading);
    svgEl.append(pinsLayer, labelsLayer);

    const marks = new Map(items.filter((i) => i.kind === 'country').map((i) => [/** @type {import('./map.js').CountryMark} */ (i).code.a3, /** @type {import('./map.js').CountryMark} */ (i)])); // prettier-ignore
    const values = [...marks.values()].map((m) => m.value).filter((v) => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    for (const [index, feature] of geo.countries.entries()) {
      const code = codeOfShape(feature.id, feature.properties?.name);
      const cname = countryName(code, this.locale, feature.properties?.name);
      const mark = marks.get(code.a3);
      const el = s('path', { class: `map-country c${index % 8}${this.basemap === 'satellite' ? ` ${climate(geo, feature, code)}` : ''}`, 'data-code': code.a2 || code.a3 }); // prettier-ignore
      if (mark) {
        el.classList.add('highlighted');
        if (mark.color) el.style.setProperty('fill', mark.color);
        else if (mark.value !== null && values.length) {
          const p = max === min ? 100 : Math.round(((mark.value - min) / (max - min)) * 100);
          el.style.setProperty(
            'fill',
            `color-mix(in oklab, var(--map-high) ${p}%, var(--map-low))`,
          );
        }
      }
      if (this.selected === code.a3) el.classList.add('selected');
      land.append(el);
      this.countryEls.push({ el, feature, code, name: cname });
    }
    const labels = this.flag('labels', true);

    /** @param {LatLon} at */
    const visible = (at) => !globeLike || geo.geoDistance?.([at.lon, at.lat], [-this.projection.rotate()[0], -this.projection.rotate()[1]]) < ((CLIP[name] ?? 90) * Math.PI) / 180; // prettier-ignore

    // GeoJSON lines and polygons, then routes.
    for (const item of items) {
      if (item.kind === 'shape') {
        const el = s('path', { class: `map-shape ${/Polygon/.test(item.geometry.type) ? 'area' : 'line'}` }); // prettier-ignore
        if (item.color) el.style.setProperty('--map-item', item.color);
        el.append(this.titleEl(item.label || t('mapShape')));
        overlay.append(el);
        this.updaters.push(() => el.setAttribute('d', this.path(item.geometry) ?? ''));
      }
      if (item.kind === 'route') {
        const el = s('path', { class: 'map-route' });
        if (item.color) el.style.setProperty('--map-item', item.color);
        overlay.append(el);
        this.updaters.push(() => {
          const stops = item.stops.map((p) => this.locate(p));
          if (stops.some((p) => !p)) return el.removeAttribute('d');
          const line = { type: 'LineString', coordinates: /** @type {LatLon[]} */ (stops).map((p) => [p.lon, p.lat]) }; // prettier-ignore
          el.setAttribute('d', this.path(line) ?? '');
        });
      }
    }

    // Pins: the items, then the ones dropped or searched.
    const pinItems = [
      ...items.flatMap((item) => (item.kind === 'marker' ? [{ place: item.place, label: this.markerLabel(item), color: item.color, dropped: false }] : [])), // prettier-ignore
      ...this.pins.map((p) => ({ place: /** @type {Place} */ ({ lat: p.lat, lon: p.lon, source: 'coords' }), label: p.label, color: '', dropped: true })), // prettier-ignore
    ];
    for (const pin of pinItems) {
      const g = s('g', { class: `map-pin${pin.dropped ? ' dropped' : ''}` });
      if (pin.color) g.style.setProperty('--map-item', pin.color);
      g.append(s('path', { d: 'M0 0C-2-6-8-9-8-15a8 8 0 1 1 16 0c0 6-6 9-8 15Z', class: 'map-pin-shape' }), s('circle', { cx: '0', cy: '-15', r: '3', class: 'map-pin-dot' }), this.titleEl(pin.label)); // prettier-ignore
      pinsLayer.append(g);
      const text = labels ? s('text', { class: 'map-label', dx: '10', dy: '-12' }) : null;
      if (text) {
        text.textContent = pin.label;
        labelsLayer.append(text);
      }
      g.addEventListener('click', (event) => {
        event.stopPropagation();
        const at = this.locate(pin.place);
        if (at) this.selectPoint(at, pin.label);
      });
      this.updaters.push(() => {
        const at = this.locate(pin.place);
        const xy = at && visible(at) ? this.projection([at.lon, at.lat]) : null;
        const show = xy && xy[0] > -20 && xy[0] < W + 20 && xy[1] > -20 && xy[1] < H + 40;
        g.toggleAttribute('hidden', !show);
        if (show) g.setAttribute('transform', `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`);
        if (text) {
          text.toggleAttribute('hidden', !show);
          if (show) {
            text.setAttribute('x', xy[0].toFixed(1));
            text.setAttribute('y', xy[1].toFixed(1));
          }
        }
      });
    }
    // Names of highlighted countries, at the centre of their largest part.
    if (labels) {
      for (const mark of marks.values()) {
        const center = this.countryCenter(mark.code);
        if (!center) continue;
        const text = s('text', { class: 'map-country-label', 'text-anchor': 'middle' });
        text.textContent = mark.label || countryName(mark.code, this.locale) + (mark.value !== null ? ` · ${this.number(mark.value)}` : ''); // prettier-ignore
        labelsLayer.append(text);
        this.updaters.push(() => {
          const xy = visible(center) ? this.projection([center.lon, center.lat]) : null;
          text.toggleAttribute('hidden', !xy);
          if (xy) {
            text.setAttribute('x', xy[0].toFixed(1));
            text.setAttribute('y', xy[1].toFixed(1));
          }
        });
      }
    }

    this.updaters.unshift(() => {
      const sphereD = this.path({ type: 'Sphere' }) ?? '';
      sphere.setAttribute('d', sphereD);
      sphereGlow.setAttribute('d', sphereD);
      shading.setAttribute('d', sphereD);
      clipPath.setAttribute('d', sphereD);
      if (this.showGraticule) graticule.setAttribute('d', this.path(geo.geoGraticule10()) ?? '');
      for (const c of this.countryEls) c.el.setAttribute('d', this.path(c.feature) ?? '');
      borders.setAttribute('d', this.path(geo.borders) ?? '');
    });

    const tooltip = h('div', { class: 'map-tooltip', part: 'tooltip', attrs: { hidden: '' } });
    const readout = h('div', { class: 'map-readout', attrs: { 'aria-hidden': 'true' } });
    const zoomControls = h(
      'div',
      { class: 'map-zoom' },
      iconButton({ icon: 'plus', label: t('mapZoomIn'), key: 'zoom-in', onClick: () => this.zoomBy(2) }), // prettier-ignore
      iconButton({ icon: 'minus', label: t('mapZoomOut'), key: 'zoom-out', onClick: () => this.zoomBy(0.5) }), // prettier-ignore
      iconButton({ icon: 'refresh', label: t('mapReset'), key: 'reset', onClick: () => this.reset() }), // prettier-ignore
      this.hasAttribute('movie') ? this.trackButton() : null,
    );
    const help = h('p', { class: 'sr-only', attrs: { id: helpId }, text: t('mapKeyboardHelp') });
    this.tooltip = tooltip;
    this.readout = readout;
    stage.replaceChildren(svgEl, zoomControls, tooltip, readout, help);
    stage.classList.toggle('globe', globeLike);
    this.bindPointer(svgEl);
    this.update();
  }

  /**
   * @param {string} text
   * @returns {SVGElement}
   */
  titleEl(text) {
    const title = s('title');
    title.textContent = text;
    return title;
  }

  /**
   * One sentence for screen readers: projection, places, countries, routes.
   *
   * @param {Item[]} items
   * @returns {string}
   */
  summary(items) {
    const t = this.t;
    const count = (/** @type {string} */ kind) => items.filter((i) => i.kind === kind).length;
    return t('mapSummary', {
      projection: t(/** @type {StringKey} */ (`mapProjection_${this.projectionName}`)),
      places: count('marker') + this.pins.length,
      countries: count('country'),
      routes: count('route'),
    });
  }

  /** Sets the projection for the current view, then moves every shape. */
  update() {
    const geo = this.geo;
    if (!geo || !this.svgEl) return;
    const name = this.projectionName;
    const view = this.viewState ?? this.initialView();
    const projection = geo.projections[name]();
    const globeLike = AZIMUTHAL.has(name);
    if (globeLike) {
      projection.rotate([-view.lon, -view.lat]).clipAngle(CLIP[name] ?? 90);
    } else projection.rotate([-view.lon, 0]);
    projection.precision(0.4);
    const pad = 12;
    if (name === 'mercator' || name === 'transverse-mercator') {
      projection.fitExtent([[pad, pad], [W - pad, H - pad]], { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[view.lon - 179.9, -80], [view.lon + 179.9, 84]] } }); // prettier-ignore
    } else
      projection.fitExtent(
        [
          [pad, pad],
          [W - pad, H - pad],
        ],
        { type: 'Sphere' },
      );
    projection.scale(projection.scale() * view.zoom);
    if (!globeLike) {
      // Centre on the latitude asked for, without leaving empty bands at the top and bottom.
      projection.translate([W / 2, H / 2]);
      const xy = projection([view.lon, view.lat]);
      const t = projection.translate();
      projection.translate([t[0] + W / 2 - xy[0], t[1] + H / 2 - xy[1]]);
      const path = geo.geoPath(projection);
      const [[, y0], [, y1]] = path.bounds({ type: 'Sphere' });
      const top = Number.isFinite(y0) ? y0 : -Infinity;
      const bottom = Number.isFinite(y1) ? y1 : Infinity;
      let dy = 0;
      if (bottom - top <= H) dy = H / 2 - (top + bottom) / 2;
      else if (top > 0) dy = -top;
      else if (bottom < H) dy = H - bottom;
      const t2 = projection.translate();
      projection.translate([t2[0], t2[1] + dy]);
    } else projection.translate([W / 2, H / 2]);
    this.projection = projection;
    this.path = geo.geoPath(projection);
    for (const update of this.updaters) update();
  }

  /** Redraws on the next frame (during drags). */
  scheduleUpdate() {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this.update();
    });
  }

  // ---------------------------------------------------------------- interaction

  /**
   * Pixels on screen to units of the viewBox.
   *
   * @returns {number}
   */
  unitsPerPixel() {
    const rect = this.svgEl?.getBoundingClientRect();
    if (!rect || !rect.width) return 1;
    return Math.max(W / rect.width, H / rect.height);
  }

  /**
   * The point of the viewBox under a pointer event.
   *
   * @param {MouseEvent} event
   * @returns {[number, number]}
   */
  pointOf(event) {
    const rect = /** @type {SVGSVGElement} */ (this.svgEl).getBoundingClientRect();
    const k = this.unitsPerPixel();
    return [W / 2 + (event.clientX - rect.left - rect.width / 2) * k, H / 2 + (event.clientY - rect.top - rect.height / 2) * k]; // prettier-ignore
  }

  /**
   * Moves the view by a distance in the viewBox.
   *
   * @param {number} dx
   * @param {number} dy
   */
  pan(dx, dy) {
    const view = (this.viewState ??= this.initialView());
    const k = this.projection?.scale() ?? 150;
    const deg = 180 / Math.PI / k;
    view.lon = wrap(view.lon - dx * deg);
    const limit = AZIMUTHAL.has(this.projectionName) ? 90 : 85;
    view.lat = Math.max(-limit, Math.min(limit, view.lat + dy * deg));
    this.scheduleUpdate();
  }

  /**
   * @param {number} factor
   * @param {[number, number]} [around] - Point of the viewBox that stays in place.
   */
  zoomBy(factor, around) {
    const view = (this.viewState ??= this.initialView());
    const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * factor));
    if (zoom === view.zoom) return;
    if (around && this.projection) {
      const at = this.projection.invert?.(around);
      if (at && Number.isFinite(at[0])) {
        // Move toward the point by the share of the zoom, so it stays under the pointer.
        const share = 1 - view.zoom / zoom;
        view.lon = wrap(view.lon + wrap(at[0] - view.lon) * share);
        view.lat = view.lat + (at[1] - view.lat) * share;
      }
    }
    view.zoom = zoom;
    this.scheduleUpdate();
    this.changedSoon();
  }

  reset() {
    this.viewState = null;
    this.selected = null;
    this.pins = [];
    this.build(this.geo);
    this.renderSide();
    this.changed();
  }

  /**
   * @param {SVGSVGElement} svgEl
   */
  bindPointer(svgEl) {
    /** @type {Map<number, [number, number]>} */
    const pointers = new Map();
    let moved = 0;
    let pinch = 0;
    svgEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      svgEl.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      moved = 0;
      if (pointers.size === 2) pinch = spread(pointers);
    });
    svgEl.addEventListener('pointermove', (event) => {
      this.hover(event);
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const k = this.unitsPerPixel();
      if (pointers.size === 2) {
        pointers.set(event.pointerId, [event.clientX, event.clientY]);
        const d = spread(pointers);
        if (pinch) this.zoomBy(d / pinch);
        pinch = d;
        moved += 10;
        return;
      }
      const dx = event.clientX - last[0];
      const dy = event.clientY - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (moved > 3) {
        svgEl.classList.add('dragging');
        this.pan(dx * k, dy * k);
      }
    });
    const end = (/** @type {PointerEvent} */ event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      svgEl.classList.remove('dragging');
      if (!pointers.size && moved > 3) this.changed();
      if (event.type === 'pointerup' && moved <= 3 && !pointers.size) this.clickAt(event);
    };
    svgEl.addEventListener('pointerup', end);
    svgEl.addEventListener('pointercancel', end);
    svgEl.addEventListener('pointerleave', () => {
      if (this.tooltip) this.tooltip.hidden = true;
      if (this.readout) this.readout.textContent = '';
    });
    svgEl.addEventListener('dblclick', (event) => {
      event.preventDefault();
      this.zoomBy(2, this.pointOf(event));
    });
    svgEl.addEventListener(
      'wheel',
      (event) => {
        if (!this.flag('scroll-zoom', true)) return;
        event.preventDefault();
        this.zoomBy(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0018)), this.pointOf(event)); // prettier-ignore
      },
      { passive: false },
    );
    svgEl.addEventListener('keydown', (event) => {
      const step = 40;
      /** @type {Record<string, () => void>} */
      const keys = {
        ArrowLeft: () => this.pan(-step, 0),
        ArrowRight: () => this.pan(step, 0),
        ArrowUp: () => this.pan(0, -step),
        ArrowDown: () => this.pan(0, step),
        '+': () => this.zoomBy(1.5),
        '=': () => this.zoomBy(1.5),
        '-': () => this.zoomBy(1 / 1.5),
        _: () => this.zoomBy(1 / 1.5),
        0: () => this.reset(),
        Home: () => this.reset(),
      };
      const action = keys[event.key];
      if (!action || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      action();
      if (event.key.startsWith('Arrow')) this.changedSoon();
    });
  }

  /**
   * The country of a path of the map.
   *
   * @param {EventTarget | null} target
   * @returns {{ el: SVGElement, feature: any, code: CountryCode, name: string } | null}
   */
  countryOf(target) {
    return this.countryEls.find((c) => c.el === target) ?? null;
  }

  /**
   * The country under a point of the viewBox.
   *
   * @param {[number, number]} xy
   * @returns {{ el: SVGElement, feature: any, code: CountryCode, name: string } | null}
   */
  countryAt(xy) {
    const at = this.projection?.invert?.(xy);
    if (!at || !Number.isFinite(at[0])) return null;
    const geo = this.geo;
    return this.countryEls.find((c) => geo.geoContains(c.feature, at)) ?? null;
  }

  /**
   * Tooltip with the country and coordinates under the pointer.
   *
   * @param {PointerEvent} event
   */
  hover(event) {
    if (!this.projection || !this.tooltip || !this.readout) return;
    const xy = this.pointOf(event);
    const at = this.projection.invert?.(xy);
    const inside = at && Number.isFinite(at[0]) && (!AZIMUTHAL.has(this.projectionName) || this.geo.geoDistance([at[0], at[1]], [-this.projection.rotate()[0], -this.projection.rotate()[1]]) < ((CLIP[this.projectionName] ?? 90) * Math.PI) / 180); // prettier-ignore
    this.readout.textContent = inside ? formatCoords(at[1], wrap(at[0]), this.coordsFormat) : '';
    const country = inside ? this.countryOf(event.target) : null;
    for (const c of this.countryEls) c.el.classList.toggle('hover', c === country);
    if (!country || event.buttons) {
      this.tooltip.hidden = true;
      return;
    }
    const mark = this.input().items.find((i) => i.kind === 'country' && i.code.a3 === country.code.a3); // prettier-ignore
    const value = mark && mark.kind === 'country' && mark.value !== null ? ` · ${this.number(mark.value)}` : ''; // prettier-ignore
    this.tooltip.textContent = `${flag(country.code.a2)} ${country.name}${value}`.trim();
    const rect = /** @type {HTMLElement} */ (this.stage).getBoundingClientRect();
    this.tooltip.style.left = `${event.clientX - rect.left + 14}px`;
    this.tooltip.style.top = `${event.clientY - rect.top + 14}px`;
    this.tooltip.hidden = false;
  }

  /**
   * A click without a drag: selects the country, or drops a pin with `pick`.
   *
   * @param {PointerEvent} event
   */
  clickAt(event) {
    const xy = this.pointOf(event);
    const at = this.projection?.invert?.(xy);
    if (!at || !Number.isFinite(at[0])) return;
    if (this.flag('pick', false)) {
      const lat = round(at[1]);
      const lon = round(wrap(at[0]));
      this.pins = [{ lat, lon, label: formatCoords(lat, lon, this.coordsFormat) }];
      this.build(this.geo);
      this.renderSide();
      this.selectPoint({ lat, lon }, formatCoords(lat, lon, this.coordsFormat));
      return;
    }
    const country = this.countryOf(event.target) ?? this.countryAt(xy);
    if (country) this.selectCountry(country.code, false);
  }

  /**
   * @param {LatLon} at
   * @param {string} label
   */
  selectPoint(at, label) {
    this.announce(this.t('mapSelectedPoint', { label, coords: formatCoords(at.lat, at.lon, this.coordsFormat) })); // prettier-ignore
    emit(this, EVENTS.SELECT, { type: 'point', label, lat: at.lat, lon: at.lon });
  }

  /**
   * @param {CountryCode} code
   * @param {boolean} fly - Move the map to it.
   */
  selectCountry(code, fly) {
    this.selected = this.selected === code.a3 && !fly ? null : code.a3;
    for (const c of this.countryEls) c.el.classList.toggle('selected', c.code.a3 === this.selected);
    const name = countryName(code, this.locale);
    const mark = this.input().items.find((i) => i.kind === 'country' && i.code.a3 === code.a3);
    const value = mark && mark.kind === 'country' ? mark.value : null;
    const center = this.countryCenter(code);
    if (fly && center) this.flyTo(center, this.countryZoom(code));
    if (this.selected) {
      this.announce(this.t('mapSelectedCountry', { name }));
      emit(this, EVENTS.SELECT, { type: 'country', label: name, code: code.a2 || code.a3, a3: code.a3, value, lat: center?.lat, lon: center?.lon }); // prettier-ignore
    }
  }

  /**
   * The largest part of a country (France without French Guiana), for its centre and zoom.
   *
   * @param {CountryCode} code
   * @returns {any}
   */
  mainland(code) {
    const geo = this.geo;
    const feature = geo?.countries.find((/** @type {any} */ f) => codeOfShape(f.id, f.properties?.name).a3 === code.a3); // prettier-ignore
    if (!feature) return null;
    if (feature.geometry.type !== 'MultiPolygon') return feature;
    let best = null;
    let area = -1;
    for (const coordinates of feature.geometry.coordinates) {
      const part = { type: 'Polygon', coordinates };
      const a = geo.geoArea(part);
      if (a > area) [best, area] = [part, a];
    }
    return best;
  }

  /**
   * @param {CountryCode} code
   * @returns {LatLon | null}
   */
  countryCenter(code) {
    if (!this.geo) return null;
    const part = this.mainland(code);
    if (!part) return null;
    const [lon, lat] = this.geo.geoCentroid(part);
    return { lat, lon };
  }

  /**
   * A zoom that fits the country.
   *
   * @param {CountryCode} code
   * @returns {number}
   */
  countryZoom(code) {
    const part = this.mainland(code);
    if (!part) return 3;
    const area = this.geo.geoArea(part); // steradians; the Earth is 4π
    return Math.min(14, Math.max(1.5, 0.9 / Math.sqrt(area / (4 * Math.PI)) / 4));
  }

  /**
   * Moves the map to a place, smoothly unless reduced motion is asked for.
   *
   * @param {LatLon} at
   * @param {number} zoom
   */
  flyTo(at, zoom) {
    const from = { ...(this.viewState ?? this.initialView()) };
    const to = { lon: at.lon, lat: Math.max(-85, Math.min(85, at.lat)), zoom: Math.min(MAX_ZOOM, Math.max(1, zoom)) }; // prettier-ignore
    cancelAnimationFrame(this.flight);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // prettier-ignore
    if (reduced || !this.projection) {
      this.viewState = to;
      this.update();
      this.changed();
      return;
    }
    const start = performance.now();
    const dLon = wrap(to.lon - from.lon);
    const step = (/** @type {number} */ now) => {
      const p = Math.min(1, (now - start) / 700);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      this.viewState = { lon: wrap(from.lon + dLon * e), lat: from.lat + (to.lat - from.lat) * e, zoom: from.zoom * (to.zoom / from.zoom) ** e }; // prettier-ignore
      this.update();
      if (p < 1) this.flight = requestAnimationFrame(step);
      else this.changed();
    };
    this.flight = requestAnimationFrame(step);
  }

  /**
   * Finds what was typed in the search field and goes there.
   *
   * @param {string} query
   */
  async find(query) {
    const t = this.t;
    const text = query.trim();
    if (!text || !this.geo) return;
    // Easter egg: "track Paris", "locate 48.85, 2.35" run the film sequence.
    const tracked = text.match(/^(?:track|locate|traquer|localiser)\s+(.+)$/i);
    if (tracked) {
      this.track(tracked[1]);
      return;
    }
    const country = findCountry(text, this.locale);
    const place = country ? { country } : readPlace(text, this.locale);
    if (place && 'country' in place) {
      this.selectCountry(place.country, true);
      this.status(t('mapFoundCountry', { name: countryName(place.country, this.locale) }));
      return;
    }
    if (place && 'lat' in place) {
      this.dropPin(place, place.name ?? formatCoords(place.lat, place.lon, this.coordsFormat));
      return;
    }
    if (place && 'address' in place) {
      const geocoder = this.getAttribute('geocoder');
      if (!geocoder) {
        this.status(t('mapNoGeocoder', { query: text }));
        return;
      }
      this.status(t('mapGeocoding', { query: text }));
      const hit = await this.geocode(text);
      if (hit) this.dropPin(hit, hit.name || text);
      else this.status(t('mapNotFound', { query: text }));
      return;
    }
    this.status(t('mapNotFound', { query: text }));
  }

  /** @returns {HTMLButtonElement} The button of the film sequence, with a crosshair. */
  trackButton() {
    const button = iconButton({ icon: 'search', label: this.t('mapTrack'), key: 'track', part: 'track-button', onClick: () => this.track(this.movieTarget()) }); // prettier-ignore
    const svg = s('svg', { class: 'icon', viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.1', 'stroke-linecap': 'round', 'aria-hidden': 'true' }); // prettier-ignore
    svg.append(s('circle', { cx: '12', cy: '12', r: '10' }), s('path', { d: 'M22 12h-4M6 12H2M12 6V2M12 22v-4' }), s('circle', { cx: '12', cy: '12', r: '1.5' })); // prettier-ignore
    button.replaceChildren(svg);
    return button;
  }

  /** @returns {string} The `movie` attribute, or the first place of the content. */
  movieTarget() {
    const value = this.getAttribute('movie')?.trim();
    if (value && !/^(?:true|on|yes|1)$/i.test(value)) return value;
    const first = this.input().items.find((i) => i.kind === 'marker');
    if (first && first.kind === 'marker') {
      const at = this.locate(first.place);
      if (at) return `${this.markerLabel(first)}: ${at.lat}, ${at.lon}`;
    }
    return '0, 0';
  }

  /**
   * Film sequence: the globe turns to the target, zooms in by stages under a surveillance
   * screen (reticle, scan lines, log, coordinates settling), then "TARGET LOCATED". Escape
   * or the Stop button ends it; with reduced motion it goes straight to the end.
   *
   * @param {string} query - Coordinates, a city, a country or an address (with a geocoder).
   * @returns {Promise<boolean>} Whether the target was found.
   */
  async track(query) {
    const t = this.t;
    if (!this.geo || !this.stage) return false;
    const named = query.match(/^([^:]{1,80}?)\s*:\s+(.+)$/);
    const place = readPlace(named ? named[2] : query, this.locale);
    /** @type {LatLon | null} */
    let at = null;
    let label = (named ? named[1] : query).trim();
    if (place && 'lat' in place) [at, label] = [place, named ? label : (place.name ?? label)];
    else if (place && 'country' in place)
      [at, label] = [this.countryCenter(place.country), countryName(place.country, this.locale)]; // prettier-ignore
    else if (place && 'address' in place && this.getAttribute('geocoder')) {
      const hit = await this.geocode(place.address);
      if (hit) at = hit;
    }
    if (!at) {
      this.status(t('mapNotFound', { query: label }));
      return false;
    }
    const target = /** @type {LatLon} */ (at);
    this.movie?.abort();
    cancelAnimationFrame(this.flight);
    const controller = new AbortController();
    this.movie = controller;
    const { signal } = controller;
    if (!AZIMUTHAL.has(this.projectionName)) {
      this.projectionState = 'globe';
      this.viewState = { lon: target.lon - 70, lat: 10, zoom: 1 };
      this.pins = [];
      this.build(this.geo);
    }
    const hud = this.hudView();
    this.stage.append(hud.root);
    this.stage.classList.add('movie');
    const stop = () => controller.abort();
    const onKey = (/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && stop();
    this.root.addEventListener('keydown', /** @type {EventListener} */ (onKey));
    hud.stop.addEventListener('click', stop);
    this.announce(t('mapTracking', { label }));
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // prettier-ignore
    const coords = (/** @type {number} */ noise) => {
      const jitter = () => (Math.random() - 0.5) * noise;
      hud.coords.textContent = formatCoords(
        target.lat + jitter(),
        target.lon + jitter() * 2,
        'dms',
      );
    };
    try {
      if (!reduced) {
        const steps = /** @type {[string, number, number, number][]} */ ([
          // message, zoom, duration (ms), noise of the coordinates (degrees)
          ['ESTABLISHING SATELLITE UPLINK', 1, 1800, 60],
          ['SIGNAL ACQUIRED — TRIANGULATING', 2.5, 1700, 20],
          ['CROSS-REFERENCING RELAY NODES', 6, 1600, 5],
          ['ENHANCE', 14, 1400, 1],
          ['ENHANCE', 32, 1300, 0.1],
        ]);
        for (const [message, zoom, duration, noise] of steps) {
          hud.log(message);
          await this.animateView({ lon: target.lon, lat: target.lat, zoom }, duration, signal, (p) => coords(noise * (1 - p) + noise * 0.15)); // prettier-ignore
        }
      } else {
        this.viewState = {
          lon: target.lon,
          lat: Math.max(-85, Math.min(85, target.lat)),
          zoom: 32,
        };
        this.update();
      }
      if (signal.aborted) throw new Error('stopped');
      coords(0);
      hud.log('TARGET LOCATED');
      hud.root.classList.add('locked');
      const known = this.input().items.some((i) => {
        const p = i.kind === 'marker' ? this.locate(i.place) : null;
        return p && Math.abs(p.lat - target.lat) < 1e-4 && Math.abs(p.lon - target.lon) < 1e-4;
      });
      if (!known) {
        this.pins = [{ lat: target.lat, lon: target.lon, label }];
        this.build(this.geo);
        this.stage.append(hud.root);
      }
      this.renderSide();
      this.announce(t('mapTargetLocated', { label, coords: formatCoords(target.lat, target.lon, this.coordsFormat) })); // prettier-ignore
      emit(this, EVENTS.SELECT, { type: 'target', label, lat: target.lat, lon: target.lon });
      this.changed();
      await wait(6000, signal);
    } catch {
      // Stopped: the map stays where it is.
    } finally {
      this.root.removeEventListener('keydown', /** @type {EventListener} */ (onKey));
      hud.root.remove();
      this.stage?.classList.remove('movie');
      if (this.movie === controller) this.movie = null;
    }
    return true;
  }

  /**
   * The surveillance screen laid over the map during the film sequence.
   *
   * @returns {{ root: HTMLElement, coords: HTMLElement, stop: HTMLButtonElement, log: (text: string) => void }} // prettier-ignore
   */
  hudView() {
    const lines = h('ol', { class: 'hud-log', attrs: { 'aria-hidden': 'true' } });
    const coords = h('div', { class: 'hud-coords', attrs: { 'aria-hidden': 'true' } });
    const stop = /** @type {HTMLButtonElement} */ (h('button', { class: 'hud-stop', attrs: { type: 'button' }, text: this.t('mapStop') })); // prettier-ignore
    const time = h('div', { class: 'hud-time', attrs: { 'aria-hidden': 'true' } });
    time.textContent = `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;
    const root = h(
      'div',
      { class: 'map-hud', part: 'hud' },
      h('div', { class: 'hud-scan', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'hud-corners', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'hud-reticle', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'hud-ring' }), h('span', { class: 'hud-box' })), // prettier-ignore
      h('div', { class: 'hud-top', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'hud-rec', text: 'REC' }), h('span', { text: 'SAT-7 // ORBITAL FEED' }), time), // prettier-ignore
      lines,
      coords,
      h('div', { class: 'hud-locked', attrs: { 'aria-hidden': 'true' } }, h('strong', { text: 'TARGET LOCATED' })), // prettier-ignore
      stop,
    );
    return {
      root,
      coords,
      stop,
      log: (text) => {
        lines.append(h('li', { text: `> ${text}` }));
        while (lines.children.length > 5) lines.firstElementChild?.remove();
      },
    };
  }

  /**
   * Moves the view to a place over a duration, eased; resolves at the end or when stopped.
   *
   * @param {{ lon: number, lat: number, zoom: number }} to
   * @param {number} duration
   * @param {AbortSignal} signal
   * @param {(progress: number) => void} [onFrame]
   * @returns {Promise<void>}
   */
  animateView(to, duration, signal, onFrame) {
    const from = { ...(this.viewState ?? this.initialView()) };
    const dLon = wrap(to.lon - from.lon);
    const lat = Math.max(-85, Math.min(85, to.lat));
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (/** @type {number} */ now) => {
        if (signal.aborted) return resolve();
        const p = Math.min(1, (now - start) / duration);
        const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
        this.viewState = { lon: wrap(from.lon + dLon * e), lat: from.lat + (lat - from.lat) * e, zoom: from.zoom * (to.zoom / from.zoom) ** e }; // prettier-ignore
        this.update();
        onFrame?.(p);
        if (p < 1) this.flight = requestAnimationFrame(step);
        else resolve();
      };
      this.flight = requestAnimationFrame(step);
    });
  }

  /**
   * @param {LatLon} at
   * @param {string} label
   */
  dropPin(at, label) {
    this.pins = [{ lat: at.lat, lon: at.lon, label }];
    const view = this.viewState ?? this.initialView();
    this.build(this.geo);
    this.renderSide();
    this.flyTo(at, Math.max(view.zoom, AZIMUTHAL.has(this.projectionName) ? 2 : 4));
    this.status(this.t('mapFound', { label, coords: formatCoords(at.lat, at.lon, this.coordsFormat) })); // prettier-ignore
    this.selectPoint(at, label);
  }

  /**
   * @param {string} message
   */
  status(message) {
    if (this.statusLine) this.statusLine.textContent = message;
  }

  /**
   * Asks the page's geocoder for an address, once per page.
   *
   * @param {string} address
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ lat: number, lon: number, name: string } | null>}
   */
  async geocode(address, signal) {
    const key = address.toLowerCase();
    const cached = geocoded.get(key);
    if (cached === 'none') return null;
    if (cached && cached !== 'pending') return cached;
    const url = geocoderUrl(this.getAttribute('geocoder') ?? '', address, this.locale);
    if (!url) return null;
    try {
      const response = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' }, signal }); // prettier-ignore
      if (!response.ok) throw new Error(String(response.status));
      const hit = readGeocoder(await response.json());
      geocoded.set(key, hit ?? 'none');
      return hit;
    } catch (error) {
      if (/** @type {any} */ (error)?.name !== 'AbortError') geocoded.delete(key);
      return null;
    }
  }

  /** Geocodes the addresses of the content, one after the other, then moves their pins. */
  async geocodeItems() {
    const geocoder = this.getAttribute('geocoder');
    const addresses = this.input()
      .items.flatMap((i) =>
        i.kind === 'marker' && 'address' in i.place
          ? [i.place.address]
          : i.kind === 'route'
            ? i.stops.flatMap((p) => ('address' in p ? [p.address] : []))
            : [],
      ) // prettier-ignore
      .filter((a) => !geocoded.has(a.toLowerCase()))
      .slice(0, MAX_GEOCODE);
    if (!geocoder || !addresses.length) return;
    this.geocoding?.abort();
    const controller = new AbortController();
    this.geocoding = controller;
    for (const [i, address] of addresses.entries()) {
      if (controller.signal.aborted) return;
      // Public services ask for at most one request a second.
      if (i) await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.geocode(address, controller.signal);
      if (controller.signal.aborted) return;
      this.update();
      this.renderSide();
    }
  }

  // ---------------------------------------------------------------- legend and list

  /** Legend of values and the list of items, under the map. */
  renderSide() {
    const t = this.t;
    const { items } = this.input();
    const legendHost = this.root.querySelector('.map-legend-host');
    const values = items.flatMap((i) => (i.kind === 'country' && i.value !== null && !i.color ? [i.value] : [])); // prettier-ignore
    if (legendHost) {
      legendHost.replaceChildren();
      if (values.length) {
        legendHost.append(
          h(
            'div',
            { class: 'map-legend', part: 'legend', attrs: { role: 'group', 'aria-label': t('mapLegend') } }, // prettier-ignore
            h('span', { class: 'map-legend-value', text: this.number(Math.min(...values)) }),
            h('span', { class: 'map-legend-bar', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'map-legend-value', text: this.number(Math.max(...values)) }),
          ),
        );
      }
    }
    const listHost = this.root.querySelector('.map-list-host');
    if (!listHost) return;
    listHost.replaceChildren();
    const rows = [];
    for (const item of items) {
      if (item.kind === 'marker') {
        const at = this.locate(item.place);
        const label = this.markerLabel(item);
        const pending = 'address' in item.place && !at;
        const note = at ? formatCoords(at.lat, at.lon, this.coordsFormat) : this.getAttribute('geocoder') ? t('mapLocating') : t('mapNeedsGeocoder'); // prettier-ignore
        rows.push(this.rowView('marker', label, note, item.color, at ? () => this.flyTo(at, Math.max((this.viewState ?? this.initialView()).zoom, 4)) : null, pending)); // prettier-ignore
      } else if (item.kind === 'country') {
        const name = countryName(item.code, this.locale);
        const note = [item.code.a2 || item.code.a3, item.value !== null ? this.number(item.value) : ''].filter(Boolean).join(' · '); // prettier-ignore
        rows.push(this.rowView('country', `${flag(item.code.a2)} ${item.label || name}`.trim(), note, item.color, () => this.selectCountry(item.code, true), false)); // prettier-ignore
      } else if (item.kind === 'route') {
        const stops = item.stops.map((p) => this.locate(p));
        const names = item.stops.map((p) => ('name' in p && p.name ? p.name : 'address' in p ? p.address : 'country' in p ? countryName(p.country, this.locale) : formatCoords(p.lat, p.lon, this.coordsFormat))); // prettier-ignore
        let km = 0;
        for (let i = 1; i < stops.length; i++) {
          const a = stops[i - 1];
          const b = stops[i];
          if (a && b) km += distanceKm(a, b);
        }
        const first = stops[0];
        rows.push(this.rowView('route', item.label || names.join(' → '), km ? t('mapDistance', { km: this.number(Math.round(km)) }) : '', item.color, first ? () => this.flyTo(first, 2) : null, false)); // prettier-ignore
      } else if (item.kind === 'shape') {
        rows.push(this.rowView('shape', item.label || t('mapShape'), item.geometry.type, item.color, null, false)); // prettier-ignore
      }
    }
    for (const pin of this.pins) rows.push(this.rowView('pin', pin.label, formatCoords(pin.lat, pin.lon, this.coordsFormat), '', () => this.flyTo(pin, Math.max((this.viewState ?? this.initialView()).zoom, 4)), false)); // prettier-ignore
    if (!rows.length) return;
    listHost.append(h('ul', { class: 'map-list', part: 'list', attrs: { 'aria-label': t('mapList') } }, ...rows)); // prettier-ignore
  }

  /**
   * @param {"marker" | "country" | "route" | "shape" | "pin"} kind
   * @param {string} label
   * @param {string} note
   * @param {string} color
   * @param {(() => void) | null} go
   * @param {boolean} pending
   * @returns {HTMLElement}
   */
  rowView(kind, label, note, color, go, pending) {
    const t = this.t;
    const swatch = h('span', { class: `map-swatch ${kind}`, attrs: { 'aria-hidden': 'true' } });
    if (color) swatch.style.setProperty('--map-item', color);
    const kindText = h('span', { class: 'sr-only', text: `${t(/** @type {StringKey} */ (`mapKind_${kind}`))}: ` }); // prettier-ignore
    const name = go
      ? h('button', { class: 'map-item-go', attrs: { type: 'button', title: t('mapShow', { label }) }, on: { click: go } }, kindText, label) // prettier-ignore
      : h('span', { class: 'map-item-name' }, kindText, label);
    return h('li', { class: `map-item ${kind}${pending ? ' pending' : ''}` }, swatch, name, note ? h('span', { class: 'map-item-note', text: note }) : null); // prettier-ignore
  }

  // ---------------------------------------------------------------- output

  /**
   * @param {number} value
   * @returns {string}
   */
  number(value) {
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(value);
  }

  /** @returns {string} One line per item, with coordinates. */
  report() {
    const lines = [];
    for (const item of this.input().items) {
      if (item.kind === 'marker') {
        const at = this.locate(item.place);
        lines.push(`${this.markerLabel(item)}: ${at ? formatCoords(at.lat, at.lon) : '?'}`);
      } else if (item.kind === 'country') lines.push(`${countryName(item.code, this.locale)} (${item.code.a2 || item.code.a3})${item.value !== null ? `: ${item.value}` : ''}`); // prettier-ignore
      else if (item.kind === 'route') lines.push(item.stops.map((p) => { const at = this.locate(p); return at ? formatCoords(at.lat, at.lon) : '?'; }).join(' -> ')); // prettier-ignore
    }
    for (const pin of this.pins) lines.push(`${pin.label}: ${formatCoords(pin.lat, pin.lon)}`);
    return lines.join('\n');
  }

  /** @returns {string} The items as a GeoJSON FeatureCollection. */
  geoJson() {
    const features = [];
    for (const item of this.input().items) {
      const properties = { name: item.kind === 'marker' ? this.markerLabel(item) : item.label || undefined, color: item.color || undefined }; // prettier-ignore
      if (item.kind === 'marker') {
        const at = this.locate(item.place);
        if (at) features.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [at.lon, at.lat] } }); // prettier-ignore
      } else if (item.kind === 'route') {
        const stops = item.stops.map((p) => this.locate(p));
        if (stops.every(Boolean)) features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: /** @type {LatLon[]} */ (stops).map((p) => [p.lon, p.lat]) } }); // prettier-ignore
      } else if (item.kind === 'shape')
        features.push({ type: 'Feature', properties, geometry: item.geometry }); // prettier-ignore
      else if (item.kind === 'country') {
        const feature = this.geo?.countries.find((/** @type {any} */ f) => codeOfShape(f.id, f.properties?.name).a3 === item.code.a3); // prettier-ignore
        features.push({ type: 'Feature', properties: { ...properties, name: countryName(item.code, this.locale), code: item.code.a3, value: item.value ?? undefined }, geometry: feature?.geometry ?? null }); // prettier-ignore
      }
    }
    for (const pin of this.pins) features.push({ type: 'Feature', properties: { name: pin.label }, geometry: { type: 'Point', coordinates: [pin.lon, pin.lat] } }); // prettier-ignore
    return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  }

  /** Fires `vt-change` with the view. */
  changed() {
    clearTimeout(this.changeTimer);
    emit(this, EVENTS.CHANGE, this.view);
  }

  /** `vt-change` once the wheel or the keys stop. */
  changedSoon() {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => emit(this, EVENTS.CHANGE, this.view), 300);
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: true,
      wrap: true,
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
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}

/**
 * The look of a country from the sky: ice, tundra, forest, desert or tropics, from where
 * its largest part lies (used by the `satellite` base map).
 *
 * @param {any} geo
 * @param {any} feature
 * @param {CountryCode} code
 * @returns {string}
 */
function climate(geo, feature, code) {
  if (code.a3 === 'ATA' || code.a3 === 'GRL') return 'ice';
  const DESERT = new Set(['DZA', 'LBY', 'EGY', 'MRT', 'MLI', 'NER', 'TCD', 'SDN', 'ESH', 'SAU', 'YEM', 'OMN', 'ARE', 'QAT', 'KWT', 'IRQ', 'JOR', 'SYR', 'IRN', 'AFG', 'PAK', 'TKM', 'UZB', 'KAZ', 'MNG', 'NAM', 'BWA', 'AUS', 'DJI', 'SOM', 'SOL', 'ERI', 'ISR', 'PSE', 'TUN', 'MAR']); // prettier-ignore
  if (DESERT.has(code.a3)) return 'desert';
  let lat = latitudes.get(feature);
  if (lat === undefined) {
    lat = /** @type {number} */ (geo.geoCentroid(feature)[1]);
    latitudes.set(feature, lat);
  }
  const a = Math.abs(lat);
  if (a > 58) return 'tundra';
  if (a > 35) return 'forest';
  if (a > 20) return 'steppe';
  return 'tropic';
}

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * @param {number} lon
 * @returns {number}
 */
function wrap(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * @param {Map<number, [number, number]>} pointers
 * @returns {number}
 */
function spread(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
}
