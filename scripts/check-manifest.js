/**
 * Checks dist/custom-elements.json (run `npm run manifest` first; used in CI after the build):
 * every element of the registry is in it as a custom element, an `@attr` type is the one written
 * in the element's own JSDoc (not the type of an attribute it inherits), and the properties
 * documented with `@prop` are marked public.
 */
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('dist/custom-elements.json', 'utf8'));
const registry = await readFile('src/vitrine.js', 'utf8');
const elements = new Map(
  manifest.modules
    .flatMap((mod) => (mod.declarations ?? []).map((decl) => ({ ...decl, path: mod.path })))
    .filter((decl) => decl.tagName)
    .map((decl) => [decl.tagName, decl]),
);
const squash = (text = '') => text.replace(/\s+/g, '');
const errors = [];

const tags = [...registry.matchAll(/\['(vt-[\w-]+)',\s*\w+\]/g)].map((match) => match[1]);
if (tags.length === 0) errors.push('no element found in the registry of src/vitrine.js');

for (const tag of tags) {
  const element = elements.get(tag);
  if (!element?.customElement) {
    errors.push(`${tag}: missing from the manifest, or not a custom element`);
    continue;
  }
  const source = await readFile(element.path.replace(/^\//, ''), 'utf8');
  const comment =
    source
      .slice(0, source.indexOf(`@element ${tag}`))
      .split('/**')
      .pop() ?? '';
  const docs = source.slice(source.indexOf(`@element ${tag}`));
  for (const [, type, name] of docs.matchAll(/@attr\s+\{([^}]*)\}\s+\[?([\w-]+)/g)) {
    const attr = element.attributes?.find((item) => item.name === name);
    if (attr && squash(attr.type?.text) !== squash(type)) {
      errors.push(
        `${tag}: attribute "${name}" has type ${attr.type?.text}, its @attr says ${type}`,
      );
    }
  }
  for (const [, name] of `${comment}${docs}`.matchAll(/@prop(?:erty)?\s+\{.*?\}\s+\[?([\w$]+)/g)) {
    const member = element.members?.find((item) => item.name === name && item.kind === 'field');
    if (member?.privacy !== 'public')
      errors.push(`${tag}: @prop "${name}" is not public in the manifest`);
  }
}

if (errors.length > 0) {
  console.error(`custom-elements.json is out of line with the sources:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`custom-elements.json: ${tags.length} elements checked`);
