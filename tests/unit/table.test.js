import { describe, expect, it } from 'vitest';
import {
  aggregate,
  coerce,
  compileFilter,
  fromValue,
  groupIndexes,
  humanize,
  inferType,
  parseTable,
  serialize,
  sortIndexes,
  sortKeys,
} from '../../src/components/table/model.js';
import { VtTable } from '../../src/components/table/vt-table.js';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

describe('parseTable', () => {
  it('reads arrays of objects, arrays of arrays, { columns, rows } and CSV', () => {
    const a = parseTable('[{"first_name":"Ada","age":36},{"first_name":"Alan","age":41}]');
    expect(a.columns.map((c) => [c.key, c.label, c.type])).toEqual([
      ['first_name', 'First name', 'text'],
      ['age', 'Age', 'number'],
    ]);
    expect(a.rows).toHaveLength(2);

    const b = parseTable('[["name","ok"],["x",true],["y",false]]');
    expect(b.columns.map((c) => c.type)).toEqual(['text', 'boolean']);
    expect(b.rows[1]).toEqual({ name: 'y', ok: false });

    const c = parseTable('{"columns":[{"key":"n","label":"N°"}],"rows":[{"n":1,"x":2}]}');
    expect(c.columns.map((col) => col.label)).toEqual(['N°']);

    const d = parseTable('name,score,url\nAda,98,https://a.example\nAlan,95,https://b.example');
    expect(d.columns.map((col) => col.type)).toEqual(['text', 'number', 'url']);
    expect(d.rows[0].score).toBe('98');
  });

  it('reports invalid JSON', () => {
    expect(parseTable('[{"a":').error).toBeTruthy();
  });

  it('humanizes keys', () => {
    expect(humanize('createdAt')).toBe('Created at');
    expect(humanize('user_id')).toBe('User id');
  });
});

describe('sorting', () => {
  const { rows, columns } = fromValue([
    { name: 'item 10', n: 3, d: '2024-01-02' },
    { name: 'item 2', n: '', d: '2023-05-01' },
    { name: 'Item 1', n: 1, d: null },
    { name: 'item 2', n: 2, d: '2024-01-01' },
  ]);
  const [name, n, d] = columns;

  it('infers types', () => {
    expect([name.type, n.type, d.type]).toEqual(['text', 'number', 'date']);
    expect(inferType(rows, 'missing')).toBe('text');
  });

  it('sorts numbers and dates with empty values last, both directions', () => {
    const idx = rows.map((_, i) => i);
    expect(
      sortIndexes(idx, [{ keys: sortKeys(rows, n), direction: 'ascending' }], collator),
    ).toEqual([2, 3, 0, 1]);
    expect(
      sortIndexes(idx, [{ keys: sortKeys(rows, n), direction: 'descending' }], collator),
    ).toEqual([0, 3, 2, 1]);
    expect(
      sortIndexes(idx, [{ keys: sortKeys(rows, d), direction: 'ascending' }], collator),
    ).toEqual([1, 3, 0, 2]);
  });

  it('sorts text naturally and on several columns', () => {
    const idx = rows.map((_, i) => i);
    const byName = sortIndexes(
      idx,
      [{ keys: sortKeys(rows, name), direction: 'ascending' }],
      collator,
    );
    expect(byName.map((i) => rows[i].name)).toEqual(['Item 1', 'item 2', 'item 2', 'item 10']);
    const multi = sortIndexes(
      idx,
      [
        { keys: sortKeys(rows, name), direction: 'ascending' },
        { keys: sortKeys(rows, n), direction: 'descending' },
      ],
      collator,
    );
    expect(multi).toEqual([2, 3, 1, 0]);
  });
});

describe('compileFilter', () => {
  it('matches text words, exact and negated', () => {
    expect(compileFilter('', 'text')).toBeNull();
    const words = /** @type {(v: unknown) => boolean} */ (compileFilter('ada love', 'text'));
    expect(words('Ada Lovelace')).toBe(true);
    expect(words('Ada')).toBe(false);
    expect(/** @type {any} */ (compileFilter('=ada', 'text'))('ADA')).toBe(true);
    expect(/** @type {any} */ (compileFilter('!x', 'text'))('abc')).toBe(true);
  });

  it('compares numbers and dates, ranges and blanks', () => {
    const gt = /** @type {any} */ (compileFilter('>= 10', 'number'));
    expect([gt(10), gt('9'), gt(null)]).toEqual([true, false, false]);
    const range = /** @type {any} */ (compileFilter('5..1', 'number'));
    expect([range(3), range(6)]).toEqual([true, false]);
    const date = /** @type {any} */ (compileFilter('>2024-01-01', 'date'));
    expect([date('2024-02-01'), date('2023-12-31')]).toEqual([true, false]);
    expect(/** @type {any} */ (compileFilter('empty', 'text'))('')).toBe(true);
    expect(/** @type {any} */ (compileFilter('yes', 'boolean'))(true)).toBe(true);
  });
});

describe('aggregates, groups and export', () => {
  const { rows, columns } = fromValue([
    { team: 'a', pts: 3, note: '=1+1' },
    { team: 'b', pts: 5, note: 'x' },
    { team: 'a', pts: '', note: 'y' },
  ]);
  const pts = columns[1];

  it('aggregates over the given rows', () => {
    expect(aggregate(rows, [0, 1, 2], pts, 'sum')).toBe(8);
    expect(aggregate(rows, [0, 1, 2], pts, 'avg')).toBe(4);
    expect(aggregate(rows, [0, 1, 2], pts, 'count')).toBe(2);
    expect(aggregate(rows, [0, 2], pts, 'max')).toBe(3);
    expect(aggregate(rows, [2], pts, 'min')).toBeNull();
  });

  it('groups in order', () => {
    expect(groupIndexes(rows, [0, 1, 2], 'team')).toEqual([
      { value: 'a', indexes: [0, 2] },
      { value: 'b', indexes: [1] },
    ]);
  });

  it('exports CSV without formulas, TSV and JSON', () => {
    const csv = serialize(rows, columns, 'csv');
    expect(csv.split('\n')[1]).toBe("a,3,'=1+1");
    expect(serialize(rows.slice(1, 2), columns, 'tsv')).toBe('Team\tPts\tNote\nb\t5\tx');
    expect(JSON.parse(serialize(rows.slice(0, 1), columns, 'json'))).toEqual([
      { team: 'a', pts: 3, note: '=1+1' },
    ]);
  });

  it('keeps the value type when editing', () => {
    expect(coerce('7', pts, 3)).toBe(7);
    expect(coerce('abc', pts, 3)).toBe('abc');
    expect(coerce('no', { ...pts, type: 'boolean' }, true)).toBe(false);
    expect(coerce('12', pts, '3')).toBe('12');
  });
});

describe('<vt-table>', () => {
  /** @returns {VtTable} */
  function mount(attrs = {}) {
    if (!customElements.get('vt-table')) customElements.define('vt-table', VtTable);
    const el = /** @type {VtTable} */ (document.createElement('vt-table'));
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.append(el);
    return el;
  }
  const people = () =>
    Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      team: i % 3 ? 'red' : 'blue',
      score: (i * 7) % 100,
      active: i % 2 === 0,
    }));

  it('renders a page of rows from the data property, as text', () => {
    const el = mount({ 'row-key': 'id' });
    el.data = [{ id: 1, name: '<img src=x onerror=alert(1)>' }, ...people().slice(1)];
    el.render();
    const rows = el.root.querySelectorAll('tbody tr.tb-row');
    expect(rows).toHaveLength(50);
    expect(el.root.querySelector('img')).toBeNull();
    expect(el.root.querySelector('tbody td[data-c="1"]')?.textContent).toContain('<img');
    expect(el.root.querySelector('.pager-info')?.textContent).toContain('1–50');
    el.remove();
  });

  it('sorts, filters, groups and exports the filtered rows', () => {
    const el = mount({ 'row-key': 'id', 'page-size': '500' });
    el.data = people();
    el.render();
    el.cycleSort('score', false);
    el.cycleSort('score', false);
    expect(el.getRows()[0].score).toBe(99);
    el.setFilter('team', '=blue', true);
    expect(el.getRows()).toHaveLength(40);
    el.setFilter('score', '>90', true);
    expect(el.getRows().every((r) => r.team === 'blue' && Number(r.score) > 90)).toBe(true);
    expect(el.exportData('csv').split('\n')[0]).toBe('Id,Name,Team,Score,Active');
    el.setFilter('score', '', true);
    el.setFilter('team', '', true);
    el.setGroup('team');
    expect(el.root.querySelectorAll('tbody tr.tb-group')).toHaveLength(2);
    el.collapseAll();
    expect(el.root.querySelectorAll('tbody tr.tb-row')).toHaveLength(0);
    el.expandAll();
    expect(el.root.querySelectorAll('tbody tr.tb-row').length).toBe(120);
    el.remove();
  });

  it('selects rows, shows the bulk bar and fires vt-bulk-action', () => {
    const el = mount({ 'row-key': 'id', selectable: 'multiple' });
    el.data = people();
    el.bulkActions = [{ id: 'archive', label: 'Archive' }];
    el.render();
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-bulk-action', (e) =>
      events.push(/** @type {CustomEvent} */ (e).detail),
    );
    el.select([1, 2, 3]);
    expect(el.root.querySelector('.tb-bulk-count')?.textContent).toBe('3 selected');
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-focus-key="bulk-archive"]')
    ).click();
    expect(events[0].action).toBe('archive');
    expect(events[0].rows.map((/** @type {any} */ r) => r.id)).toEqual([1, 2, 3]);
    el.selectAll();
    expect(el.selectedKeys).toHaveLength(120);
    el.clearSelection();
    expect(el.root.querySelector('.tb-bulk')).toBeNull();
    el.remove();
  });

  it('moves, hides, resizes columns and round-trips the state', () => {
    const el = mount({ 'row-key': 'id' });
    el.data = people();
    el.render();
    el.moveColumn('score', -1);
    el.setHidden('team', true);
    el.setWidth('name', 300);
    expect(el.visibleColumns().map((c) => c.key)).toEqual(['id', 'name', 'score', 'active']);
    const state = el.state;
    const other = mount();
    other.data = people();
    other.state = state;
    other.render();
    expect(other.visibleColumns().map((c) => c.key)).toEqual(['id', 'name', 'score', 'active']);
    expect(other.visibleColumns()[1].width).toBe(300);
    el.remove();
    other.remove();
  });

  it('edits a cell and lets listeners cancel it', () => {
    const el = mount({ 'row-key': 'id', editable: '' });
    el.data = people().slice(0, 3);
    el.render();
    const column = el.visibleColumns().find((c) => c.key === 'score');
    el.commitEdit(/** @type {any} */ (column), el.data[0], '42');
    expect(el.data[0].score).toBe(42);
    el.addEventListener('vt-cell-edit', (e) => e.preventDefault(), { once: true });
    el.commitEdit(/** @type {any} */ (column), el.data[0], '1');
    expect(el.data[0].score).toBe(42);
    el.remove();
  });

  it('moves the focus with the arrow keys and selects with Space', () => {
    const el = mount({ 'row-key': 'id', selectable: '' });
    el.data = people().slice(0, 5);
    el.render();
    el.focusCell(0, 0);
    const key = (/** @type {string} */ k, extra = {}) =>
      /** @type {HTMLElement} */ (
        el.root.activeElement ?? el.root.querySelector('td[tabindex="0"]')
      ).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
    key('ArrowDown');
    key('ArrowRight');
    expect(el.focusPos).toEqual({ r: 1, c: 1 });
    key(' ');
    expect(el.selectedKeys).toEqual(['2']);
    key('ArrowDown', { shiftKey: true });
    expect(el.selectedKeys.sort()).toEqual(['2', '3']);
    key('Escape');
    expect(el.selectedKeys).toEqual([]);
    el.remove();
  });

  it('reads CSV from inline content', async () => {
    const el = mount({ format: 'csv' });
    el.content = 'a,b\n1,x\n2,y';
    await Promise.resolve();
    el.render();
    expect(el.root.querySelectorAll('tbody tr.tb-row')).toHaveLength(2);
    el.remove();
  });
});
