// @ts-check
/**
 * Corrects two gaps in the manifest the analyzer builds on its own:
 *
 * 1. Inheritance overwrites the type of an attribute or property that a class documents itself
 *    with the type of the base class. `@attr {"single"|"range"} mode` on `vt-date-picker` came out
 *    as `"view"|"edit"` (the type of `VtBase`'s `mode`), with the right description. The own type is
 *    kept on the way in and put back once inheritance is applied.
 * 2. Every field is listed as a member, with no way to tell the public ones from the internal
 *    state. Members a class documents with `@prop` get `privacy: "public"`; the analyzer leaves
 *    `privacy` out for everything else.
 *
 * `scripts/check-manifest.js` fails the build if either goes wrong again.
 *
 * @returns {import('@custom-elements-manifest/analyzer').Plugin}
 */
function vitrinePlugin() {
  /** @type {Map<string, Set<string>>} Names documented with `@prop`, by class. */
  const documentedProps = new Map();
  /** @type {Map<string, Map<string, {text: string}>>} Own types of attributes and members, by class. */
  const ownTypes = new Map();
  /** @type {Map<string, string>} Module path of each class. */
  const modules = new Map();

  return {
    name: 'vitrine',
    analyzePhase({ ts, node, moduleDoc }) {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const names = new Set();
      const comment = /** @type {any} */ (node).jsDoc?.at(-1)?.getText() ?? '';
      for (const match of comment.matchAll(/@prop(?:erty)?\s+(?:\{.*?\}\s+)?\[?([\w$]+)/g)) {
        names.add(match[1]);
      }
      documentedProps.set(`${moduleDoc.path}#${node.name.text}`, names);
    },
    moduleLinkPhase({ moduleDoc }) {
      for (const decl of moduleDoc.declarations ?? []) {
        if (decl.kind !== 'class') continue;
        const key = `${moduleDoc.path}#${decl.name}`;
        modules.set(decl.name, key);
        const types = new Map();
        for (const item of [...(decl.attributes ?? []), ...(decl.members ?? [])]) {
          if (item.type?.text) types.set(`${item.kind ?? 'attr'}:${item.name}`, item.type);
        }
        ownTypes.set(key, types);
        const props = documentedProps.get(key);
        for (const member of decl.members ?? []) {
          if (member.kind === 'field' && props?.has(member.name)) member.privacy = 'public';
        }
      }
    },
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules ?? []) {
        for (const decl of mod.declarations ?? []) {
          if (decl.kind !== 'class') continue;
          const own = ownTypes.get(modules.get(decl.name) ?? '');
          if (!own) continue;
          for (const item of [...(decl.attributes ?? []), ...(decl.members ?? [])]) {
            const type = own.get(`${item.kind ?? 'attr'}:${item.name}`);
            if (type) item.type = type;
          }
        }
      }
    },
  };
}

export default {
  globs: ['src/**/*.js'],
  exclude: ['src/**/*.test.js'],
  outdir: 'dist',
  litelement: false,
  plugins: [vitrinePlugin()],
};
