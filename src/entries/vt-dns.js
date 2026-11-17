// @ts-check
/**
 * ES module that defines only <vt-dns> (dist/esm/vt-dns.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-dns.js"></script>
 */
import { VtDns } from '../components/dns/vt-dns.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-dns')) customElements.define('vt-dns', VtDns);

export { VtDns };
export * from './api.js';
