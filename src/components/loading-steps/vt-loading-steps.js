// @ts-check
import spinnerCss from '../../styles/spinner.css?raw';
import stepsCss from '../../styles/loading-steps.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { VtIndicator, compact } from '../loading/indicator.js';
import { spinnerShape } from '../loading/shapes.js';
import { STATUSES, overallStatus, parseSteps } from './steps.js';

/** @typedef {import('./steps.js').Step} Step */
/** @typedef {import('./steps.js').StepStatus} StepStatus */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const ICONS = { done: 'check', warning: 'alert', error: 'close', skipped: 'minus' };
const LAYOUTS = /** @type {const} */ (['list', 'compact', 'horizontal']);

/**
 * The steps of a long task (install, deploy, import, export…) with their status: pending,
 * running, done, done with warnings, failed or skipped, a detail and a duration for each,
 * and an overall bar with "Step 2 of 5". Write the steps one per line, or set them as JSON
 * or with `steps`; update one with `setStep()`.
 *
 * @element vt-loading-steps
 * @since 0.15.0
 *
 * @attr {string} text - A title above the steps.
 * @attr {"list"|"compact"|"horizontal"} layout - Vertical list with details (default), a dense list, or a horizontal stepper.
 * @attr {boolean} progress - The overall bar and "Step 2 of 5". Default: on.
 * @attr {boolean} durations - Durations of the steps. Default: on.
 * @attr {boolean} details - Details under the steps. Default: on.
 * @attr {boolean} cancelable - A Cancel button that fires `vt-cancel` while a step runs.
 * @attr {string} label - Accessible name. Default: `text`, else "Tasks".
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color of the running step and the bar.
 * @attr {string} size - Size of the status marks: `xs`…`xl` or a CSS length. Default: `sm`.
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {Step[]} steps - The steps (read and write): `{ label, status, detail, duration }`.
 * @prop {string} content - The steps as text or JSON (read and write).
 *
 * @fires vt-progress - A step changed. Detail: `{ value, max, ratio }` (finished steps).
 * @fires vt-complete - Every step finished, or one failed. Detail: `{ status }`.
 * @fires vt-cancel - The Cancel button was pressed. Detail: `{}`.
 *
 * @csspart indicator - The wrapper.
 * @csspart title - The title.
 * @csspart summary - "Step 2 of 5" and the bar.
 * @csspart bar - The overall bar.
 * @csspart steps - The list.
 * @csspart step - A step (also `step-done`, `step-error`…).
 * @csspart mark - The status mark of a step.
 * @csspart detail - The detail of a step.
 * @csspart duration - The duration of a step.
 * @csspart cancel - The Cancel button.
 *
 * @example
 * <vt-loading-steps text="Deploying">
 *   <template>
 *     done Build image (42s)
 *     running Push to registry — layer 3 of 7
 *     pending Roll out
 *   </template>
 * </vt-loading-steps>
 */
export class VtLoadingSteps extends VtIndicator {
  static type = 'loading-steps';

  static componentAttributes = ['text', 'layout', 'progress', 'durations', 'details', 'cancelable'];

  static styles = [spinnerCss, stepsCss];

  static display = 'block';

  static defaultSize = 'sm';

  constructor() {
    super();
    /** @type {Step[] | null} Steps set through the property; `null` reads the content. */
    this.stepsState = null;
    /** @type {string | null} Text set through `content`. */
    this.contentState = null;
    /** @type {MutationObserver | null} */
    this.observer = null;
    /** @type {string | null} Statuses at the last render; `null` before the first one with steps. */
    this.lastSignature = null;
  }

  connectedCallback() {
    this.observer = new MutationObserver(() => {
      if (!this.stepsState) this.requestRender();
    });
    this.observer.observe(this, { childList: true, characterData: true, subtree: true });
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = null;
    super.disconnectedCallback();
  }

  /** @type {Step[]} */
  get steps() {
    if (this.stepsState) return this.stepsState.map((s) => ({ ...s }));
    const template = this.querySelector('template');
    return parseSteps(template ? (template.content.textContent ?? '') : (this.textContent ?? ''));
  }

  set steps(value) {
    this.stepsState = Array.isArray(value) ? parseSteps(JSON.stringify(value)) : null;
    this.requestRender();
  }

  /** The steps as text (one per line) or JSON; the same as writing them inside the element. */
  get content() {
    return this.contentState ?? '';
  }

  set content(value) {
    this.contentState = value === null || value === undefined ? null : String(value);
    this.stepsState = this.contentState === null ? null : parseSteps(this.contentState);
    this.requestRender();
  }

  /**
   * Updates one step, found by index or label.
   *
   * @param {number | string} which
   * @param {Partial<Step>} changes
   */
  setStep(which, changes) {
    const steps = this.steps;
    const index = typeof which === 'number' ? which : steps.findIndex((s) => s.label === which);
    if (index < 0 || index >= steps.length) return;
    const next = { ...steps[index], ...changes };
    if (!STATUSES.includes(/** @type {StepStatus} */ (next.status)))
      next.status = steps[index].status;
    steps[index] = next;
    this.steps = steps;
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    if (!this.shown) {
      frame.replaceChildren();
      return;
    }
    const t = this.t;
    const steps = this.steps;
    const layout = parseEnum(this.getAttribute('layout'), LAYOUTS, 'list');
    const flag = (/** @type {string} */ name) => parseBoolean(this.getAttribute(name)) ?? true;
    const finished = steps.filter((s) => s.status !== 'pending' && s.status !== 'running').length;
    const status = overallStatus(steps);
    const current = steps.findIndex((s) => s.status === 'running');
    const title = cleanLabel(this.getAttribute('text'));
    this.notify(steps, finished, status);

    frame.dataset.layout = layout;
    frame.dataset.status = status;
    /** @type {HTMLElement | null} */
    let summary = null;
    if (flag('progress') && steps.length) {
      const ratio = finished / steps.length;
      const position = current >= 0 ? current + 1 : Math.min(steps.length, finished + (status === 'done' || status === 'warning' ? 0 : 1)); // prettier-ignore
      const bar = h('div', { class: 'steps-track', part: 'bar', attrs: { role: 'progressbar', 'aria-label': title || this.labelText('loadingStepsTitle'), 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(finished), 'aria-valuetext': t('loadingStepsDone', { done: formatNumber(finished, this.locale), total: formatNumber(steps.length, this.locale) }) } }, h('span', { class: 'steps-bar' })); // prettier-ignore
      bar.style.setProperty('--_ratio', String(ratio));
      summary = h(
        'div',
        { class: 'steps-summary', part: 'summary' },
        h('span', { text: status === 'done' || status === 'warning' ? t('loadingComplete') : status === 'error' ? t('loadingFailed') : t('loadingStepOf', { current: formatNumber(position, this.locale), total: formatNumber(steps.length, this.locale) }) }), // prettier-ignore
        h('span', { class: 'steps-count', text: t('loadingStepsDone', { done: formatNumber(finished, this.locale), total: formatNumber(steps.length, this.locale) }) }), // prettier-ignore
        bar,
      );
    }
    const list = h(
      'ol',
      {
        class: 'steps',
        part: 'steps',
        attrs: { 'aria-label': title || this.labelText('loadingStepsTitle') },
      },
      ...steps.map((step, i) => this.stepView(step, i, layout, flag('durations'), flag('details'))),
    );
    const cancel =
      parseBoolean(this.getAttribute('cancelable')) && status === 'running'
        ? h('button', { class: 'steps-cancel', part: 'cancel', text: t('loadingCancel'), attrs: { type: 'button' }, on: { click: () => emit(this, EVENTS.CANCEL, {}) } }) // prettier-ignore
        : null;
    frame.replaceChildren(
      ...compact([
        title || cancel ? h('div', { class: 'steps-head' }, title ? h('p', { class: 'steps-title', part: 'title', text: title }) : h('span'), cancel) : null, // prettier-ignore
        summary,
        list,
      ]),
    );
  }

  /**
   * @param {Step} step
   * @param {number} index
   * @param {(typeof LAYOUTS)[number]} layout
   * @param {boolean} durations
   * @param {boolean} details
   * @returns {HTMLElement}
   */
  stepView(step, index, layout, durations, details) {
    const t = this.t;
    const statusText = t(/** @type {StringKey} */ (`loadingStatus_${step.status}`));
    const mark = h('span', { class: `step-mark ${step.status}`, part: 'mark', attrs: { 'aria-hidden': 'true' } }); // prettier-ignore
    if (step.status === 'running') mark.append(spinnerShape('ring'));
    else if (step.status in ICONS)
      mark.append(icon(ICONS[/** @type {keyof typeof ICONS} */ (step.status)])); // prettier-ignore
    else mark.append(h('span', { class: 'step-number', text: String(index + 1) }));
    return h(
      'li',
      { class: `step ${step.status}`, part: `step step-${step.status}`, attrs: step.status === 'running' ? { 'aria-current': 'step' } : {} }, // prettier-ignore
      mark,
      h(
        'span',
        { class: 'step-body' },
        h('span', { class: 'step-label', text: step.label }),
        h('span', { class: 'sr-only', text: `, ${statusText}` }),
        details && step.detail && layout !== 'horizontal' ? h('span', { class: 'step-detail', part: 'detail', text: step.detail }) : null, // prettier-ignore
      ),
      durations && step.duration !== null ? h('span', { class: 'step-duration', part: 'duration', text: formatDuration(step.duration, this.locale) }) : null, // prettier-ignore
    );
  }

  /**
   * Fires `vt-progress` and `vt-complete` when the steps change.
   *
   * @param {Step[]} steps
   * @param {number} finished
   * @param {string} status
   */
  notify(steps, finished, status) {
    const signature = steps.map((s) => s.status).join(',');
    if (signature === this.lastSignature) return;
    const first = this.lastSignature === null;
    if (!steps.length) return;
    this.lastSignature = signature;
    // The first steps seen are the starting point, not a change.
    if (first) return;
    emit(this, EVENTS.PROGRESS, { value: finished, max: steps.length, ratio: steps.length ? finished / steps.length : 0 }); // prettier-ignore
    if (status === 'done' || status === 'warning' || status === 'error') emit(this, EVENTS.COMPLETE, { status }); // prettier-ignore
  }
}

/**
 * `850 ms`, `2.1 s`, `1 min 20 s`.
 *
 * @param {number} ms
 * @param {string} locale
 * @returns {string}
 */
export function formatDuration(ms, locale) {
  const n = (/** @type {number} */ v, /** @type {number} */ d = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(v); // prettier-ignore
  if (ms < 1000) return `${n(ms)} ms`;
  if (ms < 60000) return `${n(ms / 1000, 1)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (minutes < 60) return seconds ? `${n(minutes)} min ${n(seconds)} s` : `${n(minutes)} min`;
  return `${n(Math.floor(minutes / 60))} h ${n(minutes % 60)} min`;
}
