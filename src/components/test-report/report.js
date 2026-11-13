// @ts-check
/**
 * Reads test reports for <vt-test-report>: JUnit XML (also written by pytest, Maven,
 * Gradle, Go, PHPUnit, .NET and most CI tools), TAP, and JSON from Jest, Vitest, Mocha,
 * or a plain list of tests.
 *
 * @module components/test-report/report
 */
import { stripAnsi } from '../terminal/ansi.js';
import { parseXml, rootElement, textContent } from '../xml/parser.js';

/** Tests kept per report. */
export const MAX_TESTS = 50_000;
/** Characters kept per message, stack trace or output. */
export const MAX_TEXT = 20_000;

/** @typedef {"passed" | "failed" | "error" | "skipped"} Status */
export const STATUSES = /** @type {const} */ (['failed', 'error', 'skipped', 'passed']);

/**
 * @typedef {object} TestCase
 * @property {string} name
 * @property {string} classname - Class, file or describe path, when the format gives one.
 * @property {Status} status
 * @property {number | null} duration - In milliseconds.
 * @property {string} message - First line of the failure or the reason it was skipped.
 * @property {string} details - Stack trace or diagnostics.
 * @property {string} output - Standard output.
 * @property {string} errors - Standard error.
 * @property {string} file
 * @property {number | null} line
 * @property {boolean} flaky - Failed, then passed when run again.
 */

/**
 * @typedef {object} Suite
 * @property {string} name
 * @property {string} file
 * @property {TestCase[]} cases
 * @property {number | null} duration
 * @property {string} timestamp
 * @property {string} output - Output of the suite itself.
 */

/**
 * @typedef {object} Totals
 * @property {number} total
 * @property {number} passed
 * @property {number} failed
 * @property {number} error
 * @property {number} skipped
 */

/**
 * @typedef {object} Report
 * @property {"junit" | "tap" | "jest" | "mocha" | "json"} format
 * @property {string} name
 * @property {Suite[]} suites
 * @property {Totals} totals
 * @property {number | null} duration - In milliseconds: the report's own, or the sum of its suites.
 */

export class ReportError extends Error {}

/** @returns {TestCase} */
const testCase = (/** @type {Partial<TestCase>} */ values) => ({
  name: '',
  classname: '',
  status: 'passed',
  duration: null,
  message: '',
  details: '',
  output: '',
  errors: '',
  file: '',
  line: null,
  flaky: false,
  ...values,
});

/** @returns {Suite} */
const suite = (/** @type {Partial<Suite>} */ values) => ({
  name: '',
  file: '',
  cases: [],
  duration: null,
  timestamp: '',
  output: '',
  ...values,
});

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
const text = (value, max = MAX_TEXT) =>
  typeof value === 'string'
    ? value.slice(0, max)
    : value == null
      ? ''
      : String(value).slice(0, max);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} scale - Milliseconds per unit.
 * @returns {number | null}
 */
function duration(value, scale) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : NaN; // prettier-ignore
  return Number.isFinite(n) && n >= 0 ? n * scale : null;
}

/**
 * Reads a report in any supported format.
 *
 * @param {string} input
 * @returns {Report}
 */
export function parseReport(input) {
  const source = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).trim();
  if (!source) throw new ReportError('empty');
  /** @type {Report} */
  let report;
  if (source.startsWith('<')) report = fromJunit(source);
  else if (/^[[{]/.test(source)) report = fromJson(JSON.parse(source));
  else if (/^(?:TAP version \d+|1\.\.\d+|(?:not )?ok\b)/m.test(source)) report = fromTap(source);
  else throw new ReportError('format');
  return finish(report);
}

/**
 * Counts the tests and fills the duration.
 *
 * @param {Report} report
 * @returns {Report}
 */
function finish(report) {
  report.suites = report.suites.filter((s) => s.cases.length || s.output);
  const totals = { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 };
  let sum = 0;
  let timed = false;
  for (const s of report.suites) {
    for (const c of s.cases) {
      totals.total += 1;
      totals[c.status] += 1;
    }
    const own = s.duration ?? s.cases.reduce((acc, c) => acc + (c.duration ?? 0), 0);
    if (s.duration !== null || s.cases.some((c) => c.duration !== null)) timed = true;
    sum += own;
  }
  report.totals = totals;
  if (report.duration === null && timed) report.duration = sum;
  return report;
}

/**
 * Splits a failure text into its first line (the message) and the rest.
 *
 * @param {string} message - The message attribute, when there is one.
 * @param {string} body - The text of the element.
 * @returns {{ message: string, details: string }}
 */
function splitFailure(message, body) {
  const details = body.replace(/^\n+|\s+$/g, '');
  if (message) {
    const clean = stripAnsi(message).trim();
    return { message: clean, details: stripAnsi(details) === clean ? '' : details };
  }
  const first = details.split('\n').find((line) => stripAnsi(line).trim()) ?? '';
  return { message: stripAnsi(first).trim(), details };
}

// ------------------------------------------------------------------ JUnit

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @param {string} name
 * @returns {string}
 */
const attr = (node, name) => node.attrs.find((a) => a.name === name)?.value ?? '';

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @returns {import('../xml/parser.js').XmlNode[]}
 */
const elements = (node) => node.children.filter((child) => child.type === 'element');

/**
 * @param {string} source
 * @returns {Report}
 */
function fromJunit(source) {
  const parsed = parseXml(source, { maxDepth: 64 });
  if (!parsed.ok)
    throw new ReportError(
      `${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})`,
    );
  const root = rootElement(parsed.value);
  if (!root || !/^test(?:suites|suite|run)$/.test(root.name)) throw new ReportError('junit');
  /** @type {Suite[]} */
  const suites = [];
  let count = 0;
  /**
   * @param {import('../xml/parser.js').XmlNode} node
   * @param {string[]} path - Names of the enclosing suites.
   */
  const visit = (node, path) => {
    const name = attr(node, 'name');
    const names = name ? [...path, name] : path;
    const current = suite({
      name: names.join(' › ') || attr(node, 'package'),
      file: attr(node, 'file') || attr(node, 'filepath'),
      duration: duration(attr(node, 'time'), 1000),
      timestamp: attr(node, 'timestamp'),
    });
    for (const child of elements(node)) {
      if (child.name === 'testsuite') visit(child, names);
      else if (child.name === 'testcase' && count < MAX_TESTS) {
        current.cases.push(junitCase(child, current.file));
        count += 1;
      } else if (child.name === 'system-out' || child.name === 'system-err')
        current.output += text(textContent(child)).trim();
    }
    if (current.cases.length || current.output) suites.push(current);
  };
  if (root.name === 'testsuite') visit(root, []);
  else for (const child of elements(root)) if (child.name === 'testsuite') visit(child, []);
  return {
    format: 'junit',
    name: root.name === 'testsuite' ? '' : attr(root, 'name'),
    suites,
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: root.name === 'testsuites' ? duration(attr(root, 'time'), 1000) : null,
  };
}

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @param {string} file
 * @returns {TestCase}
 */
function junitCase(node, file) {
  const result = testCase({
    name: attr(node, 'name'),
    classname: attr(node, 'classname') || attr(node, 'class'),
    duration: duration(attr(node, 'time'), 1000),
    file: attr(node, 'file') || file,
    line: Number(attr(node, 'line')) || null,
  });
  for (const child of elements(node)) {
    const body = text(textContent(child));
    if (child.name === 'failure' || child.name === 'error') {
      // An error outranks a failure; the first of each kind is kept.
      if (result.status === 'error' || (result.status === 'failed' && child.name === 'failure'))
        continue;
      result.status = child.name === 'error' ? 'error' : 'failed';
      const type = attr(child, 'type');
      const { message, details } = splitFailure(attr(child, 'message'), body);
      result.message =
        type && message && !message.startsWith(type) ? `${type}: ${message}` : message || type;
      result.details = details;
    } else if (child.name === 'skipped' && result.status === 'passed') {
      result.status = 'skipped';
      result.message = (attr(child, 'message') || body).trim();
    } else if (/^(?:flaky|rerun)(?:Failure|Error)$/.test(child.name)) {
      result.flaky = true;
      if (!result.details) result.details = body.trim();
    } else if (child.name === 'system-out') result.output += body.trim();
    else if (child.name === 'system-err') result.errors += body.trim();
  }
  return result;
}

// ------------------------------------------------------------------ TAP

/**
 * Reads TAP (versions 12 to 14): test lines, `# SKIP` and `# TODO` directives, YAML
 * diagnostics and subtests.
 *
 * @param {string} source
 * @returns {Report}
 */
function fromTap(source) {
  const lines = source.split('\n');
  /** @type {Suite[]} */
  const suites = [];
  let fallback = suite({ name: '' });
  /** @type {Map<number, Suite>} Subtests by indent. */
  const open = new Map();
  /** @type {TestCase | null} */
  let last = null;
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = /^ */.exec(line)?.[0].length ?? 0;
    const content = line.trim();
    const subtest = /^# Subtest:\s*(.*)$/.exec(content);
    if (subtest) {
      const created = suite({ name: subtest[1].trim() });
      open.set(indent, created);
      suites.push(created);
      continue;
    }
    if (content === '---' && last) {
      const block = [];
      for (i += 1; i < lines.length && lines[i].trim() !== '...'; i += 1) block.push(lines[i]);
      const yaml = dedentBlock(block);
      last.details = yaml.slice(0, MAX_TEXT);
      const message = /^(?:message|error):\s*(?:['"]?)(.*?)['"]?\s*$/m.exec(yaml);
      if (message?.[1] && !/^[|>][-+]?$/.test(message[1])) last.message ||= message[1];
      const ms = /^duration_ms:\s*([\d.]+)\s*$/m.exec(yaml);
      if (ms) last.duration = Number(ms[1]);
      continue;
    }
    const test =
      /^(not )?ok\b(?:\s+(\d+))?(?:\s*-)?\s*(.*?)(?:\s+#\s*(skip|todo)\b\s*(.*))?$/i.exec(content);
    if (!test) continue;
    const name = test[3].replace(/\\#/g, '#').trim();
    // "# Subtest: name" comes before the tests of a subtest, and a test line with the same
    // name and indent ends it. With tests of its own, that line only sums them up; without,
    // the subtest is a single test (node --test writes every test this way).
    const sub = open.get(indent);
    if (sub && sub.name === name) {
      open.delete(indent);
      if (sub.cases.length) {
        last = null;
        continue;
      }
      suites.splice(suites.indexOf(sub), 1);
    }
    if (count >= MAX_TESTS) continue;
    const directive = test[4]?.toLowerCase();
    last = testCase({
      name: name || `#${test[2] ?? count + 1}`,
      status:
        directive === 'skip' || directive === 'todo' ? 'skipped' : test[1] ? 'failed' : 'passed',
      message: directive ? `${directive.toUpperCase()}${test[5] ? `: ${test[5].trim()}` : ''}` : '',
    });
    const target = indent > 0 ? open.get(indent - 4) : null;
    (target ?? fallback).cases.push(last);
    count += 1;
  }
  if (fallback.cases.length) suites.unshift(fallback);
  return {
    format: 'tap',
    name: '',
    suites,
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: null,
  };
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function dedentBlock(lines) {
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)?.[0].length ?? 0),
  );
  return lines
    .map((l) => l.slice(Number.isFinite(indent) ? indent : 0))
    .join('\n')
    .trimEnd();
}

// ------------------------------------------------------------------ JSON

/**
 * Reads Jest or Vitest (`--json`), Mocha (`--reporter json`), or a list of tests
 * (`[{ name, status, duration, suite, message }]`).
 *
 * @param {unknown} value
 * @returns {Report}
 */
export function fromJson(value) {
  if (isObject(value) && Array.isArray(value.testResults)) return fromJest(value);
  if (isObject(value) && isObject(value.stats) && Array.isArray(value.tests))
    return fromMocha(value);
  if (isObject(value) && Array.isArray(value.suites)) return fromSuites(value);
  const list = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.tests)
      ? value.tests
      : null;
  if (!list) throw new ReportError('format');
  return fromList(list, isObject(value) ? text(value.name, 200) : '');
}

/**
 * @param {unknown} value
 * @returns {Status}
 */
function statusOf(value) {
  const s = String(value ?? '').toLowerCase();
  if (/^(?:fail|failed|failure|broken|timedout|timed_out|interrupted)$/.test(s)) return 'failed';
  if (/^(?:error|errored)$/.test(s)) return 'error';
  if (/^(?:skip|skipped|pending|todo|disabled|ignored|excluded)$/.test(s)) return 'skipped';
  return 'passed';
}

/**
 * @param {Record<string, unknown>} value
 * @returns {Report}
 */
function fromJest(value) {
  /** @type {Suite[]} */
  const suites = [];
  let count = 0;
  for (const file of /** @type {unknown[]} */ (value.testResults)) {
    if (!isObject(file)) continue;
    const name = text(file.name ?? file.testFilePath, 1000);
    const start = Number(file.startTime);
    const end = Number(file.endTime);
    const current = suite({
      name: shortPath(name),
      file: name,
      duration: Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null,
    });
    const results = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    for (const item of results) {
      if (!isObject(item) || count >= MAX_TESTS) continue;
      const failures = Array.isArray(item.failureMessages) ? item.failureMessages.map((m) => text(m)).join('\n\n') : ''; // prettier-ignore
      const { message, details } = splitFailure('', failures);
      const ancestors = Array.isArray(item.ancestorTitles) ? item.ancestorTitles.map((t) => text(t, 500)) : []; // prettier-ignore
      current.cases.push(
        testCase({
          name: text(item.title, 1000),
          classname: ancestors.join(' › '),
          status: statusOf(item.status),
          duration: duration(item.duration, 1),
          message,
          details,
          file: name,
          line: isObject(item.location) && Number.isFinite(Number(item.location.line)) ? Number(item.location.line) : null, // prettier-ignore
        }),
      );
      count += 1;
    }
    if (!results.length && typeof file.message === 'string' && file.message) {
      // A file that failed before running its tests (a syntax error, a missing import).
      const { message, details } = splitFailure('', text(file.message));
      current.cases.push(testCase({ name: shortPath(name), status: 'error', message, details, file: name })); // prettier-ignore
    }
    suites.push(current);
  }
  return {
    format: 'jest',
    name: '',
    suites,
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: null,
  };
}

/**
 * @param {Record<string, unknown>} value
 * @returns {Report}
 */
function fromMocha(value) {
  /** @type {Map<string, Suite>} */
  const byFile = new Map();
  for (const item of /** @type {unknown[]} */ (value.tests).slice(0, MAX_TESTS)) {
    if (!isObject(item)) continue;
    const file = text(item.file, 1000);
    const full = text(item.fullTitle, 2000);
    const title = text(item.title, 1000);
    const err = isObject(item.err) ? item.err : {};
    const failed = typeof err.message === 'string' || typeof err.stack === 'string';
    const pending = item.pending === true || /** @type {unknown[]} */ (value.pending ?? []).some((p) => isObject(p) && p.fullTitle === item.fullTitle); // prettier-ignore
    const { message, details } = splitFailure(text(err.message), text(err.stack));
    let current = byFile.get(file);
    if (!current) {
      current = suite({ name: shortPath(file), file });
      byFile.set(file, current);
    }
    current.cases.push(
      testCase({
        name: title,
        classname: full.endsWith(title) ? full.slice(0, -title.length).trim() : '',
        status: failed ? 'failed' : pending ? 'skipped' : 'passed',
        duration: duration(item.duration, 1),
        message: failed ? message : '',
        details: failed ? details : '',
        file,
      }),
    );
  }
  const stats = /** @type {Record<string, unknown>} */ (value.stats);
  return {
    format: 'mocha',
    name: '',
    suites: [...byFile.values()],
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: duration(stats.duration, 1),
  };
}

/**
 * `{ suites: [{ name, tests: [...] }] }`.
 *
 * @param {Record<string, unknown>} value
 * @returns {Report}
 */
function fromSuites(value) {
  /** @type {Suite[]} */
  const suites = [];
  for (const item of /** @type {unknown[]} */ (value.suites)) {
    if (!isObject(item)) continue;
    const tests = Array.isArray(item.tests)
      ? item.tests
      : Array.isArray(item.cases)
        ? item.cases
        : [];
    const current = fromList(tests, '').suites[0] ?? suite({});
    current.name = text(item.name ?? item.title, 1000);
    current.file = text(item.file, 1000);
    current.duration = duration(item.duration, 1);
    suites.push(current);
  }
  return {
    format: 'json',
    name: text(value.name, 200),
    suites,
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: duration(value.duration, 1),
  };
}

/**
 * @param {unknown[]} list
 * @param {string} name
 * @returns {Report}
 */
function fromList(list, name) {
  /** @type {Map<string, Suite>} */
  const bySuite = new Map();
  for (const item of list.slice(0, MAX_TESTS)) {
    if (!isObject(item)) continue;
    const group = text(item.suite ?? item.classname ?? item.file ?? '', 1000);
    let current = bySuite.get(group);
    if (!current) {
      current = suite({ name: group, file: text(item.file, 1000) });
      bySuite.set(group, current);
    }
    const error = isObject(item.error) ? item.error : null;
    const { message, details } = splitFailure(
      text(item.message ?? error?.message ?? ''),
      text(item.details ?? item.stack ?? error?.stack ?? ''),
    );
    current.cases.push(
      testCase({
        name: text(item.name ?? item.title, 1000),
        classname: text(item.classname, 1000),
        status: statusOf(
          item.status ?? (item.passed === false ? 'failed' : item.skipped ? 'skipped' : 'passed'),
        ),
        duration: duration(item.duration ?? item.time, typeof item.time === 'number' && item.duration === undefined ? 1000 : 1), // prettier-ignore
        message,
        details,
        output: text(item.output ?? item.stdout),
        file: text(item.file, 1000),
        line: Number.isFinite(Number(item.line)) && item.line != null ? Number(item.line) : null,
      }),
    );
  }
  return {
    format: 'json',
    name,
    suites: [...bySuite.values()],
    totals: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
    duration: null,
  };
}

/**
 * The end of a path, from the last folder that looks like a project root.
 *
 * @param {string} path
 * @returns {string}
 */
function shortPath(path) {
  const parts = path.replace(/\\/g, '/').split('/');
  const root = Math.max(parts.lastIndexOf('src'), parts.lastIndexOf('test'), parts.lastIndexOf('tests'), parts.lastIndexOf('__tests__')); // prettier-ignore
  return root > 0 ? parts.slice(root).join('/') : parts.slice(-2).join('/');
}

/**
 * A plain text summary of the failures, to paste in an issue or a chat.
 *
 * @param {Report} report
 * @returns {string}
 */
export function failureSummary(report) {
  const lines = [];
  for (const s of report.suites)
    for (const c of s.cases) {
      if (c.status !== 'failed' && c.status !== 'error') continue;
      lines.push(`✗ ${[s.name, c.classname, c.name].filter(Boolean).join(' › ')}`);
      if (c.message) lines.push(`  ${c.message}`);
    }
  return lines.join('\n');
}
