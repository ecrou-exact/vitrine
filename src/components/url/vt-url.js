// @ts-check
import urlCss from '../../styles/url.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { urlFromData } from '../../core/data-formats.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { analyzeUrl, chainSummary, cleanUrl, defangUrl, readUrls } from './url.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./url.js').Analysis} Analysis */
/** @typedef {import('./url.js').UrlParts} UrlParts */
/** @typedef {import('./url.js').Finding} Finding */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * Takes URLs apart and checks them: scheme, credentials, host with punycode decoded and
 * look-alike letters found, registered domain, port, path, decoded parameters and fragment,
 * and the URLs hidden in parameters (redirects, base64, Proofpoint). Findings name what
 * phishing links use: a host before `@`, disguised IP addresses, homographs, deceptive
 * subdomains, shorteners, shared hosting, executable downloads, e-mail addresses in the link.
 * One URL per line; with `chain`, the lines are the steps of a redirect chain. Nothing is
 * opened, fetched or resolved, and URLs are never links.
 *
 * @element vt-url
 * @since 0.15.0
 *
 * @attr {boolean} defang - Show URLs defanged (`hxxps[://]example[.]com`). Default: on.
 * @attr {boolean} parts - The table of parts and parameters. Default: on.
 * @attr {boolean} chain - The URLs are the steps of a redirect chain. Default: off.
 *
 * @prop {string} content - One URL per line.
 * @prop {Analysis[]} analyses - Each URL read and checked (read-only).
 *
 * @fires vt-ready - URLs rendered. Detail: `{ type: "url" }`.
 * @fires vt-copy - A URL copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart url - The card of a URL.
 * @csspart verdict - The verdict of a URL.
 * @csspart line - The URL with its parts colored.
 * @csspart findings - The list of findings.
 * @csspart parts - The table of parts.
 * @csspart params - The table of parameters.
 * @csspart nested - A URL hidden in another one.
 * @csspart chain - The summary of a redirect chain.
 *
 * @example
 * <vt-url variant="full">https://www.paypal.com@evil.example/login</vt-url>
 */
export class VtUrl extends VtBase {
  static type = 'url';

  static componentAttributes = Object.freeze(['defang', 'parts', 'chain']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [urlCss];

  static upgradeProperties = ['content'];

  static fromData = urlFromData;

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    /** @type {{ text: string, analyses: Analysis[], capped: boolean } | null} */
    this.cache = null;
  }

  /** @returns {{ analyses: Analysis[], capped: boolean }} */
  read() {
    const text = this.text ?? '';
    if (this.cache?.text !== text) {
      const { urls, capped } = readUrls(text);
      this.cache = { text, analyses: urls.map((u) => analyzeUrl(u)), capped };
    }
    return this.cache;
  }

  /** @type {Analysis[]} */
  get analyses() {
    return this.read().analyses;
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * @param {string} url
   * @returns {string}
   */
  shown(url) {
    return this.flag('defang', true) ? defangUrl(url) : url;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { analyses, capped } = this.read();
    const chain = this.flag('chain', false) && analyses.length > 1;
    const body = h('div', { class: 'body url-body', part: 'body' });
    if (!analyses.length) body.append(noticeView(t('urlEmpty')));
    if (chain) body.append(this.chainView(analyses));
    analyses.forEach((a, i) => body.append(this.card(a, chain ? i + 1 : 0, 0)));
    if (capped) body.append(noticeView(t('urlCapped', { count: analyses.length })));

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('url-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const valid = analyses.filter((a) => a.parts);
    const hrefs = () => valid.map((a) => /** @type {UrlParts} */ (a.parts).href);
    const tracked = valid.some((a) => a.parts?.query.some((p) => p.tracking));
    const copy = this.feature('copy') && valid.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => hrefs().map(defangUrl).join('\n'), t('urlCopyDefanged'), 'copy-defanged') : null, // prettier-ignore
      copy && tracked ? this.copyTextButton(() => valid.map((a) => cleanUrl(/** @type {UrlParts} */ (a.parts))).join('\n'), t('urlCopyClean'), 'copy-clean') : null, // prettier-ignore
      copy ? this.copyButton(() => hrefs().join('\n'), t(valid.length > 1 ? 'urlCopyAll' : 'urlCopy')) : null, // prettier-ignore
    ];
    const badge = analyses.length > 1 ? t('urlCount', { count: analyses.length }) : 'URL';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Analysis[]} steps
   * @returns {HTMLElement}
   */
  chainView(steps) {
    const t = this.t;
    const { domains, downgrade } = chainSummary(steps);
    return h(
      'div',
      { class: 'url-chain', part: 'chain' },
      h('p', { class: 'url-chain-title', text: t('urlChain', { count: steps.length, domains: domains.length }) }), // prettier-ignore
      h(
        'ol',
        { class: 'url-chain-domains' },
        ...domains.map((d) => h('li', {}, h('code', { text: this.flag('defang', true) ? d.replace(/\./g, '[.]') : d }))), // prettier-ignore
      ),
      downgrade
        ? h('p', { class: 'url-finding danger' }, icon('alert'), h('span', { text: t('urlChainDowngrade', { step: downgrade }) })) // prettier-ignore
        : null,
    );
  }

  /**
   * @param {Analysis} analysis
   * @param {number} step - 1-based step of a chain, or 0.
   * @param {number} depth
   * @returns {HTMLElement}
   */
  card(analysis, step, depth) {
    const t = this.t;
    const verdict = analysis.verdict;
    const parts = analysis.parts;
    const label = step ? t('urlStep', { step }) : this.shown(parts?.href ?? analysis.input);
    return h(
      'section',
      { class: `url-card ${verdict}`, part: 'url', attrs: { 'aria-label': label } },
      h(
        'header',
        { class: 'url-head' },
        h('span', { class: `url-verdict ${verdict}`, part: 'verdict' }, icon(verdict === 'none' ? 'shield-check' : 'shield-alert'), h('span', { text: t(/** @type {StringKey} */ (`urlVerdict_${verdict}`)) })), // prettier-ignore
        step ? h('span', { class: 'url-step', text: t('urlStep', { step }) }) : null,
      ),
      parts ? this.lineView(parts) : h('p', { class: 'url-line' }, h('code', { text: analysis.input })), // prettier-ignore
      this.findingsView(analysis.findings),
      parts && parts.hierarchical && this.flag('parts', true) ? this.partsView(parts) : null,
      ...analysis.nested.map((n) =>
        h(
          'div',
          { class: 'url-nested', part: 'nested' },
          h('p', { class: 'url-nested-title' }, icon('arrow-right'), h('span', { text: `${t('urlHiddenIn', { param: n.param })} · ${t(/** @type {StringKey} */ (`urlEncoding_${n.encoding}`))}` })), // prettier-ignore
          this.card(n.analysis, 0, depth + 1),
        ),
      ),
    );
  }

  /**
   * The URL with each part in its own color, the registered domain in bold.
   *
   * @param {UrlParts} parts
   * @returns {HTMLElement}
   */
  lineView(parts) {
    const defang = this.flag('defang', true);
    const dots = (/** @type {string} */ s) => (defang ? s.replace(/\./g, '[.]') : s);
    if (!parts.hierarchical)
      return h('p', { class: 'url-line', part: 'line' }, h('code', {}, h('span', { class: 'u-scheme', text: `${parts.scheme}${defang ? '[:]' : ':'}` }), h('span', { class: 'u-path', text: parts.path }))); // prettier-ignore
    const url = new URL(parts.href);
    const scheme = defang ? parts.scheme.replace(/^http/, 'hxxp').replace(/^ftp/, 'fxp') : parts.scheme; // prettier-ignore
    const user = parts.username || parts.password ? `${parts.username}${parts.password ? ':••••' : ''}@` : ''; // prettier-ignore
    const host = parts.hostType === 'domain' ? parts.hostUnicode : parts.host;
    const sub = parts.hostType === 'domain' && parts.subdomain ? `${parts.subdomain}.` : '';
    const domain = sub ? host.slice(sub.length) : host;
    return h(
      'p',
      { class: 'url-line', part: 'line' },
      h(
        'code',
        {},
        h('span', { class: 'u-scheme', text: `${scheme}${defang ? '[://]' : '://'}` }),
        user ? h('span', { class: 'u-user', text: dots(user) }) : null,
        sub ? h('span', { class: 'u-sub', text: dots(sub) }) : null,
        h('strong', { class: 'u-domain', text: dots(domain) }),
        parts.port ? h('span', { class: 'u-port', text: `:${parts.port}` }) : null,
        h('span', { class: 'u-path', text: url.pathname }),
        url.search ? h('span', { class: 'u-query', text: url.search }) : null,
        url.hash ? h('span', { class: 'u-fragment', text: url.hash }) : null,
      ),
    );
  }

  /**
   * @param {Finding[]} findings
   * @returns {HTMLElement | null}
   */
  findingsView(findings) {
    if (!findings.length) return null;
    const t = this.t;
    return h(
      'ul',
      { class: 'url-findings', part: 'findings', attrs: { 'aria-label': t('urlFindings') } },
      ...findings.map((f) => {
        /** @type {Record<string, string | number>} */
        const params = { ...f.params };
        if (typeof params.note === 'string') params.note = t(/** @type {StringKey} */ (`urlNote_${params.note}`)); // prettier-ignore
        if (typeof params.encoding === 'string') params.encoding = t(/** @type {StringKey} */ (`urlEncoding_${params.encoding}`)); // prettier-ignore
        if (this.flag('defang', true))
          for (const key of ['host', 'domain', 'fake', 'lookalike', 'unicode'])
            if (typeof params[key] === 'string') params[key] = String(params[key]).replace(/\./g, '[.]'); // prettier-ignore
        return h(
          'li',
          { class: `url-finding ${f.level}`, attrs: { 'data-finding': f.id } },
          icon(f.level === 'info' ? 'help' : 'alert'),
          h('span', { text: t(/** @type {StringKey} */ (`urlFinding_${f.id}`), params) }),
        );
      }),
    );
  }

  /**
   * @param {UrlParts} parts
   * @returns {HTMLElement}
   */
  partsView(parts) {
    const t = this.t;
    const defang = this.flag('defang', true);
    const dots = (/** @type {string} */ s) => (defang ? s.replace(/\./g, '[.]') : s);
    /** @type {[StringKey, string, string?][]} */
    const rows = [
      ['urlScheme', parts.scheme],
      ['urlUser', parts.username],
      ['urlPassword', parts.password ? t('urlPasswordHidden', { count: [...parts.password].length }) : ''], // prettier-ignore
      ['urlHost', dots(parts.hostType === 'domain' ? parts.hostUnicode : parts.host)],
      ['urlHostAscii', parts.hostUnicode !== parts.host ? dots(parts.host) : ''],
      ['urlDomain', parts.hostType === 'domain' ? dots(parts.domain) : ''],
      ['urlSubdomain', dots(parts.subdomain)],
      ['urlSuffix', parts.suffix],
      ['urlPort', parts.port],
      ['urlPath', parts.path === '/' ? '' : parts.path],
      ['urlFragment', parts.fragment],
    ];
    const table = h(
      'table',
      { class: 'url-parts', part: 'parts', attrs: { 'aria-label': t('urlParts') } },
      h(
        'tbody',
        {},
        ...rows
          .filter(([, value]) => value)
          .map(([key, value]) => h('tr', {}, h('th', { attrs: { scope: 'row' }, text: t(key) }), h('td', {}, h('code', { text: value })))), // prettier-ignore
      ),
    );
    if (!parts.query.length) return table;
    const params = h(
      'details',
      { class: 'url-params-box', attrs: { open: parts.query.length <= 12 } },
      h('summary', { text: t('urlParams', { count: parts.query.length }) }),
      h(
        'div',
        { class: 'url-scroll' },
        h(
          'table',
          { class: 'url-params', part: 'params' },
          h('thead', {}, h('tr', {}, h('th', { attrs: { scope: 'col' }, text: t('urlParamName') }), h('th', { attrs: { scope: 'col' }, text: t('urlParamValue') }))), // prettier-ignore
          h(
            'tbody',
            {},
            ...parts.query.map((p) =>
              h(
                'tr',
                { class: p.tracking ? 'tracking' : '' },
                h('th', { attrs: { scope: 'row' } }, h('code', { text: p.name }), p.tracking ? h('span', { class: 'url-tag', text: t('urlTracking') }) : null), // prettier-ignore
                h('td', {}, h('code', { text: p.value })),
              ),
            ),
          ),
        ),
      ),
    );
    return h('div', { class: 'url-details' }, table, params);
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
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}
