/**
 * Reports gzipped sizes and fails when a budget is exceeded.
 * - full bundles (every component);
 * - each per-component ES module with everything it loads (its shared chunks included).
 * `node scripts/size.js --analyze` also prints the size of each module of the full bundle.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;
/** Full bundles: forty-five components, highlight.js core and 10 languages, marked, DOMPurify. */
const BUNDLES = {
  'dist/vitrine.min.js': 390 * KB,
  'dist/vitrine.esm.js': 390 * KB,
  // Only finds the elements of a page and imports their modules.
  'dist/vitrine-loader.js': 2 * KB,
};
/** Per-component modules (what a page using only that element downloads). */
const COMPONENTS = {
  'vt-code': 62 * KB,
  'vt-markdown': 80 * KB,
  'vt-json': 66 * KB,
  'vt-csv': 63 * KB,
  'vt-tags': 34 * KB,
  'vt-diff': 68 * KB,
  'vt-terminal': 64 * KB,
  'vt-tree': 64 * KB,
  'vt-http': 69 * KB,
  'vt-log': 66 * KB,
  'vt-env': 62 * KB,
  'vt-chart': 64 * KB,
  'vt-openapi': 66 * KB,
  'vt-timeline': 64 * KB,
  'vt-git': 66 * KB,
  'vt-job': 66 * KB,
  'vt-hex': 58 * KB,
  'vt-regex': 66 * KB,
  'vt-toml': 69 * KB,
  'vt-cron': 67 * KB,
  'vt-jwt': 66 * KB,
  'vt-xml': 67 * KB,
  'vt-cert': 68 * KB,
  'vt-yaml': 67 * KB,
  'vt-table': 74 * KB,
  'vt-status': 64 * KB,
  'vt-calendar': 69 * KB,
  'vt-pricing': 63 * KB,
  'vt-faq': 61 * KB,
  'vt-gallery': 62 * KB,
  'vt-stats': 62 * KB,
  'vt-testimonials': 62 * KB,
  'vt-countdown': 62 * KB,
  'vt-field': 66 * KB,
  'vt-board': 71 * KB,
  'vt-search': 64 * KB,
  'vt-upload': 66 * KB,
  'vt-menu': 64 * KB,
  'vt-date-picker': 68 * KB,
  'vt-sql': 70 * KB,
  'vt-test-report': 70 * KB,
  'vt-trace': 66 * KB,
  'vt-notebook': 86 * KB,
  'vt-math': 63 * KB,
  'vt-diagram': 62 * KB,
};

const rawCss = {
  name: 'raw-css',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /\.css\?raw$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path.replace(/\?raw$/, '')),
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
