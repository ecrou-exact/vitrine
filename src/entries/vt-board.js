// @ts-check
/**
 * ES module that defines only <vt-board> (dist/esm/vt-board.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-board.js"></script>
 */
import { VtBoard } from '../components/board/vt-board.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-board')) customElements.define('vt-board', VtBoard);

export { VtBoard };
export * from './api.js';
