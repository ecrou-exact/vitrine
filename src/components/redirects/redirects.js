// @ts-check
/**
 * Reads a chain of redirects and checks it. Nothing is fetched: the text is only read.
 *
 * Accepted formats (detected automatically):
 *
 * - **a HAR file**: the chain starts at its first entry (or at the `start` URL) and follows
 *   each 3xx response (`redirectURL` or `Location`) to the entry with that URL;
 * - **curl output** with headers (`curl -sIL`, `curl -sLD -`, `curl -v`): one block per
 *   response, the start URL taken from a `curl …` line or the `start` option;
 * - **JSON**: an array of URLs or of hops `{ url, status, type, location, ip, time }`
 *   (`type`: `http`, `meta` or `js` for client-side redirects), or `{ hops | chain |
 *   redirects: [...] }`;
 * - **a list**, one hop per line: `301 https://a.example/`, `https://a.example/ 301`, or
 *   URLs joined with arrows (`https://a -> https://b`).
 *
 * @module components/redirects/redirects
 */
import { baseDomain } from '../../core/urls.js';

/** @typedef {"permanent" | "temporary" | "other" | "meta" | "script"} RedirectKind */

/**
 * @typedef {object} Hop
 * @property {string} url - Absolute when it could be resolved.
 * @property {number | null} status - `null` when unknown (client-side or last hop not seen).
 * @property {RedirectKind | null} kind - How this hop sends to the next one; `null` for the last.
 * @property {string | null} ip
 * @property {number | null} time - Milliseconds.
 */

/**
 * @typedef {object} Step
 * @property {Hop} from
 * @property {Hop} to
 * @property {boolean} hostChange
 * @property {boolean} siteChange - Another registrable domain.
 * @property {"downgrade" | "upgrade" | null} scheme - `https:` → `http:` or the reverse.
 * @property {string[]} added - Query parameters added.
 * @property {string[]} tracking - Of those, tracking parameters (`utm_*`, `gclid`…).
 * @property {boolean} loop - `to` was already visited.
 */

/**
 * @typedef {object} ChainIssue
 * @property {"bad" | "warn" | "info"} level
 * @property {"loop" | "downgrade" | "tooLong" | "endsError" | "unfinished" | "sites"} code
 * @property {number} [count]
 */

/**
 * @typedef {object} Chain
 * @property {Hop[]} hops
 * @property {"har" | "curl" | "json" | "list"} format
 */

/** @typedef {{ ok: true, chain: Chain } | { ok: false, error: "empty" | "format" | "json", detail?: string }} ParseResult */

/** Hops read at most. */
export const MAX_HOPS = 200;
/** Browsers stop following after 20 redirects; past 10, it is already slow. */
export const LONG_CHAIN = 10;
const MAX_URL = 8192;

/** Query parameters added to follow a visitor or a campaign. */
const TRACKING = /^(?:utm_[a-z_]+|gclid|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|yclid|igshid|twclid|ttclid|li_fat_id|_hsenc|_hsmi|mkt_tok|oly_[a-z_]+|vero_[a-z_]+|_ga|_gl|ref_?src|s_cid|trk|zanpid|irclickid|clickid|sc_cid)$/i; // prettier-ignore

/**
 * @param {number | null} status
 * @returns {RedirectKind | null}
 */
export function kindOf(status) {
  if (status === 301 || status === 308) return 'permanent';
  if (status === 302 || status === 303 || status === 307) return 'temporary';
  if (status !== null && status >= 300 && status < 400) return 'other';
  return null;
}

/**
 * @param {string} text
 * @param {{ start?: string | null }} [options] - `start`: the first URL, for curl output
 *   without a `curl` line, or to start a HAR chain at another entry.
 * @returns {ParseResult}
 */
export function parseRedirects(text, options = {}) {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  const start = options.start?.trim() || null;
  /** @type {Hop[]} */
  let hops;
  /** @type {Chain["format"]} */
  let format;
  if (/^[[{]/.test(trimmed)) {
    /** @type {any} */
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      return { ok: false, error: 'json', detail: error instanceof Error ? error.message : '' };
    }
    if (Array.isArray(data?.log?.entries)) {
      hops = fromHar(data.log.entries, start);
      format = 'har';
    } else {
      const list = Array.isArray(data) ? data : (data?.hops ?? data?.chain ?? data?.redirects);
      if (!Array.isArray(list)) return { ok: false, error: 'format' };
      hops = fromJson(list);
      format = 'json';
    }
  } else if (/^(?:[<>]\s*)?HTTP\/\d(?:\.\d)?\s+\d{3}/m.test(trimmed)) {
    hops = fromCurl(trimmed, start);
    format = 'curl';
  } else {
    hops = fromList(trimmed);
    format = 'list';
  }
  if (!hops.length) return { ok: false, error: 'format' };
  return { ok: true, chain: { hops: hops.slice(0, MAX_HOPS), format } };
}

/**
 * @param {any[]} entries
 * @param {string | null} start
 * @returns {Hop[]}
 */
function fromHar(entries, start) {
  const urls = entries.map((e) => (typeof e?.request?.url === 'string' ? e.request.url : ''));
  let index = start ? urls.indexOf(start) : 0;
  if (index < 0) index = Math.max(0, urls.findIndex((url) => url.includes(/** @type {string} */ (start)))); // prettier-ignore
  /** @type {Hop[]} */
  const hops = [];
  /** @type {Set<number>} */
  const seen = new Set();
  while (index >= 0 && index < entries.length && hops.length < MAX_HOPS) {
    const entry = entries[index];
    const url = urls[index];
    const status = statusOf(entry?.response?.status);
    const location =
      (typeof entry?.response?.redirectURL === 'string' && entry.response.redirectURL) ||
      headerValue(entry?.response?.headers, 'location');
    const kind = location ? kindOf(status) : null;
    hops.push({
      url: url.slice(0, MAX_URL),
      status,
      kind,
      ip: typeof entry?.serverIPAddress === 'string' && entry.serverIPAddress ? entry.serverIPAddress.replace(/^\[|\]$/g, '') : null, // prettier-ignore
      time: typeof entry?.time === 'number' && entry.time >= 0 ? entry.time : null,
    });
    if (!kind || !location) break;
    const next = resolve(location, url);
    if (seen.has(index)) break;
    seen.add(index);
    // The next request is usually right after; look ahead first, then anywhere.
    let found = urls.findIndex((u, i) => i > index && u === next);
    if (found < 0) found = urls.indexOf(next);
    if (found < 0 || seen.has(found)) {
      // Not captured, or a loop: show where it goes, then stop.
      hops.push({ url: next.slice(0, MAX_URL), status: null, kind: null, ip: null, time: null });
      break;
    }
    index = found;
  }
  return hops;
}

/**
 * @param {any[]} list
 * @returns {Hop[]}
 */
function fromJson(list) {
  /** @type {Hop[]} */
  const hops = [];
  for (const item of list.slice(0, MAX_HOPS)) {
    if (typeof item === 'string') {
      hops.push({ url: item.slice(0, MAX_URL), status: null, kind: null, ip: null, time: null });
      continue;
    }
    if (!item || typeof item !== 'object' || typeof item.url !== 'string') continue;
    const status = statusOf(item.status ?? item.statusCode ?? item.code);
    const type = String(item.type ?? item.kind ?? '').toLowerCase();
    /** @type {RedirectKind | null} */
    let kind = kindOf(status);
    if (/meta|refresh/.test(type)) kind = 'meta';
    else if (/^js$|javascript|script|client/.test(type)) kind = 'script';
    hops.push({
      url: item.url.slice(0, MAX_URL),
      status,
      kind,
      ip: typeof item.ip === 'string' && item.ip ? item.ip : null,
      time: typeof item.time === 'number' && item.time >= 0 ? item.time : null,
    });
  }
  // A last hop that still redirects: show where it goes.
  const lastItem = list[Math.min(list.length, MAX_HOPS) - 1];
  const last = hops[hops.length - 1];
  if (last && typeof lastItem?.location === 'string' && lastItem.location && hops.length < MAX_HOPS)
    hops.push({ url: resolve(lastItem.location, last.url).slice(0, MAX_URL), status: null, kind: null, ip: null, time: null }); // prettier-ignore
  // The last hop sends nowhere, unless something follows.
  for (let i = 0; i < hops.length; i += 1) {
    if (i === hops.length - 1) hops[i].kind = null;
    else hops[i].kind ??= 'other';
  }
  return hops;
}

/**
 * curl output with response headers: `-I`, `-D -`, or `-v` (lines prefixed with `<`).
 *
 * @param {string} text
 * @param {string | null} start
 * @returns {Hop[]}
 */
function fromCurl(text, start) {
  const lines = text.split(/\r\n|\n|\r/);
  const command = lines.find((line) => /^\s*\$?\s*curl\s/.test(line));
  let url = start ?? (command ? (/(?:^|\s)['"]?(https?:\/\/[^\s'"]+)/i.exec(command)?.[1] ?? null) : null); // prettier-ignore
  if (!url) {
    // curl -v writes the request: "> GET /path" and "> Host: example.org".
    const path = lines.map((l) => /^>\s*[A-Z]+\s+(\S+)\s+HTTP/.exec(l)?.[1]).find(Boolean);
    const host = lines.map((l) => /^>\s*host:\s*(\S+)/i.exec(l)?.[1]).find(Boolean);
    if (host) url = `https://${host}${path ?? '/'}`;
  }
  /** @type {Hop[]} */
  const hops = [];
  /** @type {Hop | null} */
  let current = null;
  /** @type {string | null} */
  let location = null;
  /** @type {string | null} curl -v: "* Connected to host (ip) port 443", before each request. */
  let ip = null;
  const close = () => {
    if (!current) return;
    current.kind = location ? kindOf(current.status) : null;
    hops.push(current);
    if (location) url = resolve(location, current.url);
  };
  for (const raw of lines) {
    const line = raw.replace(/^\s*<\s?/, '');
    const status = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/.exec(line);
    if (status) {
      // "HTTP/1.1 100 Continue" and "HTTP/1.1 200 Connection established" (proxy) are not hops.
      if (status[1] === '100' || /connection established/i.test(line)) continue;
      close();
      current = { url: (url ?? '').slice(0, MAX_URL), status: Number(status[1]), kind: null, ip, time: null }; // prettier-ignore
      location = null;
      ip = null;
      continue;
    }
    const header = /^location:\s*(\S+)/i.exec(line);
    if (header && current) location = header[1];
    // "* Connected to example.org (93.184.216.34) port 443" (curl 7 and 8).
    const connected = /^\*\s+Connected to \S+ \(([^)\s]+)\)/.exec(raw);
    if (connected) ip = connected[1];
  }
  close();
  return hops;
}

/**
 * One hop per line, or URLs joined with arrows.
 *
 * @param {string} text
 * @returns {Hop[]}
 */
function fromList(text) {
  /** @type {Hop[]} */
  const hops = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (hops.length >= MAX_HOPS) break;
    const parts = line.split(/\s*(?:->|=>|→|⇒)\s*/);
    for (const part of parts) {
      const url = /(?:https?:\/\/|\/\/)[^\s"'<>]+/i.exec(part)?.[0];
      if (!url) continue;
      const status = /(?:^|\s)([1-5]\d\d)(?=\s|$)/.exec(part.replace(url, ' '))?.[1];
      const type = /\b(meta|refresh|js|javascript)\b/i
        .exec(part.replace(url, ' '))?.[1]
        ?.toLowerCase();
      const code = status ? Number(status) : null;
      hops.push({
        url: url.slice(0, MAX_URL),
        status: code,
        kind: type ? (type === 'meta' || type === 'refresh' ? 'meta' : 'script') : kindOf(code),
        ip: null,
        time: null,
      });
    }
  }
  for (let i = 0; i < hops.length; i += 1) {
    if (i === hops.length - 1) hops[i].kind = null;
    else hops[i].kind ??= 'other';
  }
  return hops;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function statusOf(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 999 ? status : null;
}

/**
 * @param {unknown} headers - HAR `{ name, value }` objects.
 * @param {string} name
 * @returns {string | null}
 */
function headerValue(headers, name) {
  if (!Array.isArray(headers)) return null;
  const found = headers.find((x) => typeof x?.name === 'string' && x.name.toLowerCase() === name);
  return found && typeof found.value === 'string' && found.value ? found.value : null;
}

/**
 * @param {string} location
 * @param {string} base
 * @returns {string}
 */
function resolve(location, base) {
  try {
    return new URL(location, base || undefined).href;
  } catch {
    return location;
  }
}

/**
 * @param {string} url
 * @returns {URL | null}
 */
function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * What changes at each step of the chain, and what is wrong with the chain.
 *
 * @param {Hop[]} hops
 * @returns {{ steps: Step[], issues: ChainIssue[], sites: string[] }}
 */
export function checkChain(hops) {
  /** @type {Step[]} */
  const steps = [];
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {string[]} */
  const sites = [];
  for (const hop of hops) {
    const host = parse(hop.url)?.hostname;
    if (host && !sites.includes(baseDomain(host))) sites.push(baseDomain(host));
  }
  for (let i = 0; i < hops.length - 1; i += 1) {
    const from = hops[i];
    const to = hops[i + 1];
    visited.add(from.url);
    const a = parse(from.url);
    const b = parse(to.url);
    const before = new Set(a ? [...a.searchParams.keys()] : []);
    const added = b ? [...new Set(b.searchParams.keys())].filter((key) => !before.has(key)) : [];
    steps.push({
      from,
      to,
      hostChange: Boolean(a && b && a.hostname !== b.hostname),
      siteChange: Boolean(a && b && baseDomain(a.hostname) !== baseDomain(b.hostname)),
      scheme:
        a?.protocol === 'https:' && b?.protocol === 'http:'
          ? 'downgrade'
          : a?.protocol === 'http:' && b?.protocol === 'https:'
            ? 'upgrade'
            : null,
      added,
      tracking: added.filter((key) => TRACKING.test(key)),
      loop: visited.has(to.url),
    });
  }
  /** @type {ChainIssue[]} */
  const issues = [];
  if (steps.some((s) => s.loop)) issues.push({ level: 'bad', code: 'loop' });
  if (steps.some((s) => s.scheme === 'downgrade')) issues.push({ level: 'bad', code: 'downgrade' });
  if (steps.length > LONG_CHAIN) issues.push({ level: 'warn', code: 'tooLong', count: steps.length }); // prettier-ignore
  const last = hops[hops.length - 1];
  if (last && last.status !== null && last.status >= 400) issues.push({ level: 'warn', code: 'endsError' }); // prettier-ignore
  if (last && last.status === null && hops.length > 1 && !steps.some((s) => s.loop)) issues.push({ level: 'info', code: 'unfinished' }); // prettier-ignore
  if (sites.length > 2) issues.push({ level: 'info', code: 'sites', count: sites.length });
  return { steps, issues, sites };
}

/**
 * The chain as text: one hop per line, status first.
 *
 * @param {Hop[]} hops
 * @returns {string}
 */
export function toText(hops) {
  return hops
    .map((hop) => {
      const status = hop.status ?? (hop.kind === 'meta' ? 'meta' : hop.kind === 'script' ? 'js' : '---'); // prettier-ignore
      return `${status} ${hop.url}`;
    })
    .join('\n');
}
