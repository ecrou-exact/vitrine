import { describe, expect, it } from 'vitest';
import { LogParser, countLevels, parseLog, toLevel } from '../../src/components/log/parser.js';

describe('toLevel', () => {
  it('normalizes names, aliases and pino numbers', () => {
    expect(toLevel('WARNING')).toBe('warn');
    expect(toLevel('err')).toBe('error');
    expect(toLevel('CRIT')).toBe('fatal');
    expect(toLevel(30)).toBe('info');
    expect(toLevel('50')).toBe('error');
    expect(toLevel(10)).toBe('trace');
    expect(toLevel('banana')).toBeNull();
  });
});

describe('parseLog: plain text', () => {
  it('reads timestamps and levels in common shapes', () => {
    const entries = parseLog(
      [
        '2026-10-07T18:00:00.123Z INFO  server started on :8080',
        '2026-10-07 18:00:01,456 [WARN] slow query (812 ms)',
        'Oct  7 18:00:02 box sshd[42]: error: auth failed',
        '[18:00:03] ERROR: payment declined',
        'E/ActivityManager: ANR in com.example',
        'level=debug msg="cache miss" key=user:42',
      ].join('\n'),
    );
    expect(entries.map((e) => e.level)).toEqual(['info', 'warn', null, 'error', 'error', 'debug']);
    expect(entries[0]).toMatchObject({
      time: '2026-10-07T18:00:00.123Z',
      message: 'server started on :8080',
    });
    expect(entries[1]).toMatchObject({
      time: '2026-10-07 18:00:01,456',
      message: 'slow query (812 ms)',
    });
    expect(entries[2].time).toBe('Oct  7 18:00:02');
    expect(entries[3]).toMatchObject({ time: '18:00:03', message: 'payment declined' });
    expect(entries[5]).toMatchObject({
      format: 'logfmt',
      message: 'cache miss',
      fields: [['key', 'user:42']],
    });
  });

  it('finds a level after a thread or logger name, without eating the message', () => {
    const [entry] = parseLog('2026-10-07 18:00:00 [main] ERROR com.app.Billing - charge failed');
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('[main] ERROR com.app.Billing - charge failed');
  });

  it('does not take lower-case prose for a level', () => {
    const [entry] = parseLog('2026-10-07 18:00:00 the error rate is fine');
    expect(entry.level).toBeNull();
  });

  it('groups stack traces and continuation lines under their entry', () => {
    const entries = parseLog(
      [
        '2026-10-07 18:00:00 ERROR request failed',
        'java.lang.IllegalStateException: boom',
        '    at com.app.Service.run(Service.java:42)',
        '',
        '    at com.app.Main.main(Main.java:7)',
        'Caused by: java.io.IOException',
        '2026-10-07 18:00:01 INFO recovered',
      ].join('\n'),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].more).toEqual([
      'java.lang.IllegalStateException: boom',
      '    at com.app.Service.run(Service.java:42)',
      '',
      '    at com.app.Main.main(Main.java:7)',
      'Caused by: java.io.IOException',
    ]);
    expect(entries[1].line).toBe(7);
  });

  it('reads Python tracebacks', () => {
    const entries = parseLog(
      'ERROR boom\nTraceback (most recent call last):\n  File "app.py", line 3, in <module>\nZeroDivisionError: division by zero',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].more).toHaveLength(3);
  });
});

describe('parseLog: JSON lines', () => {
  it('reads pino, bunyan and Logstash style objects', () => {
    const entries = parseLog(
      [
        '{"level":50,"time":1759860000000,"pid":7,"hostname":"api","msg":"db down","err":{"code":"ECONNREFUSED"}}',
        '{"@timestamp":"2026-10-07T18:00:00Z","log.level":"warn","message":"retrying","attempt":2}',
        '{"name":"app","v":0,"level":30,"msg":"ok","time":"2026-10-07T18:00:00Z"}',
      ].join('\n'),
    );
    expect(entries.map((e) => e.level)).toEqual(['error', 'warn', 'info']);
    expect(entries[0].time).toBe('2025-10-07T18:00:00.000Z');
    expect(entries[0].fields).toEqual([
      ['pid', '7'],
      ['hostname', 'api'],
      ['err', '{"code":"ECONNREFUSED"}'],
    ]);
    expect(entries[2].fields).toEqual([['name', 'app']]);
  });

  it('treats invalid JSON as text', () => {
    const [entry] = parseLog('{"level": "error", oops}');
    expect(entry.format).toBe('text');
  });
});

describe('LogParser: streaming', () => {
  it('waits for the end of a line and reports the first changed entry', () => {
    const parser = new LogParser();
    parser.push('INFO one\nERROR tw');
    expect(parser.entries).toHaveLength(1);
    const changed = parser.push('o\n    at x\n');
    expect(changed).toBe(0);
    expect(parser.entries.map((e) => e.message)).toEqual(['one', 'two']);
    expect(parser.entries[1].more).toEqual(['    at x']);
  });

  it('cuts very long lines and counts levels', () => {
    const entries = parseLog(`INFO ${'x'.repeat(30_000)}\nWARN a\nWARN b\nplain`);
    expect(entries[0].message.length).toBeLessThan(20_001);
    expect(countLevels(entries)).toMatchObject({ info: 1, warn: 2, none: 1, error: 0 });
  });
});

describe('parseLog: colored levels', () => {
  it('finds a level wrapped in escape sequences and removes it from the message', () => {
    const [entry] = parseLog(
      '2026-10-07T18:00:06Z \u001b[32mINFO\u001b[0m  \u001b[1mhealth\u001b[0m ok',
    );
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('\u001b[1mhealth\u001b[0m ok');
  });
});
