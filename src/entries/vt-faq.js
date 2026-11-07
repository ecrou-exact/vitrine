// @ts-check
/**
 * ES module that defines only <vt-faq> (dist/esm/vt-faq.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-faq.js"></script>
 */
import { VtFaq } from '../components/faq/vt-faq.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-faq')) customElements.define('vt-faq', VtFaq);

export { VtFaq };
export * from './api.js';
