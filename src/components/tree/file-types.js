// @ts-check
/**
 * Icon and category of a file, from its name.
 *
 * @module components/tree/file-types
 */

/** @typedef {"code" | "data" | "doc" | "image" | "file"} FileKind */

const KINDS = /** @type {Record<Exclude<FileKind, "file">, string[]>} */ ({
  code: [
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt',
    'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
    'ps1', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro', 'sql',
    'lua', 'dart', 'ex', 'exs', 'erl', 'hs', 'scala', 'clj', 'r', 'pl', 'zig', 'nim', 'wasm',
  ],
  data: [
    'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf', 'env',
    'lock', 'csv', 'tsv', 'properties', 'plist', 'graphql', 'gql', 'proto', 'prisma',
  ],
  doc: ['md', 'mdx', 'markdown', 'txt', 'rst', 'adoc', 'org', 'tex', 'pdf', 'doc', 'docx', 'rtf'],
  image: [
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff', 'heic',
  ],
}); // prettier-ignore

/** @type {Map<string, FileKind>} */
const BY_EXTENSION = new Map();
for (const [kind, extensions] of Object.entries(KINDS)) {
  for (const extension of extensions) BY_EXTENSION.set(extension, /** @type {FileKind} */ (kind));
}

/** Well-known names without a telling extension. */
const BY_NAME = /** @type {Record<string, FileKind>} */ ({
  dockerfile: 'code', makefile: 'code', rakefile: 'code', gemfile: 'data', procfile: 'data',
  readme: 'doc', license: 'doc', licence: 'doc', changelog: 'doc', contributing: 'doc',
  authors: 'doc', notice: 'doc', copying: 'doc',
}); // prettier-ignore

const ICONS = /** @type {Record<FileKind, string>} */ ({
  code: 'file-code',
  data: 'file-data',
  doc: 'file-text',
  image: 'file-image',
  file: 'file',
});

/**
 * @param {string} name
 * @returns {{ kind: FileKind, icon: string }}
 */
export function fileType(name) {
  const lower = name.toLowerCase();
  const base = lower.replace(/\.[^.]*$/, '');
  /** @type {FileKind | undefined} */
  let kind = BY_NAME[lower] ?? BY_NAME[base];
  if (!kind) {
    const dot = lower.lastIndexOf('.');
    if (dot > 0) kind = BY_EXTENSION.get(lower.slice(dot + 1));
    // Dotfiles (.gitignore, .editorconfig, .npmrc…) are configuration.
    else if (dot === 0) kind = 'data';
  }
  const resolved = kind ?? 'file';
  return { kind: resolved, icon: ICONS[resolved] };
}
