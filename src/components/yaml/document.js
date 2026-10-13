// @ts-check
/**
 * Turns YAML documents into the tree of <vt-json>, and finds anchors and aliases.
 *
 * Values come from js-yaml with the core schema, so they are plain data. They are
 * serialized to JSON and read by the JSON parser, which gives the same tree, depth
 * limit and types as <vt-json>.
 *
 * @module components/yaml/document
 */
import { parseJson } from '../json/parser.js';

/** @typedef {import('../json/parser.js').ParseResult} ParseResult */
/** @typedef {import('../json/parser.js').JsonSyntaxError} JsonSyntaxError */

/**
 * @typedef {object} YamlResult
 * @property {ParseResult} result - Tree of the content (an array when there are several documents).
 * @property {number} documents - Number of documents in the stream.
 * @property {string} json - The content as JSON (pretty-printed).
 */

/**
 * @param {unknown[]} documents - Documents read from the stream.
 * @param {number} maxDepth
 * @returns {YamlResult}
 */
export function documentsToTree(documents, maxDepth) {
  const value = documents.length === 1 ? documents[0] : documents;
  const json = JSON.stringify(value === undefined ? null : value, jsonValue, 2) ?? 'null';
  return { result: parseJson(json, { maxDepth }), documents: documents.length, json };
}

/**
 * `.inf` and `.nan` have no JSON form: they are kept as strings.
 *
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
function jsonValue(_key, value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

/**
 * A js-yaml exception as a syntax error with line and column.
 *
 * @param {unknown} error
 * @returns {JsonSyntaxError}
 */
export function yamlError(error) {
  const e =
    /** @type {{ reason?: string, message?: string, mark?: { line: number, column: number, position: number } }} */ (
      error ?? {}
    );
  return {
    message: String(e.reason ?? e.message ?? error),
    offset: e.mark?.position ?? 0,
    line: (e.mark?.line ?? 0) + 1,
    column: (e.mark?.column ?? 0) + 1,
    tooDeep: false,
  };
}

const ANCHOR = /(^|[\s[{,:-])&([^\s[\]{},]+)/g;
const ALIAS = /(^|[\s[{,:-])\*([^\s[\]{},]+)/g;

/**
 * Anchors (`&name`) with their line and the number of aliases (`*name`) that use them.
 * Comments and quoted strings are skipped.
 *
 * @param {string} text
 * @returns {{ name: string, line: number, uses: number }[]}
 */
export function findAnchors(text) {
  /** @type {Map<string, { name: string, line: number, uses: number }>} */
  const anchors = new Map();
  /** @type {string[]} */
  const aliases = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && i < 100_000; i += 1) {
    const line = stripQuotesAndComment(lines[i]);
    for (const match of line.matchAll(ANCHOR)) {
      if (!anchors.has(match[2])) anchors.set(match[2], { name: match[2], line: i + 1, uses: 0 });
    }
    for (const match of line.matchAll(ALIAS)) aliases.push(match[2]);
  }
  for (const name of aliases) {
    const anchor = anchors.get(name);
    if (anchor) anchor.uses += 1;
  }
  return [...anchors.values()];
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripQuotesAndComment(line) {
  let out = '';
  /** @type {string | null} */
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
      out += ' ';
    } else if (char === '"' || char === "'") {
      quote = char;
      out += ' ';
    } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    else out += char;
  }
  return out;
}
