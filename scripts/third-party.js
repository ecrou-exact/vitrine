/**
 * Third-party components shipped with Vitrine, with their exact versions and licenses.
 * Used by the build banner and by generate-notices.js.
 */
import { readFile } from 'node:fs/promises';

const pkg = async (name) =>
  JSON.parse(
    await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8'),
  );

/**
 * @returns {Promise<{ name: string, version: string, license: string, url: string, use: string, where: string, licenseFile: string, noticeFile?: string }[]>}
 */
export async function thirdParty() {
  const [hljs, marked, purify, echarts, zrender, jsyaml, temml, mono, plex] = await Promise.all(
    [
      'highlight.js',
      'marked',
      'dompurify',
      'echarts',
      'zrender',
      'js-yaml',
      'temml',
      '@fontsource/jetbrains-mono',
      '@fontsource/ibm-plex-sans',
    ].map(pkg),
  );
  return [
    {
      name: 'highlight.js',
      version: hljs.version,
      license: 'BSD-3-Clause',
      url: 'https://github.com/highlightjs/highlight.js',
      use: 'Syntax highlighting',
      where: 'Library bundle and dist/languages/',
      licenseFile: 'node_modules/highlight.js/LICENSE',
    },
    {
      name: 'marked',
      version: marked.version,
      license: 'MIT',
      url: 'https://github.com/markedjs/marked',
      use: 'Markdown parsing (GFM)',
      where: 'Library bundle',
      licenseFile: 'node_modules/marked/LICENSE',
    },
    {
      name: 'DOMPurify',
      version: purify.version,
      license: 'Apache-2.0 OR MPL-2.0',
      url: 'https://github.com/cure53/DOMPurify',
      use: 'HTML sanitization',
      where: 'Library bundle',
      licenseFile: 'node_modules/dompurify/LICENSE',
    },
    {
      name: 'Lucide',
      version: '1.52.0',
      license: 'ISC; icons derived from Feather: MIT',
      url: 'https://lucide.dev',
      use: 'Interface icons',
      where: 'Library bundle (src/core/icons.js)',
      licenseFile: 'scripts/licenses/lucide.txt',
    },
    {
      name: 'Apache ECharts',
      version: echarts.version,
      license: 'Apache-2.0',
      url: 'https://github.com/apache/echarts',
      use: 'Charts drawn by `<vt-chart>`',
      where: 'dist/vendor/echarts.js, loaded by `<vt-chart>` only',
      licenseFile: 'node_modules/echarts/LICENSE',
      noticeFile: 'node_modules/echarts/NOTICE',
    },
    {
      name: 'ZRender',
      version: zrender.version,
      license: 'BSD-3-Clause',
      url: 'https://github.com/ecomfe/zrender',
      use: 'Canvas rendering engine of Apache ECharts',
      where: 'dist/vendor/echarts.js, loaded by `<vt-chart>` only',
      licenseFile: 'node_modules/zrender/LICENSE',
    },
    {
      name: 'js-yaml',
      version: jsyaml.version,
      license: 'MIT',
      url: 'https://github.com/nodeca/js-yaml',
      use: 'YAML reading for `<vt-openapi>`',
      where: 'dist/vendor/yaml.js, loaded by `<vt-openapi>` for YAML only',
      licenseFile: 'node_modules/js-yaml/LICENSE',
    },
    {
      name: 'Temml',
      version: temml.version,
      license: 'MIT',
      url: 'https://github.com/ronkok/Temml',
      use: 'TeX to MathML for `<vt-math>`',
      where:
        'dist/vendor/temml.js, loaded by `<vt-math>` only; its MathML rules in src/styles/math.css',
      licenseFile: 'node_modules/temml/LICENSE',
    },
    ...(await mermaidParts()),
    {
      name: 'JetBrains Mono',
      version: mono.version,
      license: 'OFL-1.1',
      url: 'https://github.com/JetBrains/JetBrainsMono',
      use: 'Website font and outlined logo wordmark',
      where: 'Website and brand/ only (not in the library)',
      licenseFile: 'node_modules/@fontsource/jetbrains-mono/LICENSE',
    },
    {
      name: 'IBM Plex Sans',
      version: plex.version,
      license: 'OFL-1.1',
      url: 'https://github.com/IBM/plex',
      use: 'Website font',
      where: 'Website only (not in the library)',
      licenseFile: 'node_modules/@fontsource/ibm-plex-sans/LICENSE',
    },
  ];
}

/**
 * Mermaid and the libraries bundled with it in dist/vendor/mermaid.js and its chunks,
 * loaded by `<vt-diagram>` only. elkjs (EPL-2.0 OR GPL-3.0) is left out of the build.
 *
 * @returns {Promise<{ name: string, version: string, license: string, url: string, use: string, where: string, licenseFile: string }[]>}
 */
async function mermaidParts() {
  const where = 'dist/vendor/mermaid.js and dist/vendor/mermaid/, loaded by `<vt-diagram>` only';
  /** @type {[string, string, string, string, string][]} name, package, license, url, use */
  const parts = [
    ['Mermaid', 'mermaid', 'MIT', 'https://github.com/mermaid-js/mermaid', 'Diagrams drawn by `<vt-diagram>`'],
    ['Mermaid parser', '@mermaid-js/parser', 'MIT', 'https://github.com/mermaid-js/mermaid', 'Diagram syntax (Mermaid)'],
    ['D3', 'd3', 'ISC', 'https://github.com/d3/d3', 'Drawing and layout (Mermaid)'],
    ['d3-sankey', 'd3-sankey', 'BSD-3-Clause', 'https://github.com/d3/d3-sankey', 'Sankey diagrams (Mermaid)'],
    ['dagre-d3-es', 'dagre-d3-es', 'MIT', 'https://github.com/tbo47/dagre-es', 'Graph layout (Mermaid)'],
    ['Cytoscape.js', 'cytoscape', 'MIT', 'https://github.com/cytoscape/cytoscape.js', 'Mind map and architecture layout (Mermaid)'],
    ['cytoscape-fcose', 'cytoscape-fcose', 'MIT', 'https://github.com/iVis-at-Bilkent/cytoscape.js-fcose', 'Graph layout (Mermaid)'],
    ['cytoscape-cose-bilkent', 'cytoscape-cose-bilkent', 'MIT', 'https://github.com/cytoscape/cytoscape.js-cose-bilkent', 'Graph layout (Mermaid)'],
    ['layout-base', 'layout-base', 'MIT', 'https://github.com/iVis-at-Bilkent/layout-base', 'Graph layout (Mermaid)'],
    ['cose-base', 'cose-base', 'MIT', 'https://github.com/iVis-at-Bilkent/cose-base', 'Graph layout (Mermaid)'],
    ['KaTeX', 'katex', 'MIT', 'https://github.com/KaTeX/KaTeX', 'Math in diagram labels (Mermaid)'],
    ['Lodash', 'lodash-es', 'MIT', 'https://github.com/lodash/lodash', 'Utilities (Mermaid)'],
    ['es-toolkit', 'es-toolkit', 'MIT', 'https://github.com/toss/es-toolkit', 'Utilities (Mermaid)'],
    ['Chevrotain', 'chevrotain', 'Apache-2.0', 'https://github.com/Chevrotain/chevrotain', 'Diagram syntax (Mermaid)'],
    ['Iconify utils', '@iconify/utils', 'MIT', 'https://github.com/iconify/iconify', 'Icons in diagrams (Mermaid)'],
    ['venn.js', '@upsetjs/venn.js', 'MIT', 'https://github.com/upsetjs/venn.js', 'Venn diagrams (Mermaid)'],
    ['khroma', 'khroma', 'MIT', 'https://github.com/fabiospampinato/khroma', 'Colors (Mermaid)'],
    ['Rough.js', 'roughjs', 'MIT', 'https://github.com/rough-stuff/rough', 'Hand-drawn look (Mermaid)'],
    ['Stylis', 'stylis', 'MIT', 'https://github.com/thysultan/stylis', 'Diagram CSS (Mermaid)'],
    ['Day.js', 'dayjs', 'MIT', 'https://github.com/iamkun/dayjs', 'Dates in Gantt charts (Mermaid)'],
    ['sanitize-url', '@braintree/sanitize-url', 'MIT', 'https://github.com/braintree/sanitize-url', 'Link checks (Mermaid)'],
    ['ts-dedent', 'ts-dedent', 'MIT', 'https://github.com/tamino-martinius/node-ts-dedent', 'Text layout (Mermaid)'],
  ]; // prettier-ignore
  const { readdir } = await import('node:fs/promises');
  return Promise.all(
    parts.map(async ([name, id, license, url, use]) => {
      const dir = new URL(`../node_modules/${id}/`, import.meta.url);
      const file = (await readdir(dir)).find((f) => /^licen[cs]e/i.test(f)) ?? 'LICENSE';
      return {
        name,
        version: (await pkg(id)).version,
        license,
        url,
        use,
        where,
        licenseFile: `node_modules/${id}/${file}`,
      };
    }),
  );
}
