// @ts-check
/**
 * remark plugin (dist/integrations/remark.js), for unified, MDX, Astro, Docusaurus,
 * VitePress-like pipelines: fenced code blocks become Vitrine elements, as `html` nodes.
 *
 * ```js
 * import { unified } from 'unified';
 * import remarkParse from 'remark-parse';
 * import remarkRehype from 'remark-rehype';
 * import rehypeRaw from 'rehype-raw';
 * import rehypeStringify from 'rehype-stringify';
 * import remarkVitrine from 'vitrine/remark';
 *
 * const html = await unified()
 *   .use(remarkParse)
 *   .use(remarkVitrine, { variant: 'full' })
 *   .use(remarkRehype, { allowDangerousHtml: true })
 *   .use(rehypeRaw)
 *   .use(rehypeStringify)
 *   .process(markdown);
 * ```
 *
 * @module integrations/remark
 */
import { fenceToHtml } from './fences.js';

export { ELEMENTS, fenceToHtml } from './fences.js';

/**
 * @typedef {{ type: string, lang?: string | null, meta?: string | null, value?: string, children?: MdNode[] }} MdNode
 */

/**
 * @param {import('./fences.js').FenceOptions} [options]
 * @returns {(tree: MdNode) => void}
 */
export default function remarkVitrine(options = {}) {
  return (tree) => {
    /** @type {MdNode[]} */
    const stack = [tree];
    while (stack.length) {
      const node = /** @type {MdNode} */ (stack.pop());
      const children = node.children;
      if (!children) continue;
      children.forEach((child, index) => {
        if (child.type === 'code') {
          const info = [child.lang ?? '', child.meta ?? ''].join(' ');
          const html = fenceToHtml(info, child.value ?? '', options);
          if (html !== null) children[index] = { type: 'html', value: html };
        } else stack.push(child);
      });
    }
  };
}
