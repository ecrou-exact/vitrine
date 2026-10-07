import { describe, expect, it } from 'vitest';
import { parseJson, pathOf, position, stringify } from '../../src/components/json/parser.js';

const parse = (text, maxDepth = 512) => parseJson(text, { maxDepth });
const compact = (text) => {
  const result = parse(text);
  if (!result.ok) throw new Error(result.error.message);
  return stringify(result.value, { indent: 0, sortKeys: false });
};

describe('parseJson — valid documents', () => {
  it('round-trips every JSON type', () => {
    const text =
      '{"s":"a\\"b\\\\c\\n\\u00e9\\ud83d\\ude00","n":[0,-0,1.5,-2e-3,1E+10],"t":true,"f":false,"z":null,"o":{},"a":[]}';
    expect(compact(text)).toBe(
      JSON.stringify(JSON.parse(text)).replace(
        '"n":[0,0,1.5,-0.002,10000000000]',
        '"n":[0,-0,1.5,-2e-3,1E+10]',
      ),
    );
  });

  it('keeps numbers exactly as written', () => {
    expect(compact('[12345678901234567890, 0.1000000000000000055511151231257827, 1e400]')).toBe(
      '[12345678901234567890,0.1000000000000000055511151231257827,1e400]',
    );
  });

  it('keeps duplicate keys in order and treats __proto__ as data', () => {
    const result = parse('{"__proto__": {"polluted": true}, "a": 1, "a": 2}');
    expect(result.ok).toBe(true);
    expect(result.value.entries.map((e) => e.key)).toEqual(['__proto__', 'a', 'a']);
    expect({}.polluted).toBeUndefined();
  });

  it('accepts a byte order mark and surrounding whitespace', () => {
    expect(compact('\uFEFF \n\t{"a":1}\r\n')).toBe('{"a":1}');
  });

  it('parses top-level primitives', () => {
    for (const text of ['"x"', '42', 'true', 'null']) expect(compact(text)).toBe(text);
  });

  it('counts nodes and links parents', () => {
    const result = parse('{"a":[1,{"b":2}]}');
    expect(result.count).toBe(5);
    const b = result.value.entries[0].value.items[1].entries[0].value;
    expect(b.parent.parent.parent).toBe(result.value);
  });
});

describe('parseJson — errors', () => {
  const cases = [
    ['', 'Unexpected end of input', 1, 1],
    ['{"a": 1,}', 'Trailing comma', 1, 8],
    ['[1, 2,]', 'Trailing comma', 1, 6],
    ['{"a" 1}', 'Expected ":" after the property name', 1, 6],
    ['{a: 1}', 'Expected a property name in double quotes', 1, 2],
    ["{'a': 1}", 'Expected a property name in double quotes', 1, 2],
    ['[01]', 'Expected "," or "]"', 1, 3],
    ['[1 2]', 'Expected "," or "]"', 1, 4],
    ['{"a":1', 'Unexpected end of input', 1, 7],
    ['"abc', 'Unterminated string', 1, 1],
    ['"a\tb"', 'Control character in string (escape it)', 1, 3],
    ['"\\x"', 'Invalid escape sequence', 1, 2],
    ['"\\u12g4"', 'Invalid \\u escape', 1, 2],
    ['[NaN]', 'Unexpected character "N"', 1, 2],
    ['[undefined]', 'Unexpected character "u"', 1, 2],
    ['[1] [2]', 'Unexpected content after the JSON value', 1, 5],
    ['{\n  "a": 1,\n  "b": [1, 2,],\n}', 'Trailing comma', 3, 13],
    ['[-]', 'Invalid number', 1, 2],
  ];
  for (const [text, message, line, column] of cases) {
    it(`${JSON.stringify(text)} → ${message}`, () => {
      const result = parse(text);
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({ message, line, column, tooDeep: false });
    });
  }
});

describe('parseJson — hostile input', () => {
  it('limits nesting depth without recursion', () => {
    const deep = '['.repeat(200_000) + ']'.repeat(200_000);
    const result = parse(deep, 100);
    expect(result.ok).toBe(false);
    expect(result.error.tooDeep).toBe(true);
  });

  it('accepts nesting exactly at the limit', () => {
    expect(parse('['.repeat(100) + ']'.repeat(100), 100).ok).toBe(true);
    expect(parse('['.repeat(101) + ']'.repeat(101), 100).ok).toBe(false);
  });

  it('handles very long strings and keys', () => {
    const long = 'x'.repeat(1_000_000);
    const result = parse(`{"${long}": "${long}"}`);
    expect(result.ok).toBe(true);
    expect(result.value.entries[0].value.value.length).toBe(1_000_000);
  });

  it('parses a large document quickly', () => {
    const big = JSON.stringify(
      Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `n${i}`, ok: true })),
    );
    const start = performance.now();
    expect(parse(big).ok).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('stringify', () => {
  const doc = parse('{"b":[1,{"y":null,"x":"s"}],"a":{}}').value;
  it('pretty prints with indentation', () => {
    expect(stringify(doc, { indent: 2, sortKeys: false })).toBe(
      '{\n  "b": [\n    1,\n    {\n      "y": null,\n      "x": "s"\n    }\n  ],\n  "a": {}\n}',
    );
  });
  it('sorts keys at every level', () => {
    expect(stringify(doc, { indent: 0, sortKeys: true })).toBe(
      '{"a":{},"b":[1,{"x":"s","y":null}]}',
    );
  });
  it('escapes strings and keys', () => {
    const result = parse('{"a\\"b\\n":"<script>\\u2028"}');
    expect(stringify(result.value, { indent: 0, sortKeys: false })).toBe(
      '{"a\\"b\\n":"<script>\u2028"}',
    );
  });
});

describe('pathOf / position', () => {
  it('builds JSONPath expressions', () => {
    const root = parse('{"users":[{"name":"a","weird key":1,"":2,"x.y":3}]}').value;
    const user = root.entries[0].value.items[0];
    expect(user.entries.map((e) => pathOf(e.value))).toEqual([
      '$.users[0].name',
      '$.users[0]["weird key"]',
      '$.users[0][""]',
      '$.users[0]["x.y"]',
    ]);
    expect(pathOf(root)).toBe('$');
  });
  it('converts offsets to line and column', () => {
    expect(position('ab\ncd\nef', 7)).toEqual({ line: 3, column: 2 });
    expect(position('abc', 99)).toEqual({ line: 1, column: 4 });
  });
});
