// @ts-check
/**
 * ES module that defines only <vt-calendar> (dist/esm/vt-calendar.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-calendar.js"></script>
 */
import { VtCalendar } from '../components/calendar/vt-calendar.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-calendar')) customElements.define('vt-calendar', VtCalendar);

export { VtCalendar };
export * from './api.js';
