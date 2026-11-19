// @ts-check
/**
 * What <vt-map> shows, read from its content: places as markers (coordinates in any common
 * notation, built-in cities, addresses for a geocoder), countries to highlight with a
 * color or a value, routes between places, and GeoJSON. Pure functions, no map library:
 * the shapes and projections are loaded only when a map is drawn.
 *
 * @module components/map/map
 */
import { findCountry } from './countries.js';
import { findCity } from './places.js';

/** @typedef {import('./countries.js').CountryCode} CountryCode */
/** @typedef {{ lat: number, lon: number }} LatLon */
/**
 * Where something is: coordinates (with the city or text they came from), or an address
 * still to geocode, or a country (its centre is known once the shapes are loaded).
 *
 * @typedef {{ lat: number, lon: number, source: "coords" | "city" | "geocoded", name?: string }
 *   | { address: string } | { country: CountryCode }} Place
 */
/** @typedef {{ kind: "marker", label: string, color: string, place: Place, text: string }} Marker */
/** @typedef {{ kind: "country", code: CountryCode, label: string, color: string, value: number | null, text: string }} CountryMark */
/** @typedef {{ kind: "route", label: string, color: string, stops: Place[], text: string }} Route */
/** @typedef {{ kind: "shape", label: string, color: string, geometry: any, text: string }} Shape */
/** @typedef {Marker | CountryMark | Route | Shape} Item */
/** @typedef {{ items: Item[], invalid: string[], view: { center?: LatLon, zoom?: number } }} MapInput */

const MAX_ITEMS = 2000;
const COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ROUTE = /\s*(?:->|→|=>|⟶)\s*/;

/**
 * Reads the content: JSON or GeoJSON when it looks like JSON, else one item per line.
 *
 * @param {string} text
 * @param {string} [locale]
 * @returns {MapInput}
 */
export function readInput(text, locale = 'en') {
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    try {
      return readJson(JSON.parse(trimmed), locale);
    } catch {
      // Not JSON after all: read it as lines (it may start with a bracket by chance).
    }
  }
  /** @type {Item[]} */
  const items = [];
  /** @type {string[]} */
  const invalid = [];
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('; ')) continue;
    if (items.length >= MAX_ITEMS) break;
    const item = readLine(line, locale);
    if (item) items.push(item);
    else invalid.push(line);
  }
  return { items, invalid, view: {} };
}

/**
 * One line: `[label: ]place [#color]`, `country [value] [#color]` or `place -> place`.
 *
 * @param {string} line
 * @param {string} locale
 * @returns {Item | null}
 */
export function readLine(line, locale = 'en') {
  let rest = line;
  let color = '';
  const colorMatch = rest.match(/\s+(#[0-9a-f]{3,8})$/i) ?? rest.match(/^(#[0-9a-f]{3,8})\s+/i);
  if (colorMatch && COLOR.test(colorMatch[1])) {
    color = colorMatch[1];
    rest = rest.replace(colorMatch[0], ' ').trim();
  }
  let label = '';
  const labelled = rest.match(/^([^:]{1,80}?)\s*:\s+(.+)$/);
  if (labelled && !/^(?:geo|https?)$/i.test(labelled[1])) {
    label = labelled[1].trim();
    rest = labelled[2].trim();
  }
  if (ROUTE.test(rest)) {
    const stops = rest
      .split(ROUTE)
      .filter(Boolean)
      .map((part) => readPlace(part, locale));
    if (stops.length < 2 || stops.some((s) => !s)) return null;
    return { kind: 'route', label, color, stops: /** @type {Place[]} */ (stops), text: line };
  }
  // A country, with an optional value: "France", "FR 67.4", "Germany = 12".
  const valued = rest.match(/^(.+?)\s*(?:=\s*)?([+-]?\d+(?:[.,]\d+)?)\s*(%)?$/);
  const country = findCountry(rest, locale) ?? (valued ? findCountry(valued[1], locale) : null);
  if (country && !parseCoords(rest)) {
    const value = country === findCountry(rest, locale) || !valued ? null : Number(valued[2].replace(',', '.')); // prettier-ignore
    return { kind: 'country', code: country, label, color, value, text: line };
  }
  // Coordinates followed by a label: "48.8566, 2.3522 Paris office".
  const pair = rest.match(/^([+-]?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*([+-]?\d{1,3}(?:\.\d+)?)\s+([^\d\s°'"′″].*)$/u); // prettier-ignore
  if (pair && !label) {
    const coords = parseCoords(`${pair[1]}, ${pair[2]}`);
    if (coords) return marker(pair[3].trim(), color, { ...coords, source: 'coords' }, line);
  }
  // Any other notation followed by a label: "48°51′24″N 2°21′08″E Eiffel Tower".
  if (!label && !parseCoords(rest)) {
    const words = rest.split(/\s+/);
    for (let n = words.length - 1; n >= 2; n--) {
      const coords = parseCoords(words.slice(0, n).join(' '));
      if (coords) return marker(words.slice(n).join(' '), color, { ...coords, source: 'coords' }, line); // prettier-ignore
    }
  }
  const place = readPlace(rest, locale);
  return place ? marker(label, color, place, line) : null;
}

/**
 * @param {string} label
 * @param {string} color
 * @param {Place} place
 * @param {string} text
 * @returns {Marker}
 */
function marker(label, color, place, text) {
  return { kind: 'marker', label, color, place, text };
}

/**
 * Coordinates, a built-in city, a country (for a route) or else an address.
 *
 * @param {string} text
 * @param {string} [locale]
 * @returns {Place | null}
 */
export function readPlace(text, locale = 'en') {
  const value = text.trim();
  if (!value) return null;
  const coords = parseCoords(value);
  if (coords) return { ...coords, source: 'coords' };
  const city = findCity(value);
  if (city) return { lat: city.lat, lon: city.lon, source: 'city', name: city.name };
  const country = findCountry(value, locale);
  if (country) return { country };
  // Something with letters that is not a number pair: an address for the geocoder.
  if (/\p{L}/u.test(value) && value.length <= 300) return { address: value };
  return null;
}

/**
 * Reads coordinates written in the common ways: `48.8566, 2.3522`, `48.8566 2.3522`,
 * `48°51′24″N 2°21′08″E`, `N 48.85 E 2.35`, `48.85N, 2.35W`, `geo:48.85,2.35`, and map
 * links (`@lat,lon`, `?q=lat,lon`, `mlat=…&mlon=…`, `#map=zoom/lat/lon`).
 *
 * @param {string} text
 * @returns {LatLon | null}
 */
export function parseCoords(text) {
  const value = text.trim();
  if (!value || value.length > 200) return null;
  const link =
    value.match(/^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/i) ??
    value.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/) ??
    value.match(/[?&](?:q|ll|query)=([+-]?\d+(?:\.\d+)?)(?:,|%2C)\s*([+-]?\d+(?:\.\d+)?)/i) ??
    value.match(/[#&]map=\d+(?:\.\d+)?\/([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)/);
  if (link) return valid(Number(link[1]), Number(link[2]));
  const mlat = value.match(/[?&]mlat=([+-]?\d+(?:\.\d+)?)/);
  const mlon = value.match(/[?&]mlon=([+-]?\d+(?:\.\d+)?)/);
  if (mlat && mlon) return valid(Number(mlat[1]), Number(mlon[1]));
  if (!/^[\s\d.,;:+\-°º'′’"″NSEWOnsewo]+$/.test(value) || !/\d/.test(value)) return null;
  if (/[a-z]{2}/i.test(value)) return null;

  /** @typedef {{ deg?: number, min?: number, sec?: number, hem?: string, negative?: boolean }} Part */
  /** @type {Part[]} */
  const parts = [];
  /** @type {Part} */
  let current = {};
  let prefix = '';
  const tokens = value.match(/[NSEWO]|[+-]?\d+(?:\.\d+)?\s*(?:°|º|''|["″]|['′’])?/gi) ?? [];
  for (const raw of tokens) {
    const token = raw.trim();
    if (/^[NSEWO]$/i.test(token)) {
      const hem = token.toUpperCase() === 'O' ? 'W' : token.toUpperCase();
      if (current.deg !== undefined && !current.hem && !prefix) current.hem = hem;
      else {
        if (current.deg !== undefined) parts.push(current);
        current = {};
        prefix = hem;
      }
      continue;
    }
    const number = Number.parseFloat(token);
    const unit = token.replace(/^[+-]?\d+(?:\.\d+)?\s*/, '');
    if (/^(?:''|["″])$/.test(unit)) current.sec = number;
    else if (/^['′’]$/.test(unit)) current.min = number;
    else {
      if (current.deg !== undefined) {
        parts.push(current);
        current = {};
      }
      current.deg = Math.abs(number);
      current.negative = number < 0 || Object.is(number, -0) || token.startsWith('-');
      if (prefix) {
        current.hem = prefix;
        prefix = '';
      }
    }
  }
  if (current.deg !== undefined) parts.push(current);
  if (parts.length !== 2) return null;
  const decimal = (/** @type {Part} */ p) => {
    if ((p.min ?? 0) >= 60 || (p.sec ?? 0) >= 60) return NaN;
    const v = (p.deg ?? 0) + (p.min ?? 0) / 60 + (p.sec ?? 0) / 3600;
    return p.negative || p.hem === 'S' || p.hem === 'W' ? -v : v;
  };
  let [a, b] = parts;
  // Hemispheres decide which is which: "2°E 48°N" is still latitude 48.
  if ((a.hem === 'E' || a.hem === 'W') && (!b.hem || b.hem === 'N' || b.hem === 'S')) [a, b] = [b, a]; // prettier-ignore
  if (a.hem === 'E' || a.hem === 'W' || b.hem === 'N' || b.hem === 'S') return null;
  return valid(decimal(a), decimal(b));
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {LatLon | null}
 */
function valid(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * JSON: `{ markers, countries, routes, center, zoom }`, an array of markers, or GeoJSON
 * (a FeatureCollection, a Feature or a geometry).
 *
 * @param {any} data
 * @param {string} locale
 * @returns {MapInput}
 */
export function readJson(data, locale = 'en') {
  /** @type {Item[]} */
  const items = [];
  /** @type {string[]} */
  const invalid = [];
  /** @type {MapInput["view"]} */
  const view = {};
  const str = (/** @type {any} */ v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''); // prettier-ignore
  const colorOf = (/** @type {any} */ o) => {
    const c = str(o?.color ?? o?.['marker-color'] ?? o?.stroke ?? o?.fill);
    return COLOR.test(c) ? c : '';
  };
  const labelOf = (/** @type {any} */ o) => str(o?.label ?? o?.name ?? o?.title ?? o?.text).slice(0, 200); // prettier-ignore

  /** @returns {Place | null} */
  const placeOf = (/** @type {any} */ o) => {
    if (typeof o === 'string') return readPlace(o, locale);
    if (Array.isArray(o) && o.length >= 2) return asCoords(valid(Number(o[1]), Number(o[0]))); // GeoJSON order
    if (!o || typeof o !== 'object') return null;
    const lat = o.lat ?? o.latitude;
    const lon = o.lon ?? o.lng ?? o.long ?? o.longitude;
    if (lat !== undefined && lon !== undefined) return asCoords(valid(Number(lat), Number(lon)));
    const text = str(o.address ?? o.place ?? o.city ?? o.query ?? o.coords);
    return text ? readPlace(text, locale) : null;
  };

  /** @param {any} feature */
  const fromGeoJson = (feature) => {
    const geometry = feature?.type === 'Feature' ? feature.geometry : feature;
    const props = feature?.type === 'Feature' ? (feature.properties ?? {}) : {};
    if (!geometry || typeof geometry.type !== 'string') return;
    const label = labelOf(props);
    const color = colorOf(props);
    if (geometry.type === 'Point') {
      const place = placeOf(geometry.coordinates);
      if (place) items.push(marker(label, color, place, label));
      else invalid.push(JSON.stringify(geometry.coordinates));
    } else if (geometry.type === 'MultiPoint') {
      for (const c of geometry.coordinates ?? []) {
        const place = placeOf(c);
        if (place) items.push(marker(label, color, place, label));
      }
    } else if (geometry.type === 'GeometryCollection') {
      for (const g of geometry.geometries ?? []) fromGeoJson({ type: 'Feature', properties: props, geometry: g }); // prettier-ignore
    } else if (/^(?:Multi)?(?:LineString|Polygon)$/.test(geometry.type)) {
      items.push({ kind: 'shape', label, color, geometry, text: label || geometry.type });
    }
  };

  if (data?.type === 'FeatureCollection') {
    for (const f of (data.features ?? []).slice(0, MAX_ITEMS)) fromGeoJson(f);
    return { items, invalid, view };
  }
  if (
    data?.type === 'Feature' ||
    /^(?:Multi)?(?:Point|LineString|Polygon)$|^GeometryCollection$/.test(data?.type ?? '')
  ) {
    // prettier-ignore
    fromGeoJson(data);
    return { items, invalid, view };
  }

  const markers = Array.isArray(data) ? data : (data?.markers ?? data?.places ?? data?.points ?? []); // prettier-ignore
  for (const m of Array.isArray(markers) ? markers.slice(0, MAX_ITEMS) : []) {
    const place = placeOf(m);
    if (place && !('country' in place))
      items.push(marker(labelOf(m), colorOf(m), place, labelOf(m) || JSON.stringify(m))); // prettier-ignore
    else invalid.push(typeof m === 'string' ? m : JSON.stringify(m));
  }
  const countries = data?.countries ?? data?.highlight;
  /** @type {[string, any][]} */
  const entries = Array.isArray(countries)
    ? countries.map((c) => (typeof c === 'string' ? [c, null] : [str(c?.code ?? c?.id ?? c?.country ?? c?.name), c])) // prettier-ignore
    : countries && typeof countries === 'object' ? Object.entries(countries) : []; // prettier-ignore
  for (const [key, v] of entries) {
    const code = findCountry(key, locale);
    if (!code) {
      invalid.push(key);
      continue;
    }
    const value = typeof v === 'number' ? v : typeof v?.value === 'number' ? v.value : null;
    const color = typeof v === 'string' && COLOR.test(v) ? v : colorOf(v);
    items.push({ kind: 'country', code, label: labelOf(v), color, value, text: key });
  }
  for (const r of Array.isArray(data?.routes) ? data.routes : []) {
    const list = Array.isArray(r) ? r : (r?.stops ?? [r?.from, r?.to]);
    const stops = (Array.isArray(list) ? list : []).map(placeOf);
    if (stops.length >= 2 && stops.every(Boolean))
      items.push({ kind: 'route', label: labelOf(r), color: colorOf(r), stops: /** @type {Place[]} */ (stops), text: labelOf(r) || 'route' }); // prettier-ignore
    else invalid.push(JSON.stringify(r));
  }
  for (const f of Array.isArray(data?.features) ? data.features : []) fromGeoJson(f);
  const center = data?.center ? placeOf(data.center) : null;
  if (center && 'lat' in center) view.center = { lat: center.lat, lon: center.lon };
  if (typeof data?.zoom === 'number') view.zoom = data.zoom;
  return { items, invalid, view };
}

/**
 * @param {LatLon | null} c
 * @returns {Place | null}
 */
function asCoords(c) {
  return c ? { ...c, source: 'coords' } : null;
}

/**
 * Coordinates as text: decimal degrees (`48.85660, 2.35220`) or degrees, minutes and
 * seconds (`48°51′23.8″N 2°21′07.9″E`).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {"decimal" | "dms"} [format]
 * @returns {string}
 */
export function formatCoords(lat, lon, format = 'decimal') {
  if (format === 'decimal') return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const dms = (/** @type {number} */ v, /** @type {string} */ pos, /** @type {string} */ neg) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Math.floor((a - d) * 60);
    let s = Math.round(((a - d) * 60 - m) * 600) / 10;
    if (s >= 60) [s, m] = [0, m + 1];
    if (m >= 60) [m, d] = [0, d + 1];
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${v < 0 ? neg : pos}`; // prettier-ignore
  };
  return `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`;
}

/**
 * Great-circle distance in kilometres (haversine, mean Earth radius).
 *
 * @param {LatLon} a
 * @param {LatLon} b
 * @returns {number}
 */
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2; // prettier-ignore
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Reads a geocoder response: Nominatim (`[{ lat, lon, display_name }]`), GeoJSON (Photon,
 * Nominatim `format=geojson`, the French BAN), Google-like `{ results: [{ geometry: {
 * location } }] }`, or a single `{ lat, lon }`.
 *
 * @param {any} data
 * @returns {{ lat: number, lon: number, name: string } | null}
 */
export function readGeocoder(data) {
  const first = Array.isArray(data) ? data[0] : (data?.features?.[0] ?? data?.results?.[0] ?? data); // prettier-ignore
  if (!first || typeof first !== 'object') return null;
  const name = String(first.display_name ?? first.properties?.label ?? first.properties?.display_name ?? first.properties?.name ?? first.formatted_address ?? first.name ?? ''); // prettier-ignore
  const coords = first.geometry?.coordinates;
  if (Array.isArray(coords)) {
    const c = valid(Number(coords[1]), Number(coords[0]));
    return c ? { ...c, name } : null;
  }
  const loc = first.geometry?.location ?? first;
  const c = valid(Number(loc.lat ?? loc.latitude), Number(loc.lon ?? loc.lng ?? loc.longitude));
  return c ? { ...c, name } : null;
}

/**
 * The geocoder URL for a query, from the `geocoder` attribute: `nominatim`, `photon`, `ban`
 * (the French address base), or an http(s) URL template with `{q}`.
 *
 * @param {string} geocoder
 * @param {string} query
 * @param {string} [lang]
 * @returns {string | null}
 */
export function geocoderUrl(geocoder, query, lang = 'en') {
  const q = encodeURIComponent(query);
  const presets = /** @type {Record<string, string>} */ ({
    nominatim: `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${encodeURIComponent(lang)}&q={q}`, // prettier-ignore
    photon: 'https://photon.komoot.io/api/?limit=1&q={q}',
    ban: 'https://api-adresse.data.gouv.fr/search/?limit=1&q={q}',
  });
  const template = presets[geocoder.trim().toLowerCase()] ?? geocoder.trim();
  if (!/^https?:\/\//i.test(template) || !template.includes('{q}')) return null;
  return template.replaceAll('{q}', q);
}
