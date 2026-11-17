// @ts-check
import headersCss from '../../styles/headers.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { headersFromData } from '../../core/data-formats.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import {
  analyze,
  grade,
  isUnsafeSource,
  parseCsp,
  parseResponse,
  sortFindings,
  sourceKind,
} from './headers.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./headers.js').Finding} Finding */
/** @typedef {import('./headers.js').Grade} Grade */
/** @typedef {import('./headers.js').Response} Response */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** @type {Record<import('./headers.js').Level, string>} */
const ICONS = { bad: 'shield-alert', warn: 'alert', info: 'status-circle', ok: 'shield-check' };

/**
 * Checks the security headers of an HTTP response: HSTS, Content-Security-Policy (each
 * directive and source), framing, nosniff, Referrer-Policy, Permissions-Policy,
 * Cross-Origin-Opener-Policy, cookies, CORS, version leaks and obsolete headers. Shows a
 * grade, each finding in words with advice, the policy as a table and every header.
 *
 * Reads raw headers, `curl -I` or `curl -v` output, a JSON object of headers, or a
 * Content-Security-Policy alone. The headers are only read: nothing is fetched or sent.
 *
 * @element vt-headers
 * @since 0.15.0
 *
 * @attr {boolean} https - The response is served over HTTPS (HSTS and Secure cookies are checked). Default: on.
 * @attr {boolean} passed - Also list the checks that passed. Default: on.
 * @attr {boolean} policy - Table of the Content-Security-Policy directives. Default: on.
 * @attr {boolean} headers - List of every header, folded. Default: on.
 *
 * @prop {string} content - The headers.
 * @prop {Finding[]} findings - The findings (read-only), most severe first.
 * @prop {Grade | null} grade - The grade (read-only), `null` without headers.
 *
 * @fires vt-ready - Report rendered. Detail: `{ type: "headers" }`.
 * @fires vt-copy - Report copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart grade - The grade.
 * @csspart findings - The list of findings.
 * @csspart finding - A finding.
 * @csspart policy - The Content-Security-Policy table.
 * @csspart headers - The list of every header.
 *
 * @example
 * <vt-headers variant="full">
 *   <template>
 *     HTTP/2 200
 *     strict-transport-security: max-age=63072000; includeSubDomains
 *     content-security-policy: default-src 'self'; object-src 'none'; base-uri 'none'
 *   </template>
 * </vt-headers>
 */
export class VtHeaders extends VtBase {
  static type = 'headers';

  static fromData = headersFromData;

  static componentAttributes = Object.freeze(['https', 'passed', 'policy', 'headers']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [headersCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /**
   * @param {string} name
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) !== false;
  }

  /** @returns {{ response: Response, findings: Finding[] }} */
  report() {
    const response = parseResponse(this.text ?? '');
    const findings = response.headers.length
      ? sortFindings(analyze(response, { https: this.flag('https') }))
      : [];
    return { response, findings };
  }

  /** @type {Finding[]} */
  get findings() {
    return this.report().findings;
  }

  /** @type {Grade | null} */
  get grade() {
    const { response, findings } = this.report();
    return response.headers.length ? grade(findings) : null;
  }

  /**
   * @param {Finding} finding
   * @returns {string}
   */
  message(finding) {
    return this.t(/** @type {StringKey} */ (`hdr_${finding.id}`), finding.params);
  }

  /**
   * The report as plain text, one finding per line.
   *
   * @returns {string}
   */
  reportText() {
    const { response, findings } = this.report();
    if (!response.headers.length) return '';
    const lines = findings.map(
      (f) => `[${this.t(/** @type {StringKey} */ (`hdrLevel_${f.level}`))}] ${f.header}: ${this.message(f)}`, // prettier-ignore
    );
    return [this.t('hdrGrade', { grade: grade(findings) }), '', ...lines].join('\n');
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { response, findings } = this.report();
    const body = h('div', { class: 'body hdr-body', part: 'body' });
    /** @type {string} */
    let badge = 'HTTP';
    if (!response.headers.length) body.append(noticeView(t('hdrNone')));
    else {
      const result = grade(findings);
      badge = t('hdrGrade', { grade: result });
      body.append(this.summaryView(result, findings));
      const shown = this.flag('passed') ? findings : findings.filter((f) => f.level !== 'ok');
      if (shown.length) body.append(this.findingsView(shown));
      const csp = response.headers.find((x) => x.name === 'content-security-policy') ??
        response.headers.find((x) => x.name === 'content-security-policy-report-only'); // prettier-ignore
      if (csp && this.flag('policy')) body.append(this.policyView(csp.value));
      if (!response.cspOnly && this.flag('headers')) body.append(this.headersView(response));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('hdr-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && response.headers.length
        ? this.copyButton(() => this.reportText(), t('hdrCopyReport'))
        : null,
    ];
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Grade} result
   * @param {Finding[]} findings
   * @returns {HTMLElement}
   */
  summaryView(result, findings) {
    const t = this.t;
    const bad = findings.filter((f) => f.level === 'bad').length;
    const warn = findings.filter((f) => f.level === 'warn').length;
    const tone = bad ? 'bad' : warn ? 'warn' : 'ok';
    return h(
      'div',
      { class: `hdr-summary ${tone}` },
      h('span', {
        class: 'hdr-grade',
        part: 'grade',
        text: result,
        attrs: { role: 'img', 'aria-label': t('hdrGrade', { grade: result }) },
      }),
      h(
        'div',
        { class: 'hdr-summary-text' },
        h('strong', { text: t('hdrSummary', { bad, warn }) }),
        h('span', { class: 'hdr-muted', text: t('hdrNotFetched') }),
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
      { class: 'hdr-findings', part: 'findings', attrs: { 'aria-label': t('hdrFindings') } },
      ...findings.map((f) =>
        h(
          'li',
          { class: `hdr-finding ${f.level}`, part: 'finding' },
          h(
            'span',
            { class: 'hdr-level' },
            icon(ICONS[f.level]),
            h('span', { class: 'hdr-level-text', text: t(/** @type {StringKey} */ (`hdrLevel_${f.level}`)) }), // prettier-ignore
          ),
          h(
            'span',
            { class: 'hdr-message' },
            h('code', { class: 'hdr-name', text: f.header }),
            h('span', { text: this.message(f) }),
          ),
        ),
      ),
    );
  }

  /**
   * Directives with their sources colored by kind; risky sources are marked.
   *
   * @param {string} policy
   * @returns {HTMLElement}
   */
  policyView(policy) {
    const t = this.t;
    const rows = parseCsp(policy).map((d) =>
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'row' } }, h('code', { text: d.name })),
        h(
          'td',
          { class: 'hdr-sources' },
          ...d.sources.map((source) => {
            const risky =
              /^'unsafe-(?:inline|eval|hashes)'$/i.test(source) ||
              (/^(?:script-src|default-src|object-src)$/.test(d.name) && isUnsafeSource(source));
            return h('code', {
              class: `hdr-source src-${sourceKind(source)}${risky ? ' risky' : ''}`,
              text: source,
            });
          }),
        ),
      ),
    );
    return h(
      'section',
      { class: 'hdr-section', attrs: { 'aria-label': t('hdrPolicy') } },
      h('h3', { class: 'hdr-title', text: t('hdrPolicy') }),
      h(
        'div',
        { class: 'hdr-scroll' },
        h(
          'table',
          { class: 'hdr-table', part: 'policy' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'col' }, text: t('hdrDirective') }),
              h('th', { attrs: { scope: 'col' }, text: t('hdrSources') }),
            ),
          ),
          h('tbody', {}, ...rows),
        ),
      ),
    );
  }

  /**
   * @param {Response} response
   * @returns {HTMLElement}
   */
  headersView(response) {
    const t = this.t;
    const rows = response.headers.map((x) =>
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'row' } }, h('code', { text: x.name })),
        h('td', {}, h('code', { class: 'hdr-value', text: x.value })),
      ),
    );
    return h(
      'details',
      { class: 'hdr-all', part: 'headers' },
      h('summary', { text: t('hdrHeaders', { count: response.headers.length }) }),
      response.status
        ? h('p', {}, h('code', { class: 'hdr-status', text: response.status }))
        : null,
      h(
        'div',
        { class: 'hdr-scroll' },
        h(
          'table',
          { class: 'hdr-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'col' }, text: t('hdrName') }),
              h('th', { attrs: { scope: 'col' }, text: t('hdrValue') }),
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
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.render(), 250);
  }
}
