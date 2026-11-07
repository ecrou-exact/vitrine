// @ts-check
/**
 * ES module that defines only <vt-testimonials> (dist/esm/vt-testimonials.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-testimonials.js"></script>
 */
import { VtTestimonials } from '../components/testimonials/vt-testimonials.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-testimonials'))
  customElements.define('vt-testimonials', VtTestimonials);

export { VtTestimonials };
export * from './api.js';
