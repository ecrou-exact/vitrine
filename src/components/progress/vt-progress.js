// @ts-check
import progressCss from '../../styles/progress.css?raw';
import { cleanLabel, parseBoolean, parseCssLength, parseInteger } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { parseNumber, compact } from '../loading/indicator.js';
import { VtValueIndicator } from '../loading/value.js';

const THICKNESS = Object.freeze({ xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' });

/**
 * A linear progress bar. With a `value`, it shows how much is done; without, it slides to
 * say "working". Optional buffer (what is already loaded ahead), segments (steps), stripes,
 * a status color, a visible text and the value as a percentage, a number or a fraction.
 *
 * @element vt-progress
 * @since 0.15.0
 *
 * @attr {number} value - The value. Without it, the bar is indeterminate.
 * @attr {number} min - Start of the range. Default: `0`.
 * @attr {number} max - End of the range. Default: `100`.
 * @attr {number} buffer - A second, lighter bar ahead of the value (data already buffered).
 * @attr {string} text - Visible text above the bar (the accessible name too, unless `label` is set).
 * @attr {"percent"|"value"|"fraction"|"none"} show-value - The value next to the text. Default: `none`.
 * @attr {string} unit - Unit after the value or fraction (`MB`, `files`).
 * @attr {number} decimals - Decimals of the value shown. Default: `0`.
 * @attr {string} value-text - The value as text, instead of the computed one (`3 min left`).
 * @attr {"normal"|"success"|"warning"|"error"} status - Colors the bar, unless `tone` is set.
 * @attr {number} segments - Splits the bar into this many steps (2 to 50).
 * @attr {boolean} striped - Diagonal stripes on the bar.
 * @attr {boolean} animated - Moving stripes (with `striped`).
 * @attr {string} thickness - `xs`, `sm` (default), `md`, `lg`, `xl` or a CSS length.
 * @attr {boolean} square - Square ends instead of rounded ones.
 * @attr {string} label - Accessible name. Default: `text`, else "Loading".
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color. Default: `accent`.
 * @attr {string} speed - Speed of the indeterminate and striped animations: `slow`, `normal`, `fast` or a duration.
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {number | null} value - The value (read and write); `null` for indeterminate.
 * @prop {number} max - The end of the range.
 * @prop {number | null} ratio - Share done, from 0 to 1 (read-only).
 *
 * @fires vt-progress - The value changed. Detail: `{ value, max, ratio }`.
 * @fires vt-complete - The value reached `max`. Detail: `{ status }`.
 * @fires vt-loading-start - Shown. Detail: `{ type: "progress" }`.
 * @fires vt-loading-end - Hidden. Detail: `{ type: "progress", duration }`.
 *
 * @csspart indicator - The wrapper.
 * @csspart head - The line with the text and the value.
 * @csspart text - The visible text.
 * @csspart value - The value shown.
 * @csspart track - The track (the role="progressbar" element).
 * @csspart bar - The value bar.
 * @csspart buffer - The buffer bar.
 *
 * @cssprop --vt-indicator-color - Color of the bar.
 * @cssprop --vt-indicator-track - Color of the track.
 * @cssprop --vt-indicator-duration - Length of one indeterminate cycle at normal speed.
 *
 * @example
 * <vt-progress value="42" text="Uploading report.pdf" show-value="percent"></vt-progress>
 */
export class VtProgress extends VtValueIndicator {
  static type = 'progress';

  static componentAttributes = [...VtValueIndicator.componentAttributes, 'buffer', 'segments', 'striped', 'animated', 'thickness', 'square']; // prettier-ignore

  static styles = [progressCss];

  static display = 'block';

  /** @param {HTMLElement} frame */
  draw(frame) {
    if (!this.shown) {
      frame.replaceChildren();
      return;
    }
    this.applyStatusTone();
    const thicknessName = this.getAttribute('thickness')?.trim().toLowerCase() ?? '';
    frame.style.setProperty('--_thickness', /** @type {Record<string, string>} */ (THICKNESS)[thicknessName] ?? parseCssLength(this.getAttribute('thickness')) ?? THICKNESS.sm); // prettier-ignore
    const ratio = this.ratio;
    const text = cleanLabel(this.getAttribute('text'));
    const valueText = this.valueLabel();
    const bufferRaw = parseNumber(this.getAttribute('buffer'));
    const buffer = bufferRaw === null ? null : Math.min(1, Math.max(0, (bufferRaw - this.min) / (this.max - this.min))); // prettier-ignore
    const segments = parseInteger(this.getAttribute('segments'), { min: 2, max: 50, fallback: 0 });
    const striped = parseBoolean(this.getAttribute('striped')) ?? false;
    const animated = striped && (parseBoolean(this.getAttribute('animated')) ?? false);

    const track = h('div', {
      class: `track${ratio === null ? ' indeterminate' : ''}${segments ? ' segmented' : ''}${parseBoolean(this.getAttribute('square')) ? ' square' : ''}`,
      part: 'track',
    }); // prettier-ignore
    this.setProgressAria(track);
    if (buffer !== null && ratio !== null)
      track.append(h('div', { class: 'buffer', part: 'buffer' }));
    const bar = h('div', { class: `bar${striped ? ' striped' : ''}${animated ? ' animated' : ''}`, part: 'bar' }); // prettier-ignore
    track.append(bar);
    track.style.setProperty('--_ratio', String(ratio ?? 0));
    if (buffer !== null) track.style.setProperty('--_buffer', String(Math.max(buffer, ratio ?? 0)));
    if (segments) track.style.setProperty('--_segments', String(segments));
    frame.classList.toggle('complete', ratio !== null && ratio >= 1);
    frame.replaceChildren(
      ...compact([
        text || valueText
          ? h(
              'div',
              { class: 'head', part: 'head', attrs: { 'aria-hidden': 'true' } },
              h('span', { class: 'indicator-text', part: 'text', text }),
              valueText ? h('span', { class: 'value', part: 'value', text: valueText }) : null,
            )
          : null,
        track,
      ]),
    );
  }
}
