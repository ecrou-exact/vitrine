// @ts-check
/**
 * How each element whose content is not JSON reads a JSON value: the text it is turned into,
 * and the attributes the value may set. Serializers write valid text of each format, escaping
 * what has to be.
 *
 * @module core/data-formats
 */
import { isObject } from './data.js';
import { jsonText, listIn, wrapped } from './data-input.js';

/** @typedef {import('./data-input.js').DataResult} DataResult */

/**
 * @param {unknown} value
 * @returns {string} A cell, a variable or a field as text.
 */
function plain(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

// ---------------------------------------------------------------- code and Markdown

/** @param {unknown} value @returns {DataResult} */
export function codeFromData(value) {
  return wrapped(value, {
    keys: ['code', 'content', 'source', 'text'],
    attributes: {
      language: 'language', lang: 'language', label: 'label', filename: 'label', file: 'label',
      title: 'label', highlightLines: 'highlight-lines', highlight: 'highlight-lines',
      startLine: 'start-line', lineNumbers: 'line-numbers', wrap: 'wrap', tabSize: 'tab-size',
    }, // prettier-ignore
    // Any other value is shown as JSON.
    otherwise: (v) => ({ content: jsonText(v), attributes: { language: 'json' } }),
  });
}

/** @param {unknown} value @returns {DataResult} */
export function markdownFromData(value) {
  return wrapped(value, {
    keys: ['markdown', 'md', 'content', 'text', 'body'],
    attributes: { label: 'label', title: 'label', toc: 'toc', anchors: 'anchors' },
  });
}

// ---------------------------------------------------------------- tables

/**
 * @param {string} cell
 * @returns {string}
 */
function csvCell(cell) {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Rows as objects (columns from their keys, in order of appearance), rows as arrays, or
 * `{ columns, rows }`.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function csvFromData(value) {
  if (typeof value === 'string') return { content: value };
  const rows = listIn(value, ['rows', 'data', 'items', 'records']) ?? [];
  const declared = isObject(value) ? listIn(value.columns, []) : null;
  /** @type {string[]} */
  let header = (declared ?? []).map((column) => plain(isObject(column) ? (column.key ?? column.name) : column)); // prettier-ignore
  /** @type {string[][]} */
  let body;
  if (rows.every(Array.isArray)) {
    body = rows.map((row) => /** @type {unknown[]} */ (row).map(plain));
  } else {
    if (!header.length) {
      /** @type {Set<string>} */
      const keys = new Set();
      for (const row of rows) if (isObject(row)) for (const key of Object.keys(row)) keys.add(key);
      header = [...keys];
    }
    body = rows.filter(isObject).map((row) => header.map((key) => (Object.hasOwn(row, key) ? plain(row[key]) : ''))); // prettier-ignore
  }
  const lines = header.length ? [header, ...body] : body;
  return { content: lines.map((cells) => cells.map(csvCell).join(',')).join('\n') };
}

// ---------------------------------------------------------------- terminal and logs

/**
 * A session as text, or a list of `{ command, output, prompt }` (or plain lines).
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function terminalFromData(value) {
  const list = listIn(value, ['commands', 'session', 'steps', 'lines']);
  if (!list) return wrapped(value, { keys: ['session', 'transcript', 'text', 'content'], attributes: { prompt: 'prompt', label: 'label' } }); // prettier-ignore
  /** @type {string[]} */
  const lines = [];
  for (const item of list) {
    if (!isObject(item)) {
      lines.push(plain(item));
      continue;
    }
    if (item.command !== undefined)
      lines.push(`${plain(item.prompt) || '$'} ${plain(item.command)}`);
    const output = Array.isArray(item.output)
      ? item.output.map(plain).join('\n')
      : plain(item.output);
    if (output) lines.push(output.replace(/\n$/, ''));
  }
  const prompt = isObject(value) ? value.prompt : undefined;
  return {
    content: lines.join('\n'),
    attributes: { prompt, label: isObject(value) ? value.label : undefined },
  };
}

/**
 * Entries as JSON lines: a list of objects or strings, or `{ entries }`.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function logFromData(value) {
  const list = listIn(value, ['entries', 'logs', 'lines', 'events', 'items']);
  if (!list) return wrapped(value, { keys: ['log', 'text', 'content'], attributes: { label: 'label' } }); // prettier-ignore
  return {
    content: list
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('\n'),
  };
}

// ---------------------------------------------------------------- configuration

/**
 * An object of variables (`{ PORT: 8080 }`), or a list of `{ key, value, comment }`.
 * Values that need it are quoted, and keys a dotenv file cannot hold are left out.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function envFromData(value) {
  if (typeof value === 'string') return { content: value };
  /** @type {[string, unknown, string][]} */
  let entries = [];
  const list = listIn(value, ['variables', 'entries', 'items']);
  if (list) {
    entries = list.filter(isObject).map((item) => [plain(item.key ?? item.name), item.value, plain(item.comment)]); // prettier-ignore
  } else if (isObject(value)) {
    const source = isObject(value.variables) ? value.variables : value;
    entries = Object.entries(source).map(([key, v]) => [key, v, '']);
  }
  const lines = [];
  for (const [key, raw, comment] of entries) {
    if (!/^[A-Za-z_][\w.-]*$/.test(key)) continue;
    if (comment) lines.push(...comment.split('\n').map((line) => `# ${line}`));
    const text = plain(raw);
    lines.push(`${key}=${/^[\w@%+=:,./-]*$/.test(text) ? text : JSON.stringify(text)}`);
  }
  return { content: lines.join('\n') };
}

/**
 * @param {string} key
 * @returns {string} A TOML key, quoted when it is not bare.
 */
function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/**
 * @param {unknown} value
 * @returns {string} An inline TOML value.
 */
function tomlValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value))
    return `[${value
      .filter((v) => v !== null)
      .map(tomlValue)
      .join(', ')}]`;
  if (isObject(value))
    return `{ ${Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v)}`).join(', ')} }`; // prettier-ignore
  return '""';
}

/**
 * @param {Record<string, any>} table
 * @param {string[]} path
 * @param {string[]} out
 * @param {number} depth
 */
function writeTable(table, path, out, depth) {
  const entries = Object.entries(table).filter(([, v]) => v !== null && v !== undefined);
  const isTableArray = (/** @type {unknown} */ v) =>
    Array.isArray(v) && v.length > 0 && v.every(isObject);
  const nested = (/** @type {unknown} */ v) => depth < 32 && (isObject(v) || isTableArray(v));
  for (const [key, v] of entries) if (!nested(v)) out.push(`${tomlKey(key)} = ${tomlValue(v)}`);
  for (const [key, v] of entries) {
    if (!nested(v)) continue;
    const name = [...path, tomlKey(key)];
    if (Array.isArray(v)) {
      for (const item of v) {
        out.push('', `[[${name.join('.')}]]`);
        writeTable(item, name, out, depth + 1);
      }
    } else {
      out.push('', `[${name.join('.')}]`);
      writeTable(v, name, out, depth + 1);
    }
  }
}

/**
 * An object as a TOML document. TOML has no null: such values are left out.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function tomlFromData(value) {
  if (typeof value === 'string') return { content: value };
  if (!isObject(value)) return { content: '' };
  /** @type {string[]} */
  const out = [];
  writeTable(value, [], out, 0);
  return { content: out.join('\n').replace(/^\n+/, '') };
}

// ---------------------------------------------------------------- XML

/**
 * @param {string} text
 * @param {boolean} [attribute]
 * @returns {string}
 */
function escapeXml(text, attribute = false) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // eslint-disable-next-line no-control-regex
  const clean = escaped.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return attribute ? clean.replace(/"/g, '&quot;') : clean;
}

/**
 * @param {string} name
 * @returns {string | null} The name when XML allows it.
 */
function xmlName(name) {
  return /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(name) && !/^xml/i.test(name) ? name : null;
}

/**
 * @param {string} name
 * @param {unknown} value
 * @param {string} indent
 * @param {number} depth
 * @returns {string[]}
 */
function writeXml(name, value, indent, depth) {
  // A key XML does not allow as a name is kept as an attribute of an <item>.
  const tag = xmlName(name) ?? 'item';
  const attribute = tag === name ? '' : ` name="${escapeXml(name, true)}"`;
  if (Array.isArray(value)) return value.flatMap((item) => writeXml(name, item, indent, depth));
  if (!isObject(value) || depth > 64) {
    const text = value === null || value === undefined ? '' : escapeXml(plain(value));
    return [
      text ? `${indent}<${tag}${attribute}>${text}</${tag}>` : `${indent}<${tag}${attribute}/>`,
    ];
  }
  const attributes = isObject(value['@']) ? value['@'] : {};
  const own = Object.entries(attributes)
    .filter(([key]) => xmlName(key))
    .map(([key, v]) => ` ${key}="${escapeXml(plain(v), true)}"`)
    .join('');
  const children = Object.entries(value).filter(([key]) => key !== '@' && key !== '#text');
  const text = value['#text'] === undefined ? '' : escapeXml(plain(value['#text']));
  if (!children.length) return [`${indent}<${tag}${attribute}${own}>${text}</${tag}>`];
  return [
    `${indent}<${tag}${attribute}${own}>${text}`,
    ...children.flatMap(([key, v]) => writeXml(key, v, `${indent}  `, depth + 1)),
    `${indent}</${tag}>`,
  ];
}

/**
 * XML text, or a value written as XML: keys are elements, `@` holds attributes and `#text`
 * text, lists repeat their element. A value with several keys gets a `<root>` element.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function xmlFromData(value) {
  if (typeof value === 'string') return { content: value };
  if (isObject(value) && typeof value.xml === 'string') return { content: value.xml };
  const keys = isObject(value) ? Object.keys(value) : [];
  const lines =
    isObject(value) && keys.length === 1 && !Array.isArray(value[keys[0]])
      ? writeXml(keys[0], value[keys[0]], '', 0)
      : writeXml('root', value, '', 0);
  return { content: `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join('\n')}` };
}

// ---------------------------------------------------------------- binary, patterns, schedules

/**
 * Bytes as `hex`, `base64`, a list of numbers, or `{ bytes }`.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function hexFromData(value) {
  const bytes = listIn(value, ['bytes', 'data']);
  if (bytes && bytes.every((b) => Number.isInteger(b) && Number(b) >= 0 && Number(b) <= 255))
    return {
      content: bytes.map((b) => Number(b).toString(16).padStart(2, '0')).join(' '),
      attributes: { format: 'hex' },
    };
  if (isObject(value)) {
    if (typeof value.base64 === 'string') return { content: value.base64, attributes: { format: 'base64', label: value.label } }; // prettier-ignore
    if (typeof value.hex === 'string') return { content: value.hex, attributes: { format: 'hex', label: value.label } }; // prettier-ignore
  }
  return { content: typeof value === 'string' ? value : '' };
}

/**
 * `{ pattern, flags, replace, text }`; a string is the text to test.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function regexFromData(value) {
  if (!isObject(value)) return { content: plain(value) };
  return {
    content: plain(value.text ?? value.test ?? value.input ?? value.subject),
    attributes: {
      pattern: value.pattern ?? value.regex ?? value.source,
      flags: value.flags,
      replace: value.replace ?? value.replacement,
    },
  };
}

/** @param {unknown} value @returns {DataResult} */
export function jwtFromData(value) {
  return wrapped(value, {
    keys: ['token', 'jwt', 'access_token', 'id_token', 'accessToken', 'idToken'],
    attributes: { now: 'now' },
    otherwise: () => ({ content: '' }),
  });
}

/**
 * An expression, `{ expression, timezone }`, or jobs `[{ schedule, command, comment }]`.
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function cronFromData(value) {
  const list = listIn(value, ['jobs', 'entries', 'crontab', 'schedules']);
  if (list) {
    const lines = [];
    for (const item of list) {
      if (!isObject(item)) {
        lines.push(plain(item));
        continue;
      }
      if (item.comment)
        lines.push(
          ...plain(item.comment)
            .split('\n')
            .map((line) => `# ${line}`),
        );
      lines.push([plain(item.schedule ?? item.expression ?? item.cron), plain(item.user), plain(item.command)].filter(Boolean).join(' ')); // prettier-ignore
    }
    return {
      content: lines.join('\n'),
      attributes: isObject(value) ? { timezone: value.timezone ?? value.timeZone } : {},
    };
  }
  return wrapped(value, {
    keys: ['expression', 'schedule', 'cron', 'crontab'],
    attributes: { timezone: 'timezone', timeZone: 'timezone', count: 'count', label: 'label' },
    otherwise: () => ({ content: '' }),
  });
}

/**
 * PEM text, `{ pem }`, or a list of certificates (a chain).
 *
 * @param {unknown} value
 * @returns {DataResult}
 */
export function certFromData(value) {
  const list = listIn(value, ['certificates', 'chain', 'certs']);
  if (list)
    return {
      content: list
        .map((item) =>
          isObject(item) ? plain(item.pem ?? item.certificate ?? item.cert) : plain(item),
        )
        .filter(Boolean)
        .join('\n'),
    };
  return wrapped(value, {
    keys: ['pem', 'certificate', 'cert', 'csr'],
    attributes: { label: 'label', now: 'now' },
    otherwise: () => ({ content: '' }),
  });
}
