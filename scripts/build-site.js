/**
 * Assembles the website in _site/: pages from site/, the built library (dist/),
 * the Markdown docs (rendered client-side by <vt-markdown>), brand assets and
 * self-hosted fonts. Run `npm run site`, then `node scripts/serve.js _site 4174`.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';

const out = '_site';
const FONTS = {
  '@fontsource/jetbrains-mono/files': [
    'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-500-normal.woff2',
    'jetbrains-mono-latin-700-normal.woff2',
  ],
  '@fontsource/ibm-plex-sans/files': [
    'ibm-plex-sans-latin-400-normal.woff2',
    'ibm-plex-sans-latin-400-italic.woff2',
    'ibm-plex-sans-latin-500-normal.woff2',
    'ibm-plex-sans-latin-600-normal.woff2',
  ],
};
const BRAND = /\.(svg|png|ico)$/;

await stat('dist/vitrine.min.js').catch(() => {
  throw new Error('dist/ is missing: run `npm run build` first.');
});
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/assets/fonts`, { recursive: true });
await mkdir(`${out}/brand`, { recursive: true });

await cp('site', out, { recursive: true });
await cp('dist', `${out}/dist`, { recursive: true, filter: (src) => !src.endsWith('.map') });
await cp('docs', `${out}/docs`, { recursive: true });
await cp('design-tokens.json', `${out}/design-tokens.json`);
for (const file of await readdir('brand')) {
  if (BRAND.test(file)) await cp(`brand/${file}`, `${out}/brand/${file}`);
}
for (const [dir, files] of Object.entries(FONTS)) {
  for (const file of files) await cp(`node_modules/${dir}/${file}`, `${out}/assets/fonts/${file}`);
}
// Shared partials: <!-- @head -->, <!-- @header -->, <!-- @footer -->.
const partials = {};
for (const name of ['head', 'header', 'footer'])
  partials[name] = (await readFile(`site/partials/${name}.html`, 'utf8')).trimEnd();
await rm(`${out}/partials`, { recursive: true, force: true });
for (const file of (await readdir(out)).filter((f) => f.endsWith('.html'))) {
  let html = await readFile(`${out}/${file}`, 'utf8');
  for (const [name, content] of Object.entries(partials))
    html = html.replace(`    <!-- @${name} -->`, content);
  if (/<!-- @\w+ -->/.test(html)) throw new Error(`${file}: unknown partial`);
  await writeFile(`${out}/${file}`, html);
}
console.log(`Website assembled in ${out}/`);
