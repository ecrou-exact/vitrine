// @ts-check
/**
 * JSON as input for every element: the shared layer (`data`, `json`, `json-path`, a JSON
 * script) and what each element whose content is not JSON makes of a value.
 */
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/components/csv/parser.js';
import { parseEnv } from '../../src/components/env/parser.js';
import { decodeText } from '../../src/components/hex/bytes.js';
import { parseLog } from '../../src/components/log/parser.js';
import { parseToml, toJson } from '../../src/components/toml/parser.js';
import { parseXml, rootElement } from '../../src/components/xml/parser.js';
import {
  certFromData,
  codeFromData,
  cronFromData,
  csvFromData,
  envFromData,
  hexFromData,
  jwtFromData,
  logFromData,
  markdownFromData,
  regexFromData,
  terminalFromData,
  tomlFromData,
  xmlFromData,
} from '../../src/core/data-formats.js';
import { pickPath } from '../../src/core/data-input.js';
import { registry } from '../../src/vitrine.js';

for (const [tag, ctor] of registry) if (!customElements.get(tag)) customElements.define(tag, ctor);

/**
 * Mounts an element and waits for it to read its content.
 *
 * @param {string} tag
 * @param {Record<string, string>} attributes
 * @param {(el: any) => void} [setup]
 * @returns {Promise<any>}
 */
async function mount(tag, attributes, setup) {
  const el = /** @type {any} */ (document.createElement(tag));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  setup?.(el);
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return el;
}

describe('pickPath', () => {
  const value = { data: { items: [{ code: 'a' }, { code: 'b' }] } };

  it('follows keys and indexes', () => {
    expect(pickPath(value, 'data.items[1].code')).toEqual({ ok: true, value: 'b' });
    expect(pickPath(value, 'data.items.0')).toEqual({ ok: true, value: { code: 'a' } });
    expect(pickPath(value, '')).toEqual({ ok: true, value });
  });

  it('never follows inherited members', () => {
    for (const path of [
      '__proto__',
      'constructor',
      'data.toString',
      'data.items.length',
      'data.items[9]',
    ])
      expect(pickPath(value, path).ok, path).toBe(false);
  });
});

describe('the shared layer', () => {
  it('reads the json attribute, with attributes from the data', async () => {
    const el = await mount('vt-code', {
      json: '{"code":"print(1)","language":"python","label":"a.py"}',
    });
    expect(el.text).toBe('print(1)');
    expect(el.getAttribute('language')).toBe('python');
    expect(el.getAttribute('label')).toBe('a.py');
  });

  it('keeps the attributes the page set itself', async () => {
    const el = await mount('vt-code', { language: 'js', json: '{"code":"x","language":"python"}' });
    expect(el.getAttribute('language')).toBe('js');
  });

  it('never sets an attribute outside the allow-list', async () => {
    const el = await mount('vt-markdown', {
      json: '{"markdown":"# Hi","allowHtml":true,"images":"allow","src":"/x","allow-html":""}',
    });
    expect(el.text).toBe('# Hi');
    for (const name of ['allow-html', 'images', 'src'])
      expect(el.hasAttribute(name), name).toBe(false);
  });

  it('removes the attributes the previous data set', async () => {
    const el = await mount('vt-code', { json: '{"code":"x","language":"python"}' });
    el.setAttribute('json', '{"code":"y"}');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.text).toBe('y');
    expect(el.hasAttribute('language')).toBe(false);
  });

  it('picks a value with json-path', async () => {
    const el = await mount('vt-code', {
      json: '{"result":{"snippet":{"code":"z"}}}',
      'json-path': 'result.snippet',
    });
    expect(el.text).toBe('z');
  });

  it('reports bad JSON and missing paths', async () => {
    const bad = await mount('vt-code', { json: '{nope' });
    expect(bad.error?.code).toBe('jsonInvalid');
    const missing = await mount('vt-code', { json: '{"a":1}', 'json-path': 'b' });
    expect(missing.error?.code).toBe('jsonPathMissing');
  });

  it('reads a JSON script, which never shows as content', async () => {
    const el = await mount('vt-code', {}, (node) => {
      const script = document.createElement('script');
      script.type = 'application/json';
      script.dataset.json = '';
      script.textContent = '{"code":"from script","language":"python"}';
      node.append(script);
    });
    expect(el.text).toBe('from script');
  });

  it('takes a value through the data property, before or after definition', async () => {
    const el = await mount('vt-terminal', {}, (node) => {
      node.data = [{ command: 'ls', output: 'a.txt' }];
    });
    expect(el.text).toBe('$ ls\na.txt');
    el.data = { commands: [{ command: 'pwd', prompt: '#' }] };
    expect(el.text).toBe('# pwd');
  });

  it('gives the content property the last word', async () => {
    const el = await mount('vt-code', { json: '{"code":"from json"}' });
    el.content = 'from content';
    expect(el.text).toBe('from content');
  });

  it('shows JSON as JSON in elements that read JSON', async () => {
    const table = await mount('vt-table', { json: '{"rows":[{"a":1}]}', 'json-path': 'rows' });
    expect(JSON.parse(table.text)).toEqual([{ a: 1 }]);
    const toml = await mount('vt-toml', {}, (node) => {
      node.data = { title: 'x' };
    });
    expect(toml.text).toBe('title = "x"');
  });

  it('feeds both sides of <vt-diff>', async () => {
    const el = await mount('vt-diff', {}, (node) => {
      node.data = { original: 'a\nb', modified: 'a\nc', language: 'js' };
    });
    expect(el.original).toBe('a\nb');
    expect(el.modified).toBe('a\nc');
    expect(el.getAttribute('language')).toBe('js');
  });
});

describe('formats written from JSON', () => {
  it('code and Markdown', () => {
    expect(codeFromData({ source: 'x', lang: 'go', highlight: '2' })).toEqual({
      content: 'x',
      attributes: { language: 'go', 'highlight-lines': '2' },
    });
    expect(codeFromData({ a: 1 })).toEqual({
      content: '{\n  "a": 1\n}',
      attributes: { language: 'json' },
    });
    expect(markdownFromData('# T').content).toBe('# T');
  });

  it('CSV that reads back the same, with columns from every row', () => {
    const { content } = csvFromData([
      { name: 'Ada, Countess', note: 'say "hi"' },
      { name: 'Alan', score: 9, tags: ['a', 'b'] },
    ]);
    const parsed = parseCsv(content);
    expect(parsed.rows[0]).toEqual(['name', 'note', 'score', 'tags']);
    expect(parsed.rows[1].slice(0, 2)).toEqual(['Ada, Countess', 'say "hi"']);
    expect(parsed.rows[2]).toEqual(['Alan', '', '9', '["a","b"]']);
    expect(csvFromData({ columns: ['b'], rows: [{ a: 1, b: 2 }] }).content).toBe('b\n2');
  });

  it('dotenv with quoting, and without keys a file cannot hold', () => {
    const { content } = envFromData({
      PORT: 8080,
      GREETING: 'hello world # not a comment',
      'bad key': 1,
      EMPTY: '',
    });
    const entries = parseEnv(content).entries.map((e) => [e.key, e.value]);
    expect(entries).toEqual([
      ['PORT', '8080'],
      ['GREETING', 'hello world # not a comment'],
      ['EMPTY', ''],
    ]);
  });

  it('TOML that reads back the same', () => {
    const value = {
      title: 'Shop',
      'odd key': true,
      port: 8080,
      ratio: 0.5,
      tags: ['a', 'b'],
      owner: { name: 'Ada', address: { city: 'London' } },
      products: [{ name: 'Lamp' }, { name: 'Desk', sizes: [1, 2] }],
      nothing: null,
    };
    const parsed = parseToml(tomlFromData(value).content, { maxDepth: 100 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { nothing, ...rest } = value;
    void nothing;
    expect(JSON.parse(toJson(parsed.value))).toEqual(rest);
  });

  it('XML that reads back, with escaping and invalid names kept as attributes', () => {
    const { content } = xmlFromData({
      catalog: {
        '@': { version: '2', 'bad name': 'x' },
        item: [{ '#text': 'A & <B>' }, { '@': { sku: 'q"1' }, '#text': 'C' }],
        '9lives': 'cat',
      },
    });
    const doc = parseXml(content);
    expect(doc.ok).toBe(true);
    expect(content).toContain('<catalog version="2">');
    expect(content).toContain('<item>A &amp; &lt;B&gt;</item>');
    expect(content).toContain('<item sku="q&quot;1">C</item>');
    expect(content).toContain('<item name="9lives">cat</item>');
    if (doc.ok) expect(rootElement(doc.value)?.name).toBe('catalog');
  });

  it('a terminal session and log lines', () => {
    expect(
      terminalFromData([{ command: 'npm test', output: ['ok', 'done'] }, 'plain']).content,
    ).toBe('$ npm test\nok\ndone\nplain');
    const { content } = logFromData({ entries: [{ level: 'error', msg: 'boom' }, 'INFO started'] });
    expect(parseLog(content).map((e) => e.level)).toEqual(['error', 'info']);
  });

  it('bytes, patterns, tokens, schedules and certificates', () => {
    expect(Array.from(decodeText(hexFromData([0, 255, 16]).content, 'hex'))).toEqual([0, 255, 16]);
    expect(hexFromData([1, 300]).content).toBe('');
    expect(hexFromData({ base64: 'AAE=' }).attributes).toEqual({
      format: 'base64',
      label: undefined,
    });
    expect(regexFromData({ pattern: '\\d+', flags: 'g', text: 'a1' })).toEqual({
      content: 'a1',
      attributes: { pattern: '\\d+', flags: 'g', replace: undefined },
    });
    expect(jwtFromData({ access_token: 'a.b.c' }).content).toBe('a.b.c');
    expect(
      cronFromData({
        jobs: [{ schedule: '0 2 * * *', command: 'backup', comment: 'Nightly' }],
        timezone: 'UTC',
      }),
    ).toEqual({
      content: '# Nightly\n0 2 * * * backup',
      attributes: { timezone: 'UTC' },
    });
    expect(
      cronFromData({ expression: '*/5 * * * *', timeZone: 'Europe/Paris' }).attributes,
    ).toEqual({ timezone: 'Europe/Paris' });
    expect(certFromData(['-----BEGIN A-----', { pem: '-----BEGIN B-----' }]).content).toBe(
      '-----BEGIN A-----\n-----BEGIN B-----',
    );
  });
});
