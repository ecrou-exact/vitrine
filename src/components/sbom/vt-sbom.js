// @ts-check
import sbomCss from '../../styles/sbom.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { SEVERITIES, parseSbom, summary, toCsv } from './sbom.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./sbom.js').Sbom} Sbom */
/** @typedef {import('./sbom.js').Component} Component */
/** @typedef {import('./sbom.js').Vulnerability} Vulnerability */
/** @typedef {import('./sbom.js').ParseResult} ParseResult */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"tree" | "components" | "vulnerabilities"} View */

/** @type {readonly View[]} */
const VIEWS = Object.freeze(['tree', 'components', 'vulnerabilities']);
/** Nodes drawn in the tree; rows drawn in the table. */
const MAX_NODES = 3000;
const MAX_ROWS = 2000;

/**
 * Shows a software bill of materials: CycloneDX JSON (1.2 to 1.6) or SPDX JSON (2.2, 2.3).
 * A summary (components, direct and transitive, ecosystems, licenses, vulnerabilities by
 * severity); the dependency tree from the root, each component with its version, license
 * kind and vulnerabilities; a table of components with their package URL, depth and the path
 * that brings them in; and the vulnerabilities of a CycloneDX VEX or VDR with their score,
 * analysis and affected components. Nothing is fetched.
 *
 * @element vt-sbom
 * @since 0.15.0
 *
 * @attr {"tree" | "components" | "vulnerabilities"} view - Tab shown first. Default: tree.
 * @attr {number} depth - Tree levels open at first (default 1, 0: all closed).
 * @attr {boolean} filters - The text filter. Default: on.
 *
 * @prop {string} content - The SBOM (JSON).
 * @prop {Sbom | null} sbom - The SBOM read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "sbom" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-filter-change - Filter changed. Detail: `{ query, shown }`.
 * @fires vt-copy - CSV or package URLs copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary.
 * @csspart tree - The dependency tree.
 * @csspart components - The table of components.
 * @csspart vulnerabilities - The list of vulnerabilities.
 * @csspart severity - A severity badge.
 *
 * @example
 * <vt-sbom variant="full" src="bom.cdx.json"></vt-sbom>
 */
export class VtSbom extends VtBase {
  static type = 'sbom';

  static componentAttributes = Object.freeze(['view', 'depth', 'filters', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [sbomCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.ids = { query: uid('query') };
    /** @type {View | null} */
    this.viewState = null;
    this.query = '';
    /** @type {boolean | null} Expand-all state, `null`: follow `depth`. */
    this.expandAll = null;
    /** @type {{ text: string, result: ParseResult } | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {ParseResult} */
  read() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseSbom(text) };
    return this.parsed.result;
  }

  /** @type {Sbom | null} */
  get sbom() {
    const result = this.read();
    return result.ok ? result.sbom : null;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'tree');
  }

  get openDepth() {
    const n = Number(this.getAttribute('depth') ?? 1);
    return Number.isFinite(n) ? Math.max(0, Math.min(50, n)) : 1;
  }

  /**
   * @param {Component[]} list
   * @returns {Component[]}
   */
  filtered(list) {
    const q = this.query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => `${c.name} ${c.version} ${c.license} ${c.purl} ${c.vulns.join(' ')}`.toLowerCase().includes(q)); // prettier-ignore
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const body = h('div', { class: 'body sbom-body', part: 'body' });
    let tabs = null;
    /** @type {Component[]} */
    let list = [];
    if (!result.ok) {
      body.append(noticeView(t(/** @type {StringKey} */ (`sbomInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`), { detail: result.detail ?? '' }))); // prettier-ignore
    } else {
      const sbom = result.sbom;
      list = [...sbom.components.values()].filter((c) => !sbom.roots.includes(c.ref));
      tabs = this.feature('tabs')
        ? createTabs({
            tabs: [
              { id: 'tree', label: t('sbomTabTree') },
              { id: 'components', label: t('sbomTabComponents', { count: formatNumber(list.length, this.locale) }) }, // prettier-ignore
              { id: 'vulnerabilities', label: t('sbomTabVulns', { count: sbom.vulns.length }) },
            ],
            selected: this.view,
            label: t('sbomTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectView(/** @type {View} */ (id)),
          })
        : null;
      body.append(this.summaryView(sbom));
      if (sbom.capped) body.append(noticeView(t('sbomCapped', { count: formatNumber(sbom.components.size, this.locale) }))); // prettier-ignore
      const view = tabs ? this.view : 'tree';
      if (view === 'vulnerabilities') body.append(this.vulnsView(sbom));
      else if (view === 'components') {
        if (parseBoolean(this.getAttribute('filters')) !== false)
          body.append(this.filterView(list));
        body.append(this.componentsView(sbom, this.filtered(list)));
      } else body.append(this.treeView(sbom));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('sbom-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const shown = this.filtered(list);
    const copy = this.feature('copy') && shown.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toCsv(shown), t('sbomCopyCsv'), 'copy-csv') : null,
      copy ? this.copyButton(() => shown.map((c) => c.purl).filter(Boolean).join('\n'), t('sbomCopyPurls')) : null, // prettier-ignore
    ];
    const sbom = result.ok ? result.sbom : null;
    frame.append(...this.chrome({ badge: sbom ? `${sbom.format}${sbom.spec ? ` ${sbom.spec}` : ''}` : 'SBOM', tabs, actions }), panel); // prettier-ignore
    this.editor?.align();
  }

  /**
   * @param {View} view
   */
  selectView(view) {
    if (view === this.view) return;
    this.viewState = view;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${view}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
  }

  /**
   * @param {Sbom} sbom
   * @returns {HTMLElement}
   */
  summaryView(sbom) {
    const t = this.t;
    const s = summary(sbom);
    const n = (/** @type {number} */ x) => formatNumber(x, this.locale);
    const licenses = Object.entries(s.licenses).filter(([, count]) => count);
    const vulns = SEVERITIES.filter((k) => s.vulns[k]);
    return h(
      'div',
      { class: 'sbom-summary', part: 'summary' },
      sbom.name ? h('p', { class: 'sbom-title' }, h('strong', { text: sbom.name })) : null,
      h(
        'p',
        { class: 'sbom-facts' },
        h('strong', { text: t('sbomComponents', { count: n(s.components) }) }),
        sbom.graph ? h('span', { text: t('sbomDirect', { count: n(s.direct) }) }) : null,
        sbom.graph ? h('span', { text: t('sbomTransitive', { count: n(s.transitive) }) }) : null,
        s.ecosystems.length ? h('span', { class: 'sbom-muted', text: s.ecosystems.map(([e, c]) => `${e} ${n(c)}`).join(' · ') }) : null, // prettier-ignore
        sbom.created ? h('span', { class: 'sbom-muted', text: t('sbomCreated', { date: sbom.created.slice(0, 10) }) }) : null, // prettier-ignore
        sbom.tools.length ? h('span', { class: 'sbom-muted', text: t('sbomBy', { tools: sbom.tools.slice(0, 3).join(', ') }) }) : null, // prettier-ignore
      ),
      licenses.length
        ? h('ul', { class: 'sbom-chips', attrs: { 'aria-label': t('sbomLicense') } }, ...licenses.map(([k, count]) => h('li', { class: `lic-${k}` }, h('span', { text: t(/** @type {StringKey} */ (`sbomLicense_${k}`)) }), h('strong', { text: ` ${n(count)}` })))) // prettier-ignore
        : null,
      vulns.length
        ? h(
            'ul',
            { class: 'sbom-chips', attrs: { 'aria-label': t('sbomVulnsCol') } },
            ...vulns.map((k) => h('li', { class: `sev sev-${k}` }, h('span', { text: t(/** @type {StringKey} */ (`sbomSeverity_${k}`)) }), h('strong', { text: ` ${n(s.vulns[k])}` }))), // prettier-ignore
            h('li', { class: 'sbom-plain', text: t('sbomAffected', { count: n(s.affected) }) }),
          )
        : null,
      !sbom.graph ? h('p', { class: 'sbom-muted', text: t('sbomNoGraph') }) : null,
    );
  }

  /**
   * @param {Component} c
   * @param {boolean} [withName]
   * @returns {HTMLElement[]}
   */
  badges(c, withName = true) {
    const t = this.t;
    return [
      withName ? h('code', { class: 'sbom-name', text: c.name }) : null,
      c.version ? h('span', { class: 'sbom-version', text: c.version }) : null,
      h('span', { class: `sbom-lic lic-${c.category}`, attrs: { title: c.license || null }, text: c.license || t('sbomLicense_unknown') }), // prettier-ignore
      c.scope && c.scope !== 'required' ? h('span', { class: 'sbom-tag', text: c.scope }) : null,
      ...c.vulns.slice(0, 4).map((id) => {
        const sbom = /** @type {Sbom} */ (this.sbom);
        const v = sbom.vulns.find((x) => x.id === id);
        return h('span', { class: `sbom-sev sev-${v?.severity ?? 'unknown'}`, part: 'severity', attrs: { title: v ? t(/** @type {StringKey} */ (`sbomSeverity_${v.severity}`)) : null } }, icon('alert'), h('span', { text: id })); // prettier-ignore
      }),
    ].filter((x) => x !== null);
  }

  /**
   * @param {Sbom} sbom
   * @returns {HTMLElement}
   */
  treeView(sbom) {
    const t = this.t;
    let drawn = 0;
    /** @type {Set<string>} */
    const shown = new Set();
    const open = (/** @type {number} */ depth) => (this.expandAll === null ? depth < this.openDepth : this.expandAll); // prettier-ignore
    /**
     * @param {string} ref
     * @param {number} depth
     * @param {Set<string>} branch - Refs above it, to stop cycles.
     * @returns {HTMLElement | null}
     */
    const node = (ref, depth, branch) => {
      const c = sbom.components.get(ref);
      if (!c || drawn >= MAX_NODES) return null;
      drawn += 1;
      const children = (sbom.edges.get(ref) ?? []).filter((r) => sbom.components.has(r));
      const line = h('span', { class: 'sbom-node' }, ...this.badges(c));
      if (branch.has(ref))
        return h('li', {}, line, h('span', { class: 'sbom-tag', text: t('sbomCycle') }));
      if (shown.has(ref) && children.length) return h('li', {}, line, h('span', { class: 'sbom-muted sbom-seen', text: ` ${t('sbomSeen')}` })); // prettier-ignore
      shown.add(ref);
      if (!children.length) return h('li', {}, line);
      const next = new Set(branch).add(ref);
      return h(
        'li',
        {},
        h(
          'details',
          { attrs: { open: open(depth) } },
          h('summary', {}, line, h('span', { class: 'sbom-count', text: ` ${children.length}` })),
          h('ul', {}, ...children.map((r) => node(r, depth + 1, next))),
        ),
      );
    };
    const unreachable = [...sbom.components.values()].filter((c) => c.depth < 0);
    return h(
      'div',
      { class: 'sbom-tree-box' },
      h(
        'p',
        { class: 'sbom-tree-actions' },
        h('button', { class: 'text-btn', text: t('sbomShowAll'), attrs: { type: 'button', 'data-focus-key': 'expand' }, on: { click: () => { this.expandAll = true; this.render(); } } }), // prettier-ignore
        h('button', { class: 'text-btn', text: t('sbomCollapse'), attrs: { type: 'button', 'data-focus-key': 'collapse' }, on: { click: () => { this.expandAll = false; this.render(); } } }), // prettier-ignore
      ),
      h(
        'ul',
        { class: 'sbom-tree', part: 'tree' },
        ...sbom.roots.map((r) => node(r, 0, new Set())),
      ),
      unreachable.length
        ? h(
            'details',
            { class: 'sbom-unreachable' },
            h('summary', { text: t('sbomUnreachable', { count: unreachable.length }) }),
            h('ul', { class: 'sbom-tree' }, ...unreachable.slice(0, MAX_NODES).map((c) => h('li', {}, h('span', { class: 'sbom-node' }, ...this.badges(c))))), // prettier-ignore
          )
        : null,
    );
  }

  /**
   * @param {Component[]} list
   * @returns {HTMLElement}
   */
  filterView(list) {
    const t = this.t;
    const input = h('input', {
      class: 'sbom-query',
      attrs: { id: this.ids.query, type: 'search', value: this.query, placeholder: t('sbomFilter'), 'aria-label': t('sbomFilter'), 'data-focus-key': 'query', spellcheck: 'false' }, // prettier-ignore
      on: {
        input: () => {
          this.query = input.value.slice(0, 200);
          this.render();
          emit(this, EVENTS.FILTER_CHANGE, {
            query: this.query,
            shown: this.filtered(list).length,
          });
        },
      },
    });
    return h('div', { class: 'sbom-filters' }, input);
  }

  /**
   * @param {Sbom} sbom
   * @param {Component[]} list
   * @returns {HTMLElement}
   */
  componentsView(sbom, list) {
    const t = this.t;
    if (!list.length) return noticeView(t('sbomNone'));
    const worst = (/** @type {Component} */ c) =>
      Math.min(
        99,
        ...c.vulns.map((id) =>
          SEVERITIES.indexOf(sbom.vulns.find((v) => v.id === id)?.severity ?? 'unknown'),
        ),
      );
    const sorted = [...list].sort((a, b) => worst(a) - worst(b) || b.vulns.length - a.vulns.length || (a.depth < 0 ? 99 : a.depth) - (b.depth < 0 ? 99 : b.depth) || a.name.localeCompare(b.name)); // prettier-ignore
    const name = (/** @type {string} */ ref) => {
      const c = sbom.components.get(ref);
      return c ? `${c.name}${c.version ? `@${c.version}` : ''}` : ref;
    };
    return h(
      'div',
      { class: 'sbom-scroll' },
      h(
        'table',
        { class: 'sbom-table', part: 'components' },
        h('thead', {}, h('tr', {}, ...[t('sbomName'), t('sbomVersion'), t('sbomLicense'), t('sbomDepth'), t('sbomVulnsCol'), t('sbomPath')].map((x) => h('th', { attrs: { scope: 'col' }, text: x })))), // prettier-ignore
        h(
          'tbody',
          {},
          ...sorted.slice(0, MAX_ROWS).map((c) =>
            h(
              'tr',
              { attrs: { 'data-ref': c.ref } },
              h('th', { attrs: { scope: 'row' } }, h('code', { text: c.name }), c.purl ? h('span', { class: 'sbom-purl', text: c.purl }) : null), // prettier-ignore
              h('td', {}, h('code', { text: c.version })),
              h('td', {}, h('span', { class: `sbom-lic lic-${c.category}`, text: c.license || t('sbomLicense_unknown') }), h('span', { class: 'sr-only', text: ` (${t(/** @type {StringKey} */ (`sbomLicense_${c.category}`))})` })), // prettier-ignore
              h('td', { text: c.depth < 0 ? t('sbomDepthUnknown') : c.depth === 1 ? t('sbomDepthDirect') : String(c.depth) }), // prettier-ignore
              h('td', {}, ...this.badges(c, false).filter((b) => b.classList.contains('sbom-sev'))),
              h('td', { class: 'sbom-path', text: c.path.length > 2 ? c.path.slice(1, -1).map(name).join(' → ') : '' }), // prettier-ignore
            ),
          ),
        ),
      ),
    );
  }

  /**
   * @param {Sbom} sbom
   * @returns {HTMLElement}
   */
  vulnsView(sbom) {
    const t = this.t;
    if (!sbom.vulns.length) return noticeView(t('sbomNoVulns'));
    const name = (/** @type {string} */ ref) => {
      const c = sbom.components.get(ref);
      return c ? `${c.name}${c.version ? `@${c.version}` : ''}` : ref;
    };
    return h(
      'ul',
      { class: 'sbom-vulns', part: 'vulnerabilities' },
      ...sbom.vulns.map((v) =>
        h(
          'li',
          { class: `sbom-vuln sev-${v.severity}${v.state === 'not_affected' || v.state === 'false_positive' || v.state.startsWith('resolved') ? ' dismissed' : ''}`, attrs: { 'data-vuln': v.id } }, // prettier-ignore
          h(
            'p',
            { class: 'sbom-vuln-head' },
            h('span', { class: `sbom-sev sev-${v.severity}`, part: 'severity' }, h('span', { text: t(/** @type {StringKey} */ (`sbomSeverity_${v.severity}`)) }), v.score !== null ? h('span', { text: ` ${v.score.toFixed(1)}` }) : null), // prettier-ignore
            v.url ? h('a', { class: 'sbom-vuln-id', text: v.id, attrs: { href: v.url, rel: 'noopener noreferrer', target: '_blank' } }) : h('strong', { class: 'sbom-vuln-id', text: v.id }), // prettier-ignore
            v.method ? h('span', { class: 'sbom-muted', text: v.method }) : null,
            v.state ? h('span', { class: 'sbom-tag', text: `${t('sbomState')}: ${Object.hasOwn(strings, `sbomState_${v.state}`) ? t(/** @type {StringKey} */ (`sbomState_${v.state}`)) : v.state}` }) : null, // prettier-ignore
            ...v.cwes.map((c) => h('span', { class: 'sbom-tag', text: c })),
          ),
          v.description ? h('p', { class: 'sbom-desc', text: v.description }) : null,
          h('p', { class: 'sbom-affects' }, h('span', { class: 'sbom-muted', text: `${t('sbomAffects')}: ` }), ...v.affects.flatMap((ref, i) => [i ? ', ' : '', h('code', { text: name(ref) }), (sbom.components.get(ref)?.path.length ?? 0) > 2 ? h('span', { class: 'sbom-muted', text: ` (${t('sbomPath').toLowerCase()} ${/** @type {Component} */ (sbom.components.get(ref)).path.slice(1, -1).map(name).join(' → ')})` }) : '']).filter((x) => x !== '')), // prettier-ignore
          v.recommendation ? h('p', { class: 'sbom-reco' }, h('strong', { text: `${t('sbomRecommendation')}: ` }), v.recommendation) : null, // prettier-ignore
          v.vector ? h('p', {}, h('code', { class: 'sbom-vector', text: v.vector })) : null,
        ),
      ),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'json',
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
    this.previewTimer = setTimeout(() => this.render(), 400);
  }
}
