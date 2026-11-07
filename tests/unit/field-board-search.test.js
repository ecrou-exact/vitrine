// @ts-check
import { describe, expect, it } from 'vitest';
import {
  addTask,
  filterTasks,
  moveTask,
  parseBoard,
  readPriority,
  removeTask,
  serializeBoard,
  statusKey,
  updateTask,
} from '../../src/components/board/model.js';
import {
  filterOptions,
  fold as foldOption,
  parseOptions,
  readValues,
} from '../../src/components/field/options.js';
import {
  entryUrl,
  extractOf,
  fold,
  oneEdit,
  parseIndex,
  scoreEntry,
  searchIndex,
  words,
} from '../../src/components/search/engine.js';
import { highlight } from '../../src/components/search/vt-search.js';
import { VtField } from '../../src/components/field/vt-field.js';

describe('<vt-field> options', () => {
  it('reads strings, objects and groups, and drops duplicates', () => {
    const options = parseOptions(
      JSON.stringify([
        'France',
        { value: 'lu', label: 'Luxembourg', description: 'Grand Duchy', disabled: true },
        { group: 'Americas', options: ['Canada', { id: 'us', name: 'United States' }] },
        'France',
        null,
        {},
      ]),
    );
    expect(options.map((o) => [o.value, o.label, o.group])).toEqual([
      ['France', 'France', ''],
      ['lu', 'Luxembourg', ''],
      ['Canada', 'Canada', 'Americas'],
      ['us', 'United States', 'Americas'],
    ]);
    expect(options[1]).toMatchObject({ description: 'Grand Duchy', disabled: true });
  });

  it('reads one option per line, with value | label', () => {
    expect(parseOptions('fr | France\nde\n\n').map((o) => [o.value, o.label])).toEqual([
      ['fr', 'France'],
      ['de', 'de'],
    ]);
  });

  it('filters on every word, ignoring case and accents', () => {
    const options = parseOptions('["Éclair au café","Croissant","Pain au chocolat"]');
    expect(filterOptions(options, 'eclair CAFE').map((o) => o.value)).toEqual(['Éclair au café']);
    expect(filterOptions(options, 'au')).toHaveLength(2);
    expect(foldOption('Ça')).toBe('ca');
  });

  it('reads several values from JSON or commas', () => {
    expect(readValues('["a","b"]')).toEqual(['a', 'b']);
    expect(readValues('a, b ,,c')).toEqual(['a', 'b', 'c']);
    expect(readValues(null)).toEqual([]);
  });

  it('turns a JSON description into options and attributes from its list', () => {
    const result = VtField.fromData({
      type: 'select',
      label: 'Country',
      required: true,
      minLength: 2,
      options: ['France'],
      onclick: 'alert(1)',
      src: '/x',
    });
    expect(result.content).toBe('[\n  "France"\n]');
    expect(result.attributes).toEqual({
      type: 'select',
      label: 'Country',
      required: true,
      minlength: 2,
    });
    for (const name of Object.keys(result.attributes ?? {}))
      expect(VtField.dataAttributes).toContain(name);
  });
});

describe('<vt-board> model', () => {
  const source = JSON.stringify({
    columns: [{ id: 'todo' }, { id: 'In Progress', limit: 2 }, { id: 'done', title: 'Shipped' }],
    tasks: [
      {
        id: 'a',
        title: 'A',
        column: 'todo',
        priority: 'P1',
        labels: ['x', 'x', { name: 'y' }],
        due: '2026-11-02T10:00:00Z',
      },
      { id: 'b', title: 'B', status: 'doing', assignee: { login: 'ada' }, progress: 140 },
      { id: 'a', title: 'Duplicate id', column: 'todo' },
      { title: '' },
    ],
  });

  it('reads columns, tasks and their fields', () => {
    const result = parseBoard(source);
    if (!result.ok) throw new Error('not read');
    const { columns, tasks } = result.board;
    expect(columns.map((c) => [c.id, c.limit])).toEqual([
      ['todo', null],
      ['in-progress', 2],
      ['done', null],
    ]);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ priority: 'high', labels: ['x', 'y'], due: '2026-11-02' });
    expect(tasks[1]).toMatchObject({ column: 'in-progress', assignee: 'ada', progress: 100 });
    expect(tasks[2].id).not.toBe('a');
  });

  it('reads roadmaps written for vt-roadmap, and columns holding their tasks', () => {
    const roadmap = parseBoard(
      '[{"title":"Shipped thing","status":"released"},{"title":"Later","status":"backlog"}]',
    );
    expect(roadmap.ok && roadmap.board.columns.map((c) => c.id)).toEqual(['backlog', 'done']);
    const nested = parseBoard(
      '{"columns":[{"id":"todo","tasks":[{"title":"A"}]},{"id":"done","cards":[{"title":"B"}]}]}',
    );
    expect(nested.ok && nested.board.tasks.map((t) => `${t.title}:${t.column}`)).toEqual([
      'A:todo',
      'B:done',
    ]);
    const empty = parseBoard('');
    expect(empty.ok && empty.board.columns.map((c) => c.id)).toEqual([
      'todo',
      'in-progress',
      'done',
    ]);
  });

  it('moves, adds, updates and removes tasks without changing the board it was given', () => {
    const result = parseBoard(source);
    if (!result.ok) throw new Error('not read');
    const board = result.board;
    const moved = moveTask(board, 'a', 'in-progress', 0);
    expect(moved.tasks.filter((t) => t.column === 'in-progress').map((t) => t.id)).toEqual([
      'a',
      'b',
    ]);
    expect(board.tasks[0].column).toBe('todo');
    const last = moveTask(board, 'a', 'in-progress', 99);
    expect(last.tasks.filter((t) => t.column === 'in-progress').map((t) => t.id)).toEqual([
      'b',
      'a',
    ]);
    expect(moveTask(board, 'a', 'nowhere', 0)).toBe(board);
    const added = addTask(board, { ...board.tasks[0], id: 'n', title: 'New', column: 'todo' });
    expect(
      added.tasks
        .filter((t) => t.column === 'todo')
        .map((t) => t.id)
        .at(-1),
    ).toBe('n');
    expect(updateTask(board, 'a', { title: 'Renamed', id: 'hijack' }).tasks[0]).toMatchObject({
      id: 'a',
      title: 'Renamed',
    });
    expect(removeTask(board, 'a').tasks.some((t) => t.id === 'a')).toBe(false);
  });

  it('writes a board that reads back the same', () => {
    const result = parseBoard(source);
    if (!result.ok) throw new Error('not read');
    const again = parseBoard(serializeBoard(result.board));
    expect(again.ok && again.board).toEqual(result.board);
  });

  it('filters by words, label and assignee', () => {
    const result = parseBoard(source);
    if (!result.ok) throw new Error('not read');
    const tasks = result.board.tasks;
    expect(filterTasks(tasks, { query: 'dupl', label: null, assignee: null })).toHaveLength(1);
    expect(filterTasks(tasks, { query: '', label: 'y', assignee: null }).map((t) => t.id)).toEqual([
      'a',
    ]);
    expect(
      filterTasks(tasks, { query: '', label: null, assignee: 'ada' }).map((t) => t.id),
    ).toEqual(['b']);
  });

  it('reads priorities and statuses with their usual names only', () => {
    expect(
      ['urgent', 'P0', 'critical', 'minor', 'whatever', 'constructor'].map(readPriority),
    ).toEqual(['urgent', 'urgent', 'urgent', 'low', 'none', 'none']);
    expect(['To Do', 'WIP', 'QA', 'closed', 'toString'].map(statusKey)).toEqual([
      'todo',
      'in-progress',
      'review',
      'done',
      'tostring',
    ]);
  });
});

describe('<vt-search> engine', () => {
  const index = parseIndex(
    JSON.stringify({
      entries: [
        {
          id: 'u-1',
          title: 'Getting started',
          section: 'Guides',
          url: '/start',
          content: 'Install from a CDN.',
          featured: true,
        },
        {
          id: 'u-2',
          title: 'Accessibilité',
          section: 'Guides',
          content: 'Clavier et lecteurs d’écran 🎧 partout.',
        },
        {
          id: 'u-3',
          title: 'Board',
          section: 'Components',
          content: 'Drag and drop tasks between columns.',
          keywords: ['kanban'],
        },
        { t: 'Old index format', p: 'Page', u: 'old.html' },
        { id: 'u-5', title: 'Bad link', url: 'javascript:alert(1)' },
        { id: 'u-1', title: 'Same id' },
        { title: '' },
      ],
    }),
  );
  if (!index.ok) throw new Error('not read');
  const { entries } = index;

  it('reads entries in several shapes, with safe addresses only', () => {
    expect(entries.map((e) => e.id)).toEqual(['u-1', 'u-2', 'u-3', 'old.html', 'u-5']);
    expect(entries[3]).toMatchObject({
      title: 'Old index format',
      section: 'Page',
      url: 'old.html',
    });
    expect(entries[4].url).toBe('');
  });

  it('ranks titles before contents and needs every word', () => {
    expect(searchIndex(entries, 'board').map((r) => r.entry.id)).toEqual(['u-3']);
    expect(searchIndex(entries, 'kanban').map((r) => r.entry.id)).toEqual(['u-3']);
    expect(searchIndex(entries, 'drag columns').map((r) => r.entry.id)).toEqual(['u-3']);
    expect(searchIndex(entries, 'drag nothing')).toEqual([]);
    expect(scoreEntry(entries[0], ['getting'])).toBeGreaterThan(scoreEntry(entries[0], ['cdn']));
  });

  it('forgives case, accents and one typo', () => {
    expect(searchIndex(entries, 'ACCESSIBILITE').map((r) => r.entry.id)).toEqual(['u-2']);
    expect(searchIndex(entries, 'acessibilite').map((r) => r.entry.id)).toEqual(['u-2']);
    expect(searchIndex(entries, 'statred').map((r) => r.entry.id)).toEqual(['u-1']);
    expect(oneEdit('board', 'baord')).toBe(true);
    expect(oneEdit('board', 'bored')).toBe(false);
    expect(words('Hello, "world" (x)')).toEqual(['hello', 'world', 'x']);
  });

  it('gives the places of matches in code points, so highlights cut the right letters', () => {
    const [hit] = searchIndex(entries, 'partout');
    expect(hit.extract).toContain('🎧 partout');
    const marked = highlight(hit.extract, hit.extractRanges);
    expect(
      marked
        .filter((part) => typeof part !== 'string')
        .map((part) => /** @type {HTMLElement} */ (part).textContent),
    ).toEqual(['partout']);
    expect(fold('Écran')).toBe('ecran');
  });

  it('cuts long contents around the first match', () => {
    const content = `${'word '.repeat(60)}needle ${'more '.repeat(60)}`;
    const { extract, ranges } = extractOf(content, ['needle']);
    expect(extract.startsWith('…')).toBe(true);
    expect(extract.endsWith('…')).toBe(true);
    expect(Array.from(extract).slice(ranges[0][0], ranges[0][1]).join('')).toBe('needle');
  });

  it('builds addresses from ids, safely', () => {
    expect(entryUrl(entries[1], '/docs/{id}')).toBe('/docs/u-2');
    expect(entryUrl({ ...entries[1], id: 'a b/../c' }, '/docs/{id}')).toBe('/docs/a%20b%2F..%2Fc');
    expect(entryUrl(entries[1], 'javascript:{id}')).toBeNull();
    expect(entryUrl(entries[1], null)).toBeNull();
    expect(entryUrl(entries[0], '/docs/{id}')).toBe('/start');
  });

  it('stays quick on a large index', () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({
      id: `id-${i}`,
      title: `Page ${i} about things`,
      content: 'Lorem ipsum dolor sit amet '.repeat(10),
    }));
    const large = parseIndex(JSON.stringify(many));
    if (!large.ok) throw new Error('not read');
    const started = performance.now();
    searchIndex(large.entries, 'page things lorem');
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
