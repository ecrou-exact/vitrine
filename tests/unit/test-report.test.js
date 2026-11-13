// @ts-check
import { describe, expect, it } from 'vitest';
import {
  ReportError,
  failureSummary,
  parseReport,
} from '../../src/components/test-report/report.js';
import { VtTestReport } from '../../src/components/test-report/vt-test-report.js';

if (!customElements.get('vt-test-report')) customElements.define('vt-test-report', VtTestReport);

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="api" time="3.5">
  <testsuite name="users" tests="3" time="1.25" file="tests/users.py">
    <testcase classname="tests.users" name="test_create" time="0.5"/>
    <testcase classname="tests.users" name="test_delete" time="0.7">
      <failure message="assert 404 == 200" type="AssertionError">Traceback (most recent call last):
  File "tests/users.py", line 12, in test_delete
AssertionError: assert 404 == 200</failure>
      <system-out>deleting 7</system-out>
    </testcase>
    <testcase classname="tests.users" name="test_slow"><skipped message="too slow"/></testcase>
  </testsuite>
  <testsuite name="auth">
    <testcase name="login" time="0.01"><error type="TimeoutError">boom</error></testcase>
    <testcase name="retry" time="0.2"><flakyFailure message="first run">x</flakyFailure></testcase>
  </testsuite>
</testsuites>`;

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtTestReport>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtTestReport} */ (document.createElement('vt-test-report'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('parseReport', () => {
  it('reads JUnit XML: suites, statuses, messages, output and durations', () => {
    const report = parseReport(JUNIT);
    expect(report.format).toBe('junit');
    expect(report.totals).toEqual({ total: 5, passed: 2, failed: 1, error: 1, skipped: 1 });
    expect(report.duration).toBe(3500);
    const [users, auth] = report.suites;
    expect(users.name).toBe('users');
    expect(users.file).toBe('tests/users.py');
    const failed = users.cases[1];
    expect(failed.status).toBe('failed');
    expect(failed.duration).toBe(700);
    expect(failed.message).toBe('AssertionError: assert 404 == 200');
    expect(failed.details).toContain('line 12');
    expect(failed.output).toBe('deleting 7');
    expect(users.cases[2]).toMatchObject({ status: 'skipped', message: 'too slow' });
    expect(auth.cases[0]).toMatchObject({ status: 'error', message: 'TimeoutError: boom' });
    expect(auth.cases[1]).toMatchObject({ status: 'passed', flaky: true });
  });

  it('reads a single <testsuite> and nested suites', () => {
    const report = parseReport(
      '<testsuite name="root"><testsuite name="inner"><testcase name="a"/></testsuite><testcase name="b"/></testsuite>',
    );
    expect(report.suites.map((s) => [s.name, s.cases.map((c) => c.name)])).toEqual([
      ['root › inner', ['a']],
      ['root', ['b']],
    ]);
  });

  it('never expands entities or reads files named in the XML', () => {
    const report = parseReport(
      '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><testsuite><testcase name="&e;"/></testsuite>',
    );
    expect(report.suites[0].cases[0].name).not.toContain('root:');
  });

  it('reads TAP, with directives, YAML diagnostics and subtests', () => {
    const report = parseReport(`TAP version 14
1..3
# Subtest: math
    # Subtest: adds
    ok 1 - adds
      ---
      duration_ms: 1.5
      ...
    not ok 2 - divides
      ---
      message: 'division by zero'
      ...
    1..2
not ok 1 - math
ok 2 - strings # SKIP not ready
not ok 3 - net # TODO later`);
    expect(report.format).toBe('tap');
    expect(report.totals).toEqual({ total: 4, passed: 1, failed: 1, error: 0, skipped: 2 });
    const math = report.suites.find((s) => s.name === 'math');
    expect(math?.cases.map((c) => [c.name, c.status, c.duration, c.message])).toEqual([
      ['adds', 'passed', 1.5, ''],
      ['divides', 'failed', null, 'division by zero'],
    ]);
    expect(report.suites[0].cases.map((c) => c.message)).toEqual([
      'SKIP: not ready',
      'TODO: later',
    ]);
  });

  it('reads Jest and Vitest JSON, with colors removed from the message only', () => {
    const report = parseReport(
      JSON.stringify({
        testResults: [
          {
            name: '/repo/src/sum.test.js',
            startTime: 1000,
            endTime: 1050,
            assertionResults: [
              { ancestorTitles: ['sum'], title: 'adds', status: 'passed', duration: 3 },
              {
                ancestorTitles: ['sum'],
                title: 'fails',
                status: 'failed',
                duration: 4,
                failureMessages: ['\u001b[31mExpected 1\u001b[39m\n    at sum.test.js:5'],
              },
              { ancestorTitles: [], title: 'later', status: 'todo' },
            ],
          },
          {
            name: '/repo/src/broken.test.js',
            message: 'SyntaxError: Unexpected token',
            assertionResults: [],
          },
        ],
      }),
    );
    expect(report.format).toBe('jest');
    expect(report.suites[0].name).toBe('src/sum.test.js');
    expect(report.suites[0].duration).toBe(50);
    const failed = report.suites[0].cases[1];
    expect(failed.classname).toBe('sum');
    expect(failed.message).toBe('Expected 1');
    expect(failed.details).toContain('\u001b[31m');
    expect(report.suites[0].cases[2].status).toBe('skipped');
    expect(report.suites[1].cases[0]).toMatchObject({
      status: 'error',
      message: 'SyntaxError: Unexpected token',
    });
  });

  it('reads Mocha JSON and plain lists', () => {
    const mocha = parseReport(
      JSON.stringify({
        stats: { duration: 12 },
        tests: [
          { title: 'works', fullTitle: 'api works', file: 'test/api.js', duration: 2, err: {} },
          { title: 'breaks', fullTitle: 'api breaks', file: 'test/api.js', err: { message: 'nope', stack: 'Error: nope\n  at x' } },
          { title: 'later', fullTitle: 'api later', file: 'test/api.js', pending: true, err: {} },
        ],
      }),
    ); // prettier-ignore
    expect(mocha.format).toBe('mocha');
    expect(mocha.duration).toBe(12);
    expect(mocha.suites[0].cases.map((c) => [c.classname, c.status])).toEqual([
      ['api', 'passed'],
      ['api', 'failed'],
      ['api', 'skipped'],
    ]);

    const list = parseReport(
      JSON.stringify([
        { name: 'a', status: 'pass', suite: 'unit', duration: 5 },
        { name: 'b', status: 'fail', suite: 'unit', message: 'bad' },
      ]),
    );
    expect(list.totals).toMatchObject({ total: 2, passed: 1, failed: 1 });
  });

  it('refuses what is not a report, with a reason', () => {
    expect(() => parseReport('')).toThrow(ReportError);
    expect(() => parseReport('hello')).toThrow('format');
    expect(() => parseReport('<html></html>')).toThrow('junit');
  });

  it('sums up the failures as text', () => {
    expect(failureSummary(parseReport(JUNIT))).toBe(
      [
        '✗ users › tests.users › test_delete',
        '  AssertionError: assert 404 == 200',
        '✗ auth › login',
        '  TimeoutError: boom',
      ].join('\n'),
    );
  });
});

describe('<vt-test-report>', () => {
  it('shows the result of the run and opens the suites with failures', async () => {
    const el = await mount({}, JUNIT);
    expect(el.root.querySelector('.tr-summary')?.textContent).toContain('2 of 5 tests failed');
    const headers = el.root.querySelectorAll('.tr-suite-header');
    expect(Array.from(headers, (b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(el.root.querySelector('.status-failed .tr-message')?.textContent).toBe(
      'AssertionError: assert 404 == 200',
    );
  });

  it('filters by status and by search, and reports it', async () => {
    const el = await mount({ variant: 'full' }, JUNIT);
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-filter-change', (event) =>
      events.push(/** @type {CustomEvent} */ (event).detail),
    );
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-focus-key="status-failed"]')
    ).click();
    expect(Array.from(el.root.querySelectorAll('.tr-case'), (li) => li.className)).toEqual([
      'tr-case status-failed',
      'tr-case status-error',
    ]);
    expect(events.at(-1)).toEqual({ status: 'failed', query: '', shown: 2 });
  });

  it('shows details with their colors, as text', async () => {
    const el = await mount(
      {},
      JSON.stringify([
        {
          name: '<b>x</b>',
          status: 'failed',
          message: 'bad',
          details: '\u001b[31m<img src=x>\u001b[0m',
        },
      ]),
    );
    /** @type {HTMLButtonElement} */ (el.root.querySelector('.tr-toggle')).click();
    const pre = el.root.querySelector('.tr-pre');
    expect(pre?.querySelector('.fg-1')?.textContent).toBe('<img src=x>');
    expect(el.root.querySelector('img, b')).toBeNull();
  });

  it('closes a suite and reports it', async () => {
    const el = await mount({ open: 'all' }, JUNIT);
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-toggle', (event) =>
      events.push(/** @type {CustomEvent} */ (event).detail),
    );
    /** @type {HTMLButtonElement} */ (el.root.querySelector('.tr-suite-header')).click();
    expect(el.root.querySelector('.tr-suite-header')?.getAttribute('aria-expanded')).toBe('false');
    expect(events).toEqual([{ suite: 'users', expanded: false }]);
  });
});
