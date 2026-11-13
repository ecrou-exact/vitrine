// @ts-check
/**
 * markdown-it plugin (dist/integrations/markdown-it.js): fenced code blocks become Vitrine
 * elements. ```` ```sql ```` becomes `<vt-sql>`, ```` ```mermaid ```` `<vt-diagram>`,
 * ```` ```math ```` `<vt-math>`, and any other language `<vt-code>`.
 *
 * ```js
 * import MarkdownIt from 'markdown-it';
 * import vitrine from 'vitrine/markdown-it';
 *
 * const md = new MarkdownIt().use(vitrine, { variant: 'full' });
 * ```
 *
 * The page then loads the elements, with `dist/vitrine-loader.js` for example.
 *
 * @module integrations/markdown-it
 */
import { fenceToHtml } from './fences.js';

export { ELEMENTS, fenceToHtml } from './fences.js';

/**
 * @param {any} md - A markdown-it instance.
 * @param {import('./fences.js').FenceOptions} [options]
 */
export default function vitrine(md, options = {}) {
  const fallback = md.renderer.rules.fence;
  md.renderer.rules.fence = (
    /** @type {any[]} */ tokens,
    /** @type {number} */ index,
    /** @type {any} */ mdOptions,
    /** @type {any} */ env,
    /** @type {any} */ self,
  ) => {
    const token = tokens[index];
    return (
      fenceToHtml(token.info, token.content, options) ??
      (fallback ? fallback(tokens, index, mdOptions, env, self) : self.renderToken(tokens, index, mdOptions)) // prettier-ignore
    );
  };
}
