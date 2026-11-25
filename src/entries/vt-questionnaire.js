// @ts-check
/**
 * ES module that defines <vt-questionnaire> and the elements it draws its questions with
 * (`vt-field`, `vt-tags`, `vt-date-picker`) in dist/esm/vt-questionnaire.js. Code shared with
 * other components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-questionnaire.js"></script>
 */
import { VtDatePicker } from '../components/date-picker/vt-date-picker.js';
import { VtField } from '../components/field/vt-field.js';
import { VtQuestionnaire } from '../components/questionnaire/vt-questionnaire.js';
import { VtTags } from '../components/tags/vt-tags.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
/** @type {[string, CustomElementConstructor][]} */
const elements = [
  ['vt-date-picker', VtDatePicker],
  ['vt-field', VtField],
  ['vt-tags', VtTags],
  ['vt-questionnaire', VtQuestionnaire],
];
for (const [name, element] of elements)
  if (!customElements.get(name)) customElements.define(name, element);

export { VtQuestionnaire };
export * from './api.js';
