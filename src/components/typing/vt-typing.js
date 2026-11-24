// @ts-check
import typingCss from '../../styles/typing.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { formatNumber } from '../../core/i18n.js';
import { VtIndicator, compact } from '../loading/indicator.js';

const TYPES = /** @type {const} */ (['dots', 'wave', 'bubble']);

/**
 * "Ada is typing…": the indicator of chats and assistants, as three bouncing dots, a wave,
 * or dots in a message bubble, with an optional text naming who is typing.
 *
 * @element vt-typing
 * @since 0.15.0
 *
 * @attr {"dots"|"wave"|"bubble"} type - Default: `bubble`.
 * @attr {string} name - Who is typing; several names separated by commas.
 * @attr {boolean} show-text - Show "Ada is typing…" next to the dots. Default: off (the text is still read by screen readers).
 * @attr {string} text - The text, instead of the generated one.
 * @attr {string} label - Accessible name. Default: the text.
 * @attr {string} size - Size of the dots: `xs`…`xl` or a CSS length. Default: `sm`.
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color of the dots. Default: `neutral`.
 * @attr {string} speed - `slow`, `normal`, `fast` or a duration.
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @csspart indicator - The wrapper.
 * @csspart bubble - The bubble (`bubble` type).
 * @csspart dot - A dot.
 * @csspart text - The visible text.
 *
 * @cssprop --vt-typing-bubble - Background of the bubble.
 *
 * @example
 * <vt-typing name="Ada" show-text></vt-typing>
 */
export class VtTyping extends VtIndicator {
  static type = 'typing';

  static componentAttributes = ['type', 'name', 'show-text', 'text'];

  static styles = [typingCss];

  static defaultSize = 'sm';

  /** The sentence: "Ada is typing…", "2 people are typing…". */
  sentence() {
    const custom = cleanLabel(this.getAttribute('text'));
    if (custom) return custom;
    const names = (this.getAttribute('name') ?? '').split(',').map((n) => cleanLabel(n, 60)).filter(Boolean); // prettier-ignore
    if (!names.length) return this.t('loadingTypingSomeone');
    if (names.length === 1) return this.t('loadingTyping', { name: names[0] });
    if (names.length === 2) return this.t('loadingTypingTwo', { names: new Intl.ListFormat(this.locale, { type: 'conjunction' }).format(names) }); // prettier-ignore
    return this.t('loadingTypingMany', { count: formatNumber(names.length, this.locale) });
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    if (!this.hasAttribute('tone')) frame.dataset.tone = 'neutral';
    if (!this.shown) {
      frame.replaceChildren();
      frame.removeAttribute('role');
      return;
    }
    const type = parseEnum(this.getAttribute('type'), TYPES, 'bubble');
    const sentence = this.sentence();
    frame.dataset.type = type;
    frame.setAttribute('role', 'status');
    frame.setAttribute('aria-label', cleanLabel(this.getAttribute('label')) || sentence);
    const dots = Array.from({ length: 3 }, () => h('span', { class: 'dot', part: 'dot' }));
    const marks = type === 'bubble' ? h('span', { class: 'bubble', part: 'bubble', attrs: { 'aria-hidden': 'true' } }, ...dots) : h('span', { class: 'dots', attrs: { 'aria-hidden': 'true' } }, ...dots); // prettier-ignore
    frame.replaceChildren(
      ...compact([
        marks,
        parseBoolean(this.getAttribute('show-text')) ? h('span', { class: 'indicator-text', part: 'text', text: sentence, attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
      ]),
    );
  }
}
