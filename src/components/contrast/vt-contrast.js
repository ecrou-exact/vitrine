// @ts-check
import contrastCss from '../../styles/contrast.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { LEVELS, blend, grade, parseColor, ratio, readInput, suggest, toHex } from './contrast.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./contrast.js').Rgba} Rgba */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {{ label: string, fg: string, bg: string }} Pair */

/**
 * Checks color contrast against WCAG 2.2: the contrast ratio of a text color on a background,
 * whether it passes AA and AAA for normal and large text and the 3:1 of interface components,
 * a preview, and the nearest color of the same hue that passes. Reads hex, `rgb()`, `hsl()`,
 * `hwb()` and named colors; transparent colors are laid over their background. Several pairs
 * are checked one under the other; a list of single colors becomes a grid of every text color
 * on every background.
 *
 * @element vt-contrast
 * @since 0.15.0
 *
 * @attr {string} fg - Text color. With `bg`, the pair checked (the content is ignored).
 * @attr {string} bg - Background color.
 * @attr {boolean} field - Color fields to edit a single pair. Default: on.
 * @attr {boolean} suggest - The nearest colors that pass. Default: on.
 *
 * @prop {string} content - Pairs (`#333 on #fff`, one per line, `label: fg bg`) or colors.
 * @prop {{ label: string, fg: string, bg: string, ratio: number }[]} results - Each pair checked (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "contrast" }`.
 * @fires vt-change - A color was edited. Detail: `{ fg, bg, ratio }`.
 * @fires vt-copy - A color or the report copied. Detail: `{ text }`.
 *
 * @csspart pair - The card of a pair.
 * @csspart preview - The sample text on its background.
 * @csspart ratio - The contrast ratio.
 * @csspart levels - The table of criteria.
 * @csspart suggestion - The nearest passing colors.
 * @csspart grid - The grid of a palette.
 *
 * @example
 * <vt-contrast fg="#767676" bg="#ffffff"></vt-contrast>
 */
export class VtContrast extends VtBase {
  static type = 'contrast';

  static componentAttributes = Object.freeze(['fg', 'bg', 'field', 'suggest']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [contrastCss];

  static allowEmpty = true;

  static upgradeProperties = ['content'];

  constructor() {
    super();
    /** @type {{ fg: string, bg: string } | null} Colors typed in the fields. */
    this.pairState = null;
    /** @type {HTMLElement | null} */
    this.pairHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {{ pairs: Pair[], palette: { label: string, color: string }[], invalid: string[] }} */
  input() {
    if (this.pairState)
      return { pairs: [{ label: '', ...this.pairState }], palette: [], invalid: [] };
    const fg = this.getAttribute('fg');
    const bg = this.getAttribute('bg');
    if (fg !== null || bg !== null) return { pairs: [{ label: '', fg: fg ?? '#000000', bg: bg ?? '#ffffff' }], palette: [], invalid: [] }; // prettier-ignore
    return readInput(this.text ?? '');
  }

  /** @type {{ label: string, fg: string, bg: string, ratio: number }[]} */
  get results() {
    return this.input().pairs.flatMap((p) => {
      const fg = parseColor(p.fg);
      const bg = parseColor(p.bg);
      return fg && bg ? [{ ...p, ratio: round(ratio(fg, bg)) }] : [];
    });
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * @param {number} value
   */
  number(value) {
    return new Intl.NumberFormat(this.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round(value)); // prettier-ignore
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { pairs, palette, invalid } = this.input();
    const body = h('div', { class: 'body contrast-body', part: 'body' });
    const single = pairs.length === 1 && !palette.length;
    if (!pairs.length && palette.length < 2) body.append(noticeView(t('contrastEmpty')));
    if (single && this.flag('field', true)) body.append(this.fieldsView(pairs[0]));
    this.pairHost = h('div', { class: 'contrast-pairs', attrs: { 'aria-live': single ? 'polite' : null } }); // prettier-ignore
    for (const pair of pairs) this.pairHost.append(this.pairView(pair));
    body.append(this.pairHost);
    if (palette.length >= 2) body.append(this.gridView(palette));
    if (invalid.length) body.append(h('p', { class: 'contrast-muted', text: t('contrastInvalidLines', { list: invalid.slice(0, 5).join(' · ') }) })); // prettier-ignore

    const panel = h('div', { class: 'panel' });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('contrast-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && this.results.length ? this.copyButton(() => this.report(), t('contrastCopyReport')) : null, // prettier-ignore
    ];
    frame.append(...this.chrome({ badge: pairs.length > 1 ? `WCAG · ${t('contrastPairs', { count: pairs.length })}` : 'WCAG', actions }), panel); // prettier-ignore
    this.editor?.align();
  }

  /** @returns {string} One line per pair: colors, ratio and the levels passed. */
  report() {
    return this.results
      .map((r) => {
        const g = grade(r.ratio);
        const passed = Object.keys(LEVELS).filter((k) => g[/** @type {keyof typeof LEVELS} */ (k)]).map((k) => this.t(/** @type {StringKey} */ (`contrastLevel_${k}`))); // prettier-ignore
        return `${r.label ? `${r.label}: ` : ''}${r.fg} on ${r.bg} — ${r.ratio.toFixed(2)}:1 — ${passed.join(', ') || this.t('contrastFail')}`; // prettier-ignore
      })
      .join('\n');
  }

  /**
   * @param {Pair} pair
   * @returns {HTMLElement}
   */
  fieldsView(pair) {
    const t = this.t;
    const field = (/** @type {"fg" | "bg"} */ key, /** @type {StringKey} */ label) => {
      const id = uid(key);
      const value = pair[key];
      const parsed = parseColor(value);
      const text = h('input', {
        class: 'contrast-input',
        attrs: { id, type: 'text', value, spellcheck: 'false', autocomplete: 'off', 'data-focus-key': key }, // prettier-ignore
        on: { input: () => this.edit(key, text.value) },
      });
      const picker = h('input', {
        class: 'contrast-picker',
        attrs: { type: 'color', value: parsed ? toHex({ ...parsed, a: 1 }) : '#000000', 'aria-label': t('contrastPick', { name: t(label).toLowerCase() }), 'data-focus-key': `${key}-picker` }, // prettier-ignore
        on: {
          input: () => {
            text.value = picker.value;
            this.edit(key, picker.value);
          },
        },
      });
      return h('div', { class: 'contrast-field' }, h('label', { attrs: { for: id }, text: t(label) }), picker, text); // prettier-ignore
    };
    return h('div', { class: 'contrast-fields' }, field('fg', 'contrastText'), field('bg', 'contrastBackground')); // prettier-ignore
  }

  /**
   * @param {"fg" | "bg"} key
   * @param {string} value
   */
  edit(key, value) {
    const current = this.input().pairs[0] ?? { label: '', fg: '#000000', bg: '#ffffff' };
    this.pairState = { fg: current.fg, bg: current.bg, [key]: value.slice(0, 100) };
    const pair = { label: '', ...this.pairState };
    this.pairHost?.replaceChildren(this.pairView(pair));
    const fg = parseColor(pair.fg);
    const bg = parseColor(pair.bg);
    emit(this, EVENTS.CHANGE, { fg: pair.fg, bg: pair.bg, ratio: fg && bg ? round(ratio(fg, bg)) : null }); // prettier-ignore
  }

  /**
   * @param {Pair} pair
   * @returns {HTMLElement}
   */
  pairView(pair) {
    const t = this.t;
    const fg = parseColor(pair.fg);
    const bg = parseColor(pair.bg);
    if (!fg || !bg) return noticeView(t('contrastInvalid', { color: !fg ? pair.fg : pair.bg }));
    const value = ratio(fg, bg);
    const g = grade(value);
    const back = bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
    const preview = h(
      'div',
      { class: 'contrast-preview', part: 'preview', attrs: { 'aria-hidden': 'true' } },
      // Samples are drawn from attributes: they are illustrations, read out by the ratio and results.
      h('span', { class: 'contrast-sample', attrs: { 'data-sample': t('contrastSample') } }),
      h('span', {
        class: 'contrast-sample large',
        attrs: { 'data-sample': t('contrastSampleLarge') },
      }),
      h('span', { class: 'contrast-ui' }),
    );
    preview.style.background = toHex(back);
    preview.style.color = toHex(fg.a < 1 ? blend(fg, back) : fg);
    const best = Object.keys(LEVELS).every((k) => g[/** @type {keyof typeof LEVELS} */ (k)]);
    const level = g.aaNormal ? (g.aaaNormal ? 'aaa' : 'aa') : g.aaLarge ? 'large' : 'fail';
    return h(
      'section',
      { class: `contrast-pair ${level}`, part: 'pair', attrs: { 'aria-label': `${pair.label ? `${pair.label}: ` : ''}${pair.fg} / ${pair.bg}` } }, // prettier-ignore
      pair.label ? h('h3', { class: 'contrast-title', text: pair.label }) : null,
      h(
        'div',
        { class: 'contrast-top' },
        preview,
        h(
          'div',
          { class: 'contrast-score', part: 'ratio' },
          h('span', { class: 'contrast-label', text: t('contrastRatio') }),
          h('strong', { class: 'contrast-value', text: t('contrastRatioValue', { ratio: this.number(value) }) }), // prettier-ignore
          h('span', { class: `contrast-grade ${level}`, text: t(/** @type {StringKey} */ (`contrastGrade_${level}`)) }), // prettier-ignore
          h('span', { class: 'contrast-colors' }, h('code', { text: pair.fg }), ' / ', h('code', { text: pair.bg })), // prettier-ignore
        ),
      ),
      h(
        'table',
        { class: 'contrast-levels', part: 'levels' },
        h('thead', {}, h('tr', {}, ...[t('contrastCriterion'), t('contrastMinimum'), t('contrastResult')].map((x) => h('th', { attrs: { scope: 'col' }, text: x })))), // prettier-ignore
        h(
          'tbody',
          {},
          ...Object.entries(LEVELS).map(([key, min]) => {
            const ok = g[/** @type {keyof typeof LEVELS} */ (key)];
            return h(
              'tr',
              { attrs: { 'data-level': key } },
              h('th', { attrs: { scope: 'row' }, text: t(/** @type {StringKey} */ (`contrastLevel_${key}`)) }), // prettier-ignore
              h('td', { text: `${min}:1` }),
              h('td', { class: ok ? 'pass' : 'fail' }, h('span', { class: 'contrast-result' }, icon(ok ? 'check' : 'close'), h('span', { text: ok ? t('contrastPass') : t('contrastFail') }))), // prettier-ignore
            );
          }),
        ),
      ),
      fg.a < 1 || bg.a < 1 ? h('p', { class: 'contrast-muted', text: t('contrastBlended') }) : null,
      this.flag('suggest', true) && !best ? this.suggestView(fg, bg, g) : null,
    );
  }

  /**
   * @param {Rgba} fg
   * @param {Rgba} bg
   * @param {Record<keyof typeof LEVELS, boolean>} g
   * @returns {HTMLElement}
   */
  suggestView(fg, bg, g) {
    const t = this.t;
    /** @type {[keyof typeof LEVELS, number][]} */
    const targets = [];
    if (!g.aaNormal) targets.push(['aaNormal', LEVELS.aaNormal]);
    if (!g.aaaNormal) targets.push(['aaaNormal', LEVELS.aaaNormal]);
    const list = h('ul', { class: 'contrast-suggest', part: 'suggestion' });
    for (const [key, target] of targets) {
      const level = t(/** @type {StringKey} */ (`contrastLevel_${key}`));
      const color = suggest(fg, bg, target);
      if (!color) {
        list.append(h('li', { text: t('contrastSuggestNone', { level }) }));
        continue;
      }
      const hex = toHex(color);
      const swatch = h('span', { class: 'contrast-swatch', attrs: { 'aria-hidden': 'true' } });
      swatch.style.background = hex;
      list.append(
        h(
          'li',
          {},
          swatch,
          h('span', { text: t('contrastSuggest', { level, color: hex, ratio: this.number(ratio(color, bg)) }) }), // prettier-ignore
          this.feature('copy') ? this.copyTextButton(() => hex, t('contrastCopyColor', { color: hex }), `copy-${key}`) : null, // prettier-ignore
        ),
      );
    }
    return list;
  }

  /**
   * Every color as text on every other color as background.
   *
   * @param {{ label: string, color: string }[]} palette
   * @returns {HTMLElement}
   */
  gridView(palette) {
    const t = this.t;
    const colors = palette.map((p) => ({ ...p, rgba: parseColor(p.color) })).filter((p) => p.rgba);
    const name = (/** @type {{ label: string, color: string }} */ p) => p.label || p.color;
    const head = h('tr', {}, h('td', {}), ...colors.map((bg) => {
      const th = h('th', { attrs: { scope: 'col' } }, h('span', { class: 'contrast-swatch', attrs: { 'aria-hidden': 'true' } }), h('code', { text: name(bg) })); // prettier-ignore
      /** @type {HTMLElement} */ (th.firstChild).style.background = toHex(/** @type {Rgba} */ (bg.rgba)); // prettier-ignore
      return th;
    })); // prettier-ignore
    const rows = colors.map((fg) =>
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'row' } }, h('code', { text: name(fg) })),
        ...colors.map((bg) => {
          if (fg === bg) return h('td', { class: 'same' });
          const value = ratio(/** @type {Rgba} */ (fg.rgba), /** @type {Rgba} */ (bg.rgba));
          const g = grade(value);
          const level = g.aaNormal ? (g.aaaNormal ? 'aaa' : 'aa') : g.aaLarge ? 'large' : 'fail';
          const cell = h(
            'td',
            { class: `cell ${level}`, attrs: { title: t('contrastGridCell', { fg: name(fg), bg: name(bg), ratio: this.number(value), grade: t(/** @type {StringKey} */ (`contrastGrade_${level}`)) }) } }, // prettier-ignore
            h('span', {
              class: 'contrast-aa',
              attrs: { 'aria-hidden': 'true', 'data-sample': 'Aa' },
            }),
            h('span', { class: 'contrast-cell-ratio', text: this.number(value) }),
            h('span', { class: 'contrast-cell-grade', text: t(/** @type {StringKey} */ (`contrastGrade_${level}`)) }), // prettier-ignore
          );
          const sample = /** @type {HTMLElement} */ (cell.firstChild);
          const back = /** @type {Rgba} */ (bg.rgba);
          sample.style.background = toHex(back.a < 1 ? blend(back, { r: 255, g: 255, b: 255, a: 1 }) : back); // prettier-ignore
          sample.style.color = toHex(/** @type {Rgba} */ (fg.rgba));
          return cell;
        }),
      ),
    );
    return h(
      'div',
      { class: 'contrast-scroll' },
      h('table', { class: 'contrast-grid', part: 'grid' }, h('caption', { text: t('contrastPalette') }), h('thead', {}, head), h('tbody', {}, ...rows)), // prettier-ignore
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: true,
      wrap: true,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.render(), 250);
  }
}

/**
 * Two decimals, rounded down so that 4.499 never reads as 4.50.
 *
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.floor(value * 100) / 100;
}
