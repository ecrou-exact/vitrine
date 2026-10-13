import { describe, expect, it } from 'vitest';
import { documentsToTree, findAnchors, yamlError } from '../../src/components/yaml/document.js';
import { en, fr } from '../../src/components/yaml/strings.js';
import { parseYamlAll } from '../../src/vendor/yaml.js';

/**
 * @param {string} text
 */
function read(text) {
  return documentsToTree(parseYamlAll(text), 64);
}

describe('YAML documents', () => {
  it('turns one document into the JSON tree', () => {
    const { result, documents, json } = read('name: shop\nports: [80, 443]\ndebug: false\n');
    expect(documents).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.type !== 'object') throw new Error('object expected');
    expect(result.value.entries.map((entry) => entry.key)).toEqual(['name', 'ports', 'debug']);
    expect(result.value.entries[1].value.type).toBe('array');
    expect(JSON.parse(json)).toEqual({ name: 'shop', ports: [80, 443], debug: false });
  });

  it('lists the documents of a stream', () => {
    const { result, documents } = read('a: 1\n---\nb: 2\n---\n- x\n');
    expect(documents).toBe(3);
    expect(result.ok && result.value.type).toBe('array');
  });

  it('resolves aliases and merge keys', () => {
    const { json } = read('base: &base\n  retries: 3\njob:\n  <<: *base\n  name: build\n');
    expect(JSON.parse(json).job).toEqual({ retries: 3, name: 'build' });
  });

  it('keeps the core schema: dates stay strings, .inf and .nan become strings', () => {
    const { json } = read('when: 2026-10-13\nbig: .inf\nnothing: .nan\nempty: ~\n');
    expect(JSON.parse(json)).toEqual({
      when: '2026-10-13',
      big: 'Infinity',
      nothing: 'NaN',
      empty: null,
    });
  });

  it('never builds functions or class instances', () => {
    expect(() => parseYamlAll('x: !!js/function "function () {}"')).toThrow();
  });

  it('reports syntax errors with line and column', () => {
    let error;
    try {
      parseYamlAll('a: 1\nb: [1, 2\nc: 3\n');
    } catch (e) {
      error = yamlError(e);
    }
    expect(error?.line).toBeGreaterThan(1);
    expect(error?.column).toBeGreaterThan(0);
    expect(error?.message).toBeTruthy();
  });

  it('applies the depth limit of the JSON parser', () => {
    const deep = `${'- '.repeat(1)}${'['.repeat(80)}${']'.repeat(80)}`;
    const tree = documentsToTree(parseYamlAll(deep), 16);
    expect(tree.result.ok).toBe(false);
  });
});

describe('anchors', () => {
  it('finds anchors and counts their aliases', () => {
    const anchors = findAnchors('base: &base\n  a: 1\nx:\n  <<: *base\ny: *base\nz: &other 2\n');
    expect(anchors).toEqual([
      { name: 'base', line: 1, uses: 2 },
      { name: 'other', line: 6, uses: 0 },
    ]);
  });

  it('ignores comments and quoted text', () => {
    expect(findAnchors('a: "&not" # &comment\nb: \'*no\'\n')).toEqual([]);
  });
});

describe('strings', () => {
  it('translates every string into French', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
});
