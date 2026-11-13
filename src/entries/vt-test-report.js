// @ts-check
/**
 * ES module that defines only <vt-test-report> (dist/esm/vt-test-report.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-test-report.js"></script>
 */
import { VtTestReport } from '../components/test-report/vt-test-report.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-test-report')) customElements.define('vt-test-report', VtTestReport);

export { VtTestReport };
export * from './api.js';
