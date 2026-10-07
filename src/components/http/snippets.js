// @ts-check
/**
 * Writes an HTTP request as code: curl, JavaScript fetch, Python requests and HTTPie.
 *
 * Every value is quoted for its language (POSIX shell single quotes, JavaScript and
 * Python string literals), so a value can never break out of its string. JSON bodies are
 * written as native objects (JavaScript object literals, Python dicts) with their numbers
 * kept exactly as written.
 *
 * @module components/http/snippets
 */
import { parseJson } from '../json/parser.js';
import { absoluteUrl, getHeader } from './message.js';

/** @typedef {import('./message.js').HttpRequest} HttpRequest */
/** @typedef {import('./message.js').Header} Header */
/** @typedef {import('../json/parser.js').JsonNode} JsonNode */

/** @typedef {"curl" | "fetch" | "python" | "httpie"} SnippetLanguage */

export const SNIPPET_LANGUAGES = /** @type {const} */ (['curl', 'fetch', 'python', 'httpie']);

/** Highlighting language of each snippet. */
export const SNIPPET_HIGHLIGHT = /** @type {Record<SnippetLanguage, string>} */ ({
  curl: 'bash',
  fetch: 'javascript',
  python: 'python',
  httpie: 'bash',
});

/** Headers that tools set themselves (the host is in the URL). */
const TOOL_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);

/** Headers browsers do not let `fetch` set. */
const FORBIDDEN_FETCH = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2', 'date',
  'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'via',
]); // prettier-ignore

/**
 * POSIX shell single-quoted string.
 *
 * @param {string} text
 * @returns {string}
 */
export function shellQuote(text) {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * JavaScript / Python string literal (double quotes, escaped).
 *
 * @param {string} text
 * @returns {string}
 */
function stringLiteral(text) {
  return JSON.stringify(text)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * @param {HttpRequest} request
 * @returns {Header[]}
 */
function headersFor(request) {
  return request.headers.filter(([name]) => !TOOL_HEADERS.has(name.toLowerCase()));
}

/**
 * The parsed JSON body, when the request has one.
 *
 * @param {HttpRequest} request
 * @returns {JsonNode | null}
 */
function jsonBody(request) {
  if (!request.body) return null;
  const type = (getHeader(request.headers, 'content-type') ?? '').toLowerCase();
  if (type && !type.includes('json')) return null;
  const parsed = parseJson(request.body, { maxDepth: 512 });
  return parsed.ok ? parsed.value : null;
}

/**
 * Writes a JSON value as JavaScript or Python source.
 *
 * @param {JsonNode} node
 * @param {"js" | "python"} language
 * @param {string} indent - Indentation of the line the value starts on.
 * @returns {string}
 */
export function literal(node, language, indent = '') {
  const step = language === 'python' ? '    ' : '  ';
  const inner = indent + step;
  switch (node.type) {
    case 'string':
      return stringLiteral(node.value);
    case 'number':
      return node.raw;
    case 'boolean':
      return language === 'python' ? (node.value ? 'True' : 'False') : String(node.value);
    case 'null':
      return language === 'python' ? 'None' : 'null';
    case 'array':
      if (!node.items.length) return '[]';
      return `[\n${node.items.map((item) => `${inner}${literal(item, language, inner)},`).join('\n')}\n${indent}]`;
    case 'object': {
      if (!node.entries.length) return '{}';
      const key = (/** @type {string} */ name) =>
        language === 'js' && /^[A-Za-z_$][\w$]*$/.test(name) ? name : stringLiteral(name);
      const lines = node.entries.map(
        (entry) => `${inner}${key(entry.key)}: ${literal(entry.value, language, inner)},`,
      );
      return `{\n${lines.join('\n')}\n${indent}}`;
    }
    default:
      return 'null';
  }
}

/**
 * @param {HttpRequest} request
 * @returns {string}
 */
export function toCurl(request) {
  const head = ['curl'];
  const hasBody = Boolean(request.body);
  if (request.method === 'HEAD') head.push('--head');
  else if (!(request.method === 'GET' && !hasBody) && !(request.method === 'POST' && hasBody))
    head.push(`-X ${request.method}`);
  head.push(shellQuote(absoluteUrl(request)));
  const lines = [head.join(' ')];
  for (const [name, value] of headersFor(request))
    lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  if (hasBody) lines.push(`--data-raw ${shellQuote(request.body)}`);
  return lines.join(' \\\n  ');
}

/**
 * @param {HttpRequest} request
 * @param {{ responseType?: "json" | "text" }} [options]
 * @returns {string}
 */
export function toFetch(request, options = {}) {
  /** @type {string[]} */
  const fields = [];
  if (request.method !== 'GET') fields.push(`  method: ${stringLiteral(request.method)},`);
  const headers = headersFor(request).filter(([name]) => !FORBIDDEN_FETCH.has(name.toLowerCase()));
  if (headers.length) {
    const lines = headers.map(
      ([name, value]) => `    ${stringLiteral(name)}: ${stringLiteral(value)},`,
    );
    fields.push(`  headers: {\n${lines.join('\n')}\n  },`);
  }
  if (getHeader(request.headers, 'cookie')) {
    // Browsers send cookies themselves; they cannot be set by hand.
    fields.push(`  credentials: 'include',`);
  }
  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    const json = jsonBody(request);
    fields.push(
      json
        ? `  body: JSON.stringify(${literal(json, 'js', '  ')}),`
        : `  body: ${stringLiteral(request.body)},`,
    );
  }
  const url = stringLiteral(absoluteUrl(request));
  const call = fields.length ? `fetch(${url}, {\n${fields.join('\n')}\n})` : `fetch(${url})`;
  const read = options.responseType === 'json' ? 'json' : 'text';
  return `const response = await ${call};\nconst data = await response.${read}();`;
}

/**
 * @param {HttpRequest} request
 * @returns {string}
 */
export function toPython(request) {
  const method = request.method.toLowerCase();
  const shortcut = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method);
  /** @type {string[]} */
  const args = shortcut
    ? [`    ${stringLiteral(absoluteUrl(request))},`]
    : [`    ${stringLiteral(request.method)},`, `    ${stringLiteral(absoluteUrl(request))},`];
  const json = jsonBody(request);
  const headers = headersFor(request).filter(
    // requests sets the JSON content type itself.
    ([name, value]) => !(json && name.toLowerCase() === 'content-type' && /json/i.test(value)),
  );
  if (headers.length) {
    const lines = headers.map(
      ([name, value]) => `        ${stringLiteral(name)}: ${stringLiteral(value)},`,
    );
    args.push(`    headers={\n${lines.join('\n')}\n    },`);
  }
  if (request.body) {
    args.push(
      json
        ? `    json=${literal(json, 'python', '    ')},`
        : `    data=${stringLiteral(request.body)},`,
    );
  }
  const call = shortcut ? `requests.${method}` : 'requests.request';
  return `import requests\n\nresponse = ${call}(\n${args.join('\n')}\n)\nresponse.raise_for_status()`;
}

/**
 * @param {HttpRequest} request
 * @returns {string}
 */
export function toHttpie(request) {
  const lines = [`http ${request.method} ${shellQuote(absoluteUrl(request))}`];
  for (const [name, value] of headersFor(request)) lines.push(shellQuote(`${name}:${value}`));
  // Options may follow the URL; the body is sent exactly as written.
  if (request.body) lines.push(`--raw ${shellQuote(request.body)}`);
  return lines.join(' \\\n  ');
}

/**
 * @param {HttpRequest} request
 * @param {SnippetLanguage} language
 * @param {{ responseType?: "json" | "text" }} [options]
 * @returns {string}
 */
export function snippet(request, language, options = {}) {
  switch (language) {
    case 'fetch':
      return toFetch(request, options);
    case 'python':
      return toPython(request);
    case 'httpie':
      return toHttpie(request);
    default:
      return toCurl(request);
  }
}
