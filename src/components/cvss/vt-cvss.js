// @ts-check
import cvssCss from '../../styles/cvss.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { cvssFromData } from '../../core/data-formats.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { formatVector, metricsOf, overall, parseVector, scores, severity } from './cvss.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./cvss.js').Vector} Vector */
/** @typedef {import('./cvss.js').MetricDef} MetricDef */
/** @typedef {import('./cvss.js').MetricGroup} MetricGroup */
/** @typedef {import('./cvss.js').Severity} Severity */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** @type {Record<MetricGroup, StringKey>} */
const GROUP_TITLES = {
  base: 'cvssBase',
  temporal: 'cvssTemporal',
  threat: 'cvssThreat',
  environmental: 'cvssEnvironmental',
  supplemental: 'cvssSupplemental',
};

/**
 * Shows a CVSS vector as a score, a severity and each metric explained in words. CVSS 3.0 and
 * 3.1 scores (base, temporal, environmental) are computed; CVSS 4.0 vectors are explained,
 * and their score can be given with `score`. With `editable`, each metric is a select and the
 * element works as a calculator.
 *
 * @element vt-cvss
 * @since 0.15.0
 *
 * @attr {number} score - Score to show instead of the computed one (CVSS 4.0, or a score from a database).
 * @attr {boolean} editable - Each metric is a select; changing one updates the vector and the score.
 * @attr {boolean} metrics - Table of the metrics with their meaning. Default: on.
 * @attr {boolean} all - Also list optional metrics that are not defined. Default: off (on when editable).
 *
 * @prop {string} content - The vector.
 * @prop {Vector | null} vector - The parsed vector (read-only), `null` when it cannot be read.
 * @prop {number | null} score - The score shown (read-only).
 *
 * @fires vt-ready - Vector rendered. Detail: `{ type: "cvss" }`.
 * @fires vt-change - A metric changed with `editable`. Detail: `{ value }` (the new vector).
 * @fires vt-copy - Vector copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart score - The score box.
 * @csspart severity - The severity label.
 * @csspart gauge - The bar under the score.
 * @csspart vector - The vector.
 * @csspart metrics - The metrics table.
 * @csspart select - A metric select (editable).
 *
 * @example
 * <vt-cvss variant="full">
 *   <template>CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H</template>
 * </vt-cvss>
 */
export class VtCvss extends VtBase {
  static type = 'cvss';

  static fromData = cvssFromData;

  static dataAttributes = Object.freeze(['score']);

  static componentAttributes = Object.freeze(['score', 'editable', 'metrics', 'all']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [cvssCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Vector | null} */
  get vector() {
    const result = parseVector(this.text ?? '');
    return result.ok ? result.vector : null;
  }

  /** @type {number | null} */
  get score() {
    const vector = this.vector;
    return vector ? this.scoreOf(vector).value : null;
  }

  /**
   * @param {Vector} vector
   * @returns {{ value: number | null, given: boolean }}
   */
  scoreOf(vector) {
    const given = Number.parseFloat(this.getAttribute('score') ?? '');
    if (Number.isFinite(given) && given >= 0 && given <= 10)
      return { value: Math.round(given * 10) / 10, given: true };
    const computed = scores(vector);
    return { value: computed ? overall(computed) : null, given: false };
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = parseVector(this.text ?? '');
    const body = h('div', { class: 'body cvss-body', part: 'body' });
    let badge = 'CVSS';
    if (!result.ok) {
      const key = /** @type {StringKey} */ (
        `cvssInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`
      );
      body.append(
        noticeView(t(key, { metric: result.metric ?? '' })),
        h('pre', { class: 'cvss-raw', text: this.text ?? '' }),
      );
    } else {
      const vector = result.vector;
      badge = `CVSS ${vector.version}`;
      body.append(this.scoreView(vector), this.vectorView(vector));
      if (this.flag('metrics', true)) body.append(this.metricsView(vector));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('cvss-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      history = this.historyButtons(editor);
    } else panel.append(body);

    const vector = result.ok ? result.vector : null;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy')
        ? this.copyButton(() => vector?.vector ?? this.text ?? '', t('cvssCopyVector'))
        : null,
    ];
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * Score, severity in words and a bar, then the sub-scores.
   *
   * @param {Vector} vector
   * @returns {HTMLElement}
   */
  scoreView(vector) {
    const t = this.t;
    const { value, given } = this.scoreOf(vector);
    const level = severity(value);
    const box = h('div', { class: `cvss-score sev-${value === null ? 'unknown' : level}`, part: 'score' }); // prettier-ignore
    const number = h('span', {
      class: 'cvss-number',
      text: value === null ? '–' : value.toFixed(1),
    });
    const label = h('span', {
      class: 'cvss-severity',
      part: 'severity',
      text: value === null ? vector.version : t(/** @type {StringKey} */ (`cvssSeverity_${level}`)),
    });
    const fill = h('span', { class: 'cvss-fill' });
    // A custom property set through the CSSOM: allowed by a strict style-src.
    fill.style.setProperty('--_value', String((value ?? 0) / 10));
    const gauge = h(
      'div',
      {
        class: 'cvss-gauge',
        part: 'gauge',
        attrs: {
          role: 'meter',
          'aria-label': t('cvssScore'),
          'aria-valuemin': 0,
          'aria-valuemax': 10,
          'aria-valuenow': value ?? 0,
          'aria-valuetext': value === null ? '–' : `${value.toFixed(1)} (${label.textContent})`,
        },
      },
      fill,
    );
    box.append(h('div', { class: 'cvss-main' }, number, label), gauge);

    const computed = scores(vector);
    if (computed && !given) {
      /** @type {[StringKey, number | null][]} */
      const items = [
        ['cvssBase', computed.base],
        ['cvssImpact', computed.impact],
        ['cvssExploitability', computed.exploitability],
        ['cvssTemporal', computed.temporal],
        ['cvssEnvironmental', computed.environmental],
      ];
      box.append(
        h(
          'dl',
          { class: 'cvss-subscores' },
          ...items
            .filter(([, n]) => n !== null)
            .map(([key, n]) =>
              h('div', {}, h('dt', { text: t(key) }), h('dd', { text: Number(n).toFixed(1) })),
            ),
        ),
      );
    } else {
      box.append(h('p', { class: 'cvss-note', text: t(given ? 'cvssGivenScore' : 'cvssNoScore4') })); // prettier-ignore
    }
    return box;
  }

  /**
   * The vector, each metric with its name as a tooltip.
   *
   * @param {Vector} vector
   * @returns {HTMLElement}
   */
  vectorView(vector) {
    const code = h('code', {
      class: 'cvss-vector',
      part: 'vector',
      attrs: { 'aria-label': this.t('cvssVector') },
    });
    vector.vector.split('/').forEach((part, index) => {
      if (index) code.append(h('span', { class: 'cvss-slash', text: '/' }));
      const key = part.split(':')[0];
      code.append(
        h('span', {
          class: index ? 'cvss-pair' : 'cvss-prefix',
          text: part,
          attrs: index ? { title: this.metricName(vector, key) } : {},
        }),
      );
    });
    return code;
  }

  /**
   * Metrics by group: name, value (a select when editable) and meaning.
   *
   * @param {Vector} vector
   * @returns {HTMLElement}
   */
  metricsView(vector) {
    const t = this.t;
    const editable = this.flag('editable', false);
    const all = this.flag('all', editable);
    const defs = metricsOf(vector.version);
    /** @type {MetricGroup[]} */
    const groups = ['base', 'temporal', 'threat', 'environmental', 'supplemental'];
    const tables = h('div', { class: 'cvss-groups', part: 'metrics' });
    for (const group of groups) {
      const shown = defs.filter(
        (d) => d.group === group && (all || d.required || (vector.metrics[d.key] ?? 'X') !== 'X'),
      );
      if (!shown.length) continue;
      const rows = shown.map((def) => {
        const value = vector.metrics[def.key] ?? 'X';
        const cell = h('td', { class: 'cvss-value' });
        if (editable) cell.append(this.metricSelect(vector, def, value));
        else
          cell.append(
            h('code', { class: 'cvss-code', text: value }),
            h('span', { text: this.valueName(vector, def.key, value) }),
          );
        return h(
          'tr',
          { class: value === 'X' ? 'cvss-undefined' : '' },
          h('th', { attrs: { scope: 'row' } }, h('code', { class: 'cvss-code', text: def.key }), h('span', { text: this.metricName(vector, def.key) })), // prettier-ignore
          cell,
          h('td', { class: 'cvss-meaning', text: t(/** @type {StringKey} */ (`cvssD_${baseId(vector, def.key)}`)) }), // prettier-ignore
        );
      });
      tables.append(
        h(
          'section',
          { class: 'cvss-group', attrs: { 'aria-label': t(GROUP_TITLES[group]) } },
          h('h3', { class: 'cvss-title', text: t(GROUP_TITLES[group]) }),
          h(
            'table',
            { class: 'cvss-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { attrs: { scope: 'col' }, text: t('cvssMetric') }),
                h('th', { attrs: { scope: 'col' }, text: t('cvssValue') }),
                h('th', { attrs: { scope: 'col' }, text: t('cvssMeaning') }),
              ),
            ),
            h('tbody', {}, ...rows),
          ),
        ),
      );
    }
    return tables;
  }

  /**
   * @param {Vector} vector
   * @param {MetricDef} def
   * @param {string} value
   * @returns {HTMLSelectElement}
   */
  metricSelect(vector, def, value) {
    const select = h(
      'select',
      {
        class: 'cvss-select',
        part: 'select',
        attrs: { 'aria-label': this.metricName(vector, def.key), 'data-focus-key': `metric-${def.key}` }, // prettier-ignore
        on: {
          change: () => {
            const metrics = { ...vector.metrics, [def.key]: select.value };
            const next = formatVector(vector.version, metrics);
            this.edited(next);
            emit(this, EVENTS.CHANGE, { value: next });
            const focus = this.activeFocusKey();
            this.render();
            if (focus) this.restoreFocus(focus);
          },
        },
      },
      ...def.values.map((option) =>
        h('option', {
          text: `${option} — ${this.valueName(vector, def.key, option)}`,
          attrs: { value: option, selected: option === value },
        }),
      ),
    );
    return select;
  }

  /**
   * @param {Vector} vector
   * @param {string} key
   * @returns {string}
   */
  metricName(vector, key) {
    const name = this.t(/** @type {StringKey} */ (`cvssM_${baseId(vector, key)}`));
    return modified(vector, key) ? this.t('cvssModified', { name }) : name;
  }

  /**
   * @param {Vector} vector
   * @param {string} key
   * @param {string} value
   * @returns {string}
   */
  valueName(vector, key, value) {
    if (value === 'X') return this.t('cvssV_X');
    if (value === 'S' && /^MS[IA]$/.test(key)) return this.t('cvssV_safety');
    return this.t(/** @type {StringKey} */ (`cvssV_${valueId(vector, key)}_${value}`));
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: false,
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
    if (!this.editing) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.render(), 200);
  }
}

/**
 * Whether a metric is an environmental "modified" copy of a base metric.
 *
 * @param {Vector} vector
 * @param {string} key
 */
function modified(vector, key) {
  return key.length > 1 && key[0] === 'M' && metricsOf(vector.version).some((d) => d.key === key.slice(1)); // prettier-ignore
}

/**
 * The id of a metric in the strings: modified metrics use their base metric, and CVSS 4.0
 * Exploit Maturity and Safety have their own.
 *
 * @param {Vector} vector
 * @param {string} key
 */
function baseId(vector, key) {
  const id = modified(vector, key) ? key.slice(1) : key;
  return vector.version === '4.0' && (id === 'E' || id === 'S') ? `4${id}` : id;
}

/**
 * The id of a metric's values in the strings.
 *
 * @param {Vector} vector
 * @param {string} key
 */
function valueId(vector, key) {
  const id = baseId(vector, key);
  if (/^(?:C|I|A|VC|VI|VA|SC|SI|SA)$/.test(id)) return 'CIA';
  if (/^(?:CR|IR|AR)$/.test(id)) return 'REQ';
  return id;
}
