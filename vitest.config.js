import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';

/** Loads `*.css?raw` as a string, exactly like the esbuild build does. */
const rawCss = {
  name: 'vitrine-raw-css',
  enforce: 'pre',
  /** @param {string} id */
  resolveId(id, importer) {
    if (!id.endsWith('.css?raw') || !importer) return null;
    // The virtual id must not end with ".css", or Vitest's CSS handling empties it.
    return `\0raw-css:${new URL(id.replace(/\?raw$/, ''), `file://${importer}`).pathname}.js`;
  },
  /** @param {string} id */
  async load(id) {
    if (!id.startsWith('\0raw-css:')) return null;
    const css = await readFile(id.slice('\0raw-css:'.length, -'.js'.length), 'utf8');
    return `export default ${JSON.stringify(css)};`;
  },
};

export default defineConfig({
  plugins: [rawCss],
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/security/**/*.test.js'],
    passWithNoTests: true,
  },
});
