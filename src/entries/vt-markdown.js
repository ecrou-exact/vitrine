// @ts-check
/**
 * ES module that defines only <vt-markdown> (dist/esm/vt-markdown.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-markdown.js"></script>
 */
import { VtMarkdown } from '../components/markdown/vt-markdown.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-markdown')) customElements.define('vt-markdown', VtMarkdown);

export { VtMarkdown };
export * from './api.js';
