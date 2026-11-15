// @ts-check
/**
 * ES module that defines only <vt-consent> (dist/esm/vt-consent.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-consent.js"></script>
 */
import { VtConsent } from '../components/consent/vt-consent.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-consent')) customElements.define('vt-consent', VtConsent);

export { VtConsent };
export * from './api.js';
