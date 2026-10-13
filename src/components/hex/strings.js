// @ts-check
/**
 * Interface strings of <vt-hex>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/hex/strings
 */

export const en = Object.freeze({
  hexLabel: 'Bytes',
  hexSize: '{size} bytes',
  hexCopyHex: 'Copy as hex',
  hexCopyBase64: 'Copy as base64',
  hexByte: 'Offset {offset}: {value}, {char}',
  hexInvalid: 'These bytes could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  hexLabel: 'Octets',
  hexSize: '{size} octets',
  hexCopyHex: 'Copier en hexadécimal',
  hexCopyBase64: 'Copier en base64',
  hexByte: 'Position {offset} : {value}, {char}',
  hexInvalid: 'Ces octets n’ont pas pu être lus : {message}',
};
