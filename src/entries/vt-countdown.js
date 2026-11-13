// @ts-check
/**
 * ES module that defines only <vt-countdown> (dist/esm/vt-countdown.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-countdown.js"></script>
 */
import { VtCountdown } from '../components/countdown/vt-countdown.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-countdown')) customElements.define('vt-countdown', VtCountdown);

export { VtCountdown };
export * from './api.js';
