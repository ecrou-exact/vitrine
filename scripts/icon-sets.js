/**
 * Builds the icon sets of <vt-icon-picker> into dist/vendor/icons/<set>.js, loaded only when a
 * picker shows that set: Font Awesome Free (solid, regular, brands), Lucide, Bootstrap Icons and
 * the flags of flag-icons.
 *
 * Each SVG is read once here into a compact tree, `[tag, attributes, ...children]`, or the path
 * data alone when an icon is one path. The picker draws them with DOM methods and an allow-list
 * of SVG elements and attributes: no markup is ever parsed in the browser.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const require = createRequire(import.meta.url);
const dir = (name) => dirname(require.resolve(`${name}/package.json`));

/** Attributes kept; editor leftovers (`class`, `style`, `xmlns`…) are dropped. */
const KEEP = new Set([
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'fill-rule', 'clip-rule', 'fill-opacity',
  'opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width',
  'height', 'points', 'id', 'clip-path', 'href', 'gradientUnits', 'gradientTransform', 'offset',
  'stop-color', 'stop-opacity', 'fx', 'fy', 'markerWidth', 'markerHeight', 'marker-mid', 'viewBox',
]); // prettier-ignore

/**
 * A small XML reader for the well-formed SVG files of these packages.
 *
 * @param {string} text
 * @returns {{ tag: string, attrs: Record<string, string>, children: any[] }}
 */
export function parseSvg(text) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (const [, closing, name, attrText, selfClosing] of clean.matchAll(tag)) {
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const [, key, , value] of attrText.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))
      attrs[key] = value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const node = { tag: name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root.children[0];
}

/**
 * @param {{ tag: string, attrs: Record<string, string>, children: any[] }} node
 * @returns {any[]}
 */
function compact(node) {
  const attrs = {};
  for (const [key, value] of Object.entries(node.attrs)) {
    const name = key === 'xlink:href' ? 'href' : key;
    if (KEEP.has(name)) attrs[name] = value;
  }
  return [node.tag, attrs, ...node.children.map(compact)];
}

/**
 * The body of an icon: the path data alone for one path that only needs the set's fill,
 * else the trees of the children of `<svg>`.
 *
 * @param {string} text
 * @returns {{ body: string | any[], viewBox: string }}
 */
function readIcon(text) {
  const svg = parseSvg(text);
  const children = svg.children.map(compact);
  const [first] = children;
  const lone = children.length === 1 && first[0] === 'path' && Object.keys(first[1]).every((k) => k === 'd' || (k === 'fill' && first[1].fill === 'currentColor')); // prettier-ignore
  return { body: lone ? first[1].d : children, viewBox: svg.attrs.viewBox ?? '' };
}

async function fontAwesome() {
  const root = dir('@fortawesome/fontawesome-free');
  const meta = loadYaml(await readFile(join(root, 'metadata/icons.yml'), 'utf8'));
  const sets = [];
  for (const [style, label] of [
    ['solid', 'Solid'],
    ['regular', 'Regular'],
    ['brands', 'Brands'],
  ]) {
    const files = (await readdir(join(root, 'svgs', style)))
      .filter((f) => f.endsWith('.svg'))
      .sort();
    const icons = [];
    for (const file of files) {
      const name = file.slice(0, -4);
      const { body, viewBox } = readIcon(await readFile(join(root, 'svgs', style, file), 'utf8'));
      const info = meta[name] ?? {};
      const terms = [info.label, ...(info.search?.terms ?? []), ...(info.aliases?.names ?? [])].filter((t) => typeof t === 'string'); // prettier-ignore
      const keywords = [...new Set(terms.map((t) => t.toLowerCase()))].join(' ');
      icons.push(
        viewBox === '0 0 512 512' ? [name, body, keywords] : [name, body, keywords, viewBox],
      );
    }
    sets.push({
      id: `fa-${style}`,
      label: `Font Awesome ${label}`,
      license: 'CC BY 4.0',
      licenseUrl: 'https://fontawesome.com/license/free',
      // CC BY 4.0: the attribution Font Awesome puts in its own SVG files.
      attribution: `Font Awesome Free ${JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version} by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0)`, // prettier-ignore
      code: style === 'brands' ? 'fa-brands fa-{name}' : `fa-${style} fa-{name}`,
      viewBox: '0 0 512 512',
      attrs: { fill: 'currentColor' },
      icons,
    });
  }
  return sets;
}

async function lucide() {
  const root = dir('lucide-static');
  const nodes = JSON.parse(await readFile(join(root, 'icon-nodes.json'), 'utf8'));
  const tags = JSON.parse(await readFile(join(root, 'tags.json'), 'utf8'));
  const icons = Object.keys(nodes)
    .sort()
    .map((name) => [name, nodes[name].map(([tag, attrs]) => [tag, attrs]), [...new Set(tags[name] ?? [])].join(' ')]); // prettier-ignore
  return {
    id: 'lucide',
    label: 'Lucide',
    license: 'ISC',
    licenseUrl: 'https://lucide.dev/license',
    code: 'lucide-{name}',
    viewBox: '0 0 24 24',
    attrs: { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, // prettier-ignore
    icons,
  };
}

async function bootstrap() {
  const root = join(dir('bootstrap-icons'), 'icons');
  const files = (await readdir(root)).filter((f) => f.endsWith('.svg')).sort();
  const icons = [];
  for (const file of files) {
    const { body } = readIcon(await readFile(join(root, file), 'utf8'));
    icons.push([file.slice(0, -4), body, '']);
  }
  return {
    id: 'bootstrap',
    label: 'Bootstrap Icons',
    license: 'MIT',
    licenseUrl: 'https://github.com/twbs/icons/blob/main/LICENSE',
    code: 'bi bi-{name}',
    viewBox: '0 0 16 16',
    attrs: { fill: 'currentColor' },
    icons,
  };
}

async function flags() {
  const root = dir('flag-icons');
  const countries = JSON.parse(await readFile(join(root, 'country.json'), 'utf8'));
  const icons = [];
  for (const c of countries) {
    const text = await readFile(join(root, 'flags/1x1', `${c.code}.svg`), 'utf8').catch(() => null);
    if (!text) continue;
    const { body } = readIcon(text);
    const keywords = [c.name, c.code, c.capital, c.continent]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    icons.push([c.code, typeof body === 'string' ? [['path', { d: body }]] : body, keywords, '', c.name]); // prettier-ignore
  }
  icons.sort((a, b) => a[4].localeCompare(b[4]));
  return {
    id: 'flags',
    label: 'Flags',
    license: 'MIT',
    licenseUrl: 'https://github.com/lipis/flag-icons/blob/main/LICENSE',
    code: 'fi fi-{name}',
    viewBox: '0 0 512 512',
    attrs: {},
    icons,
  };
}

/**
 * Writes every set, and an index of their names, sizes and licenses.
 *
 * @param {string} out - dist/vendor/icons
 */
export async function buildIconSets(out) {
  const sets = [...(await fontAwesome()), await lucide(), await bootstrap(), await flags()];
  await mkdir(out, { recursive: true });
  await Promise.all(sets.map((set) => writeFile(join(out, `${set.id}.js`), `export default ${JSON.stringify(set)};\n`))); // prettier-ignore
  return sets.map(({ id, label, icons }) => ({ id, label, count: icons.length }));
}
