// @ts-check
/**
 * Reads an HTTP exchange (a request, its response, or both).
 *
 * Accepted formats (detected automatically):
 *
 * - **raw HTTP**, as in `.http` files and RFC 9110 examples: a request line, headers, a
 *   blank line and a body, optionally followed by the response (`HTTP/1.1 200 OK`…);
 * - **a curl command** (`curl -X POST https://… -H '…' -d '…'`);
 * - **JSON**: `{ request: { method, url, headers, body }, response: { status, headers,
 *   body } }`, where headers are an object or `[name, value]` pairs — or a HAR entry, as
 *   exported by browser developer tools.
 *
 * @module components/http/message
 */

/** @typedef {[name: string, value: string]} Header */

/**
 * @typedef {object} HttpRequest
 * @property {string} method - Upper case.
 * @property {string} url - As written: absolute, or a path with a `Host` header.
 * @property {Header[]} headers
 * @property {string} body
 */

/**
 * @typedef {object} HttpResponse
 * @property {number} status
 * @property {string} statusText - The reason phrase (from the message, or the standard one).
 * @property {Header[]} headers
 * @property {string} body
 * @property {number | null} time - Duration in milliseconds, when known.
 * @property {"base64" | null} [encoding] - `base64` when the body is binary, encoded (HAR).
 */

/**
 * @typedef {object} TlsDetails
 * @property {string | null} protocol - `TLS 1.3`…
 * @property {string | null} cipher
 * @property {string | null} subject - Subject name of the server certificate.
 * @property {string[]} sans - Subject alternative names.
 * @property {string | null} issuer
 * @property {Date | null} validFrom
 * @property {Date | null} validTo
 */

/**
 * @typedef {object} HttpConnection
 * @property {string | null} serverIp
 * @property {string | null} httpVersion - `HTTP/2`, `h3`…
 * @property {TlsDetails | null} tls
 * @property {number | null} bodySize - Body bytes on the wire (compressed).
 * @property {number | null} contentSize - Decoded body bytes.
 * @property {number | null} transferSize - Headers and body on the wire.
 * @property {string | null} mimeType
 */

/**
 * @typedef {object} HttpExchange
 * @property {HttpRequest | null} request
 * @property {HttpResponse | null} response
 * @property {"http" | "curl" | "json" | "har"} format
 * @property {HttpConnection | null} [connection] - Server address, TLS and sizes, when known.
 * @property {HarEntrySummary[]} [entries] - Every entry of a whole HAR file, in order.
 * @property {number} [entry] - Index of the entry shown, in `entries`.
 */

/**
 * @typedef {object} HarEntrySummary
 * @property {string} method
 * @property {string} url
 * @property {number | null} status
 * @property {string | null} mimeType
 */

/** Entries of a HAR file listed at most. */
export const MAX_ENTRIES = 5000;

/** Headers kept at most per message. */
export const MAX_HEADERS = 200;
/** Longest header value kept (characters). */
const MAX_HEADER = 8192;

const METHOD = /^[A-Z][A-Z-]{1,19}$/;

/** Standard reason phrases (RFC 9110 and common extensions). */
export const REASONS = /** @type {Record<number, string>} */ ({
  100: 'Continue', 101: 'Switching Protocols', 103: 'Early Hints', 200: 'OK', 201: 'Created',
  202: 'Accepted', 203: 'Non-Authoritative Information', 204: 'No Content', 205: 'Reset Content',
  206: 'Partial Content', 207: 'Multi-Status', 300: 'Multiple Choices', 301: 'Moved Permanently',
  302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect',
  308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required',
  403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
  408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required',
  412: 'Precondition Failed', 413: 'Content Too Large', 414: 'URI Too Long',
  415: 'Unsupported Media Type', 416: 'Range Not Satisfiable', 417: 'Expectation Failed',
  418: "I'm a teapot", 421: 'Misdirected Request', 422: 'Unprocessable Content', 423: 'Locked',
  425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required',
  429: 'Too Many Requests', 431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
}); // prettier-ignore

/** Thrown when the input cannot be read. */
export class HttpParseError extends Error {}

/**
 * @param {string} name
 * @param {string} value
 * @returns {Header}
 */
function header(name, value) {
  return [name.trim().slice(0, 256), String(value).trim().slice(0, MAX_HEADER)];
}

/**
 * Value of a header (case-insensitive), or `null`.
 *
 * @param {Header[]} headers
 * @param {string} name
 * @returns {string | null}
 */
export function getHeader(headers, name) {
  const lower = name.toLowerCase();
  return headers.find(([key]) => key.toLowerCase() === lower)?.[1] ?? null;
}

/**
 * Reads an HTTP exchange.
 *
 * @param {string} text
 * @param {{ entry?: number | string | null }} [options] - `entry`: in a whole HAR file, the
 *   entry to read, by index (from 0) or by URL (the first entry with this exact URL, else
 *   the first whose URL contains it). Default: the first entry.
 * @returns {HttpExchange}
 * @throws {HttpParseError}
 */
export function parseExchange(text, options = {}) {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { request: null, response: null, format: 'http' };
  if (/^[[{]/.test(trimmed)) return fromJson(trimmed, options.entry ?? null);
  if (/^curl(?:\s|$)/.test(trimmed))
    return { request: fromCurl(trimmed), response: null, format: 'curl' };
  return fromRaw(trimmed);
}

// ---------------------------------------------------------------- raw HTTP

/**
 * @param {string} text
 * @returns {HttpExchange}
 */
function fromRaw(text) {
  const lines = text.split(/\r\n|\n|\r/);
  let i = 0;
  // Comments and separators of .http files before the request.
  while (i < lines.length && /^\s*(?:#|\/\/)|^\s*$/.test(lines[i])) i += 1;

  /** @type {HttpRequest | null} */
  let request = null;
  /** @type {HttpResponse | null} */
  let response = null;

  if (!/^HTTP\/\d(?:\.\d)? \d{3}\b/.test(lines[i] ?? '')) {
    const requestLine = /^([A-Za-z][A-Za-z-]{1,19})\s+(\S+)(?:\s+HTTP\/\d(?:\.\d)?)?\s*$/.exec(
      lines[i] ?? '',
    );
    if (!requestLine) {
      throw new HttpParseError(
        'The first line must be a request line ("GET /path HTTP/1.1") or a status line ("HTTP/1.1 200 OK").',
      );
    }
    i += 1;
    const headers = readHeaders(lines, i);
    i = headers.next;
    const body = readBody(lines, i);
    i = body.next;
    request = {
      method: requestLine[1].toUpperCase(),
      url: requestLine[2],
      headers: headers.headers,
      body: body.text,
    };
  }
  if (i < lines.length) {
    const status = /^HTTP\/\d(?:\.\d)? (\d{3})(?: (.*))?$/.exec(lines[i]);
    if (status) {
      i += 1;
      const headers = readHeaders(lines, i);
      const code = Number(status[1]);
      response = {
        status: code,
        statusText: status[2]?.trim() || REASONS[code] || '',
        headers: headers.headers,
        body: lines.slice(headers.next).join('\n').replace(/\s+$/, ''),
        time: null,
      };
    }
  }
  return { request, response, format: 'http' };
}

/**
 * Headers from `start` up to the first blank line.
 *
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ headers: Header[], next: number }}
 */
function readHeaders(lines, start) {
  /** @type {Header[]} */
  const headers = [];
  let i = start;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      break;
    }
    // A body or response right after the request line, without headers.
    if (/^HTTP\/\d(?:\.\d)? \d{3}\b/.test(line)) break;
    const colon = line.indexOf(':');
    if (colon <= 0) {
      // Obsolete line folding: continuation of the previous value.
      if (/^\s/.test(line) && headers.length) headers[headers.length - 1][1] += ` ${line.trim()}`;
      else break;
      continue;
    }
    if (headers.length < MAX_HEADERS)
      headers.push(header(line.slice(0, colon), line.slice(colon + 1)));
  }
  return { headers, next: i };
}

/**
 * Body of a request: up to a status line that follows a blank line (the response).
 *
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ text: string, next: number }}
 */
function readBody(lines, start) {
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^HTTP\/\d(?:\.\d)? \d{3}\b/.test(lines[i]) && (i === start || !lines[i - 1].trim())) {
      end = i;
      break;
    }
  }
  return { text: lines.slice(start, end).join('\n').replace(/\s+$/, ''), next: end };
}

// ---------------------------------------------------------------- curl

/**
 * Splits a shell command into words: single and double quotes, backslash escapes,
 * `$'…'` strings and line continuations, like a POSIX shell (without expansions).
 *
 * @param {string} command
 * @returns {string[]}
 */
export function shellWords(command) {
  /** @type {string[]} */
  const words = [];
  let word = '';
  let inWord = false;
  const text = command.replace(/\\\r?\n/g, ' ');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new HttpParseError('Unclosed single quote in the curl command.');
      word += text.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (char === '$' && text[i + 1] === "'") {
      // ANSI-C quoting: $'line\nbreak'
      let j = i + 2;
      for (; j < text.length && text[j] !== "'"; j += 1) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const next = text[j + 1];
          word +=
            { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }[next] ?? `\\${next}`;
          j += 1;
        } else word += text[j];
      }
      if (j >= text.length) throw new HttpParseError('Unclosed quote in the curl command.');
      inWord = true;
      i = j;
    } else if (char === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j += 1) {
        if (text[j] === '\\' && '"\\$`'.includes(text[j + 1] ?? '')) j += 1;
        word += text[j];
      }
      if (j >= text.length) throw new HttpParseError('Unclosed double quote in the curl command.');
      inWord = true;
      i = j;
    } else if (char === '\\' && i + 1 < text.length) {
      word += text[i + 1];
      inWord = true;
      i += 1;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else {
      word += char;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/** curl options followed by a value that this reader ignores. */
const CURL_IGNORED_WITH_VALUE = new Set([
  '-o', '--output', '-w', '--write-out', '-m', '--max-time', '--connect-timeout', '-x',
  '--proxy', '--cacert', '--cert', '--key', '-T', '--upload-file', '--retry', '-r', '--range',
  '-c', '--cookie-jar', '--resolve', '--limit-rate', '-K', '--config',
]); // prettier-ignore

/**
 * @param {string} command
 * @returns {HttpRequest}
 */
function fromCurl(command) {
  const words = shellWords(command);
  /** @type {string | null} */
  let method = null;
  /** @type {string | null} */
  let url = null;
  /** @type {Header[]} */
  const headers = [];
  /** @type {string[]} */
  const data = [];
  let get = false;
  let json = false;
  /** @type {string[]} */
  const form = [];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    const value = () => {
      i += 1;
      if (i >= words.length)
        throw new HttpParseError(`Missing value after ${word} in the curl command.`);
      return words[i];
    };
    // --option=value
    const long = /^(--[a-z-]+)=(.*)$/s.exec(word);
    const name = long ? long[1] : word;
    const inline = long ? long[2] : null;
    const read = () => (inline !== null ? inline : value());
    switch (name) {
      case '-X':
      case '--request':
        method = read().toUpperCase();
        break;
      case '-H':
      case '--header': {
        const line = read();
        const colon = line.indexOf(':');
        if (colon > 0 && headers.length < MAX_HEADERS)
          headers.push(header(line.slice(0, colon), line.slice(colon + 1)));
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        data.push(read());
        break;
      case '--data-urlencode': {
        const item = read();
        const eq = item.indexOf('=');
        data.push(
          eq >= 0
            ? `${item.slice(0, eq)}=${encodeURIComponent(item.slice(eq + 1))}`
            : encodeURIComponent(item),
        );
        break;
      }
      case '--json':
        data.push(read());
        json = true;
        break;
      case '-F':
      case '--form':
        form.push(read());
        break;
      case '-u':
      case '--user':
        headers.push(header('Authorization', `Basic ${toBase64(read())}`));
        break;
      case '-b':
      case '--cookie':
        headers.push(header('Cookie', read()));
        break;
      case '-A':
      case '--user-agent':
        headers.push(header('User-Agent', read()));
        break;
      case '-e':
      case '--referer':
        headers.push(header('Referer', read()));
        break;
      case '--url':
        url = read();
        break;
      case '-G':
      case '--get':
        get = true;
        break;
      case '-I':
      case '--head':
        method = 'HEAD';
        break;
      default:
        if (CURL_IGNORED_WITH_VALUE.has(name)) {
          if (inline === null) value();
        } else if (!word.startsWith('-') && url === null) url = word;
      // Other flags (-s, -L, -k, --compressed…) do not change the request.
    }
  }
  if (!url) throw new HttpParseError('The curl command has no URL.');
  let body = data.join('&');
  if (get && body) {
    url += (url.includes('?') ? '&' : '?') + body;
    body = '';
  }
  if (json) {
    if (!getHeader(headers, 'content-type')) headers.push(['Content-Type', 'application/json']);
    if (!getHeader(headers, 'accept')) headers.push(['Accept', 'application/json']);
  } else if (body && !getHeader(headers, 'content-type')) {
    headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  }
  if (form.length) {
    // Multipart bodies cannot be shown faithfully: list the fields instead.
    body = form.join('\n');
    if (!getHeader(headers, 'content-type')) headers.push(['Content-Type', 'multipart/form-data']);
  }
  const resolved = method ?? (body ? 'POST' : 'GET');
  if (!METHOD.test(resolved)) throw new HttpParseError(`Invalid method "${resolved}".`);
  return { method: resolved, url, headers, body };
}

/**
 * Base64 of a UTF-8 string.
 *
 * @param {string} text
 * @returns {string}
 */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ---------------------------------------------------------------- JSON and HAR

/**
 * @param {string} text
 * @param {number | string | null} entry
 * @returns {HttpExchange}
 */
function fromJson(text, entry) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new HttpParseError(error instanceof Error ? error.message : 'Invalid JSON.');
  }
  // A whole HAR file: one of its entries, the others listed.
  /** @type {HarEntrySummary[] | null} */
  let entries = null;
  let index = 0;
  if (Array.isArray(data?.log?.entries)) {
    const all = data.log.entries.slice(0, MAX_ENTRIES);
    const list = all.map(summarize);
    entries = list;
    index = findEntry(list, entry);
    data = all[index] ?? {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpParseError('Expected an object with "request" and/or "response".');
  }
  const req = data.request;
  const res = data.response;
  // HAR entries describe bodies as postData / content and headers as { name, value }.
  const firstHeader = Array.isArray(req?.headers) ? req.headers[0] : null;
  const har = Boolean(
    req?.postData ||
    res?.content ||
    (firstHeader && typeof firstHeader === 'object' && !Array.isArray(firstHeader)),
  );
  /** @type {HttpRequest | null} */
  let request = null;
  if (req && typeof req === 'object') {
    const method = String(req.method ?? 'GET').toUpperCase();
    if (!METHOD.test(method)) throw new HttpParseError(`Invalid method "${method}".`);
    if (typeof req.url !== 'string' || !req.url)
      throw new HttpParseError('The request has no URL.');
    request = {
      method,
      url: req.url,
      headers: readJsonHeaders(req.headers),
      body: bodyText(req.body ?? req.postData?.text),
    };
    if (req.postData?.mimeType && !getHeader(request.headers, 'content-type'))
      request.headers.push(['Content-Type', String(req.postData.mimeType)]);
  }
  /** @type {HttpResponse | null} */
  let response = null;
  if (res && typeof res === 'object') {
    const status = Number(res.status);
    if (!Number.isInteger(status) || status < 100 || status > 999)
      throw new HttpParseError('The response status must be a number between 100 and 999.');
    response = {
      status,
      statusText:
        typeof res.statusText === 'string' && res.statusText
          ? res.statusText
          : REASONS[status] || '',
      headers: readJsonHeaders(res.headers),
      body: bodyText(res.body ?? res.content?.text),
      encoding: res.content?.encoding === 'base64' ? 'base64' : null,
      time:
        typeof data.time === 'number' && data.time >= 0
          ? data.time
          : typeof res.time === 'number'
            ? res.time
            : null,
    };
    if (res.content?.mimeType && !getHeader(response.headers, 'content-type'))
      response.headers.push(['Content-Type', String(res.content.mimeType)]);
  }
  if (!request && !response)
    throw new HttpParseError('Expected an object with "request" and/or "response".');
  /** @type {HttpExchange} */
  const exchange = {
    request,
    response,
    format: har || entries ? 'har' : 'json',
    connection: readConnection(data),
  };
  if (entries && entries.length > 1) {
    exchange.entries = entries;
    exchange.entry = index;
  }
  return exchange;
}

/**
 * @param {any} item - A HAR entry.
 * @returns {HarEntrySummary}
 */
function summarize(item) {
  const status = Number(item?.response?.status);
  const method = String(item?.request?.method ?? 'GET').toUpperCase();
  return {
    method: METHOD.test(method) ? method : 'GET',
    url: typeof item?.request?.url === 'string' ? item.request.url.slice(0, MAX_HEADER) : '',
    status: Number.isInteger(status) && status >= 100 && status <= 999 ? status : null,
    mimeType: text(item?.response?.content?.mimeType)?.split(';')[0].trim() ?? null,
  };
}

/**
 * Index of the entry asked for: a number (from 0) or a URL.
 *
 * @param {HarEntrySummary[]} entries
 * @param {number | string | null} wanted
 * @returns {number}
 */
function findEntry(entries, wanted) {
  if (wanted === null || wanted === '') return 0;
  const number = typeof wanted === 'number' ? wanted : /^\d+$/.test(wanted) ? Number(wanted) : NaN;
  if (Number.isInteger(number)) return number >= 0 && number < entries.length ? number : 0;
  const url = String(wanted);
  const exact = entries.findIndex((e) => e.url === url);
  if (exact >= 0) return exact;
  const partial = entries.findIndex((e) => e.url.includes(url));
  return partial >= 0 ? partial : 0;
}

/**
 * Connection details of a HAR entry (or of a `connection` object in plain JSON): server
 * address, HTTP version, TLS (`_securityDetails`, as recorded by Chromium and Playwright)
 * and sizes. `null` when there is none.
 *
 * @param {any} data
 * @returns {HttpConnection | null}
 */
function readConnection(data) {
  const extra = data.connection && typeof data.connection === 'object' ? data.connection : {};
  const res = data.response && typeof data.response === 'object' ? data.response : {};
  const security = data._securityDetails ?? res._securityDetails ?? extra.tls ?? null;
  const ip = text(data.serverIPAddress ?? extra.serverIp);
  const connection = {
    serverIp: ip ? ip.replace(/^\[(.*)\]$/, '$1') : null,
    httpVersion: text(res.httpVersion ?? extra.httpVersion),
    tls: security && typeof security === 'object' ? readTls(security) : null,
    bodySize: size(res.bodySize ?? extra.bodySize),
    contentSize: size(res.content?.size ?? extra.contentSize),
    transferSize: size(res._transferSize ?? extra.transferSize),
    mimeType: text(res.content?.mimeType ?? extra.mimeType),
  };
  // A MIME type alone is already in the headers: no connection to show.
  const known = Object.entries(connection).filter(([key]) => key !== 'mimeType');
  return known.some(([, value]) => value !== null) ? connection : null;
}

/**
 * @param {any} value
 * @returns {TlsDetails}
 */
function readTls(value) {
  const sans = Array.isArray(value.sanList) ? value.sanList : value.sans;
  return {
    protocol: text(value.protocol),
    cipher: text(value.cipher),
    subject: text(value.subjectName ?? value.subject),
    sans: Array.isArray(sans) ? sans.slice(0, MAX_HEADERS).map(String) : [],
    issuer: text(value.issuer),
    validFrom: date(value.validFrom),
    validTo: date(value.validTo),
  };
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function text(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim().slice(0, MAX_HEADER);
  return result || null;
}

/**
 * Sizes in HAR use -1 for "unknown".
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function size(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * A date as an ISO string, or as Unix seconds (`_securityDetails`).
 *
 * @param {unknown} value
 * @returns {Date | null}
 */
function date(value) {
  /** @type {Date} */
  let result;
  if (typeof value === 'number' && Number.isFinite(value))
    result = new Date(value < 1e11 ? value * 1000 : value);
  else if (typeof value === 'string' && value.trim()) result = new Date(value.trim());
  else return null;
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * Headers from JSON: an object, `[name, value]` pairs, or HAR `{ name, value }` objects.
 *
 * @param {unknown} value
 * @returns {Header[]}
 */
function readJsonHeaders(value) {
  /** @type {Header[]} */
  const headers = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (headers.length >= MAX_HEADERS) break;
      if (Array.isArray(item) && item.length >= 2)
        headers.push(header(String(item[0]), String(item[1])));
      else if (item && typeof item === 'object' && 'name' in item)
        headers.push(header(String(item.name), String(item.value ?? '')));
    }
  } else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      if (headers.length >= MAX_HEADERS) break;
      for (const one of Array.isArray(item) ? item : [item])
        headers.push(header(name, String(one ?? '')));
    }
  }
  return headers.filter(([name]) => name);
}

/**
 * A body from JSON: strings as they are, other values serialized.
 *
 * @param {unknown} value
 * @returns {string}
 */
function bodyText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------- helpers

/**
 * Absolute URL of a request: the URL itself, or `Host` + path.
 *
 * @param {HttpRequest} request
 * @returns {string}
 */
export function absoluteUrl(request) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(request.url)) return request.url;
  const host = getHeader(request.headers, 'host');
  if (!host) return request.url;
  const local = /^(?:localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host);
  const path = request.url.startsWith('/') ? request.url : `/${request.url}`;
  return `${local ? 'http' : 'https'}://${host}${path}`;
}

/**
 * Query parameters of a URL, decoded, in order.
 *
 * @param {string} url
 * @returns {Header[]}
 */
export function queryParams(url) {
  const start = url.indexOf('?');
  if (start < 0) return [];
  const query = url.slice(start + 1).split('#')[0];
  return formParams(query);
}

/**
 * Pairs of an `application/x-www-form-urlencoded` string, decoded.
 *
 * @param {string} text
 * @returns {Header[]}
 */
export function formParams(text) {
  /** @type {Header[]} */
  const pairs = [];
  for (const part of text.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const name = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? '' : part.slice(eq + 1);
    pairs.push([decode(name), decode(value)]);
    if (pairs.length >= MAX_HEADERS) break;
  }
  return pairs;
}

/**
 * @param {string} text
 * @returns {string}
 */
function decode(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/**
 * The exchange as raw HTTP text (what the copy and download buttons produce).
 *
 * @param {HttpExchange} exchange
 * @returns {string}
 */
export function toRawHttp(exchange) {
  /** @type {string[]} */
  const parts = [];
  const { request, response } = exchange;
  if (request) {
    const head = [
      `${request.method} ${request.url} HTTP/1.1`,
      ...request.headers.map(([n, v]) => `${n}: ${v}`),
    ];
    parts.push(request.body ? `${head.join('\n')}\n\n${request.body}` : head.join('\n'));
  }
  if (response) {
    const head = [
      `HTTP/1.1 ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      ...response.headers.map(([n, v]) => `${n}: ${v}`),
    ];
    parts.push(response.body ? `${head.join('\n')}\n\n${response.body}` : head.join('\n'));
  }
  return parts.join('\n\n');
}
