# `<vt-sql>`

`<vt-sql>` shows SQL: a query alone, highlighted and laid out on demand, or a session of `psql`, `mysql`, MariaDB, `sqlite3` or DuckDB with its result tables, row counts, timings and errors. Results can be sorted by a click on a column, and `NULL` is told apart from an empty string. Nothing is ever run: the element only reads text.

```html
<vt-sql variant="full" dialect="postgresql">
  <template>
    app=# SELECT id, name, email FROM users ORDER BY id LIMIT 3;
     id | name  |      email
    ----+-------+------------------
      1 | Ada   | ada@example.com
      2 | Alan  | alan@example.com
      3 | Grace |
    (3 rows)

    Time: 0.512 ms
    app=# SELECT * FROM userz;
    ERROR:  relation "userz" does not exist
    LINE 1: SELECT * FROM userz;
                          ^
  </template>
</vt-sql>
```

## What it reads

| Content                       | Example                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| A query, or several           | `SELECT * FROM users WHERE id = $1;`                                                            |
| A `psql` session              | Prompts `app=#` and `app-#`, aligned tables, `(3 rows)`, `Time: 0.5 ms`, `INSERT 0 1`, `ERROR:` |
| A `mysql` or MariaDB session  | Prompts `mysql>` and `->`, `+----+` tables, `NULL`, `2 rows in set (0.01 sec)`, `Query OK`      |
| A `sqlite3` or DuckDB session | `.mode box` tables (`┌──┬──┐`), with the type row of DuckDB                                     |
| Result tables without prompts | A table pasted on its own                                                                       |
| JSON                          | One statement, a list of them, or `{ "statements": [...] }`                                     |

Columns of a `+----+` or box table follow its border, so a `|` inside a value does not split the cell.

## JSON

A statement is a string (the query) or an object:

```js
document.querySelector('vt-sql').data = {
  query: 'SELECT id, name FROM users WHERE team = $1',
  params: ['core'],
  columns: ['id', { name: 'name', type: 'text' }],
  rows: [[1, 'Ada'], [2, null]],
  rowCount: 2,
  duration: 3.4,
  dialect: 'postgresql',
};
```

| Key                                | Description                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `query` (or `sql`, `text`)         | The SQL                                                                                   |
| `params` (or `values`, `bindings`) | A list (`$1`, `$2`…) or an object of named parameters (`:team`)                           |
| `columns` (or `fields`)            | Names, or `{ name, type }`. The `fields` of a node-postgres result work as they are       |
| `rows` (or `data`)                 | Lists of values, or objects by column name. Objects and lists in a cell are shown as JSON |
| `rowCount` (or `total`, `count`)   | Number of rows, when the result holds only some of them                                   |
| `duration` (or `time`)             | Milliseconds                                                                              |
| `message` (or `command`)           | A command tag or a notice, such as `INSERT 0 1`                                           |
| `error`                            | A string, or an object with `message`                                                     |
| `dialect` (or `database`)          | Sets the `dialect` attribute, unless the page set it                                      |

A node-postgres result (`{ command, rowCount, rows, fields }`) can be passed as it is, with the query added.

## Laying a query out

`format` lays every query out: keywords in capitals, one clause per line, the items of a select list on lines of their own, conditions after `AND` and `OR` indented, subqueries indented. Strings, quoted names and comments are kept as they are, and nothing moves inside a function call or a window (`OVER (PARTITION BY …)`). In the full variant, a button switches between the query as written and laid out.

## Attributes

| Attribute       | Type    | Default | Description                                                                                     |
| --------------- | ------- | ------- | ----------------------------------------------------------------------------------------------- |
| `dialect`       | string  | `sql`   | `sql`, `postgresql`, `mysql`, `sqlite`, `mssql` or `oracle`, for the badge and the highlighting |
| `format`        | boolean | off     | Lays the queries out                                                                            |
| `format-toggle` | boolean | preset  | A button that lays the queries out or shows them as written                                     |
| `line-numbers`  | boolean | off     | Line numbers in the queries                                                                     |
| `max-rows`      | number  | 200     | Rows shown per result before "Show more"                                                        |
| `results`       | boolean | on      | Result tables                                                                                   |
| `query`         | boolean | on      | Queries; off shows only the results                                                             |
| `sortable`      | boolean | on      | Sorts a result by a click on a column (`NULL` always last)                                      |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, search, copy (the queries), download (the content as written), full screen and the layout button. Each result also has a "Copy as CSV" button when `copy` is on.

## Properties

`statements` is the list read, as `{ sql, params, result, message, error, duration }` (read-only copies), where `result` is `{ columns, rows, total }` and a `NULL` cell is `null`.

## Events

| Event     | When                | Detail                                   |
| --------- | ------------------- | ---------------------------------------- |
| `vt-sort` | A result was sorted | `{ statement, column, name, direction }` |

## CSS parts

`statement`, `query`, `params`, `result`, `summary`, `table`, `header-cell`, `cell`, `null` and `sql-error`.
