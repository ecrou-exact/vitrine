import { describe, expect, it } from 'vitest';
import { parseToml, tomlPath, toJson } from '../../src/components/toml/parser.js';

const parse = (/** @type {string} */ text) => parseToml(text, { maxDepth: 100 });
const json = (/** @type {string} */ text) => {
  const result = parse(text);
  if (!result.ok)
    throw new Error(`${result.error.message} at ${result.error.line}:${result.error.column}`);
  return JSON.parse(toJson(result.value));
};
const error = (/** @type {string} */ text) => {
  const result = parse(text);
  if (result.ok) throw new Error('expected an error');
  return result.error;
};

describe('parseToml: keys and tables', () => {
  it('reads bare, quoted and dotted keys', () => {
    expect(json('a = 1\n"b c" = 2\n\'d.e\' = 3\nf . g = 4\n1234 = 5\nbare-key_2 = 6')).toEqual({
      a: 1,
      'b c': 2,
      'd.e': 3,
      f: { g: 4 },
      1234: 5,
      'bare-key_2': 6,
    });
  });

  it('reads tables, sub-tables and implicit parents', () => {
    expect(json('[a.b.c]\nx = 1\n[a]\ny = 2\n[a.b.d]\nz = 3')).toEqual({
      a: { b: { c: { x: 1 }, d: { z: 3 } }, y: 2 },
    });
  });

  it('reads arrays of tables with sub-tables', () => {
    const value = json(
      '[[fruits]]\nname = "apple"\n[fruits.physical]\ncolor = "red"\n[[fruits.varieties]]\nname = "fuji"\n[[fruits]]\nname = "banana"',
    );
    expect(value).toEqual({
      fruits: [
        { name: 'apple', physical: { color: 'red' }, varieties: [{ name: 'fuji' }] },
        { name: 'banana' },
      ],
    });
  });

  it('reads inline tables', () => {
    expect(json('point = { x = 1, y.z = 2 }\nempty = {}')).toEqual({
      point: { x: 1, y: { z: 2 } },
      empty: {},
    });
  });

  it('rejects duplicate keys and redefined tables', () => {
    expect(error('a = 1\na = 2')).toMatchObject({
      message: 'Duplicate key "a"',
      line: 2,
      column: 1,
    });
    expect(error('[a]\n[a]').message).toMatch(/already defined/);
    expect(error('[a]\nb.c = 1\n[a.b]').message).toMatch(/already defined|redefine/);
    expect(error('a = { b = 1 }\n[a]').message).toMatch(/redefine/);
    expect(error('a = { b = 1 }\na.c = 2').message).toMatch(/Cannot add/);
    expect(error('a = [1]\n[[a]]').message).toMatch(/array of tables/);
    expect(error('[[a]]\n[a]').message).toMatch(/array of tables/);
    expect(error('a = {b = 1,}').message).toMatch(/comma/);
  });

  it('allows sub-tables of dotted tables', () => {
    expect(json('[fruit]\napple.color = "red"\n[fruit.apple.texture]\nsmooth = true')).toEqual({
      fruit: { apple: { color: 'red', texture: { smooth: true } } },
    });
  });
});

describe('parseToml: values', () => {
  it('reads every string kind', () => {
    const value = json(
      [
        'a = "tab\\there \\u00e9 \\U0001F600 \\"q\\""',
        "b = 'C:\\path\\no-escape'",
        'c = """\nline 1\nline 2"""',
        'd = """one \\\n    two"""',
        "e = '''\nraw \\n'''",
        'f = """quotes: ""\'"""',
        'g = """a"""""',
      ].join('\n'),
    );
    expect(value).toEqual({
      a: 'tab\there é 😀 "q"',
      b: 'C:\\path\\no-escape',
      c: 'line 1\nline 2',
      d: 'one two',
      e: 'raw \\n',
      f: 'quotes: ""\'',
      g: 'a""',
    });
  });

  it('reads integers in every base, exactly', () => {
    expect(
      toJson(
        /** @type {any} */ (
          parse(
            'a = +99\nb = -17\nc = 1_000\nd = 0xDEAD_beef\ne = 0o755\nf = 0b1101\ng = 9007199254740993',
          )
        ).value,
        0,
      ),
    ).toBe('{"a":99,"b":-17,"c":1000,"d":3735928559,"e":493,"f":13,"g":9007199254740993}');
  });

  it('keeps the written text and the type in the tree', () => {
    const result = /** @type {any} */ (parse('n = 0xff\nf = 6.626e-34\nd = 1979-05-27'));
    const [n, f, d] = result.value.entries.map((/** @type {any} */ e) => e.value);
    expect([n.raw, n.kind, f.kind, d.kind]).toEqual(['0xff', 'integer', 'float', 'date-local']);
  });

  it('reads floats, inf and nan', () => {
    expect(
      json(
        'a = 1.5\nb = -0.01\nc = 5e+22\nd = 1e06\ne = 224_617.445_991\nf = inf\ng = -inf\nh = nan',
      ),
    ).toEqual({
      a: 1.5,
      b: -0.01,
      c: 5e22,
      d: 1e6,
      e: 224617.445991,
      f: 'inf',
      g: '-inf',
      h: 'nan',
    });
  });

  it('reads dates and times', () => {
    const result = /** @type {any} */ (
      parse(
        'a = 1979-05-27T07:32:00Z\nb = 1979-05-27T00:32:00.999999-07:00\nc = 1979-05-27 07:32:00\nd = 1979-05-27\ne = 07:32:00.5',
      )
    );
    expect(result.value.entries.map((/** @type {any} */ e) => [e.value.raw, e.value.kind])).toEqual(
      [
        ['1979-05-27T07:32:00Z', 'datetime'],
        ['1979-05-27T00:32:00.999999-07:00', 'datetime'],
        ['1979-05-27 07:32:00', 'datetime-local'],
        ['1979-05-27', 'date-local'],
        ['07:32:00.5', 'time-local'],
      ],
    );
  });

  it('reads booleans and nested, multi-line arrays with comments', () => {
    expect(json('a = [ true, false ]\nb = [\n  [1, 2], # one\n  ["x"],\n]\nc = []')).toEqual({
      a: [true, false],
      b: [[1, 2], ['x']],
      c: [],
    });
  });

  it('rejects invalid values with positions', () => {
    expect(error('a = 01')).toMatchObject({ line: 1, column: 5 });
    expect(error('a = 1__0').message).toMatch(/Invalid value/);
    expect(error('a = 2026-02-30').message).toMatch(/Invalid date/);
    expect(error('a = 25:00:00').message).toMatch(/Invalid time/);
    expect(error('a = "open').message).toMatch(/Unterminated/);
    expect(error('a = "\\x"').message).toMatch(/escape/);
    expect(error('a = 1 b = 2').message).toMatch(/new line/);
    expect(error('a =').message).toMatch(/Expected a value/);
    expect(error('= 1').message).toMatch(/Expected a key|Unexpected/);
    expect(error('a = [1 2]').message).toMatch(/","/);
  });

  it('limits nesting depth', () => {
    const result = parseToml('a = [[[[[1]]]]]', { maxDepth: 3 });
    expect(result.ok ? null : result.error.tooDeep).toBe(true);
  });

  it('accepts comments, blank lines and CRLF', () => {
    expect(json('# title\r\n\r\n[a] # table\r\nb = 1 # value\r\n')).toEqual({ a: { b: 1 } });
  });
});

describe('tomlPath', () => {
  it('writes the path of a node', () => {
    const result = /** @type {any} */ (parse('[[products]]\nname = "x"\n[site]\n"key two" = 1'));
    const name = result.value.entries[0].value.items[0].entries[0].value;
    const two = result.value.entries[1].value.entries[0].value;
    expect(tomlPath(name)).toBe('products[0].name');
    expect(tomlPath(two)).toBe('site."key two"');
    expect(tomlPath(result.value)).toBe('');
  });
});
