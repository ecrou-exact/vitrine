// @ts-check
/**
 * ES module that defines only <vt-pcap> (dist/esm/vt-pcap.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-pcap.js"></script>
 */
import { VtPcap } from '../components/pcap/vt-pcap.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-pcap')) customElements.define('vt-pcap', VtPcap);

export { VtPcap };
export * from './api.js';
