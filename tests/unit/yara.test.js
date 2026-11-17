import { describe, expect, it } from 'vitest';
import { parseYara, readHex, tokenize } from '../../src/components/yara/yara.js';
import { VtYara } from '../../src/components/yara/vt-yara.js';

const RULES = String.raw`import "pe"

rule Loader_Strings : banker loader {
  meta:
    author = "CIRCL"
    description = "Loader with a PE header"
    score = 75
    active = true
  strings:
    $mz = { 4D 5A [2-4] ?? 00 }
    $cmd = "cmd.exe /c" nocase wide ascii
    $url = /https?:\/\/[a-z0-9]+\.top\// nocase
    $key = "s3cr3t" xor(1-255)
    $b64 = "powershell" base64
  condition:
    uint16(0) == 0x5A4D and filesize < 500KB and
    2 of ($cmd, $url, $key) and #b64 > 1 and $mz at 0 and
    pe.number_of_sections > 3 // sections
}

private rule Broken {
  strings:
    $a = "ab"
    $b = { 4D ?? [-] 00 }
    $c = "never used"
    $d = "x" nocase xor
    $h = { 4D 5A } nocase
  condition:
    $a and $b and $d and $h and $missing and math.entropy(0, filesize) > 7
}

rule Loader_Strings { condition: true }`;

const rule = (name, index = 0) => parseYara(RULES).rules.filter((r) => r.name === name)[index];
const ids = (r) => r.findings.map((f) => f.id);

describe('parseYara', () => {
  it('reads imports, rules, tags, meta and strings', () => {
    const set = parseYara(RULES);
    expect(set.imports).toEqual(['pe']);
    expect(set.rules.map((r) => r.name)).toEqual(['Loader_Strings', 'Broken', 'Loader_Strings']);
    const r = rule('Loader_Strings');
    expect(r.tags).toEqual(['banker', 'loader']);
    expect(r.meta).toEqual([
      { key: 'author', value: 'CIRCL', kind: 'string' },
      { key: 'description', value: 'Loader with a PE header', kind: 'string' },
      { key: 'score', value: '75', kind: 'number' },
      { key: 'active', value: 'true', kind: 'boolean' },
    ]);
    expect(r.strings.map((s) => [s.id, s.kind])).toEqual([
      ['$mz', 'hex'],
      ['$cmd', 'text'],
      ['$url', 'regex'],
      ['$key', 'text'],
      ['$b64', 'text'],
    ]);
    expect(r.strings[1].modifiers.map((m) => m.name)).toEqual(['nocase', 'wide', 'ascii']);
    expect(r.strings[3].modifiers).toEqual([{ name: 'xor', arg: '1-255' }]);
    expect(r.strings[2].value).toBe(String.raw`/https?:\/\/[a-z0-9]+\.top\//`);
    expect(rule('Broken').private).toBe(true);
  });

  it('reads the condition in words', () => {
    const notes = rule('Loader_Strings').notes.map((n) => n.id);
    expect(notes).toEqual(['magic', 'size_lt', 'ofCount', 'count_gt', 'at', 'module']);
    expect(rule('Loader_Strings').notes[0].params.type).toContain('MZ');
    expect(rule('Loader_Strings').notes[2].params).toMatchObject({ count: '2', total: 3 });
    expect(ids(rule('Loader_Strings'))).toEqual([]);
  });

  it('finds what the compiler and reviewers reject', () => {
    const found = ids(rule('Broken'));
    expect(found).toEqual(
      expect.arrayContaining([
        'shortString',
        'shortAtom',
        'unboundedJump',
        'unusedString',
        'modifierClash',
        'modifier',
        'undefinedString',
        'noImport',
        'noDescription',
      ]),
    );
    expect(rule('Broken').findings.find((f) => f.id === 'unusedString')?.params.id).toBe('$c');
    expect(ids(rule('Loader_Strings', 1))).toContain('duplicateRule');
  });

  it('reports syntax errors with their line', () => {
    const set = parseYara('rule A {\n  strings:\n    $a = "x\n  condition: $a\n}');
    expect(set.rules[0].findings.some((f) => f.id === 'unclosed' && f.line === 3)).toBe(true);
    expect(parseYara('hello world').findings[0]).toMatchObject({ id: 'syntax', line: 1 });
  });

  it('reads hex strings', () => {
    expect(readHex('4D 5A 90 00 ?? [4-6] (01 02 | 03)')).toMatchObject({ fixed: 7, longestRun: 4, unbounded: false, valid: true }); // prettier-ignore
    expect(readHex('?? 4D [-]')).toMatchObject({ leadingWildcard: true, unbounded: true });
    expect(readHex('4D ZZ').valid).toBe(false);
  });

  it('keeps every character in the tokens', () => {
    expect(
      tokenize(RULES)
        .map((t) => t.text)
        .join(''),
    ).toBe(RULES);
  });
});

describe('<vt-yara>', () => {
  if (!customElements.get('vt-yara')) customElements.define('vt-yara', VtYara);

  it('shows rules, strings, the condition and problems', () => {
    const el = /** @type {VtYara} */ (document.createElement('vt-yara'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = RULES;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('.yara-rule')).toHaveLength(3);
    const first = /** @type {HTMLElement} */ (root.querySelector('[data-rule="Loader_Strings"]'));
    expect(first.querySelectorAll('.yara-strings tbody tr')).toHaveLength(5);
    expect(first.querySelector('.yara-notes')?.textContent).toContain('MZ');
    expect(first.querySelector('.yara-verdict')?.textContent).toBe('No problem');
    const broken = /** @type {HTMLElement} */ (root.querySelector('[data-rule="Broken"]'));
    expect(broken.querySelector('[data-finding="undefinedString"]')?.textContent).toContain('$missing'); // prettier-ignore
    expect(broken.querySelector('tr.unused')?.getAttribute('data-string')).toBe('$c');
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-tab="source"]')).click();
    expect(el.root.querySelector('.yara-source')?.textContent).toBe(RULES);
    el.remove();
  });

  it('never turns rule text into markup', () => {
    const el = /** @type {VtYara} */ (document.createElement('vt-yara'));
    el.content = 'rule X { meta: d = "<img src=x onerror=alert(1)>" strings: $a = "<b>" condition: $a }'; // prettier-ignore
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('img, b')).toBeNull();
    expect(el.root.querySelector('.yara-meta dd')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    el.remove();
  });
});
