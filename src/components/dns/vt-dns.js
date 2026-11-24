// @ts-check
import dnsCss from '../../styles/dns.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { dnsFromData } from '../../core/data-formats.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { check, explain, formatDuration, parseDns, txtKind } from './dns.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./dns.js').DnsRecord} DnsRecord */
/** @typedef {import('./dns.js').Zone} Zone */
/** @typedef {import('./dns.js').Finding} Finding */
/** @typedef {import('./dns.js').Part} Part */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** @type {Record<import('./dns.js').Level, string>} */
const ICONS = { bad: 'shield-alert', warn: 'alert', info: 'status-circle' };

/**
 * Shows DNS records from `dig` output, a zone file or DNS-over-HTTPS JSON as a table, with
 * the records that carry a policy explained term by term (SPF, DMARC, DKIM, CAA, MX, SOA,
 * SRV) and checked (SPF `+all`, too many lookups, several SPF records, DMARC `p=none`, short
 * DKIM keys…). Nothing is resolved.
 *
 * @element vt-dns
 * @since 0.15.0
 *
 * @attr {boolean} explain - Explain SPF, DMARC, DKIM, CAA, MX, SOA and SRV records. Default: on.
 * @attr {boolean} checks - Findings about SPF, DMARC and DKIM. Default: on.
 * @attr {boolean} filters - Buttons to show one type. Default: on.
 *
 * @prop {string} content - The records.
 * @prop {DnsRecord[]} records - The records read (read-only).
 * @prop {Finding[]} findings - The findings (read-only), most severe first.
 *
 * @fires vt-ready - Records rendered. Detail: `{ type: "dns" }`.
 * @fires vt-copy - Records copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart query - The dig header (question, status, server, time).
 * @csspart findings - The list of findings.
 * @csspart filters - The type buttons.
 * @csspart records - The records table.
 * @csspart type - The type of a record.
 * @csspart explanation - The explanation of a record.
 *
 * @example
 * <vt-dns variant="full">
 *   <template>example.com. 300 IN TXT "v=spf1 include:_spf.google.com ~all"</template>
 * </vt-dns>
 */
export class VtDns extends VtBase {
  static type = 'dns';

  static fromData = dnsFromData;

  static componentAttributes = Object.freeze(['explain', 'checks', 'filters']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [dnsCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {string | null} Type shown alone. */
    this.only = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {Zone} */
  zone() {
    return parseDns(this.text ?? '');
  }

  /** @type {DnsRecord[]} */
  get records() {
    return this.zone().records;
  }

  /** @type {Finding[]} */
  get findings() {
    return check(this.records);
  }

  /**
   * @param {string} name
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) !== false;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { records, dig } = this.zone();
    if (this.only && !records.some((r) => r.type === this.only)) this.only = null;
    const body = h('div', { class: 'body dns-body', part: 'body' });
    if (dig) body.append(this.digView(dig));
    if (!records.length) body.append(noticeView(t('dnsNone')));
    else {
      const findings = this.flag('checks') ? check(records) : [];
      if (findings.length) body.append(this.findingsView(findings));
      if (this.flag('filters')) body.append(this.filtersView(records));
      body.append(this.tableView(this.only ? records.filter((r) => r.type === this.only) : records)); // prettier-ignore
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('dns-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && records.length
        ? this.copyButton(
            () => records.map((r) => [r.name, r.ttl ?? '', r.class, r.type, r.data].join('\t')).join('\n'), // prettier-ignore
            t('dnsCopyZone'),
          )
        : null,
    ];
    frame.append(...this.chrome({ badge: t('dnsRecords', { count: records.length }), actions }), panel); // prettier-ignore
    this.editor?.align();
  }

  /**
   * @param {import('./dns.js').DigInfo} dig
   * @returns {HTMLElement}
   */
  digView(dig) {
    const t = this.t;
    /** @type {[StringKey, string][]} */
    const items = [
      ['dnsQuestion', dig.question],
      ['dnsStatus', dig.status],
      ['dnsServer', dig.server],
      ['dnsTime', dig.time],
      ['dnsFlags', dig.flags],
    ];
    return h(
      'dl',
      { class: 'dns-query', part: 'query' },
      ...items
        .filter(([, value]) => value)
        .map(([key, value]) =>
          h(
            'div',
            { class: key === 'dnsStatus' && value !== 'NOERROR' ? 'dns-bad' : '' },
            h('dt', { text: t(key) }),
            h('dd', {}, h('code', { text: value })),
          ),
        ),
    );
  }

  /**
   * @param {Finding[]} findings
   * @returns {HTMLElement}
   */
  findingsView(findings) {
    const t = this.t;
    return h(
      'ul',
      { class: 'dns-findings', part: 'findings', attrs: { 'aria-label': t('dnsFindings') } },
      ...findings.map((f) =>
        h(
          'li',
          { class: `dns-finding ${f.level}` },
          h('span', { class: 'dns-level' }, icon(ICONS[f.level]), h('span', { text: t(/** @type {StringKey} */ (`dnsLevel_${f.level}`)) })), // prettier-ignore
          h('span', { class: 'dns-message' }, h('code', { text: f.name }), h('span', { text: t(/** @type {StringKey} */ (`dns_${f.id}`), f.params) })), // prettier-ignore
        ),
      ),
    );
  }

  /**
   * @param {DnsRecord[]} records
   * @returns {HTMLElement}
   */
  filtersView(records) {
    const t = this.t;
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const r of records) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    /**
     * @param {string | null} type
     * @param {string} label
     * @param {number} count
     */
    const button = (type, label, count) =>
      h(
        'button',
        {
          class: 'dns-filter',
          attrs: { type: 'button', 'aria-pressed': String(this.only === type), 'data-focus-key': `filter-${type ?? 'all'}` }, // prettier-ignore
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
        h('span', { class: 'dns-count', text: String(count) }),
      );
    return h(
      'div',
      { class: 'dns-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('dnsFilter') } }, // prettier-ignore
      button(null, t('dnsAll'), records.length),
      ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => button(type, type, count)), // prettier-ignore
    );
  }

  /**
   * @param {DnsRecord[]} records
   * @returns {HTMLElement}
   */
  tableView(records) {
    const t = this.t;
    const explainOn = this.flag('explain');
    const rows = records.map((r) => {
      const kind = txtKind(r);
      const parts = explainOn ? explain(r) : null;
      const data = h(
        'td',
        { class: 'dns-data' },
        h('code', { class: 'dns-value', text: r.data }),
        parts ? this.partsView(parts) : null,
      );
      return h(
        'tr',
        {},
        h(
          'th',
          { attrs: { scope: 'row' } },
          h('code', { text: r.name }),
          r.section === 'authority' || r.section === 'additional'
            ? h('span', { class: 'dns-tag', text: t(/** @type {StringKey} */ (`dnsSection_${r.section}`)) }) // prettier-ignore
            : null,
        ),
        h('td', { class: 'dns-ttl', text: r.ttl === null ? '' : formatDuration(r.ttl), attrs: r.ttl === null ? {} : { title: `${r.ttl} s` } }), // prettier-ignore
        h(
          'td',
          {},
          h('span', { class: `dns-type t-${r.type.toLowerCase()}`, part: 'type', text: r.type }),
          kind ? h('span', { class: 'dns-tag', text: t(/** @type {StringKey} */ (`dnsKind_${kind}`)) }) : null, // prettier-ignore
        ),
        data,
      );
    });
    return h(
      'div',
      { class: 'dns-scroll' },
      h(
        'table',
        { class: 'dns-table', part: 'records' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'col' }, text: t('dnsName') }),
            h('th', { attrs: { scope: 'col' }, text: t('dnsTtl') }),
            h('th', { attrs: { scope: 'col' }, text: t('dnsType') }),
            h('th', { attrs: { scope: 'col' }, text: t('dnsData') }),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    );
  }

  /**
   * @param {Part[]} parts
   * @returns {HTMLElement}
   */
  partsView(parts) {
    const t = this.t;
    return h(
      'dl',
      { class: 'dns-explain', part: 'explanation' },
      ...parts.map((p) => {
        const params = p.params
          ? { ...p.params, result: p.params.result ? t(/** @type {StringKey} */ (`dnsResult_${p.params.result}`)) : '' } // prettier-ignore
          : undefined;
        const meaning = p.key ? t(/** @type {StringKey} */ (p.key), params) : '';
        const shownValue = p.value && !p.label.endsWith(p.value) ? p.value : '';
        return h(
          'div',
          {},
          h('dt', {}, h('code', { text: p.label })),
          h('dd', {}, shownValue ? h('code', { class: 'dns-part-value', text: shownValue }) : null, h('span', { text: meaning })), // prettier-ignore
        );
      }),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: true,
      wrap: false,
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
