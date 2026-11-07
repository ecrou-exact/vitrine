// @ts-check
/**
 * Items of <vt-menu>: read from JSON or from lines of text, with submenus, check boxes,
 * radio groups, separators and headings.
 *
 * @module components/menu/items
 */

/** Most items read, all levels together. */
export const MAX_ITEMS = 500;
/** Deepest submenu. */
export const MAX_DEPTH = 4;

/**
 * @typedef {object} MenuItem
 * @property {string} id - Unique id, given or made from the label.
 * @property {'item' | 'checkbox' | 'radio' | 'separator' | 'heading'} type
 * @property {string} label
 * @property {string} description
 * @property {string} shortcut - Shown on the right, such as "Ctrl+S".
 * @property {string} icon - A name of the icon set.
 * @property {string} href - A link, safe schemes only.
 * @property {string} target
 * @property {boolean} disabled
 * @property {boolean} danger - A destructive action, shown in red.
 * @property {boolean} checked
 * @property {string} group - Name of the radio group.
 * @property {string} value - Value of a radio item.
 * @property {MenuItem[]} items - A submenu.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/**
 * @param {string} label
 * @returns {string}
 */
function slug(label) {
  return (
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

/**
 * Lines of text: one item per line; `---` is a separator, `# Title` a heading, two spaces
 * before a line put it in the submenu of the line above, `[x]` / `[ ]` make a check box, and
 * `Label | Ctrl+S` gives a shortcut.
 *
 * @param {string} source
 * @returns {unknown[]}
 */
function fromLines(source) {
  /** @type {{ items: unknown[], indent: number }[]} */
  const stack = [{ items: [], indent: -1 }];
  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    let line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (/^-{3,}$/.test(line)) {
      parent.items.push({ type: 'separator' });
      continue;
    }
    if (line.startsWith('# ')) {
      parent.items.push({ type: 'heading', label: line.slice(2) });
      continue;
    }
    /** @type {Record<string, unknown>} */
    const item = {};
    const check = /^\[( |x|X)\]\s*/.exec(line);
    if (check) {
      item.type = 'checkbox';
      item.checked = check[1] !== ' ';
      line = line.slice(check[0].length);
    }
    const [label, shortcut] = line.split(/\s+\|\s+/);
    item.label = label;
    if (shortcut) item.shortcut = shortcut;
    const children = /** @type {unknown[]} */ ([]);
    item.items = children;
    parent.items.push(item);
    stack.push({ items: children, indent });
  }
  return stack[0].items;
}

/**
 * Reads the items of a menu.
 *
 * @param {unknown} source - A JSON list (as text or as a value), or lines of text.
 * @returns {MenuItem[]}
 */
export function parseItems(source) {
  /** @type {unknown} */
  let data = source;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = fromLines(trimmed);
      }
    } else data = fromLines(trimmed);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = /** @type {Record<string, unknown>} */ (data);
    data = record.items ?? record.actions ?? [];
  }
  const ids = new Set();
  const state = { count: 0 };
  return readList(Array.isArray(data) ? data : [], 0, ids, state, '');
}

/**
 * @param {unknown[]} list
 * @param {number} depth
 * @param {Set<string>} ids
 * @param {{ count: number }} state
 * @param {string} radio - Radio group of the list, from a parent `group`.
 * @returns {MenuItem[]}
 */
function readList(list, depth, ids, state, radio) {
  /** @type {MenuItem[]} */
  const items = [];
  for (const entry of list) {
    if (state.count >= MAX_ITEMS) break;
    const item = readItem(entry, depth, ids, state, radio);
    if (!item) continue;
    // A group of radio items is written as `{ group, items: [...] }`: its items join the list.
    if (item.type === 'heading' && item.items.length) {
      items.push({ ...item, items: [] }, ...item.items);
      continue;
    }
    items.push(item);
  }
  // No separator at the ends, and never two in a row.
  return items.filter(
    (item, i) =>
      item.type !== 'separator' ||
      (i > 0 && i < items.length - 1 && items[i - 1].type !== 'separator'),
  );
}

/**
 * @param {unknown} entry
 * @param {number} depth
 * @param {Set<string>} ids
 * @param {{ count: number }} state
 * @param {string} radio
 * @returns {MenuItem | null}
 */
function readItem(entry, depth, ids, state, radio) {
  /** @type {Record<string, unknown>} */
  const record =
    typeof entry === 'string' || typeof entry === 'number'
      ? /^-{3,}$/.test(String(entry).trim())
        ? { type: 'separator' }
        : { label: String(entry) }
      : entry && typeof entry === 'object' && !Array.isArray(entry)
        ? /** @type {Record<string, unknown>} */ (entry)
        : {};
  const kind = text(record.type).toLowerCase();
  if (kind === 'separator' || kind === 'divider' || record.separator === true) {
    state.count += 1;
    return blank('separator', `sep-${state.count}`);
  }
  const label = text(record.label ?? record.title ?? record.name ?? record.text).slice(0, 200);
  const group = text(record.group ?? record.radio);
  // `{ group: "Sort", type: "radio", items: [...] }` is a heading over radio items.
  if (Array.isArray(record.items) && (kind === 'radio' || kind === 'group' || kind === 'heading')) {
    state.count += 1;
    const heading = blank('heading', uniqueId(`group-${slug(label || group)}`, ids));
    heading.label = label || group;
    heading.items = readList(record.items, depth, ids, state, kind === 'radio' ? group || heading.id : radio); // prettier-ignore
    return heading;
  }
  if (kind === 'heading' || kind === 'header') {
    if (!label) return null;
    state.count += 1;
    const heading = blank('heading', uniqueId(`heading-${slug(label)}`, ids));
    heading.label = label;
    return heading;
  }
  if (!label) return null;
  state.count += 1;
  const type = kind === 'checkbox' || kind === 'check' ? 'checkbox' : kind === 'radio' || radio || group ? 'radio' : 'item'; // prettier-ignore
  const item = blank(type, uniqueId(text(record.id ?? record.value) || slug(label), ids));
  item.label = label;
  item.description = text(record.description ?? record.hint).slice(0, 300);
  item.shortcut = text(record.shortcut ?? record.kbd ?? record.keys).slice(0, 30);
  item.icon = text(record.icon).slice(0, 40);
  item.href = text(record.href ?? record.url ?? record.link).slice(0, 2000);
  item.target = text(record.target) === '_blank' ? '_blank' : '';
  item.disabled = record.disabled === true;
  item.danger = record.danger === true || text(record.variant) === 'danger' || text(record.tone) === 'danger'; // prettier-ignore
  item.checked = record.checked === true || record.selected === true;
  item.group = type === 'radio' ? group || radio || 'radio' : '';
  item.value = text(record.value) || item.id;
  if (Array.isArray(record.items) && depth + 1 < MAX_DEPTH && type === 'item')
    item.items = readList(record.items, depth + 1, ids, state, '');
  if (item.items.length) item.href = '';
  return item;
}

/**
 * @param {MenuItem['type']} type
 * @param {string} id
 * @returns {MenuItem}
 */
function blank(type, id) {
  return { id, type, label: '', description: '', shortcut: '', icon: '', href: '', target: '', disabled: false, danger: false, checked: false, group: '', value: '', items: [] }; // prettier-ignore
}

/**
 * @param {string} wanted
 * @param {Set<string>} ids
 * @returns {string}
 */
function uniqueId(wanted, ids) {
  const base = wanted.slice(0, 100) || 'item';
  let id = base;
  for (let n = 2; ids.has(id); n += 1) id = `${base}-${n}`;
  ids.add(id);
  return id;
}

/**
 * Items that the keyboard can reach in a list.
 *
 * @param {MenuItem[]} items
 * @returns {MenuItem[]}
 */
export function focusable(items) {
  return items.filter((item) => item.type !== 'separator' && item.type !== 'heading');
}

/**
 * Finds an item by id, at any level.
 *
 * @param {MenuItem[]} items
 * @param {string} id
 * @returns {MenuItem | null}
 */
export function findItem(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    const inner = findItem(item.items, id);
    if (inner) return inner;
  }
  return null;
}

/**
 * Where a menu fits: under (or over) its anchor, inside the viewport.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} anchor
 * @param {{ width: number, height: number }} menu
 * @param {{ width: number, height: number }} view
 * @param {{ side?: 'bottom' | 'right', align?: 'start' | 'end' }} [options]
 * @returns {{ left: number, top: number }}
 */
export function placeMenu(anchor, menu, view, options = {}) {
  const gap = 4;
  const margin = 8;
  let left;
  let top;
  if (options.side === 'right') {
    // A submenu: on the right of its item, else on the left.
    left = anchor.right + menu.width + gap <= view.width - margin ? anchor.right + gap : anchor.left - menu.width - gap; // prettier-ignore
    top = anchor.top - gap;
    if (top + menu.height > view.height - margin) top = view.height - margin - menu.height;
  } else {
    left = options.align === 'end' ? anchor.right - menu.width : anchor.left;
    top = anchor.bottom + gap;
    if (top + menu.height > view.height - margin && anchor.top - gap - menu.height >= margin)
      top = anchor.top - gap - menu.height;
  }
  left = Math.min(Math.max(margin, left), Math.max(margin, view.width - margin - menu.width));
  top = Math.max(margin, top);
  return { left: Math.round(left), top: Math.round(top) };
}
