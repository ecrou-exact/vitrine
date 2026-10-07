import { describe, expect, it } from 'vitest';
import { fileType } from '../../src/components/tree/file-types.js';
import {
  MAX_NODES,
  TreeError,
  parseLine,
  parseTree,
  sortTree,
  toJson,
  toTreeText,
} from '../../src/components/tree/parser.js';

/** Names as nested arrays: ["src", ["app.js"]]. */
const shape = (nodes) =>
  nodes.flatMap((node) => (node.children.length ? [node.name, shape(node.children)] : [node.name]));

describe('parseLine', () => {
  it('reads folders, notes and status markers', () => {
    expect(parseLine('src/')).toEqual({ name: 'src', folder: true, note: '', status: null });
    expect(parseLine('+ new.js  # added in v2')).toEqual({
      name: 'new.js',
      folder: false,
      note: 'added in v2',
      status: 'added',
    });
    expect(parseLine('~ app.js')).toMatchObject({ status: 'modified' });
    expect(parseLine('* main.go')).toMatchObject({ status: 'highlighted' });
    expect(parseLine('-old.js')).toMatchObject({ name: '-old.js', status: null });
    expect(parseLine('C#/Program.cs')).toMatchObject({ name: 'C#/Program.cs', note: '' });
  });
});

describe('parseTree', () => {
  it('reads indented text with any indentation unit', () => {
    const result = parseTree('src/\n    app.js\n    lib/\n        util.js\nREADME.md\n');
    expect(result.format).toBe('indent');
    expect(shape(result.roots)).toEqual(['src', ['app.js', 'lib', ['util.js']], 'README.md']);
    expect(result.roots[0].children[1].type).toBe('folder');
    expect([result.folders, result.files]).toEqual([2, 3]);
  });

  it('reads tree command output, Unicode and ASCII', () => {
    const unicode = parseTree(
      '.\n├── src\n│   ├── app.js\n│   └── lib\n│       └── util.js\n└── package.json\n\n2 directories, 3 files',
    );
    expect(unicode.format).toBe('tree');
    expect(shape(unicode.roots)).toEqual([
      '.',
      ['src', ['app.js', 'lib', ['util.js']], 'package.json'],
    ]);
    const ascii = parseTree('app\n|-- a.js\n`-- b\n    `-- c.js');
    expect(shape(ascii.roots)).toEqual(['app', ['a.js', 'b', ['c.js']]]);
  });

  it('reads paths and merges folders', () => {
    const result = parseTree('src/app.js\nsrc/lib/util.js\ndocs/\nREADME.md');
    expect(result.format).toBe('paths');
    expect(shape(result.roots)).toEqual([
      'src',
      ['app.js', 'lib', ['util.js']],
      'docs',
      'README.md',
    ]);
    expect(result.roots[1].type).toBe('folder');
  });

  it('reads JSON: paths, entry objects and nested objects', () => {
    expect(shape(parseTree('["a/b.js", "c.md"]').roots)).toEqual(['a', ['b.js'], 'c.md']);
    const entries = parseTree(
      JSON.stringify([
        { name: 'src', children: [{ name: 'app.js', status: 'added', note: 'entry' }] },
        { name: 'empty', type: 'folder' },
        { name: 'bad', status: 'nope' },
        { nope: true },
      ]),
    );
    expect(shape(entries.roots)).toEqual(['src', ['app.js'], 'empty', 'bad']);
    expect(entries.roots[0].children[0]).toMatchObject({ status: 'added', note: 'entry' });
    expect(entries.roots[1].type).toBe('folder');
    expect(entries.roots[2].status).toBeNull();
    const nested = parseTree('{"src": {"app.js": "entry point", "lib": ["a.js"]}, "x.txt": null}');
    expect(shape(nested.roots)).toEqual(['src', ['app.js', 'lib', ['a.js']], 'x.txt']);
    expect(nested.roots[0].children[0].note).toBe('entry point');
  });

  it('reports invalid JSON', () => {
    expect(() => parseTree('{"a": ')).toThrow(TreeError);
  });

  it('limits the number of entries, depth and name length', () => {
    const many = parseTree(Array.from({ length: MAX_NODES + 50 }, (_, i) => `f${i}`).join('\n'));
    expect(many.truncated).toBe(true);
    expect(many.files).toBe(MAX_NODES);
    const deep = parseTree(`${Array.from({ length: 200 }, (_, i) => `d${i}`).join('/')}/x.js`);
    let depth = 0;
    for (let node = deep.roots[0]; node; node = node.children[0]) depth += 1;
    expect(depth).toBe(64);
    expect(parseTree('x'.repeat(1000)).roots[0].name).toHaveLength(255);
    let json = '{"a":'.repeat(5000) + '1' + '}'.repeat(5000);
    expect(() => parseTree(json)).not.toThrow();
    json = '[{"name":"a","children":'.repeat(100) + '[]' + '}]'.repeat(100);
    expect(() => parseTree(json)).not.toThrow();
  });

  it('removes control characters from names', () => {
    expect(parseTree('a\u0007b.js').roots[0].name).toBe('ab.js');
  });
});

describe('output', () => {
  it('sorts folders first, then by name with numbers in order', () => {
    const { roots } = parseTree('b.js\nfile10.js\nfile2.js\nlib/\nA.js');
    sortTree(roots);
    expect(shape(roots)).toEqual(['lib', 'A.js', 'b.js', 'file2.js', 'file10.js']);
  });

  it('draws the tree like the tree command', () => {
    const { roots } = parseTree('app/\n  src/\n    a.js  # entry\n  b.md');
    expect(toTreeText(roots)).toBe('app/\n├── src/\n│   └── a.js  # entry\n└── b.md');
  });

  it('exports plain JSON', () => {
    const { roots } = parseTree('src/\n  + a.js');
    expect(toJson(roots)).toEqual([
      { name: 'src', type: 'folder', children: [{ name: 'a.js', type: 'file', status: 'added' }] },
    ]);
  });
});

describe('fileType', () => {
  it('recognizes kinds by extension and well-known names', () => {
    expect(fileType('app.tsx').kind).toBe('code');
    expect(fileType('package.json').kind).toBe('data');
    expect(fileType('README.md').kind).toBe('doc');
    expect(fileType('README').kind).toBe('doc');
    expect(fileType('Dockerfile').kind).toBe('code');
    expect(fileType('.gitignore').kind).toBe('data');
    expect(fileType('logo.SVG').kind).toBe('image');
    expect(fileType('archive.zip')).toEqual({ kind: 'file', icon: 'file' });
  });
});
