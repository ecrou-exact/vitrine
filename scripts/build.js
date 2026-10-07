/**
 * Build script: bundles the library into an ES module and a minified IIFE.
 * Maintainers only — consumers use the files committed in dist/.
 */
import { build, context } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');

const banner = {
  js: `/*! Vitrine v${pkg.version} | MIT License | https://github.com/ecrou-exact/vitrine */`,
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: true,
  target: ['es2022'],
  legalComments: 'eof',
  banner,
  define: { __VITRINE_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
};

const builds = [
  { ...shared, entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/vitrine.esm.js' },
  {
    ...shared,
    entryPoints: ['src/auto-define.js'],
    format: 'iife',
    minify: true,
    outfile: 'dist/vitrine.min.js',
  },
];

if (watch) {
  for (const options of builds) {
    const ctx = await context(options);
    await ctx.watch();
  }
} else {
  await Promise.all(builds.map((options) => build(options)));
}
