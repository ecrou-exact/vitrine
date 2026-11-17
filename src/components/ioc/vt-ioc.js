// @ts-check
import iocCss from '../../styles/ioc.css?raw';
import { parseBoolean, parseList } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { iocFromData } from '../../core/data-formats.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { TYPES, defang, extract, toCsv, toMisp, toStix, toText } from './ioc.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./ioc.js').Indicator} Indicator */
/** @typedef {import('./ioc.js').IocType} IocType */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * Finds the indicators of compromise in a text (a report, an e-mail, a log): URLs, domains,
 * IPv4 and IPv6 addresses, e-mail addresses, MD5 / SHA-1 / SHA-256 / SHA-512 hashes, CVE
 * identifiers and MITRE ATT&CK techniques. Defanged indicators (`hxxp`, `[.]`) are read too.
 * They are shown defanged, grouped by type, with filters, and copied as a list, CSV, a STIX
 * 2.1 bundle or a MISP event.
 *
 * Nothing is resolved, fetched or linked: indicators are only text.
 *
 * @element vt-ioc
 * @since 0.15.0
 *
 * @attr {string} types - Types to keep, comma-separated (`url, domain, ipv4, ipv6, email, md5, sha1, sha256, sha512, cve, attack`). Default: all.
 * @attr {boolean} defang - Show and copy indicators defanged. Default: on.
 * @attr {boolean} private - Keep private, loopback and other special addresses. Default: on (they are marked).
 * @attr {boolean} filters - Buttons to show one type. Default: on.
 *
 * @prop {string} content - The text to read.
 * @prop {Indicator[]} indicators - The indicators found (read-only), after `types` and `private`.
 * @method export(format) - The indicators as `"text"`, `"csv"`, `"stix"` or `"misp"`.
 *
 * @fires vt-ready - Indicators rendered. Detail: `{ type: "ioc" }`.
 * @fires vt-copy - List or export copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart filters - The type buttons.
 * @csspart group - The section of one type.
 * @csspart table - The table of one type.
 * @csspart indicator - An indicator value.
 * @csspart note - The note of a special address.
 *
 * @example
 * <vt-ioc variant="full">
 *   <template>C2 at 45.33.32[.]156, payload hxxps://evil[.]example/a.exe</template>
 * </vt-ioc>
 */
export class VtIoc extends VtBase {
  static type = 'ioc';

  static fromData = iocFromData;

  static componentAttributes = Object.freeze(['types', 'defang', 'private', 'filters']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [iocCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {IocType | null} Type shown alone, `null` for all. */
    this.only = null;
    /** @type {boolean | null} Defanging chosen with the button; `null` follows `defang`. */
    this.defangState = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {{ indicators: Indicator[], capped: boolean }} */
  scan() {
    const types = parseList(this.getAttribute('types'), TYPES);
    const keepPrivate = parseBoolean(this.getAttribute('private')) !== false;
    const result = extract(this.text ?? '');
    const indicators = result.indicators.filter(
      (i) => (!types?.length || types.includes(i.type)) && (keepPrivate || !i.note),
    );
    return { indicators, capped: result.capped };
  }

  /** @type {Indicator[]} */
  get indicators() {
    return this.scan().indicators;
  }

  /** Whether indicators are shown and copied defanged. */
  get defanged() {
    return this.defangState ?? parseBoolean(this.getAttribute('defang')) !== false;
  }

  /**
   * @param {'text' | 'csv' | 'stix' | 'misp'} format
   * @returns {string}
   */
  export(format) {
    const list = this.visible(this.indicators);
    const name = this.heading || undefined;
    if (format === 'csv') return toCsv(list, this.defanged);
    if (format === 'stix') return toStix(list, { name });
    if (format === 'misp') return toMisp(list, { info: name });
    return toText(list, this.defanged);
  }

  /**
   * @param {Indicator[]} list
   * @returns {Indicator[]}
   */
  visible(list) {
    return this.only ? list.filter((i) => i.type === this.only) : list;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { indicators, capped } = this.scan();
    if (this.only && !indicators.some((i) => i.type === this.only)) this.only = null;
    const body = h('div', { class: 'body ioc-body', part: 'body' });
    if (!indicators.length) body.append(noticeView(t('iocNone')));
    else {
      if (this.defanged) body.append(h('p', { class: 'ioc-note', text: t('iocDefanged') }));
      if (capped) body.append(noticeView(t('iocCapped', { count: indicators.length })));
      if (parseBoolean(this.getAttribute('filters')) !== false)
        body.append(this.filtersView(indicators));
      for (const type of TYPES) {
        if (this.only && type !== this.only) continue;
        const group = indicators.filter((i) => i.type === type);
        if (group.length) body.append(this.groupView(type, group));
      }
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('ioc-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      history = this.historyButtons(editor);
    } else panel.append(body);

    const copy = this.feature('copy') && indicators.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      indicators.length
        ? iconButton({
            icon: this.defanged ? 'eye' : 'shield-check',
            label: this.defanged ? t('iocRefang') : t('iocDefang'),
            key: 'defang',
            pressed: this.defanged,
            onClick: () => {
              this.defangState = !this.defanged;
              this.render();
            },
          })
        : null,
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => this.export('csv'), t('iocCopyCsv'), 'copy-csv') : null,
      copy ? this.copyTextButton(() => this.export('stix'), t('iocCopyStix'), 'copy-stix') : null,
      copy ? this.copyTextButton(() => this.export('misp'), t('iocCopyMisp'), 'copy-misp') : null,
      copy ? this.copyButton(() => this.export('text'), t('iocCopyList')) : null,
    ];
    const badge = indicators.length === 1 ? t('iocCountOne') : t('iocCount', { count: indicators.length }); // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * A button per type with its count; pressing one shows that type alone.
   *
   * @param {Indicator[]} indicators
   * @returns {HTMLElement}
   */
  filtersView(indicators) {
    const t = this.t;
    /**
     * @param {IocType | null} type
     * @param {string} label
     * @param {number} count
     */
    const button = (type, label, count) =>
      h(
        'button',
        {
          class: 'ioc-filter',
          attrs: {
            type: 'button',
            'aria-pressed': String(this.only === type),
            'data-focus-key': `filter-${type ?? 'all'}`,
          },
          on: {
            click: () => {
              this.only = type;
              const focus = this.activeFocusKey();
              this.render();
              if (focus) this.restoreFocus(focus);
            },
          },
        },
        h('span', { text: label }),
        h('span', { class: 'ioc-count', text: String(count) }),
      );
    const types = TYPES.filter((type) => indicators.some((i) => i.type === type));
    return h(
      'div',
      { class: 'ioc-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('iocFilter') } }, // prettier-ignore
      button(null, t('iocAll'), indicators.length),
      ...types.map((type) =>
        button(
          type,
          t(/** @type {StringKey} */ (`iocType_${type}`)),
          indicators.filter((i) => i.type === type).length,
        ),
      ),
    );
  }

  /**
   * @param {IocType} type
   * @param {Indicator[]} group
   * @returns {HTMLElement}
   */
  groupView(type, group) {
    const t = this.t;
    const title = t(/** @type {StringKey} */ (`iocType_${type}`));
    const ip = type === 'ipv4' || type === 'ipv6';
    const rows = group.map((i) =>
      h(
        'tr',
        {},
        h(
          'td',
          { class: 'ioc-value' },
          h('code', { part: 'indicator', text: this.defanged ? defang(i.type, i.value) : i.value }),
        ),
        h('td', { class: 'ioc-num', text: String(i.count) }),
        h('td', { class: 'ioc-num', text: String(i.line) }),
        ip
          ? h(
              'td',
              {},
              i.note
                ? h('span', { class: 'ioc-tag', part: 'note', text: t(/** @type {StringKey} */ (`iocNote_${i.note}`)) }) // prettier-ignore
                : null,
            )
          : null,
      ),
    );
    return h(
      'section',
      { class: `ioc-group type-${type}`, part: 'group', attrs: { 'aria-label': title } },
      h(
        'h3',
        { class: 'ioc-title' },
        h('span', { text: title }),
        h('span', { class: 'ioc-count', text: String(group.length) }),
      ),
      h(
        'div',
        { class: 'ioc-scroll' },
        h(
          'table',
          { class: 'ioc-table', part: 'table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'col' }, text: t('iocValue') }),
              h('th', { class: 'ioc-num', attrs: { scope: 'col' }, text: t('iocSeen') }),
              h('th', { class: 'ioc-num', attrs: { scope: 'col' }, text: t('iocLine') }),
              ip ? h('th', { attrs: { scope: 'col' }, text: t('iocNoteHeader') }) : null,
            ),
          ),
          h('tbody', {}, ...rows),
        ),
      ),
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
