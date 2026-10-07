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
 * @returns {Promise<{ name: string, version: string, license: string, url: string, use: string, where: string, licenseFile: string }[]>}
 */
export async function thirdParty() {
  const [hljs, marked, purify, mono, plex] = await Promise.all(
    [
      'highlight.js',
      'marked',
      'dompurify',
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
