// @ts-check
import { describe, expect, it } from 'vitest';
import {
  formatSql,
  parseSql,
  resultToCsv,
  statementKind,
  tokenize,
} from '../../src/components/sql/sql.js';
import { VtSql } from '../../src/components/sql/vt-sql.js';

if (!customElements.get('vt-sql')) customElements.define('vt-sql', VtSql);

/**
 * @param {Record<string, string>} attributes
 * @param {(el: VtSql) => void} setup
 * @returns {Promise<VtSql>}
 */
async function mount(attributes, setup) {
  const el = /** @type {VtSql} */ (document.createElement('vt-sql'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  setup(el);
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

const PSQL = `app=# SELECT id, name
app-# FROM users LIMIT 2;
 id |  name
----+-------
  1 | Ada
  2 | Alan
(2 rows)

Time: 0.512 ms
app=# INSERT INTO users (name) VALUES ('Grace');
INSERT 0 1
app=# SELECT * FROM userz;
ERROR:  relation "userz" does not exist
LINE 1: SELECT * FROM userz;
                      ^`;

describe('parseSql', () => {
  it('reads a query alone', () => {
    const [statement] = parseSql('SELECT 1;\n');
    expect(statement.sql).toBe('SELECT 1;');
    expect(statement.result).toBeNull();
  });

  it('reads a psql session: queries, results, timings, tags and errors', () => {
    const statements = parseSql(PSQL);
    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toBe('SELECT id, name\nFROM users LIMIT 2;');
    expect(statements[0].result?.columns.map((c) => c.name)).toEqual(['id', 'name']);
    expect(statements[0].result?.rows).toEqual([
      ['1', 'Ada'],
      ['2', 'Alan'],
    ]);
    expect(statements[0].result?.total).toBe(2);
    expect(statements[0].duration).toBe(0.512);
    expect(statements[1].message).toBe('INSERT 0 1');
    expect(statements[2].error).toContain('relation "userz" does not exist');
    expect(statements[2].error).toContain('LINE 1');
  });

  it('reads a mysql session, with NULL and timings in seconds', () => {
    const statements = parseSql(`mysql> SELECT id, name FROM users;
+----+-------+
| id | name  |
+----+-------+
|  1 | a | b |
|  2 | NULL  |
+----+-------+
2 rows in set (0.01 sec)

mysql> UPDATE users SET name = 'x';
Query OK, 2 rows affected (0.02 sec)`);
    expect(statements).toHaveLength(2);
    // A bar inside a value does not split the cell: columns follow the border.
    expect(statements[0].result?.rows).toEqual([
      ['1', 'a | b'],
      ['2', null],
    ]);
    expect(statements[0].duration).toBe(10);
    expect(statements[1].message).toBe('Query OK, 2 rows affected');
  });

  it('reads box tables of sqlite3 and DuckDB, with the type row', () => {
    const [statement] = parseSql(`D SELECT 42 AS answer, 'x' AS name;
┌────────┬─────────┐
│ answer │  name   │
│ int32  │ varchar │
├────────┼─────────┤
│     42 │ x       │
└────────┴─────────┘`);
    expect(statement.sql).toBe("SELECT 42 AS answer, 'x' AS name;");
    expect(statement.result?.columns).toEqual([
      { name: 'answer', type: 'int32' },
      { name: 'name', type: 'varchar' },
    ]);
    expect(statement.result?.rows).toEqual([['42', 'x']]);
  });

  it('reads results without prompts', () => {
    const statements = parseSql(` id | name
----+------
  1 | Ada
(1 row)`);
    expect(statements[0].result?.rows).toEqual([['1', 'Ada']]);
    expect(statements[0].result?.total).toBe(1);
  });

  it('reads JSON: a node-postgres result, parameters, and lists of statements', () => {
    const [pg] = parseSql(
      JSON.stringify({
        query: 'SELECT * FROM users WHERE id = $1 AND name = $2',
        params: [7, "O'Hara", null],
        fields: [{ name: 'id' }, { name: 'meta' }],
        rows: [{ id: 7, meta: { admin: true } }],
        rowCount: 1,
        duration: 3.2,
      }),
    );
    expect(pg.params).toEqual([
      { name: '$1', value: '7' },
      { name: '$2', value: "'O''Hara'" },
      { name: '$3', value: 'NULL' },
    ]);
    expect(pg.result?.rows).toEqual([['7', '{"admin":true}']]);
    expect(pg.result?.total).toBe(1);
    expect(pg.duration).toBe(3.2);

    const list = parseSql(
      JSON.stringify([
        'BEGIN;',
        { sql: 'SELECT 1 AS a', columns: ['a'], rows: [[1]] },
        { sql: 'oops', error: { message: 'syntax error' } },
      ]),
    );
    expect(list.map((s) => s.sql)).toEqual(['BEGIN;', 'SELECT 1 AS a', 'oops']);
    expect(list[1].result?.rows).toEqual([['1']]);
    expect(list[2].error).toBe('syntax error');
  });

  it('reads text that only looks like JSON as SQL', () => {
    expect(parseSql('[dbo].[users]')[0].sql).toBe('[dbo].[users]');
  });
});

describe('tokenize', () => {
  it('keeps strings, quoted names and comments whole', () => {
    const tokens = tokenize(`SELECT 'it''s', "a b", $$x;y$$ -- c;\n/* ; */ FROM t;`).filter(
      (token) => token.type !== 'space',
    );
    expect(tokens.map((token) => token.type)).toEqual([
      'word', 'string', 'comma', 'ident', 'comma', 'string', 'comment', 'comment', 'word', 'word', 'punct',
    ]); // prettier-ignore
  });
});

describe('formatSql', () => {
  it('puts one clause per line, list items and conditions indented', () => {
    expect(
      formatSql(
        'select u.id, count(o.id) as n from users u left join orders o on o.user_id = u.id and o.paid where u.age between 18 and 30 group by u.id order by n desc limit 5',
      ),
    ).toBe(
      [
        'SELECT',
        '  u.id,',
        '  count(o.id) AS n',
        'FROM users u',
        'LEFT JOIN orders o ON o.user_id = u.id',
        '  AND o.paid',
        'WHERE u.age BETWEEN 18 AND 30',
        'GROUP BY u.id',
        'ORDER BY n DESC',
        'LIMIT 5',
      ].join('\n'),
    );
  });

  it('indents subqueries and leaves function calls and windows on one line', () => {
    expect(
      formatSql(
        'select row_number() over (partition by team order by id) from t where id in (select id from vip)',
      ),
    ).toBe(
      [
        'SELECT row_number() OVER (PARTITION BY team ORDER BY id)',
        'FROM t',
        'WHERE id IN (',
        '  SELECT id',
        '  FROM vip',
        ')',
      ].join('\n'),
    );
  });

  it('keeps strings, names and comments, and separates statements', () => {
    expect(formatSql("insert into t (a) values ('select from') returning id; select \"From\" from x -- end")).toBe(
      [
        'INSERT INTO t (a)',
        "VALUES ('select from')",
        'RETURNING id;',
        '',
        'SELECT "From"',
        'FROM x -- end',
      ].join('\n'),
    ); // prettier-ignore
  });
});

describe('helpers', () => {
  it('tells the kind of a statement', () => {
    expect(statementKind('-- note\n(SELECT 1)')).toBe('SELECT');
    expect(statementKind('with x as (select 1) select * from x')).toBe('WITH');
    expect(statementKind("'x'")).toBe('');
  });

  it('writes a result as CSV, NULL as an empty field', () => {
    expect(
      resultToCsv({
        columns: [
          { name: 'a', type: '' },
          { name: 'b', type: '' },
        ],
        rows: [
          ['1', null],
          ['x,y', 'say "hi"'],
        ],
        total: null,
      }),
    ).toBe('a,b\n1,\n"x,y","say ""hi"""');
  });
});

describe('<vt-sql>', () => {
  it('renders statements, results and NULL cells as text', async () => {
    const el = await mount({ dialect: 'postgres' }, (element) => {
      element.content = JSON.stringify({
        query: 'SELECT name FROM users',
        columns: ['name'],
        rows: [['<img src=x onerror=alert(1)>'], [null]],
      });
    });
    expect(el.dialect).toBe('postgresql');
    expect(el.root.querySelector('img')).toBeNull();
    const cells = el.root.querySelectorAll('tbody td');
    expect(cells[0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(cells[1].classList.contains('sql-null')).toBe(true);
    expect(el.root.querySelector('.sql-summary')?.textContent).toContain('2 rows');
  });

  it('sorts a result by a column, NULL last, and reports it', async () => {
    const el = await mount({}, (element) => {
      element.content = JSON.stringify({ columns: ['n'], rows: [[10], [null], [9], [100]] });
    });
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-sort', (event) =>
      events.push(/** @type {CustomEvent} */ (event).detail),
    );
    const values = () => Array.from(el.root.querySelectorAll('tbody td'), (td) => td.textContent);
    el.sortBy(0, 0, 'n');
    expect(values()).toEqual(['9', '10', '100', 'NULL']);
    el.sortBy(0, 0, 'n');
    expect(values()).toEqual(['100', '10', '9', 'NULL']);
    expect(events.map((detail) => detail.direction)).toEqual(['ascending', 'descending']);
  });

  it('shows rows a page at a time', async () => {
    const el = await mount({ 'max-rows': '10' }, (element) => {
      element.content = JSON.stringify({
        columns: ['i'],
        rows: Array.from({ length: 25 }, (_, i) => [i]),
      });
    });
    expect(el.root.querySelectorAll('tbody tr')).toHaveLength(10);
    /** @type {HTMLButtonElement} */ (el.root.querySelector('.sql-more')).click();
    expect(el.root.querySelectorAll('tbody tr')).toHaveLength(20);
  });

  it('lays the query out on demand', async () => {
    const el = await mount({ variant: 'full' }, (element) => {
      element.content = 'select a, b from t where x = 1';
    });
    expect(el.root.querySelector('.sql-query')?.textContent).toBe('select a, b from t where x = 1');
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-focus-key="format"]')).click();
    expect(el.root.querySelector('.sql-query')?.textContent).toContain('SELECT\n  a,\n  b\nFROM t');
  });
});
