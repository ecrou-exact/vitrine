import { describe, expect, it } from 'vitest';
import { matchNames, parseCondition, readRule, readRules, readTag } from '../../src/components/sigma/sigma.js'; // prettier-ignore
import { VtSigma } from '../../src/components/sigma/vt-sigma.js';

const RULE = {
  title: 'Whoami Execution',
  id: '502b42de-4306-40b4-9596-6f590c81f073',
  status: 'test',
  description: 'Detects the execution of whoami, often used after an intrusion.',
  author: ['Florian Roth', 'CIRCL'],
  date: '2018-08-13',
  tags: ['attack.discovery', 'attack.t1033', 'attack.t1059.001', 'cve.2021-44228', 'attack.g0016', 'detection.threat-hunting'], // prettier-ignore
  logsource: { category: 'process_creation', product: 'windows' },
  detection: {
    selection_img: [
      { Image: ['C:\\Windows\\System32\\whoami.exe'] },
      { OriginalFileName: 'whoami.exe' },
    ],
    selection_cli: { 'CommandLine|contains|all': ['/user', '/priv'] },
    filter_admin: { User: null },
    condition: '1 of selection_* and not filter_admin',
  },
  falsepositives: ['Admin scripts'],
  level: 'medium',
};

describe('readRule', () => {
  it('reads metadata, tags and searches', () => {
    const rule = /** @type {NonNullable<ReturnType<typeof readRule>>} */ (readRule(RULE));
    expect(rule.title).toBe('Whoami Execution');
    expect(rule.author).toBe('Florian Roth, CIRCL');
    expect(rule.logsource).toEqual({ category: 'process_creation', product: 'windows' });
    expect(rule.tags.map((t) => [t.kind, t.label])).toEqual([
      ['tactic', 'Discovery'],
      ['technique', 'T1033'],
      ['technique', 'T1059.001'],
      ['cve', 'CVE-2021-44228'],
      ['group', 'G0016'],
      ['other', 'detection.threat-hunting'],
    ]);
    expect(rule.tags[2].url).toBe('https://attack.mitre.org/techniques/T1059/001/');
    expect(rule.tags[0].url).toBe('https://attack.mitre.org/tactics/TA0007/');
    const [img, cli, filter] = rule.searches;
    expect(img.kind).toBe('list');
    expect(img.groups).toHaveLength(2);
    expect(cli.groups[0][0]).toEqual({ field: 'CommandLine', modifiers: ['contains', 'all'], values: ['/user', '/priv'] }); // prettier-ignore
    expect(filter.groups[0][0].values).toEqual([null]);
    expect(rule.findings).toEqual([]);
    expect(rule.searches.every((s) => s.used)).toBe(true);
  });

  it('reads the condition as a tree', () => {
    const tree = parseCondition('1 of selection_* and not filter or (a and b)', ['selection_a', 'selection_b', 'filter', 'a', 'b']); // prettier-ignore
    expect(tree).toEqual({
      type: 'or',
      children: [
        {
          type: 'and',
          children: [
            {
              type: 'of',
              quantity: '1',
              pattern: 'selection_*',
              names: ['selection_a', 'selection_b'],
            },
            { type: 'not', child: { type: 'search', name: 'filter' } },
          ],
        },
        {
          type: 'and',
          children: [
            { type: 'search', name: 'a' },
            { type: 'search', name: 'b' },
          ],
        },
      ],
    });
    expect(() => parseCondition('a and', ['a'])).toThrow();
    expect(() => parseCondition('(a', ['a'])).toThrow();
    expect(matchNames('them', ['a', '_b'])).toEqual(['a']);
  });

  it('finds problems', () => {
    const rule = /** @type {NonNullable<ReturnType<typeof readRule>>} */ (
      readRule({
        title: 'Bad',
        id: '42',
        status: 'beta',
        level: 'severe',
        date: '2020/01/02',
        tags: ['attack.T1003'],
        logsource: { product: 'linux' },
        detection: {
          selection: { 'cmd|contain': 'x', 'path|endswith': '*\\x.exe', 'a|all': ['one'] },
          unused: { b: 1 },
          condition: 'selection and other and 1 of nothing_*',
        },
      })
    );
    expect(rule.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining(['unknownSearch', 'emptyPattern', 'unusedSearch', 'unknownModifier', 'wildcardModifier', 'allSingle', 'badLevel', 'badStatus', 'badId', 'oldDate', 'tagCase']), // prettier-ignore
    );
    expect(readRule({ title: 'x' })?.findings.map((f) => f.id)).toEqual(['noLogsource', 'noDetection']); // prettier-ignore
    expect(readRule({ title: 'x', logsource: { product: 'a' }, detection: { s: { a: 1 }, condition: 's or' } })?.findings[0].id).toBe('badCondition'); // prettier-ignore
  });

  it('merges global documents and reads correlation rules', () => {
    const { rules } = readRules([
      { action: 'global', title: 'Shared', logsource: { product: 'windows' }, detection: { condition: 'selection' } }, // prettier-ignore
      { logsource: { service: 'security' }, detection: { selection: { EventID: 4624 } } },
      { title: 'Many logins', correlation: { type: 'event_count', rules: ['x'], timespan: '5m' } },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ title: 'Shared', logsource: { product: 'windows', service: 'security' } }); // prettier-ignore
    expect(rules[0].findings).toEqual([]);
    expect(rules[1].type).toBe('correlation');
    expect(readTag('attack.command_and_control').label).toBe('Command and Control');
  });
});

describe('<vt-sigma>', () => {
  if (!customElements.get('vt-sigma')) customElements.define('vt-sigma', VtSigma);

  it('shows a rule from JSON', () => {
    const el = /** @type {VtSigma} */ (document.createElement('vt-sigma'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = JSON.stringify(RULE);
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.sigma-title')?.textContent).toBe('Whoami Execution');
    expect(root.querySelector('.sigma-level')?.textContent).toContain('Medium');
    expect(root.querySelectorAll('.sigma-search')).toHaveLength(3);
    expect(root.querySelector('[data-search="selection_cli"] .sigma-mods')?.textContent).toBe('contains, every value, not just one'); // prettier-ignore
    expect(root.querySelector('.sigma-tree')?.textContent).toContain(
      'selection_img, selection_cli',
    );
    const link = /** @type {HTMLAnchorElement} */ (root.querySelector('.tag-technique a'));
    expect(link.href).toBe('https://attack.mitre.org/techniques/T1033/');
    el.setAttribute('links', 'false');
    el.render();
    expect(el.root.querySelector('.sigma-tags a')).toBeNull();
    el.remove();
  });

  it('never links unsafe references or renders markup', () => {
    const el = /** @type {VtSigma} */ (document.createElement('vt-sigma'));
    el.content = JSON.stringify({ title: '<img src=x onerror=alert(1)>', references: ['javascript:alert(1)', 'https://example.com/'], logsource: { product: 'x' }, detection: { s: { '<b>': '<i>' }, condition: 's' } }); // prettier-ignore
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('img, b, i')).toBeNull();
    const links = [...el.root.querySelectorAll('.sigma-refs a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['https://example.com/']);
    el.remove();
  });
});
