// @ts-check
/**
 * CSV for spreadsheets: fields quoted when needed, and text that a spreadsheet would run as a
 * formula (`=`, `+`, `-`, `@`, tab, carriage return first) prefixed with `'`.
 *
 * @module core/csv
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function csvField(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const formula = typeof value !== 'number' && /^[=+\-@\t\r]/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text); // prettier-ignore
  const safe = formula ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {unknown[][]} rows - The header row first.
 * @returns {string}
 */
export function csvText(rows) {
  return rows.map((row) => row.map(csvField).join(',')).join('\n');
}
