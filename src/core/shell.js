// @ts-check
/**
 * Quoting words for shells, so a command shown to be copied does what it says, whatever the
 * names in it (packages, files) come from.
 *
 * @module core/shell
 */

/**
 * A word as a POSIX shell reads it back: single-quoted unless it only holds safe characters.
 *
 * @param {string} word
 * @returns {string}
 */
export function shellQuote(word) {
  return /^[\w@%+=:,./~^-]+$/.test(word) && !word.startsWith('~')
    ? word
    : `'${word.replace(/'/g, `'\\''`)}'`;
}

/**
 * A word as PowerShell reads it back: a verbatim single-quoted string.
 *
 * @param {string} word
 * @returns {string}
 */
export function powershellQuote(word) {
  return /^[\w.\\:-]+$/.test(word) ? word : `'${word.replace(/['‘’‚‛]/g, "''")}'`;
}
