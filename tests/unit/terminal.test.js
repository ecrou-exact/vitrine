import { describe, expect, it } from 'vitest';
import {
  PLAIN,
  color256,
  decodeLiteralEscapes,
  lineText,
  parseAnsi,
  stripAnsi,
} from '../../src/components/terminal/ansi.js';
import {
  commandsText,
  parsePrompts,
  parseTranscript,
  promptMatcher,
} from '../../src/components/terminal/transcript.js';

const ESC = '\u001b';

describe('parseAnsi', () => {
  it('keeps plain text and splits lines (CRLF too)', () => {
    const lines = parseAnsi('one\r\ntwo\nthree\n');
    expect(lines.map(lineText)).toEqual(['one', 'two', 'three']);
    expect(lines[0][0].style).toBe(PLAIN);
  });

  it('applies 16-color, bold and reset', () => {
    const [line] = parseAnsi(`${ESC}[1;31mfail${ESC}[0m ok`);
    expect(line[0]).toMatchObject({ text: 'fail', style: { bold: true, fg: { index: 1 } } });
    expect(line[1]).toMatchObject({ text: ' ok', style: { bold: false, fg: null } });
  });

  it('reads bright, 256 and 24-bit colors, with ; and : separators', () => {
    const [line] = parseAnsi(
      `${ESC}[92ma${ESC}[38;5;196mb${ESC}[48;2;10;20;30mc${ESC}[38:2::1:2:3md`,
    );
    expect(line[0].style.fg).toEqual({ index: 10 });
    expect(line[1].style.fg).toEqual(color256(196));
    expect(line[2].style.bg).toEqual({ rgb: [10, 20, 30] });
    expect(line[3].style.fg).toEqual({ rgb: [1, 2, 3] });
  });

  it('ignores invalid color values', () => {
    const [line] = parseAnsi(`${ESC}[38;2;300;0;0mx${ESC}[38;5;999my`);
    expect(line[0].style.fg).toBeNull();
  });

  it('maps the 256-color cube and gray ramp', () => {
    expect(color256(3)).toEqual({ index: 3 });
    expect(color256(16)).toEqual({ rgb: [0, 0, 0] });
    expect(color256(231)).toEqual({ rgb: [255, 255, 255] });
    expect(color256(232)).toEqual({ rgb: [8, 8, 8] });
  });

  it('carriage returns overwrite the line, like progress bars', () => {
    expect(stripAnsi('progress 10%\rprogress 55%\rprogress 100%\ndone')).toBe(
      'progress 100%\ndone',
    );
    expect(stripAnsi('abcdef\rXY')).toBe('XYcdef');
    expect(stripAnsi(`abcdef\rXY${ESC}[K`)).toBe('XY');
    expect(stripAnsi(`abc\b\bZ`)).toBe('aZc');
  });

  it('expands tabs to 8-column stops', () => {
    expect(stripAnsi('a\tb')).toBe(`a${' '.repeat(7)}b`);
  });

  it('removes cursor, mode, title and unknown sequences and control characters', () => {
    const text = `${ESC}[?25l${ESC}]0;title\u0007${ESC}[2J${ESC}[1Ahi\u0007${ESC}(B there\u0000${ESC}`;
    expect(stripAnsi(text)).toBe('hi there');
  });

  it('keeps OSC 8 links only for http(s) URLs', () => {
    const [line] = parseAnsi(
      `${ESC}]8;;https://example.com${ESC}\\site${ESC}]8;;${ESC}\\ ${ESC}]8;;javascript:alert(1)\u0007bad${ESC}]8;;\u0007`,
    );
    expect(line[0]).toMatchObject({ text: 'site', style: { link: 'https://example.com' } });
    expect(line.find((s) => s.text.includes('bad'))?.style.link).toBeNull();
    const [relative] = parseAnsi(`${ESC}]8;;/admin${ESC}\\x${ESC}]8;;${ESC}\\`);
    expect(relative[0].style.link).toBeNull();
  });

  it('bounds runaway sequences and very long lines', () => {
    const garbage = `${ESC}[${'1;'.repeat(10_000)}mtext`;
    expect(() => parseAnsi(garbage)).not.toThrow();
    expect(lineText(parseAnsi('x'.repeat(30_000))[0]).length).toBe(20_000);
  });

  it('decodes literal escapes only when asked', () => {
    expect(decodeLiteralEscapes('\\e[31mred \\x1b[0m \\033[1m')).toBe(
      `${ESC}[31mred ${ESC}[0m ${ESC}[1m`,
    );
    expect(stripAnsi(decodeLiteralEscapes('10%\\r100%'))).toBe('100%');
  });
});

describe('transcript', () => {
  it('reads the prompt attribute', () => {
    expect(parsePrompts(null)).toEqual(['$', '❯']);
    expect(parsePrompts('none')).toEqual([]);
    expect(parsePrompts(' >  PS> ')).toEqual(['>', 'PS>']);
  });

  it('matches prompts with a context, longest prompt first', () => {
    const match = promptMatcher(['$', '>', 'PS>']);
    expect(match('$ ls -la')).toEqual({ prompt: '$', rest: 'ls -la' });
    expect(match('ada@box:~/app$ npm i')).toEqual({ prompt: 'ada@box:~/app$', rest: 'npm i' });
    expect(match('PS> dir')).toEqual({ prompt: 'PS>', rest: 'dir' });
    expect(match('$')).toEqual({ prompt: '$', rest: '' });
    expect(match('costs $5')).toBeNull();
    expect(match('a > b')).toBeNull();
    expect(match('total$x')).toBeNull();
  });

  it('splits commands, continuations and output', () => {
    const entries = parseTranscript(
      parseAnsi('$ docker run \\\n  -p 80:80 nginx\nStarting…\nready\n$ echo done\ndone'),
      ['$'],
    );
    expect(entries.map((e) => e.type)).toEqual(['command', 'output', 'command', 'output']);
    expect(entries[0]).toMatchObject({ lines: ['docker run \\', '  -p 80:80 nginx'], line: 1 });
    expect(entries[1].line).toBe(3);
    expect(commandsText(entries)).toBe('docker run \\\n  -p 80:80 nginx\necho done');
  });

  it('without prompts everything is output', () => {
    const entries = parseTranscript(parseAnsi('$ not a command'), []);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('output');
  });
});
