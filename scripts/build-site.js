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
await writeFile(`${out}/assets/search-index.json`, JSON.stringify(await searchIndex()));
console.log(`Website assembled in ${out}/`);

/**
 * Search index for the site-wide search: page titles and section headings of the site
 * pages, and every heading of the docs (with the same anchors as <vt-markdown>).
 *
 * @returns {Promise<{ t: string, p: string, u: string }[]>} Title, page, URL.
 */
async function searchIndex() {
  /** @type {{ t: string, p: string, u: string }[]} */
  const entries = [];
  // Titles become plain text. Tags are removed until none is left (a single pass would
  // turn "<scr<b>ipt>" into "<script>"); the index is only ever shown with textContent.
  const text = (/** @type {string} */ html) => {
    let plain = html;
    let previous;
    do {
      previous = plain;
      plain = plain.replace(/<[^<>]*>/g, '');
    } while (plain !== previous);
    return plain
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const PAGES = {
    'index.html': 'Home',
    'examples.html': 'Examples',
    'integrations.html': 'Integrations',
    'playground.html': 'Playground',
    'themes.html': 'Themes',
    'lab.html': 'Stress lab',
    'legal.html': 'Legal',
  };
  for (const [file, page] of Object.entries(PAGES)) {
    const html = await readFile(`site/${file}`, 'utf8');
    entries.push({ t: page, p: 'Page', u: file });
    // Headings in order, with the id of the nearest section or element before them.
    let anchor = '';
    for (const match of html.matchAll(/<(section|article|h2|h3)\b([^>]*)>([\s\S]*?)(?=<)/g)) {
      const [, tag, attrs] = match;
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
      if (tag === 'section' || tag === 'article') {
        if (id) anchor = id;
        continue;
      }
      const end = html.indexOf(`</${tag}>`, match.index);
      const title = text(html.slice(match.index, end));
      if (!title || title.length > 90) continue;
      entries.push({ t: title, p: page, u: `${file}#${id ?? anchor}`.replace(/#$/, '') });
    }
  }

  const slug = (/** @type {string} */ heading, /** @type {Map<string, number>} */ used) => {
    const base =
      heading
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-')
        .slice(0, 100) || 'section';
    let id = base;
    for (let n = used.get(base) ?? 0; used.has(id); n += 1) {
      id = `${base}-${n + 1}`;
      used.set(base, n + 1);
    }
    used.set(id, used.get(id) ?? 0);
    return id;
  };
  const docs = ['', 'components/'];
  for (const dir of docs) {
    for (const file of (await readdir(`docs/${dir}`)).filter((f) => f.endsWith('.md'))) {
      const page = `${dir}${file.replace(/\.md$/, '')}`;
      if (page === 'README' || page === 'DESIGN_SYSTEM') continue;
      const markdown = await readFile(`docs/${dir}${file}`, 'utf8');
      /** @type {Map<string, number>} */
      const used = new Map();
      let fenced = false;
      let pageTitle = page;
      for (const line of markdown.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        if (fenced) continue;
        const heading = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
        if (!heading) continue;
        // Visible heading text: inline code, links and emphasis without their syntax.
        const title = heading[2]
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/[`*_]/g, '')
          .trim();
        const id = slug(title, used);
        if (heading[1] === '#') {
          pageTitle = title;
          entries.push({ t: title, p: 'Docs', u: `docs.html?page=${page}` });
        } else entries.push({ t: title, p: pageTitle, u: `docs.html?page=${page}#${id}` });
      }
    }
  }
  return entries;
}
