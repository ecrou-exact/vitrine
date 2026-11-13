// @ts-check
/**
 * Comparison of two datasets for <vt-compare>: records paired by a key (or by position),
 * then sorted into added, removed, changed and unchanged, with the fields that changed.
 *
 * @module components/compare/compare
 */
import { isMissing } from '../describe/describe.js';
import { toNumber } from '../pivot/pivot.js';

/** @typedef {import('../pivot/pivot.js').Dataset} Dataset */
/** @typedef {import('../pivot/pivot.js').PivotRecord} DataRecord */
/** @typedef {"added" | "removed" | "changed" | "same"} Status */

/**
 * @typedef {object} CompareRow
 * @property {Status} status
 * @property {string[]} key - Values of the key fields, or the position (from 1).
 * @property {DataRecord | null} before
 * @property {DataRecord | null} after
 * @property {string[]} changed - Fields whose value changed.
 */

/**
 * @typedef {object} Comparison
 * @property {string[]} key - Fields that pair the records; empty when paired by position.
 * @property {string[]} fields - Fields of both, those of the second first.
 * @property {string[]} addedFields - Fields only in the second.
 * @property {string[]} removedFields - Fields only in the first.
 * @property {CompareRow[]} rows
 * @property {Record<Status, number>} counts
 * @property {number} duplicates - Records whose key was already seen on their side.
 */

/** Names of fields tried as keys, in order. */
const KEYS = ['id', 'key', 'uuid', 'guid', 'code', 'sku', 'slug', 'email', 'name'];

/**
 * @param {DataRecord} record
 * @param {string[]} fields
 */
const keyOf = (record, fields) => fields.map((f) => (isMissing(record[f]) ? '' : String(record[f]).trim())); // prettier-ignore

/**
 * Whether two values are the same: missing values match, numbers are compared as numbers
 * (`1.0` and `1`), the rest as trimmed text.
 *
 * @param {DataRecord[string] | undefined} a
 * @param {DataRecord[string] | undefined} b
 */
export function sameValue(a, b) {
  const ma = isMissing(a);
  const mb = isMissing(b);
  if (ma || mb) return ma && mb;
  const na = toNumber(/** @type {any} */ (a));
  const nb = toNumber(/** @type {any} */ (b));
  if (na !== null && nb !== null) return na === nb;
  return String(a).trim() === String(b).trim();
}

/**
 * @param {DataRecord[]} records
 * @param {string} field
 */
const unique = (records, field) => {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const record of records) {
    const v = record[field];
    if (isMissing(v)) return false;
    const text = String(v).trim();
    if (seen.has(text)) return false;
    seen.add(text);
  }
  return records.length > 0;
};

/**
 * The key fields: those asked when both datasets have them; otherwise a field named like
 * an identifier, then the first field, with a value present and different in every record
 * of both; otherwise none (records are paired by position).
 *
 * @param {Dataset} before
 * @param {Dataset} after
 * @param {string[]} [asked]
 * @returns {string[]}
 */
export function chooseKey(before, after, asked) {
  const common = after.fields.filter((f) => before.fields.includes(f));
  if (asked?.length) {
    const key = asked.filter((f) => common.includes(f));
    if (key.length === asked.length) return key;
  }
  const named = KEYS.map((k) => common.find((f) => f.toLowerCase() === k)).filter((f) => f !== undefined); // prettier-ignore
  for (const field of [...named, ...common.slice(0, 1)])
    if (unique(before.records, field) && unique(after.records, field)) return [field];
  return [];
}

/**
 * Compares two datasets.
 *
 * @param {Dataset} before
 * @param {Dataset} after
 * @param {{ key?: string[] }} [options]
 * @returns {Comparison}
 */
export function compareDatasets(before, after, options = {}) {
  const key = chooseKey(before, after, options.key);
  const fields = [...after.fields, ...before.fields.filter((f) => !after.fields.includes(f))];
  const addedFields = after.fields.filter((f) => !before.fields.includes(f));
  const removedFields = before.fields.filter((f) => !after.fields.includes(f));
  const common = after.fields.filter((f) => before.fields.includes(f));
  let duplicates = 0;

  /**
   * Keys of the records, with `#2`, `#3`… for repeats so they pair in order.
   *
   * @param {DataRecord[]} records
   * @returns {string[]}
   */
  const keys = (records) => {
    /** @type {Map<string, number>} */
    const seen = new Map();
    return records.map((record, i) => {
      if (!key.length) return String(i + 1);
      const k = JSON.stringify(keyOf(record, key));
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      if (n > 1) duplicates += 1;
      return n > 1 ? `${k}#${n}` : k;
    });
  };
  const beforeKeys = keys(before.records);
  const afterKeys = keys(after.records);
  /** @type {Map<string, number>} */
  const beforeIndex = new Map(beforeKeys.map((k, i) => [k, i]));
  const afterSet = new Set(afterKeys);

  // Removed records follow the record that preceded them in the first dataset.
  /** @type {Map<string, number[]>} */
  const removedAfter = new Map();
  let previous = '';
  beforeKeys.forEach((k, i) => {
    if (afterSet.has(k)) previous = k;
    else removedAfter.set(previous, [...(removedAfter.get(previous) ?? []), i]);
  });

  /** @type {CompareRow[]} */
  const rows = [];
  /** @type {Record<Status, number>} */
  const counts = { added: 0, removed: 0, changed: 0, same: 0 };
  const label = (/** @type {DataRecord} */ record, /** @type {number} */ i) => (key.length ? keyOf(record, key) : [String(i + 1)]); // prettier-ignore
  const removed = (/** @type {string} */ k) => {
    for (const i of removedAfter.get(k) ?? []) {
      const record = before.records[i];
      rows.push({ status: 'removed', key: label(record, i), before: record, after: null, changed: [] }); // prettier-ignore
      counts.removed += 1;
    }
  };
  removed('');
  after.records.forEach((record, i) => {
    const k = afterKeys[i];
    const j = beforeIndex.get(k);
    if (j === undefined) {
      rows.push({ status: 'added', key: label(record, i), before: null, after: record, changed: [] }); // prettier-ignore
      counts.added += 1;
    } else {
      const old = before.records[j];
      const changed = common.filter((f) => !sameValue(old[f], record[f]));
      const status = changed.length ? 'changed' : 'same';
      rows.push({ status, key: label(record, i), before: old, after: record, changed });
      counts[status] += 1;
    }
    removed(k);
  });
  return { key, fields, addedFields, removedFields, rows, counts, duplicates };
}

/**
 * The comparison as CSV: a `status` column, then the fields; a changed value is written
 * `old → new`. Formulas are neutralized for spreadsheets.
 *
 * @param {Comparison} comparison
 * @param {CompareRow[]} rows
 * @returns {string}
 */
export function comparisonToCsv(comparison, rows) {
  const field = (/** @type {unknown} */ v) => {
    const text = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(text) && typeof v !== 'number' && !/^-\d+(?:\.\d+)?$/.test(text) ? `'${text}` : text; // prettier-ignore
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [['status', ...comparison.fields].map(field).join(',')];
  for (const row of rows) {
    const cells = comparison.fields.map((f) => {
      if (row.status === 'removed') return row.before?.[f];
      if (row.status === 'changed' && row.changed.includes(f)) return `${row.before?.[f] ?? ''} → ${row.after?.[f] ?? ''}`; // prettier-ignore
      return row.after?.[f] ?? row.before?.[f];
    });
    lines.push([row.status, ...cells].map(field).join(','));
  }
  return lines.join('\n');
}
