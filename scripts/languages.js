/**
 * Lists the highlight.js languages and their aliases. Shared by the generator and the build.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const hljs = require('highlight.js/lib/core');
const dir = new URL('../node_modules/highlight.js/lib/languages/', import.meta.url);

/** Languages included in the main bundle; every other language is lazy-loaded. */
export const BUNDLED_LANGUAGES = [
  'bash',
  'diff',
  'javascript',
  'json',
  'markdown',
  'plaintext',
  'python',
  'shell',
  'xml',
  'yaml',
];

/**
 * @returns {{ name: string, aliases: string[] }[]}
 */
export function listLanguages() {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.js.js'))
    .map((file) => {
      const name = file.slice(0, -3);
      const definition = require(new URL(file, dir).pathname)(hljs);
      const aliases = (definition.aliases ?? [])
        .map((alias) => String(alias).toLowerCase())
        .filter((alias) => alias !== name && /^[a-z0-9_+#.-]{1,40}$/.test(alias));
      return { name, aliases: [...new Set(aliases)].sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
