import { describe, expect, it } from 'vitest';
import { detectFormat, parseEnv, splitReferences } from '../../src/components/env/parser.js';
import { VtEnv } from '../../src/components/env/vt-env.js';

describe('detectFormat', () => {
  it('recognizes dotenv, INI and properties', () => {
    expect(detectFormat('A=1\nB=2')).toBe('dotenv');
    expect(detectFormat('export A=1')).toBe('dotenv');
    expect(detectFormat('[server]\nport = 80')).toBe('ini');
    expect(detectFormat('app.name=demo\nserver.port=8080')).toBe('properties');
    expect(detectFormat('app.name: demo')).toBe('properties');
  });
});

describe('parseEnv: dotenv', () => {
  it('reads quotes, export, comments and escapes', () => {
    const { entries, format } = parseEnv(
      [
        '# Database',
        'export DB_HOST=localhost # local only',
        "DB_PASSWORD='p#ss'",
        'GREETING="hello\\nworld"',
        'EMPTY=',
      ].join('\n'),
    );
    expect(format).toBe('dotenv');
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      key: 'DB_HOST',
      value: 'localhost',
      exported: true,
      comment: 'Database\nlocal only',
      line: 2,
    });
    expect(entries[1]).toMatchObject({ key: 'DB_PASSWORD', value: 'p#ss', quote: "'" });
    expect(entries[2].value).toBe('hello\nworld');
    expect(entries[3].value).toBe('');
  });

  it('keeps multi-line quoted values together', () => {
    const { entries } = parseEnv('KEY="-----BEGIN\nabc\n-----END"\nNEXT=1');
    expect(entries[0]).toMatchObject({ value: '-----BEGIN\nabc\n-----END', lines: 3 });
    expect(entries[1]).toMatchObject({ key: 'NEXT', line: 4 });
  });

  it('reports lines it cannot read', () => {
    const { invalid } = parseEnv('A=1\nnot an assignment\nB="unclosed');
    expect(invalid.map((item) => item.line)).toEqual([2, 3]);
  });
});

describe('parseEnv: INI and properties', () => {
  it('reads sections', () => {
    const result = parseEnv('; top\nname = demo\n[db]\nhost: example.org\n[cache]\nttl=60');
    expect(result.sections).toEqual(['db', 'cache']);
    expect(result.entries.map((e) => [e.section, e.key, e.value])).toEqual([
      ['', 'name', 'demo'],
      ['db', 'host', 'example.org'],
      ['cache', 'ttl', '60'],
    ]);
  });

  it('reads continued lines and unicode escapes', () => {
    const { entries } = parseEnv(
      'greeting = Hello \\\n    world\nname\\ x : caf\\u00e9',
      'properties',
    );
    expect(entries[0]).toMatchObject({ key: 'greeting', value: 'Hello world', lines: 2 });
    expect(entries[1]).toMatchObject({ key: 'name x', value: 'café' });
  });
});

describe('splitReferences', () => {
  it('finds ${VAR} and $VAR, not escaped ones', () => {
    expect(splitReferences('postgres://${DB_HOST:-db}:$PORT/x \\$NOT')).toEqual([
      { text: 'postgres://', ref: null },
      { text: '${DB_HOST:-db}', ref: 'DB_HOST' },
      { text: ':', ref: null },
      { text: '$PORT', ref: 'PORT' },
      { text: '/x \\$NOT', ref: null },
    ]);
  });
});

describe('<vt-env>', () => {
  it('masks secrets in the table and the copied text until revealed', () => {
    if (!customElements.get('vt-env')) customElements.define('vt-env', VtEnv);
    const el = /** @type {VtEnv} */ (document.createElement('vt-env'));
    el.content = 'API_KEY=abcdefghijklmnopqrstuvwxyz\nNAME=demo';
    document.body.append(el);
    el.render();
    expect(el.displayText()).toMatch(/^API_KEY=\S+wxyz\nNAME=demo$/);
    expect(el.displayText()).not.toContain('abcdef');
    expect(el.root.querySelector('.secret')).not.toBeNull();
    el.revealed = true;
    expect(el.displayText()).toContain('abcdef');
    el.remove();
  });
});
