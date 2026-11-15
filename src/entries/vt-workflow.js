// @ts-check
/**
 * ES module that defines only <vt-workflow> (dist/esm/vt-workflow.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-workflow.js"></script>
 */
import { VtWorkflow } from '../components/workflow/vt-workflow.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-workflow')) customElements.define('vt-workflow', VtWorkflow);

export { VtWorkflow };
export * from './api.js';
