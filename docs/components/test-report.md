# `<vt-test-report>`

`<vt-test-report>` shows the result of a test run: how many tests passed, failed or were skipped, the suites with their tests and durations, and for each failure its message, stack trace and output, with their ANSI colors. Suites with failures are open at first.

```html
<vt-test-report variant="full" src="/ci/junit.xml"></vt-test-report>
```

## What it reads

| Format                                    | Written by                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| JUnit XML (`<testsuites>`, `<testsuite>`) | pytest (`--junitxml`), Maven Surefire, Gradle, Go (`go-junit-report`), PHPUnit, .NET, Jest and Vitest reporters, most CI tools |
| TAP, versions 12 to 14                    | `node --test`, tape, Perl's `prove`; `# SKIP`, `# TODO`, YAML diagnostics and subtests                                         |
| JSON of Jest and Vitest                   | `jest --json`, `vitest --reporter=json`                                                                                        |
| JSON of Mocha                             | `mocha --reporter json`                                                                                                        |
| A plain list                              | `[{ name, suite, status, duration, message, details, output }]`                                                                |

In JUnit XML, `<failure>` and `<error>` give the message and the stack trace, `<skipped>` its reason, `<system-out>` and `<system-err>` the output, and `flakyFailure` or `rerunFailure` (Surefire) mark a test that failed and then passed. Durations in JUnit and TAP (`duration_ms`) are read in seconds and milliseconds. The XML is read with the parser of [`<vt-xml>`](xml.md): entities are never expanded and nothing is fetched.

A plain list reads `status` in many spellings: `passed`, `pass`, `failed`, `fail`, `error`, `skipped`, `pending`, `todo`… `duration` is in milliseconds, and `time` in seconds.

## Using it

The result of the run is on top: a sentence, the counts, the total time and a bar of passed, failed and skipped tests (read as text by screen readers). In the full variant, buttons show all tests, the failed ones, the passed ones or the skipped ones, with their counts; the search filters tests by name, class or message; a button lists the slowest first; and "Copy failures" copies a summary to paste in an issue:

```text
✗ users › tests.users › test_delete
  AssertionError: assert 404 == 200
```

## Attributes

| Attribute       | Type    | Default  | Description                                                  |
| --------------- | ------- | -------- | ------------------------------------------------------------ |
| `status`        | string  | `all`    | Tests shown at first: `all`, `failed`, `passed` or `skipped` |
| `open`          | string  | `failed` | Suites open at first: `failed`, `all` or `none`              |
| `sort`          | string  | `order`  | Order of the tests in a suite: `order`, `duration` or `name` |
| `status-filter` | boolean | preset   | Status buttons with counts                                   |
| `output`        | boolean | on       | Standard output and errors of a test, under its details      |

Shared attributes are in [Common attributes](../common-attributes.md).

## Properties

`report` is the report read (a read-only copy): `{ format, name, suites, totals, duration }`, where each suite is `{ name, file, cases, duration, timestamp }` and each test `{ name, classname, status, duration, message, details, output, errors, file, line, flaky }`. Durations are in milliseconds.

## Events

| Event              | When                                   | Detail                     |
| ------------------ | -------------------------------------- | -------------------------- |
| `vt-filter-change` | The status shown or the search changed | `{ status, query, shown }` |
| `vt-toggle`        | A suite was opened or closed           | `{ suite, expanded }`      |

## CSS parts

`summary`, `bar`, `status-filter`, `suite`, `suite-header`, `case` (also `case-passed`, `case-failed`, `case-error`, `case-skipped`), `message` and `details`.
