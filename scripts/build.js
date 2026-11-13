/**
 * Build script: bundles the library (ES module + minified IIFE) and the lazy-loaded
 * highlight.js languages. Maintainers only — consumers use the files in dist/.
 */
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { BUNDLED_LANGUAGES, listLanguages } from './languages.js';
import { syntaxThemes } from './syntax-themes.js';
import { thirdParty } from './third-party.js';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');

const parties = await thirdParty();
const bundled = parties.filter((c) => c.where.startsWith('Library'));
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
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
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
const components = [
  'code', 'markdown', 'json', 'csv', 'tags', 'diff', 'terminal', 'tree', 'http', 'log', 'chart', 'openapi', 'env', 'timeline', 'git', 'job', 'hex', 'regex', 'toml', 'jwt', 'yaml', 'xml', 'cron', 'cert', 'table', 'status', 'calendar', 'pricing', 'faq', 'gallery', 'stats', 'testimonials', 'countdown', 'field', 'board', 'search', 'date-picker', 'menu', 'upload', 'compare', 'describe', 'treemap', 'flame', 'heatmap', 'pivot', 'diagram', 'math', 'notebook', 'trace', 'test-report', 'sql',
]; // prettier-ignore
/** @type {import('esbuild').BuildOptions} */
const split = {
  ...shared,
  entryPoints: {
    vitrine: 'src/entries/all.js',
    // configure(), locales and themes alone, shared with the elements (used by the loader).
    api: 'src/entries/api.js',
    ...Object.fromEntries(components.map((name) => [`vt-${name}`, `src/entries/vt-${name}.js`])),
  },
  format: 'esm',
  splitting: true,
  minify: true,
  outdir: 'dist/esm',
  chunkNames: 'chunks/[name]-[hash]',
};
builds.push(split);

// One small classic script that loads only the elements a page uses (dist/esm/vt-*.js).
builds.push({
  ...shared,
  entryPoints: ['src/loader.js'],
  format: 'iife',
  outfile: 'dist/vitrine-loader.js',
  minify: true,
  banner: {
    js: `/*! Vitrine v${pkg.version} | MIT License | https://github.com/ecrou-exact/vitrine */`,
  },
  define: { ...shared.define, __VITRINE_ELEMENTS__: JSON.stringify(components) },
});

// Plugins for Markdown pipelines: fenced code blocks become elements. No dependencies.
builds.push({
  ...shared,
  entryPoints: {
    'markdown-it': 'src/integrations/markdown-it.js',
    remark: 'src/integrations/remark.js',
  },
  format: 'esm',
  outdir: 'dist/integrations',
  minify: false,
  banner: {
    js: `/*! Vitrine v${pkg.version} | MIT License | https://github.com/ecrou-exact/vitrine */`,
  },
});

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

/**
 * ECharts and ZRender empty their container with `el.innerHTML = ''`. Under Trusted Types
 * (which Vitrine recommends and its website enforces) even an empty string is refused, so
 * these clearing assignments become `textContent = ''`, which removes the same children
 * without any HTML parsing. No other `innerHTML` use is reachable: tooltips are drawn on
 * the canvas (renderMode "richText").
 */
const trustedTypesSafe = {
  name: 'trusted-types-safe',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onLoad({ filter: /node_modules[\\/](?:echarts|zrender)[\\/].*\.js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      return {
        contents: source.replace(/\.innerHTML\s*=\s*(?:''|""|null)\s*;/g, ".textContent = '';"),
        loader: 'js',
      };
    });
  },
};

/** What Mermaid's HTML and style writes call instead (see src/vendor/trusted-html.js). */
const SAFE_WRITES = JSON.stringify(resolve('src/vendor/trusted-html.js').replace(/\\/g, '/'));

/**
 * Mermaid and d3 write HTML with `innerHTML` and inline styles with `setAttribute('style')`,
 * which a page with Trusted Types and a strict `style-src` refuses. At build time:
 *
 * - clearing a node becomes `textContent = ''`;
 * - the `<style>` of a diagram being drawn is filled with `textContent` and adopted as a
 *   constructable stylesheet, its rules scoped to the diagram (`adoptStyle`);
 * - every other `innerHTML` write inserts markup sanitized by Vitrine, as DOM (`setHtml`);
 * - `style` attributes are set through CSSOM (`setAttributeSafely`).
 *
 * The build fails if an `innerHTML` write is left that this cannot rewrite.
 */
const mermaidTrusted = {
  name: 'mermaid-trusted-types',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onLoad(
      { filter: /node_modules[\\/](?:mermaid|d3-selection)[\\/].*\.m?js$/ },
      async (args) => {
        const source = await readFile(args.path, 'utf8');
        /** @type {Set<string>} */
        const used = new Set();
        let contents = source
          .replace(/\.innerHTML\s*=\s*(?:''|""|null)\s*;/g, ".textContent = '';")
          // The <style> of the diagram being drawn: never an inline <style> on the page.
          .replace(
            /(\w+) = document\.createElement\("style"\);(\s*)\1\.innerHTML = rules;/g,
            (_, name, space) => {
              used.add('adoptStyle');
              return `${name} = document.createElement("vt-style");${space}__vitrine_adoptStyle(rules);`;
            },
          )
          .replace(/\b(style\w*)\.innerHTML\s*=\s*([\w$]+)\s*;/g, '$1.textContent = $2;')
          .replace(/([\w$.]+)\.innerHTML\s*=\s*([^;\n=][^;\n]*);/g, (_, target, value) => {
            used.add('setHtml');
            return `__vitrine_setHtml(${target}, ${value});`;
          })
          // d3's attr(): style attributes go through CSSOM.
          .replace(/\bthis\.setAttribute\(name, (value|v)\);/g, (_, value) => {
            used.add('setAttributeSafely');
            return `__vitrine_setAttributeSafely(this, name, ${value});`;
          })
          .replace(/([\w$.]+)\.setAttribute\(\s*("style"|'style')\s*,/g, (_, target, name) => {
            used.add('setAttributeSafely');
            return `__vitrine_setAttributeSafely(${target}, ${name},`;
          });
        if (/\.innerHTML\s*=[^=]/.test(contents))
          throw new Error(`An innerHTML write was not rewritten in ${args.path}`);
        if (used.size) {
          const names = [...used].map((name) => `${name} as __vitrine_${name}`).join(', ');
          contents = `import { ${names} } from ${SAFE_WRITES};\n${contents}`;
        }
        return { contents, loader: 'js' };
      },
    );
  },
};

/**
 * Libraries loaded on demand, never part of the main bundles: each in a file of its own,
 * whose banner names what it holds. Mermaid is split: each type of diagram is a chunk in
 * dist/vendor/mermaid/, fetched when a diagram of that type is first drawn.
 */
const VENDOR = {
  echarts: { entry: 'src/vendor/echarts.js' },
  yaml: { entry: 'src/vendor/yaml.js' },
  temml: { entry: 'src/vendor/temml.js' },
  mermaid: { entry: 'src/vendor/mermaid.js', also: ['DOMPurify'], split: true },
};

/**
 * elkjs (EPL-2.0 OR GPL-3.0) only serves Mermaid's optional "elk" layout: it is left out,
 * so that dist/ holds no copyleft code. A diagram asking for that layout gets this error.
 */
const withoutElk = {
  name: 'without-elk',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /^elkjs(?:\/|$)/ }, (args) => ({ path: args.path, namespace: 'no-elk' }));
    // Mermaid creates the layout engine when its code loads: only running it fails.
    b.onLoad({ filter: /.*/, namespace: 'no-elk' }, () => ({
      contents: `const message = 'The ELK layout is not included in Vitrine: remove "layout: elk" to use the default layout.';
export default class ELK {
  layout() { return Promise.reject(new Error(message)); }
  knownLayoutOptions() { return Promise.resolve([]); }
}`,
      loader: 'js',
    }));
  },
};

/** @type {import('esbuild').BuildOptions[]} */
const vendors = Object.entries(VENDOR).map(([name, { entry, also = [], split = false }]) => {
  const held = parties.filter(
    (c) => c.where.includes(`dist/vendor/${name}.js`) || also.includes(c.name),
  );
  return {
    entryPoints: { [name]: entry },
    outdir: 'dist/vendor',
    plugins: [trustedTypesSafe, mermaidTrusted, withoutElk],
    ...(split ? { splitting: true, chunkNames: `${name}/[name]-[hash]` } : {}),
    bundle: true,
    format: 'esm',
    minify: true,
    target: ['es2022'],
    legalComments: 'none',
    banner: {
      js: `/*! ${held.map((c) => `${c.name} ${c.version} (${c.license}) ${c.url}`).join(' | ')} | Full texts: THIRD_PARTY_NOTICES.md */`,
    },
    logLevel: 'warning',
  };
});

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
  for (const options of vendors) await build(options);
} else {
  await Promise.all([
    ...builds.map((options) => build(options)),
    build(languages),
    ...vendors.map((options) => build(options)),
  ]);
  console.log(`languages: ${lazy.length} lazy-loaded, ${BUNDLED_LANGUAGES.length} bundled`);
}
