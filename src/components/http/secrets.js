// @ts-check
/**
 * Hides credentials in an HTTP exchange: authorization headers, cookies, API keys and
 * tokens in headers, query parameters, form fields and JSON bodies.
 *
 * Masked values keep their shape (`Bearer ••••••••`, `session=••••••••`) so the example
 * stays readable, and never reveal more than the last 4 characters of long values.
 *
 * @module components/http/secrets
 */
import { parseJson, stringify } from '../json/parser.js';
import { formParams, getHeader } from './message.js';

/** @typedef {import('./message.js').Header} Header */
/** @typedef {import('./message.js').HttpRequest} HttpRequest */
/** @typedef {import('./message.js').HttpResponse} HttpResponse */
/** @typedef {import('./message.js').HttpExchange} HttpExchange */

export const MASK = '••••••••';

const SECRET_HEADERS = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key',
  'apikey', 'x-auth-token', 'x-access-token', 'x-csrf-token', 'x-xsrf-token',
  'x-amz-security-token', 'x-goog-api-key', 'private-token', 'x-vault-token',
]); // prettier-ignore

/** Names of headers, parameters and fields that hold secrets. */
const SECRET_NAME =
  /(?:^|[-_.])(?:token|secret|password|passwd|pwd|api[-_]?key|apikey|key|signature|sig|auth|credentials?|session(?:id)?|sid)$/i;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretHeader(name) {
  const lower = name.toLowerCase();
  return SECRET_HEADERS.has(lower) || SECRET_NAME.test(lower);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretName(name) {
  return SECRET_NAME.test(name);
}

/**
 * Masks a value, keeping at most its last 4 characters when it is long.
 *
 * @param {string} value
 * @returns {string}
 */
export function maskValue(value) {
  if (!value) return value;
  return value.length >= 16 ? `${MASK}${value.slice(-4)}` : MASK;
}

/**
 * Masks a header value, keeping the parts that are not secret.
 *
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
export function maskHeader(name, value) {
  const lower = name.toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization') {
    const scheme = /^([A-Za-z][\w-]*)\s+(.+)$/.exec(value);
    return scheme ? `${scheme[1]} ${maskValue(scheme[2])}` : maskValue(value);
  }
  if (lower === 'cookie') {
    return value
      .split(';')
      .map((part) => {
        const eq = part.indexOf('=');
        return eq < 0 ? part : `${part.slice(0, eq)}=${MASK}`;
      })
      .join(';');
  }
  if (lower === 'set-cookie') {
    // Only the cookie value; attributes (Path, HttpOnly…) are useful to show.
    return value.replace(/^([^=;]+)=([^;]*)/, (_, key) => `${key}=${MASK}`);
  }
  return maskValue(value);
}

/**
 * Masks secret query parameters in a URL, without re-encoding the rest.
 *
 * @param {string} url
 * @returns {string}
 */
export function maskUrl(url) {
  const start = url.indexOf('?');
  let masked = url;
  if (start >= 0) {
    const hashAt = url.indexOf('#', start);
    const end = hashAt < 0 ? url.length : hashAt;
    const query = url
      .slice(start + 1, end)
      .split('&')
      .map((part) => {
        const eq = part.indexOf('=');
        if (eq < 0) return part;
        const name = safeDecode(part.slice(0, eq));
        return isSecretName(name) ? `${part.slice(0, eq)}=${MASK}` : part;
      })
      .join('&');
    masked = `${url.slice(0, start + 1)}${query}${url.slice(end)}`;
  }
  // user:password@host
  return masked.replace(/^([a-z][a-z0-9+.-]*:\/\/[^/@:]+):[^/@]*@/i, `$1:${MASK}@`);
}

/**
 * @param {string} text
 * @returns {string}
 */
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Masks secret fields in a body (JSON objects at any depth, or form fields).
 *
 * @param {string} body
 * @param {string | null} contentType
 * @returns {string}
 */
export function maskBody(body, contentType) {
  if (!body) return body;
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('json') || (!type && /^\s*[[{]/.test(body))) {
    const parsed = parseJson(body, { maxDepth: 512 });
    if (!parsed.ok) return body;
    let changed = false;
    /** @type {import('../json/parser.js').JsonNode[]} */
    const stack = [parsed.value];
    while (stack.length) {
      const node = /** @type {import('../json/parser.js').JsonNode} */ (stack.pop());
      if (node.type === 'object') {
        for (const entry of node.entries) {
          if (entry.value.type === 'string' && isSecretName(entry.key) && entry.value.value) {
            entry.value.value = maskValue(entry.value.value);
            changed = true;
          } else stack.push(entry.value);
        }
      } else if (node.type === 'array') stack.push(...node.items);
    }
    return changed ? stringify(parsed.value, { indent: 2, sortKeys: false }) : body;
  }
  if (type.includes('x-www-form-urlencoded')) {
    const pairs = formParams(body);
    if (!pairs.some(([name]) => isSecretName(name))) return body;
    return body
      .split('&')
      .map((part) => {
        const eq = part.indexOf('=');
        return eq >= 0 && isSecretName(safeDecode(part.slice(0, eq).replace(/\+/g, ' ')))
          ? `${part.slice(0, eq)}=${MASK}`
          : part;
      })
      .join('&');
  }
  return body;
}

/**
 * @param {Header[]} headers
 * @returns {Header[]}
 */
function maskHeaders(headers) {
  return headers.map(([name, value]) => [
    name,
    isSecretHeader(name) ? maskHeader(name, value) : value,
  ]);
}

/**
 * A copy of the exchange with every secret masked.
 *
 * @param {HttpExchange} exchange
 * @returns {HttpExchange}
 */
export function maskExchange(exchange) {
  const { request, response } = exchange;
  return {
    ...exchange,
    request: request && {
      ...request,
      url: maskUrl(request.url),
      headers: maskHeaders(request.headers),
      body: maskBody(request.body, getHeader(request.headers, 'content-type')),
    },
    response: response && {
      ...response,
      headers: maskHeaders(response.headers),
      body: maskBody(response.body, getHeader(response.headers, 'content-type')),
    },
  };
}

/**
 * Tells whether an exchange holds anything that would be masked.
 *
 * @param {HttpExchange} exchange
 * @returns {boolean}
 */
export function hasSecrets(exchange) {
  return JSON.stringify(maskExchange(exchange)) !== JSON.stringify(exchange);
}
