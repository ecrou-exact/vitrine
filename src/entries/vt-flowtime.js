// @ts-check
/** Defines <vt-flowtime> without loading the other components. */
import { VtFlowtime } from '../components/flowtime/vt-flowtime.js';
import { useAssetsFrom } from './assets.js';
useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-flowtime')) customElements.define('vt-flowtime', VtFlowtime);
export { VtFlowtime };
export * from './api.js';
