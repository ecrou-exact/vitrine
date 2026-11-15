// @ts-check
/**
 * Access logs of web servers: Apache and Nginx (common and combined formats), IIS (W3C
 * extended), and JSON lines of Caddy, Traefik or Nginx `log_format … escape=json`, read into
 * requests; user agents read into browser, system and bot; statistics and top lists.
 *
 * @module components/access-log/access
 */
import { isObject } from '../../core/data.js';

/**
 * @typedef {object} Request
 * @property {number} line - Line number in the log, from 1.
 * @property {string} ip
 * @property {string} user
 * @property {number | null} time
 * @property {string} method
 * @property {string} path - With its query.
 * @property {string} protocol
 * @property {number | null} status
 * @property {number | null} bytes
 * @property {string} referer
 * @property {string} agent
 * @property {number | null} duration - Milliseconds.
 * @property {string} host
 * @property {Agent} client
 */

/**
 * @typedef {object} Agent
 * @property {string} browser
 * @property {string} os
 * @property {'desktop' | 'mobile' | 'bot' | 'tool' | 'unknown'} device
 * @property {string} bot - Name of the bot, when it is one.
 */

/** Lines read at most. */
export const MAX_REQUESTS = 100_000;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }; // prettier-ignore

/** `10/Oct/2000:13:55:36 -0700`. */
const CLF_TIME = /^(\d{1,2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s*([+-]\d{4}))?$/;
/** `ip ident user [time] "request" status bytes "referer" "agent" rest`. */
const COMBINED = /^(\S+) (\S+) (\S+) \[([^\]]+)\] "((?:[^"\\]|\\.)*)" (\d{3}|-) (\d+|-)(?: "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)")?(.*)$/; // prettier-ignore

/**
 * @param {string} text
 * @returns {number | null}
 */
export function clfTime(text) {
  const m = CLF_TIME.exec(text.trim());
  if (!m) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? null : t;
  }
  const month = MONTHS[/** @type {keyof typeof MONTHS} */ (m[2].toLowerCase())];
  if (month === undefined) return null;
  const utc = Date.UTC(+m[3], month, +m[1], +m[4], +m[5], +m[6]);
  const zone = m[7] ? (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) : 0;
  return utc - zone * 60_000;
}

/** @param {string} s */
const unescape = (s) => s.replace(/\\x([0-9a-f]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))).replace(/\\(.)/g, '$1'); // prettier-ignore

/** @param {string} s */
const dash = (s) => (s === '-' ? '' : s);

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function num(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() && value !== '-' ? Number(value) : NaN; // prettier-ignore
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- user agents

const BOTS = [
  'Googlebot', 'bingbot', 'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Applebot', 'DuckDuckBot', 'YandexBot', 'Baiduspider', 'AhrefsBot', 'SemrushBot', 'MJ12bot',
  'DotBot', 'PetalBot', 'Bytespider', 'CCBot', 'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'Slackbot',
  'Discordbot', 'TelegramBot', 'WhatsApp', 'UptimeRobot', 'Pingdom', 'Amazonbot', 'meta-externalagent',
]; // prettier-ignore
const TOOLS = [['curl', 'curl'], ['Wget', 'Wget'], ['python-requests', 'Python requests'], ['python-httpx', 'Python httpx'], ['aiohttp', 'aiohttp'], ['Go-http-client', 'Go'], ['okhttp', 'OkHttp'], ['axios', 'axios'], ['node-fetch', 'node-fetch'], ['undici', 'Node.js'], ['PostmanRuntime', 'Postman'], ['insomnia', 'Insomnia'], ['Java/', 'Java'], ['libwww-perl', 'Perl'], ['HTTPie', 'HTTPie'], ['k6/', 'k6']]; // prettier-ignore

/**
 * Reads a user agent: browser, system, and bot or tool.
 *
 * @param {string} agent
 * @returns {Agent}
 */
export function readAgent(agent) {
  if (!agent) return { browser: '', os: '', device: 'unknown', bot: '' };
  const bot = BOTS.find((b) => agent.toLowerCase().includes(b.toLowerCase()));
  if (bot) return { browser: '', os: '', device: 'bot', bot };
  if (/bot\b|crawler|spider|slurp|scraper|headless/i.test(agent)) {
    const name = /([\w.-]*(?:bot|crawler|spider|Slurp)[\w.-]*)/i.exec(agent)?.[1] ?? 'Bot';
    return { browser: '', os: '', device: 'bot', bot: name };
  }
  const tool = TOOLS.find(([needle]) => agent.includes(needle));
  if (tool) return { browser: tool[1], os: '', device: 'tool', bot: '' };
  const os = /Windows NT/.test(agent) ? 'Windows' : /iPhone|iPad|iPod/.test(agent) ? 'iOS' : /Mac OS X|Macintosh/.test(agent) ? 'macOS' : /Android/.test(agent) ? 'Android' : /CrOS/.test(agent) ? 'ChromeOS' : /Linux|X11/.test(agent) ? 'Linux' : ''; // prettier-ignore
  const browser = /Edg(?:e|A|iOS)?\//.test(agent) ? 'Edge' : /OPR\/|Opera/.test(agent) ? 'Opera' : /SamsungBrowser/.test(agent) ? 'Samsung Internet' : /Firefox\/|FxiOS/.test(agent) ? 'Firefox' : /Chrome\/|CriOS/.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : ''; // prettier-ignore
  const mobile = /Mobi|iPhone|Android(?!.*Tablet)/.test(agent);
  return {
    browser,
    os,
    device: browser || os ? (mobile ? 'mobile' : 'desktop') : 'unknown',
    bot: '',
  };
}

// ---------------------------------------------------------------- formats

/**
 * @param {Omit<Request, 'client'>} r
 * @returns {Request}
 */
const request = (r) => ({ ...r, client: readAgent(r.agent) });

/**
 * A line of the common or combined format, with what Nginx may add after it
 * (`$request_time`, `rt=0.012`, `"$host"`).
 *
 * @param {string} line
 * @param {number} n
 * @returns {Request | null}
 */
function readCombined(line, n) {
  const m = COMBINED.exec(line);
  if (!m) return null;
  const [method = '', path = '', protocol = ''] = unescape(m[5]).split(' ');
  const rest = m[10] ?? '';
  const time = /(?:rt|request_time|rtime)=(\d+(?:\.\d+)?)/.exec(rest)?.[1] ?? /^\s+(\d+\.\d+)\b/.exec(rest)?.[1]; // prettier-ignore
  return request({
    line: n,
    ip: m[1],
    user: dash(m[3]),
    time: clfTime(m[4]),
    method: method.slice(0, 20),
    path: path.slice(0, 4000),
    protocol,
    status: num(m[6]),
    bytes: num(m[7]),
    referer: dash(unescape(m[8] ?? '')),
    agent: dash(unescape(m[9] ?? '')),
    duration: time ? Number(time) * 1000 : null,
    host: /"?(?:host|vhost)="?([\w.:-]+)/.exec(rest)?.[1] ?? '',
  });
}

/**
 * The first value of some keys, at any depth given as `a.b`.
 *
 * @param {Record<string, any>} item
 * @param {string[]} keys
 * @returns {unknown}
 */
function pick(item, keys) {
  for (const key of keys) {
    let value = /** @type {any} */ (item);
    for (const part of key.split('.')) value = isObject(value) ? value[part] : undefined;
    if (Array.isArray(value)) value = value[0];
    if (value !== undefined && value !== null && value !== '' && value !== '-') return value;
  }
  return undefined;
}

/**
 * A JSON line of Caddy, Traefik, Nginx or your own.
 *
 * @param {Record<string, any>} item
 * @param {number} n
 * @returns {Request | null}
 */
function readJsonLine(item, n) {
  const s = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''); // prettier-ignore
  const path = s(pick(item, ['request.uri', 'uri', 'RequestPath', 'request_uri', 'path', 'url', 'request.url', 'cs-uri-stem'])); // prettier-ignore
  const status = num(pick(item, ['status', 'DownstreamStatus', 'OriginStatus', 'response.status', 'status_code', 'statusCode', 'sc-status'])); // prettier-ignore
  if (!path && status === null) return null;
  const rawTime = pick(item, ['ts', 'time', 'time_iso8601', 'time_local', 'StartUTC', 'StartLocal', 'timestamp', '@timestamp', 'date']); // prettier-ignore
  const time = typeof rawTime === 'number' ? (rawTime > 1e11 ? rawTime : rawTime * 1000) : typeof rawTime === 'string' ? clfTime(rawTime) : null; // prettier-ignore
  // Caddy writes seconds, Traefik nanoseconds, Nginx `request_time` seconds.
  const rawDuration = pick(item, ['duration_ms', 'Duration', 'duration', 'request_time', 'latency', 'responseTime', 'time-taken']); // prettier-ignore
  const d = num(rawDuration);
  const duration = d === null ? null : item.Duration !== undefined ? d / 1e6 : item.duration_ms !== undefined || item.responseTime !== undefined || item['time-taken'] !== undefined ? d : d * 1000; // prettier-ignore
  return request({
    line: n,
    ip: s(pick(item, ['request.client_ip', 'request.remote_ip', 'ClientHost', 'ClientAddr', 'remote_addr', 'client_ip', 'ip', 'remote_ip', 'c-ip', 'clientIp'])).replace(/:\d+$/, ''), // prettier-ignore
    user: s(pick(item, ['user_id', 'remote_user', 'ClientUsername', 'user', 'cs-username', 'username'])), // prettier-ignore
    time,
    method: s(pick(item, ['request.method', 'RequestMethod', 'request_method', 'method', 'cs-method'])).slice(0, 20), // prettier-ignore
    path: path.slice(0, 4000),
    protocol: s(pick(item, ['request.proto', 'RequestProtocol', 'server_protocol', 'protocol'])),
    status,
    bytes: num(pick(item, ['size', 'DownstreamContentSize', 'body_bytes_sent', 'bytes_sent', 'bytes', 'sc-bytes', 'responseSize'])), // prettier-ignore
    referer: s(pick(item, ['request.headers.Referer', 'request_Referer', 'http_referer', 'referer', 'referrer', 'cs(Referer)'])), // prettier-ignore
    agent: s(pick(item, ['request.headers.User-Agent', 'request_User-Agent', 'http_user_agent', 'user_agent', 'userAgent', 'agent', 'cs(User-Agent)'])), // prettier-ignore
    duration,
    host: s(pick(item, ['request.host', 'RequestHost', 'host', 'server_name', 'cs-host'])),
  });
}

/**
 * Reads an access log: one request per line, the format found on each line.
 *
 * @param {string} text
 * @returns {Request[]}
 */
export function readAccessLog(text) {
  /** @type {Request[]} */
  const out = [];
  /** @type {string[] | null} W3C `#Fields:` of IIS. */
  let fields = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < MAX_REQUESTS; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (/^#Fields:/i.test(line)) fields = line.slice(8).trim().split(/\s+/);
      continue;
    }
    let found = null;
    if (line.startsWith('{')) {
      try {
        const item = JSON.parse(line);
        if (isObject(item)) found = readJsonLine(item, i + 1);
      } catch {
        found = null;
      }
    } else if (fields) {
      const values = line.split(/\s+/);
      /** @type {Record<string, string>} */
      const item = {};
      fields.forEach((f, n) => (item[f] = (values[n] ?? '-').replace(/\+/g, ' ')));
      if (item.date && item.time) item.date = `${item.date}T${item.time}Z`;
      if (item['cs-uri-query'] && item['cs-uri-query'] !== '-') item['cs-uri-stem'] += `?${item['cs-uri-query']}`; // prettier-ignore
      found = readJsonLine(item, i + 1);
    } else found = readCombined(line, i + 1);
    if (found) out.push(found);
  }
  return out;
}

/**
 * An IP with its end hidden: `203.0.113.0`, `2001:db8:85a3::`. For logs shown to others.
 *
 * @param {string} ip
 * @returns {string}
 */
export function maskIp(ip) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.0');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::`;
  return ip;
}

/**
 * @param {number | null} status
 * @returns {'2xx' | '3xx' | '4xx' | '5xx' | 'other'}
 */
export function statusClass(status) {
  if (status === null) return 'other';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'other';
}

/**
 * @param {number[]} sorted
 * @param {number} q - 0 to 1.
 * @returns {number | null}
 */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
}

/**
 * Totals of some requests.
 *
 * @param {Request[]} requests
 */
export function summarize(requests) {
  const durations = requests.map((r) => r.duration).filter((d) => d !== null).sort((a, b) => a - b); // prettier-ignore
  const errors = requests.filter((r) => r.status !== null && r.status >= 400).length;
  return {
    requests: requests.length,
    visitors: new Set(requests.map((r) => r.ip)).size,
    errors,
    bytes: requests.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    bots: requests.filter((r) => r.client.device === 'bot').length,
    median: quantile(durations, 0.5),
    p95: quantile(durations, 0.95),
  };
}

/**
 * The most frequent values of a field.
 *
 * @param {Request[]} requests
 * @param {(r: Request) => string} key
 * @param {number} [count]
 * @returns {[string, number][]}
 */
export function top(requests, key, count = 10) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const r of requests) {
    const k = key(r);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count);
}

/**
 * Requests per period, by class of status, for the chart.
 *
 * @param {Request[]} requests
 * @param {number} [bars]
 * @returns {{ start: number, size: number, buckets: Record<string, number>[] } | null}
 */
export function timeline(requests, bars = 48) {
  const times = requests.map((r) => r.time).filter((t) => t !== null);
  if (times.length < 2) return null;
  const from = Math.min(...times);
  const to = Math.max(...times);
  const steps = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 604800].map((s) => s * 1000); // prettier-ignore
  const size = steps.find((s) => (to - from) / s <= bars) ?? steps[steps.length - 1];
  const start = Math.floor(from / size) * size;
  const count = Math.max(1, Math.floor((to - start) / size) + 1);
  /** @type {Record<string, number>[]} */
  const buckets = Array.from({ length: Math.min(count, 1000) }, () => ({ '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 })); // prettier-ignore
  for (const r of requests) {
    if (r.time === null) continue;
    const b = buckets[Math.floor((r.time - start) / size)];
    if (b) b[statusClass(r.status)] += 1;
  }
  return { start, size, buckets };
}
