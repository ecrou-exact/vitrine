// @ts-check
/**
 * HAR files (HTTP Archive 1.2, as browsers, Playwright, Lookyloo and proxies export them) read
 * into the requests of each page with their timing phases, types, sizes and domains, the
 * redirect chain of the page, and what stands out: errors, redirects, third parties, mixed
 * content.
 *
 * @module components/waterfall/waterfall
 */
import { registeredDomain } from '../url/url.js';

/** Most entries read. */
export const MAX_ENTRIES = 5000;
/** Most headers kept per request or response. */
const MAX_HEADERS = 200;

/** Timing phases, in the order they happen (HAR 1.2 `timings`). */
export const PHASES = Object.freeze(['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive']); // prettier-ignore
/** Resource types, in the order of the filters. */
export const TYPES = Object.freeze(['document', 'script', 'style', 'image', 'font', 'xhr', 'media', 'other']); // prettier-ignore

/**
 * @typedef {typeof PHASES[number]} Phase
 * @typedef {typeof TYPES[number]} ResourceType
 * @typedef {{ name: string, value: string }} Header
 * @typedef {object} Entry
 * @property {number} index - 1-based, in the order of the file.
 * @property {string} pageref
 * @property {number} start - Milliseconds since the start of the page.
 * @property {number} time - Total time (ms).
 * @property {Record<Phase, number>} timings - Each phase in ms (0 when absent; `connect` without `ssl`).
 * @property {string} method
 * @property {string} url
 * @property {string} host
 * @property {string} domain - Registered domain.
 * @property {string} scheme
 * @property {number} status - 0 when the request failed or was blocked.
 * @property {string} statusText
 * @property {string} httpVersion
 * @property {string} mime
 * @property {ResourceType} type
 * @property {number} size - Size of the content (bytes, decoded), -1 when unknown.
 * @property {number} transfer - Bytes received, -1 when unknown.
 * @property {string} ip
 * @property {string} redirect - `redirectURL`, resolved.
 * @property {boolean} cached
 * @property {Header[]} requestHeaders
 * @property {Header[]} responseHeaders
 * @property {boolean} thirdParty - On another registered domain than the page.
 * @property {boolean} mixed - HTTP on an HTTPS page.
 * @property {boolean} failed - Status 0 or 4xx / 5xx.
 * @typedef {object} Page
 * @property {string} id
 * @property {string} title
 * @property {number} started - Epoch (ms).
 * @property {number} onContentLoad - ms since the start, -1 when unknown.
 * @property {number} onLoad - ms since the start, -1 when unknown.
 * @property {string} url - The first document requested.
 * @property {string} domain
 * @property {Entry[]} entries
 * @property {string[]} redirects - The URLs the page went through before the final document.
 * @property {number} duration - End of the last request (ms).
 * @typedef {{ creator: string, browser: string, pages: Page[], capped: boolean }} Har
 * @typedef {{ ok: true, har: Har } | { ok: false, error: "empty" | "json" | "format", detail?: string }} HarResult
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
const str = (value, max = 8192) => (typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' ? String(value) : ''); // prettier-ignore

/**
 * @param {unknown} value
 * @returns {number} The number, or -1.
 */
const num = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : -1); // prettier-ignore

/**
 * @param {unknown} list
 * @returns {Header[]}
 */
function headers(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_HEADERS)
    .filter(isObject)
    .map((x) => ({ name: str(x.name, 200), value: str(x.value).replace(/[\r\n]+/g, ' ') }));
}

/** Chrome and Playwright `_resourceType` values. */
const RESOURCE_TYPES = /** @type {Record<string, ResourceType>} */ ({
  document: 'document', script: 'script', stylesheet: 'style', image: 'image', font: 'font',
  xhr: 'xhr', fetch: 'xhr', eventsource: 'xhr', websocket: 'xhr', preflight: 'xhr', ping: 'xhr',
  media: 'media', manifest: 'other', other: 'other', texttrack: 'media',
}); // prettier-ignore

/**
 * @param {string} resourceType
 * @param {string} mime
 * @param {string} url
 * @returns {ResourceType}
 */
export function typeOf(resourceType, mime, url) {
  const known = RESOURCE_TYPES[resourceType.toLowerCase()];
  if (known) return known;
  const m = mime.toLowerCase();
  if (/html|xhtml/.test(m)) return 'document';
  if (/javascript|ecmascript|wasm/.test(m)) return 'script';
  if (/css/.test(m)) return 'style';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('font/') || /woff|truetype|opentype|fontobject/.test(m)) return 'font';
  if (m.startsWith('audio/') || m.startsWith('video/')) return 'media';
  if (/json|xml|text\/plain|event-stream|protobuf|grpc/.test(m)) return 'xhr';
  const ext = /\.([a-z0-9]{1,5})(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  if (/^(?:js|mjs)$/.test(ext)) return 'script';
  if (ext === 'css') return 'style';
  if (/^(?:png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(ext)) return 'image';
  if (/^(?:woff2?|ttf|otf|eot)$/.test(ext)) return 'font';
  if (/^(?:mp4|webm|mp3|ogg|wav|m3u8)$/.test(ext)) return 'media';
  return 'other';
}

/**
 * @param {string} url
 * @returns {{ host: string, scheme: string }}
 */
function hostOf(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, scheme: parsed.protocol.replace(':', '') };
  } catch {
    return { host: '', scheme: '' };
  }
}

/**
 * @param {string} target
 * @param {string} base
 * @returns {string}
 */
function resolve(target, base) {
  if (!target) return '';
  try {
    return new URL(target, base).href;
  } catch {
    return target;
  }
}

/**
 * @param {Record<string, any>} raw
 * @param {number} index
 * @returns {Entry & { epoch: number }}
 */
function readEntry(raw, index) {
  const request = isObject(raw.request) ? raw.request : {};
  const response = isObject(raw.response) ? raw.response : {};
  const content = isObject(response.content) ? response.content : {};
  const t = isObject(raw.timings) ? raw.timings : {};
  const url = str(request.url);
  const { host, scheme } = hostOf(url);
  const mime = str(content.mimeType, 200).split(';')[0].trim();
  /** @type {Record<Phase, number>} */
  const timings = { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 0, receive: 0 };
  for (const phase of PHASES) timings[phase] = Math.max(0, num(t[phase]));
  // In HAR, `connect` includes `ssl`: keep them apart so the bar adds up.
  if (timings.ssl > 0 && timings.connect >= timings.ssl) timings.connect -= timings.ssl;
  const total = num(raw.time);
  const sum = PHASES.reduce((s, p) => s + timings[p], 0);
  if (sum === 0 && total > 0) timings.wait = total;
  const status = Math.max(0, Math.trunc(num(response.status)));
  const headerSize = num(response.headersSize);
  const bodySize = num(response.bodySize);
  const transfer = num(response._transferSize) >= 0 ? num(response._transferSize) : bodySize >= 0 ? bodySize + Math.max(0, headerSize) : -1; // prettier-ignore
  const epoch = Date.parse(str(raw.startedDateTime, 64));
  return {
    index,
    epoch: Number.isFinite(epoch) ? epoch : 0,
    pageref: str(raw.pageref, 200),
    start: 0,
    time: total >= 0 ? total : sum,
    timings,
    method: str(request.method, 20).toUpperCase() || 'GET',
    url,
    host,
    domain: host ? registeredDomain(host) : '',
    scheme,
    status,
    statusText: str(response.statusText, 200),
    httpVersion: str(response.httpVersion || request.httpVersion, 20),
    mime,
    type: typeOf(str(raw._resourceType, 40), mime, url),
    size: num(content.size),
    transfer,
    ip: str(raw.serverIPAddress, 64).replace(/^\[|\]$/g, ''),
    redirect: resolve(str(response.redirectURL), url),
    cached: status === 304 || (isObject(raw.cache) && Object.keys(raw.cache).some((k) => isObject(raw.cache[k]))) || raw._fromCache === true || typeof raw._fromCache === 'string', // prettier-ignore
    requestHeaders: headers(request.headers),
    responseHeaders: headers(response.headers),
    thirdParty: false,
    mixed: false,
    failed: status === 0 || status >= 400,
  };
}

/**
 * The URLs the page went through: the first document, then each redirect it follows.
 *
 * @param {Entry[]} entries
 * @returns {string[]}
 */
function redirectChain(entries) {
  const first = entries.find((e) => e.type === 'document') ?? entries[0];
  if (!first) return [];
  const chain = [first.url];
  let current = first;
  while (current.status >= 300 && current.status < 400 && current.redirect && chain.length < 30) {
    const target = current.redirect;
    chain.push(target);
    const next = entries.find((e) => e.url === target && e.start >= current.start && e !== current);
    if (!next) break;
    current = next;
  }
  return chain.length > 1 ? chain : [];
}

/**
 * Reads a HAR file: `{ log: { pages, entries } }`, the `log` alone, or a list of entries.
 *
 * @param {string} text
 * @returns {HarResult}
 */
export function parseHar(text) {
  if (!text.trim()) return { ok: false, error: 'empty' };
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: 'json', detail: error instanceof Error ? error.message.slice(0, 200) : '' }; // prettier-ignore
  }
  const log = isObject(value) && isObject(value.log) ? value.log : value;
  const rawEntries = Array.isArray(log) ? log : isObject(log) && Array.isArray(log.entries) ? log.entries : null; // prettier-ignore
  if (!rawEntries) return { ok: false, error: 'format' };
  const entries = rawEntries
    .slice(0, MAX_ENTRIES)
    .filter(isObject)
    .map((raw, i) => readEntry(raw, i + 1))
    .filter((e) => e.url);
  const rawPages = isObject(log) && Array.isArray(log.pages) ? log.pages.filter(isObject) : [];
  const creator = isObject(log) && isObject(log.creator) ? `${str(log.creator.name, 100)} ${str(log.creator.version, 40)}`.trim() : ''; // prettier-ignore
  const browser = isObject(log) && isObject(log.browser) ? `${str(log.browser.name, 100)} ${str(log.browser.version, 40)}`.trim() : ''; // prettier-ignore

  const groups = rawPages.length
    ? rawPages.slice(0, 100).map((p, i) => ({
        raw: p,
        list: entries.filter((e) => e.pageref === str(p.id, 200) || (!e.pageref && i === 0)),
      }))
    : [{ raw: /** @type {Record<string, any>} */ ({}), list: entries }];
  const pages = groups.filter((g) => g.list.length || rawPages.length === 1).map((g) => buildPage(g.raw, g.list)); // prettier-ignore
  return { ok: true, har: { creator, browser, pages, capped: rawEntries.length > MAX_ENTRIES } };
}

/**
 * @param {Record<string, any>} raw
 * @param {(Entry & { epoch: number })[]} list
 * @returns {Page}
 */
function buildPage(raw, list) {
  const times = list.map((e) => e.epoch).filter((t) => t > 0);
  const declared = Date.parse(str(raw.startedDateTime, 64));
  const started = Number.isFinite(declared) ? declared : times.length ? Math.min(...times) : 0;
  const origin = times.length ? Math.min(started, ...times) : started;
  const sorted = list
    .map(({ epoch, ...entry }) => ({ ...entry, start: epoch > 0 ? epoch - origin : 0 }))
    .sort((a, b) => a.start - b.start || a.index - b.index);
  // The page is the first document that is not a redirect: the one the visitor lands on.
  const document =
    sorted.find((e) => e.type === 'document' && !(e.status >= 300 && e.status < 400)) ??
    sorted.find((e) => e.type === 'document') ??
    sorted[0];
  const domain = document?.domain ?? '';
  const secure = document?.scheme === 'https';
  for (const e of sorted) {
    e.thirdParty = Boolean(domain && e.domain && e.domain !== domain);
    // Requests before the page (its redirects) are not mixed content.
    e.mixed = secure && Boolean(document) && e.start >= document.start && e !== document && (e.scheme === 'http' || e.scheme === 'ws'); // prettier-ignore
  }
  const timings = isObject(raw.pageTimings) ? raw.pageTimings : {};
  const shift = started - origin;
  const mark = (/** @type {unknown} */ v) => (num(v) >= 0 ? num(v) + shift : -1);
  return {
    id: str(raw.id, 200),
    title: str(raw.title, 500),
    started: origin,
    onContentLoad: mark(timings.onContentLoad),
    onLoad: mark(timings.onLoad),
    url: document?.url ?? '',
    domain,
    entries: sorted,
    redirects: redirectChain(sorted),
    duration: Math.max(0, ...sorted.map((e) => e.start + e.time), mark(timings.onLoad)),
  };
}

/**
 * Totals of a page.
 *
 * @param {Entry[]} entries
 */
export function totals(entries) {
  const domains = new Set(entries.map((e) => e.host).filter(Boolean));
  const third = new Set(entries.filter((e) => e.thirdParty).map((e) => e.host));
  return {
    requests: entries.length,
    domains: domains.size,
    thirdParty: third.size,
    transfer: entries.reduce((s, e) => s + Math.max(0, e.transfer), 0),
    size: entries.reduce((s, e) => s + Math.max(0, e.size), 0),
    failed: entries.filter((e) => e.failed).length,
    redirects: entries.filter((e) => e.status >= 300 && e.status < 400 && e.redirect).length,
    mixed: entries.filter((e) => e.mixed).length,
  };
}

/**
 * Requests grouped by host, most requests first.
 *
 * @param {Entry[]} entries
 * @returns {{ host: string, domain: string, thirdParty: boolean, requests: number, transfer: number, ips: string[], types: ResourceType[] }[]}
 */
export function byHost(entries) {
  /** @type {Map<string, { host: string, domain: string, thirdParty: boolean, requests: number, transfer: number, ips: Set<string>, types: Set<ResourceType> }>} */
  const map = new Map();
  for (const e of entries) {
    const key = e.host || e.url.slice(0, 40);
    const item = map.get(key) ?? { host: key, domain: e.domain, thirdParty: e.thirdParty, requests: 0, transfer: 0, ips: new Set(), types: new Set() }; // prettier-ignore
    item.requests += 1;
    item.transfer += Math.max(0, e.transfer);
    if (e.ip) item.ips.add(e.ip);
    item.types.add(e.type);
    map.set(key, item);
  }
  return [...map.values()]
    .sort((a, b) => b.requests - a.requests || a.host.localeCompare(b.host))
    .map((x) => ({ ...x, ips: [...x.ips], types: TYPES.filter((t) => x.types.has(t)) }));
}

/**
 * @param {string} cell
 * @returns {string} A CSV cell; cells a spreadsheet would run as a formula are prefixed.
 */
function csvCell(cell) {
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {Entry[]} entries
 * @returns {string}
 */
export function toCsv(entries) {
  const head = 'index,method,status,type,url,ip,transfer,size,start_ms,time_ms';
  const rows = entries.map(
    (e) =>
    [String(e.index), e.method, String(e.status), e.type, e.url, e.ip, String(e.transfer), String(e.size), e.start.toFixed(1), e.time.toFixed(1)].map(csvCell).join(','), // prettier-ignore
  );
  return [head, ...rows].join('\n');
}
