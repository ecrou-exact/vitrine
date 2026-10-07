/**
 * Build script: bundles the library (ES module + minified IIFE) and the lazy-loaded
 * highlight.js languages. Maintainers only — consumers use the files in dist/.
 */
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { BUNDLED_LANGUAGES, listLanguages } from './languages.js';
import { syntaxThemes } from './syntax-themes.js';
import { thirdParty } from './third-party.js';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');

const bundled = (await thirdParty()).filter((c) => c.where.startsWith('Library'));
const banner = {
  js: [
    `/*! Vitrine v${pkg.version} | MIT License | https://github.com/ecrou-exact/vitrine`,
    ` * Includes: ${bundled.map((c) => `${c.name} ${c.version} (${c.license})`).join(', ')}.`,
    ' * Full license texts: THIRD_PARTY_NOTICES.md */',
  ].join('\n'),
};

/** Imports `*.css?raw` as a string (same convention as Vite / Vitest). */
const rawCss = {
  name: 'raw-css',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /\.css\?raw$/ }, (args) => ({
      path: new URL(args.path.replace(/\?raw$/, ''), `file://${args.resolveDir}/`).pathname,
      namespace: 'raw-css',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-css' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: true,
  target: ['es2022', 'chrome120', 'firefox121', 'safari17'],
  legalComments: 'eof',
  banner,
  define: { __VITRINE_VERSION__: JSON.stringify(pkg.version) },
  plugins: [rawCss],
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/index.js'],
    format: 'esm',
    outfile: 'dist/vitrine.esm.js',
    minify: true,
  },
  {
    ...shared,
    entryPoints: ['src/auto-define.js'],
    format: 'iife',
    outfile: 'dist/vitrine.min.js',
    minify: true,
  },
];

// Per-component ES modules with shared chunks: load only the elements you use.
const components = ['code', 'markdown', 'json', 'csv', 'tags', 'diff', 'terminal', 'tree', 'http', 'log'];
/** @type {import('esbuild').BuildOptions} */
const split = {
  ...shared,
  entryPoints: {
    vitrine: 'src/entries/all.js',
    ...Object.fromEntries(components.map((name) => [`vt-${name}`, `src/entries/vt-${name}.js`])),
  },
  format: 'esm',
  splitting: true,
  minify: true,
  outdir: 'dist/esm',
  chunkNames: 'chunks/[name]-[hash]',
};
builds.push(split);

const lazy = listLanguages()
  .map(({ name }) => name)
  .filter((name) => !BUNDLED_LANGUAGES.includes(name));

/** @type {import('esbuild').BuildOptions} */
const languages = {
  entryPoints: Object.fromEntries(
    lazy.map((name) => [name, require.resolve(`highlight.js/lib/languages/${name}`)]),
  ),
  outdir: 'dist/languages',
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2022'],
  legalComments: 'none',
  banner: {
    js: '/*! highlight.js language | BSD-3-Clause | https://github.com/highlightjs/highlight.js */',
  },
  logLevel: 'warning',
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await copyFile('src/styles/light-dom.css', 'dist/vitrine.css');

// Syntax themes: one small stylesheet each, loaded on demand, plus an index for docs.
const themes = await syntaxThemes();
await mkdir('dist/syntax-themes', { recursive: true });
await Promise.all(
  themes.map((theme) => writeFile(`dist/syntax-themes/${theme.name}.css`, theme.css)),
);
await writeFile(
  'dist/syntax-themes/index.json',
  JSON.stringify(
    themes.map(({ name, title, dark, contrast }) => ({ name, title, dark, contrast })),
  ),
);

if (watch) {
  for (const options of builds) await (await context(options)).watch();
  await build(languages);
} else {
  await Promise.all([...builds.map((options) => build(options)), build(languages)]);
  console.log(`languages: ${lazy.length} lazy-loaded, ${BUNDLED_LANGUAGES.length} bundled`);
}
