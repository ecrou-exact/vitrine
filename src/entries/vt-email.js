// @ts-check
/**
 * ES module that defines only <vt-email> (dist/esm/vt-email.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-email.js"></script>
 */
import { VtEmail } from '../components/email/vt-email.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-email')) customElements.define('vt-email', VtEmail);

export { VtEmail };
export * from './api.js';
