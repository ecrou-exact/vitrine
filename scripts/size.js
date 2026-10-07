/**
 * Reports the gzipped size of the built bundles and fails when over budget.
 * `node scripts/size.js --analyze` also prints the size of each module.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/** Gzipped size budgets, in bytes. */
const BUDGETS = { 'dist/vitrine.min.js': 72 * 1024, 'dist/vitrine.esm.js': 72 * 1024 };

let failed = false;
for (const [file, budget] of Object.entries(BUDGETS)) {
  const size = gzipSync(await readFile(file)).length;
  const ok = size <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${file}: ${(size / 1024).toFixed(1)} KB gzip (budget ${budget / 1024} KB)`,
  );
}

if (process.argv.includes('--analyze')) {
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
    console.log(`${(bytes / 1024).toFixed(1).padStart(7)} KB  ${key}`);
  }
}

if (failed) process.exit(1);
