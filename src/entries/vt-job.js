// @ts-check
/**
 * ES module that defines only <vt-job> (dist/esm/vt-job.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-job.js"></script>
 */
import { VtJob } from '../components/job/vt-job.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-job')) customElements.define('vt-job', VtJob);

export { VtJob };
export * from './api.js';
