/**
 * Reports gzipped sizes and fails when a budget is exceeded.
 * - full bundles (every component);
 * - each per-component ES module with everything it loads (its shared chunks included).
 * `node scripts/size.js --analyze` also prints the size of each module of the full bundle.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const KB = 1024;
/** Full bundles: six components, highlight.js core and 10 languages, marked, DOMPurify. */
const BUNDLES = { 'dist/vitrine.min.js': 104 * KB, 'dist/vitrine.esm.js': 104 * KB };
/** Per-component modules (what a page using only that element downloads). */
const COMPONENTS = {
  'vt-code': 58 * KB,
  'vt-markdown': 76 * KB,
  'vt-json': 62 * KB,
  'vt-csv': 60 * KB,
  'vt-tags': 32 * KB,
  'vt-diff': 64 * KB,
  'vt-terminal': 60 * KB,
  'vt-tree': 40 * KB,
  'vt-http': 66 * KB,
};

const rawCss = {
  name: 'raw-css',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /\.css\?raw$/ }, (a) => ({
      path: new URL(a.path.replace(/\?raw$/, ''), `file://${a.resolveDir}/`).pathname,
      namespace: 'raw-css',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-css' }, async (a) => ({
      contents: await readFile(a.path, 'utf8'),
      loader: 'text',
    }));
  },
};

let failed = false;
const report = (
  /** @type {string} */ name,
  /** @type {number} */ size,
  /** @type {number} */ budget,
) => {
  const ok = size <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} ${(size / KB).toFixed(1).padStart(6)} KB gzip (budget ${budget / KB} KB)`,
  );
};

for (const [file, budget] of Object.entries(BUNDLES))
  report(file, gzipSync(await readFile(file)).length, budget);

for (const [name, budget] of Object.entries(COMPONENTS)) {
  const result = await build({
    entryPoints: [`src/entries/${name}.js`],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    plugins: [rawCss],
    logLevel: 'silent',
  });
  report(`${name} (module)`, gzipSync(result.outputFiles[0].contents).length, budget);
}

if (process.argv.includes('--analyze')) {
  const result = await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    metafile: true,
    plugins: [rawCss],
  });
  /** @type {Record<string, number>} */
  const groups = {};
  for (const [file, info] of Object.entries(Object.values(result.metafile.outputs)[0].inputs)) {
    const key = /highlight\.js\/(?:lib|es)\/languages\//.test(file)
      ? `highlight.js language: ${file.split('/').pop()}`
      : file.includes('node_modules/')
        ? file.split('node_modules/')[1].split('/')[0]
        : file;
    groups[key] = (groups[key] ?? 0) + info.bytesInOutput;
  }
  for (const [key, bytes] of Object.entries(groups).sort((a, b) => b[1] - a[1])) {
    console.log(`${(bytes / KB).toFixed(1).padStart(7)} KB  ${key}`);
  }
}

if (failed) process.exit(1);
