// @ts-check
/**
 * ES module that defines only <vt-pricing> (dist/esm/vt-pricing.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-pricing.js"></script>
 */
import { VtPricing } from '../components/pricing/vt-pricing.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-pricing')) customElements.define('vt-pricing', VtPricing);

export { VtPricing };
export * from './api.js';
