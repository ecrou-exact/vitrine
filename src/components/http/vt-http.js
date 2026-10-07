// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import httpCss from '../../styles/http.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, iconButton, noticeView } from '../../core/ui.js';
import { parseJson, stringify } from '../json/parser.js';
import {
  HttpParseError,
  absoluteUrl,
  formParams,
  getHeader,
  parseExchange,
  queryParams,
  toRawHttp,
} from './message.js';
import { hasSecrets, maskExchange } from './secrets.js';
import { SNIPPET_HIGHLIGHT, SNIPPET_LANGUAGES, snippet } from './snippets.js';

/** @typedef {import('./message.js').HttpExchange} HttpExchange */
/** @typedef {import('./message.js').HttpRequest} HttpRequest */
/** @typedef {import('./message.js').HttpResponse} HttpResponse */
/** @typedef {import('./message.js').Header} Header */
/** @typedef {import('./snippets.js').SnippetLanguage} SnippetLanguage */

const VIEWS = /** @type {const} */ (['exchange', 'code']);
const LAYOUTS = /** @type {const} */ (['stacked', 'columns']);
const LANGUAGE_LABELS = /** @type {Record<SnippetLanguage, string>} */ ({
  curl: 'curl',
  fetch: 'fetch',
  python: 'Python',
  httpie: 'HTTPie',
});

/** @typedef {typeof VIEWS[number]} View */

/**
 * Shows an HTTP request and its response, and the same request as code.
 *
 * Give it raw HTTP (as in `.http` files), a curl command, JSON, or a HAR entry exported
 * from browser developer tools. Bodies are formatted by content type, the status is
 * colored by class, credentials are masked until the reader reveals them, and the Code
 * tab writes the request for curl, fetch, Python and HTTPie.
 *
 * Nothing is ever sent: the component only displays the exchange.
 *
 * @element vt-http
 * @since 0.7.0
 *
 * @attr {"exchange"|"code"} view - Initial view (default `exchange`).
 * @attr {boolean} tabs - Exchange / Code tabs. Full variant: on.
 * @attr {string} snippets - Code languages and their order, separated by spaces (default `curl fetch python httpie`).
 * @attr {boolean} mask-secrets - Masks credentials until revealed (default on).
 * @attr {"stacked"|"columns"} layout - Response under the request (default) or next to it on wide screens.
 *
 * @prop {string} content - The exchange as raw HTTP, a curl command or JSON.
 * @prop {{ request: object | null, response: object | null }} exchange - The parsed exchange (read and write).
 *
 * @fires vt-tab-change - A view, section or code language was chosen. Detail: `{ tab }`.
 *
 * @csspart request - The request section.
 * @csspart response - The response section.
 * @csspart method - The method badge.
 * @csspart url - The URL.
 * @csspart status - The status badge (also `status-2xx`… by class).
 * @csspart headers - A headers or parameters table.
 * @csspart message-body - A message body.
 * @csspart snippet - The generated code.
 *
 * @example
 * <vt-http variant="full">
 *   <template>
 *     GET /api/users/42 HTTP/1.1
 *     Host: api.example.com
 *
 *     HTTP/1.1 200 OK
 *     Content-Type: application/json
 *
 *     {"id": 42, "name": "Ada"}
 *   </template>
 * </vt-http>
 */
export class VtHttp extends VtBase {
  static type = 'http';

  static componentAttributes = Object.freeze([
    'view', 'tabs', 'snippets', 'mask-secrets', 'layout',
  ]); // prettier-ignore

  static presets = {
    simple: { 'mask-secrets': true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      tabs: true, 'mask-secrets': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, httpCss];

  static upgradeProperties = ['content', 'exchange'];

  constructor() {
    super();
    /** @type {{ text: string, exchange: HttpExchange | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {View | null} */
    this.viewState = null;
    /** @type {string | null} Request section shown: headers, query or body. */
    this.requestTab = null;
    /** @type {string | null} Response section shown: body or headers. */
    this.responseTab = null;
    /** @type {SnippetLanguage | null} */
    this.language = null;
    /** Secrets shown by the reader. */
    this.revealed = false;
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {HTMLElement | null} */
    this.previewHost = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.requestTab = null;
    this.responseTab = null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    if (name === 'snippets') this.language = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ exchange: HttpExchange | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) {
      try {
        this.parsed = { text, exchange: parseExchange(text), error: null };
      } catch (error) {
        this.parsed = {
          text,
          exchange: null,
          error: error instanceof Error ? error : new HttpParseError(String(error)),
        };
      }
    }
    return this.parsed;
  }

  /** @returns {{ request: object | null, response: object | null }} */
  get exchange() {
    const exchange = this.parse().exchange;
    return {
      request: exchange?.request ? structuredClone(exchange.request) : null,
      response: exchange?.response ? structuredClone(exchange.response) : null,
    };
  }

  set exchange(value) {
    let json;
    try {
      json = JSON.stringify(value ?? {});
    } catch {
      json = '{}';
    }
    this.content = json;
  }

  /** Secrets are hidden right now. */
  get masking() {
    return this.feature('mask-secrets') && !this.revealed;
  }

  /** @returns {HttpExchange | null} The exchange as displayed (masked or not). */
  shown() {
    const exchange = this.parse().exchange;
    if (!exchange) return null;
    return this.masking ? maskExchange(exchange) : exchange;
  }

  /** @returns {SnippetLanguage[]} */
  get languages() {
    const value = this.getAttribute('snippets');
    if (value === null) return [...SNIPPET_LANGUAGES];
    const chosen = value
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((name) => /** @type {readonly string[]} */ (SNIPPET_LANGUAGES).includes(name));
    return /** @type {SnippetLanguage[]} */ ([...new Set(chosen)]);
  }

  /** @returns {View} */
  get view() {
    const view = this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'exchange');
    // The Code view needs a request and at least one language.
    return view === 'code' && this.parse().exchange?.request && this.languages.length
      ? 'code'
      : 'exchange';
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { exchange, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLElement[]} */
    let extra = [];

    if (this.editing) {
      const editor = this.createEditor();
      this.previewHost = h('div', { class: 'body http-body http-preview', part: 'body preview' });
      panel.classList.add('http-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        this.previewHost,
      );
      this.renderPreview();
      extra = this.historyButtons(editor);
    } else {
      this.previewHost = null;
      panel.append(
        h(
          'div',
          {
            class: 'body http-body',
            part: 'body',
            attrs: {
              tabindex: '0',
              role: 'region',
              'aria-label': this.heading || this.t('httpExchange'),
            },
          },
          ...this.renderView(),
        ),
      );
    }

    const view = this.view;
    const canCode = Boolean(exchange?.request) && this.languages.length > 0;
    const tabs =
      this.feature('tabs') && !this.editing && canCode
        ? createTabs({
            tabs: [
              { id: 'exchange', label: t('httpExchange'), icon: 'list' },
              { id: 'code', label: t('code'), icon: 'code' },
            ],
            selected: view,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => this.select('view', id),
          })
        : null;
    if (tabs) panel.setAttribute('role', 'tabpanel');

    /** @type {TextSearch | null} */
    let search = null;
    const target = {
      /** @param {string} query */
      run: (query) => {
        const root = this.root.querySelector('.http');
        search = root ? new TextSearch(root, { skip: 'button, .sr-only' }) : null;
        return search ? search.run(query) : { total: 0, capped: false };
      },
      /** @param {number} index */
      go: (index) => revealMatch(search?.go(index) ?? null),
      clear: () => search?.clear(),
    };

    const secrets = this.feature('mask-secrets') && exchange && !error && hasSecrets(exchange);
    const actions = [
      this.searchButton(target),
      ...extra,
      secrets
        ? iconButton({
            icon: this.revealed ? 'eye-off' : 'eye',
            label: t(this.revealed ? 'hideSecrets' : 'showSecrets'),
            key: 'secrets',
            part: 'secrets-button',
            pressed: this.revealed,
            onClick: () => {
              this.revealed = !this.revealed;
              this.render();
              this.announce(t(this.revealed ? 'secretsShown' : 'secretsHidden'));
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.rawText(),
            this.downloadName('exchange.http'),
            'text/plain',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.rawText(), t('copy')) : null,
    ];
    frame.append(...this.chrome({ badge: tabs ? '' : 'HTTP', tabs, actions }), panel);
    this.editor?.align();
  }

  /** @returns {string} The exchange as raw HTTP, as displayed (masked or not). */
  rawText() {
    const shown = this.shown();
    return shown ? toRawHttp(shown) : (this.text ?? '');
  }

  /**
   * @param {"view" | "request" | "response" | "language"} what
   * @param {string} id
   */
  select(what, id) {
    if (what === 'view') this.viewState = /** @type {View} */ (id);
    else if (what === 'request') this.requestTab = id;
    else if (what === 'response') this.responseTab = id;
    else this.language = /** @type {SnippetLanguage} */ (id);
    this.render();
    emit(this, EVENTS.TAB_CHANGE, { tab: id });
  }

  /** @returns {HTMLElement[]} The content of the current view. */
  renderView() {
    const { error } = this.parse();
    const exchange = this.shown();
    if (error) return [noticeView(this.t('invalidHttp', { message: error.message }))];
    if (!exchange || (!exchange.request && !exchange.response))
      return [h('div', { class: 'empty', part: 'empty', text: this.t('empty') })];
    if (this.view === 'code' && exchange.request) return [this.codeView(exchange)];
    const layout = parseEnum(this.getAttribute('layout'), LAYOUTS, 'stacked');
    const http = h('div', { class: `http ${layout}` });
    if (exchange.request) http.append(this.requestSection(exchange.request));
    if (exchange.response) http.append(this.responseSection(exchange.response));
    return [http];
  }

  /**
   * @param {HttpRequest} request
   * @returns {HTMLElement}
   */
  requestSection(request) {
    const t = this.t;
    const query = queryParams(request.url);
    const sections = [
      request.body ? { id: 'body', label: t('httpBody') } : null,
      { id: 'headers', label: `${t('httpHeaders')} ${request.headers.length}` },
      query.length ? { id: 'query', label: `${t('httpQuery')} ${query.length}` } : null,
    ].filter((section) => section !== null);
    const tab = sections.some((s) => s.id === this.requestTab)
      ? /** @type {string} */ (this.requestTab)
      : sections[0].id;

    const line = h(
      'div',
      { class: 'start-line' },
      h('span', {
        class: `method method-${request.method.toLowerCase()}`,
        part: 'method',
        text: request.method,
      }),
      this.urlNode(request),
    );
    const url = absoluteUrl(request);
    const copyUrl = this.copyButton(() => url, t('copyUrl'), 'copy-url');
    copyUrl.classList.add('line-copy');
    line.append(copyUrl);

    /** @type {HTMLElement} */
    let content;
    if (tab === 'headers') content = this.table(request.headers, t('httpHeaders'));
    else if (tab === 'query') content = this.table(query, t('httpQuery'));
    else content = this.bodyView(request.body, getHeader(request.headers, 'content-type'));

    return h(
      'section',
      { class: 'http-message request', part: 'request', attrs: { 'aria-label': t('httpRequest') } },
      line,
      this.sectionTabs('request', sections, tab, t('httpRequest')),
      h('div', { class: 'section-panel', attrs: { id: `${this.panelId}-request` } }, content),
    );
  }

  /**
   * @param {HttpResponse} response
   * @returns {HTMLElement}
   */
  responseSection(response) {
    const t = this.t;
    const sections = [
      { id: 'body', label: t('httpBody') },
      { id: 'headers', label: `${t('httpHeaders')} ${response.headers.length}` },
    ];
    const tab = this.responseTab === 'headers' ? 'headers' : 'body';
    const kind = `${Math.floor(response.status / 100)}xx`;
    const line = h(
      'div',
      { class: 'start-line' },
      h('span', {
        class: `status status-${kind}`,
        part: `status status-${kind}`,
        text: `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      }),
    );
    /** @type {string[]} */
    const meta = [];
    if (response.time !== null)
      meta.push(`${formatNumber(Math.round(response.time), this.locale)} ms`);
    if (response.body)
      meta.push(formatSize(new TextEncoder().encode(response.body).length, this.locale));
    if (meta.length) line.append(h('span', { class: 'meta', text: meta.join(', ') }));

    const content =
      tab === 'headers'
        ? this.table(response.headers, t('httpHeaders'))
        : this.bodyView(response.body, getHeader(response.headers, 'content-type'));
    return h(
      'section',
      {
        class: 'http-message response',
        part: 'response',
        attrs: { 'aria-label': t('httpResponse') },
      },
      line,
      this.sectionTabs('response', sections, tab, t('httpResponse')),
      h('div', { class: 'section-panel', attrs: { id: `${this.panelId}-response` } }, content),
    );
  }

  /**
   * Small tab list of a section (request: body, headers, query; response: body, headers).
   *
   * @param {"request" | "response"} section
   * @param {{ id: string, label: string }[]} tabs
   * @param {string} selected
   * @param {string} label
   * @returns {HTMLElement}
   */
  sectionTabs(section, tabs, selected, label) {
    const list = createTabs({
      tabs: tabs.map((tab) => ({ id: `${section}-${tab.id}`, label: tab.label })),
      selected: `${section}-${selected}`,
      label,
      panelId: `${this.panelId}-${section}`,
      onSelect: (id) => this.select(section, id.slice(section.length + 1)),
    });
    list.classList.add('section-tabs');
    list.setAttribute('part', 'section-tabs');
    return list;
  }

  /**
   * The URL with its parts styled: origin muted, path, query.
   *
   * @param {HttpRequest} request
   * @returns {HTMLElement}
   */
  urlNode(request) {
    const node = h('code', { class: 'url', part: 'url' });
    const { origin, path, rest } = splitUrl(request.url);
    const host = getHeader(request.headers, 'host');
    if (origin) node.append(h('span', { class: 'origin', text: origin }));
    else if (host) node.append(h('span', { class: 'origin implied', text: host }));
    for (const part of pathParts(path)) {
      node.append(part.param ? h('span', { class: 'param', text: part.text }) : part.text);
    }
    if (rest) node.append(h('span', { class: 'query', text: rest }));
    return node;
  }

  /**
   * A table of name / value pairs (headers, query parameters, form fields).
   *
   * @param {Header[]} rows
   * @param {string} label
   * @returns {HTMLElement}
   */
  table(rows, label) {
    if (!rows.length) return h('p', { class: 'none', text: this.t('httpNone') });
    return h(
      'table',
      { class: 'pairs', part: 'headers', attrs: { 'aria-label': label } },
      h(
        'tbody',
        {},
        ...rows.map(([name, value]) =>
          h('tr', {}, h('th', { attrs: { scope: 'row' }, text: name }), h('td', { text: value })),
        ),
      ),
    );
  }

  /**
   * A body, formatted by content type.
   *
   * @param {string} body
   * @param {string | null} contentType
   * @returns {HTMLElement}
   */
  bodyView(body, contentType) {
    if (!body) return h('p', { class: 'none', text: this.t('httpNoBody') });
    const type = (contentType ?? '').toLowerCase();
    if (type.includes('x-www-form-urlencoded'))
      return this.table(formParams(body), this.t('httpBody'));
    let text = body;
    let language = 'plaintext';
    if (type.includes('json') || (!type && /^\s*[[{]/.test(body))) {
      const parsed = parseJson(body, { maxDepth: getConfig().maxDepth });
      if (parsed.ok) {
        text = stringify(parsed.value, { indent: 2, sortKeys: false });
        language = 'json';
      }
    } else if (/xml|html|svg/.test(type) || (!type && /^\s*</.test(body))) language = 'xml';
    else if (/javascript|ecmascript/.test(type)) language = 'javascript';
    else if (/yaml/.test(type)) language = 'yaml';
    const view = buildCodeView(text, {
      language,
      lineNumbers: false,
      startLine: 1,
      highlightRanges: [],
      diff: false,
      highlightLimit: getConfig().highlightLimit,
    });
    return h('div', { class: 'message-body', part: 'message-body' }, view.element);
  }

  /**
   * The Code view: the request written for each language.
   *
   * @param {HttpExchange} exchange
   * @returns {HTMLElement}
   */
  codeView(exchange) {
    const t = this.t;
    const languages = this.languages;
    const language =
      this.language && languages.includes(this.language) ? this.language : languages[0];
    const request = /** @type {HttpRequest} */ (exchange.request);
    const responseType = /json/i.test(
      getHeader(exchange.response?.headers ?? [], 'content-type') ??
        getHeader(request.headers, 'accept') ??
        '',
    )
      ? 'json'
      : 'text';
    const code = snippet(request, language, { responseType });
    const list = createTabs({
      tabs: languages.map((id) => ({ id: `code-${id}`, label: LANGUAGE_LABELS[id] })),
      selected: `code-${language}`,
      label: t('codeLanguage'),
      panelId: `${this.panelId}-code`,
      onSelect: (id) => this.select('language', id.slice(5)),
    });
    list.classList.add('section-tabs');
    list.setAttribute('part', 'section-tabs');
    const view = buildCodeView(code, {
      language: SNIPPET_HIGHLIGHT[language],
      lineNumbers: false,
      startLine: 1,
      highlightRanges: [],
      diff: false,
      highlightLimit: getConfig().highlightLimit,
    });
    const copy = this.copyButton(() => code, t('copyCode'), 'copy-snippet');
    copy.classList.add('snippet-copy');
    return h(
      'div',
      { class: 'http code-panel' },
      h('div', { class: 'code-head' }, list, copy),
      h(
        'div',
        {
          class: 'snippet',
          part: 'snippet',
          attrs: { id: `${this.panelId}-code`, role: 'tabpanel' },
        },
        view.element,
      ),
      this.masking && hasSecrets(/** @type {HttpExchange} */ (this.parse().exchange))
        ? h('p', { class: 'note', text: t('secretsInCode') })
        : null,
    );
  }

  // ------------------------------------------------------------------ editing

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
    this.previewTimer = setTimeout(() => this.renderPreview(), 150);
  }

  /** Renders the live preview under the editor. */
  renderPreview() {
    const host = this.previewHost;
    if (!host) return;
    const scroll = host.scrollTop;
    host.replaceChildren(...this.renderView());
    host.scrollTop = scroll;
    if (this.searchOpen && this.searchQuery) this.searchBar?.run();
  }
}

/**
 * Splits a URL into its origin (`https://host`, if any), path, and the rest (query and
 * fragment), with linear scans only.
 *
 * @param {string} url
 * @returns {{ origin: string, path: string, rest: string }}
 */
export function splitUrl(url) {
  let start = 0;
  const scheme = url.indexOf('://');
  if (scheme > 0 && /^[a-z][a-z0-9+.-]*$/i.test(url.slice(0, scheme))) {
    let end = scheme + 3;
    while (end < url.length && !'/?#'.includes(url[end])) end += 1;
    start = end;
  }
  let pathEnd = start;
  while (pathEnd < url.length && url[pathEnd] !== '?' && url[pathEnd] !== '#') pathEnd += 1;
  return { origin: url.slice(0, start), path: url.slice(start, pathEnd), rest: url.slice(pathEnd) };
}

/**
 * Splits a path into text and parameters written as `{id}` or `:id` (after a `/`), in one
 * pass.
 *
 * @param {string} path
 * @returns {{ text: string, param: boolean }[]}
 */
export function pathParts(path) {
  /** @type {{ text: string, param: boolean }[]} */
  const parts = [];
  // nextStop[k]: index of the first "}" or "/" at or after k (-1 if none), in one pass.
  /** @type {number[]} */
  const nextStop = new Array(path.length + 1).fill(-1);
  for (let k = path.length - 1; k >= 0; k -= 1)
    nextStop[k] = path[k] === '}' || path[k] === '/' ? k : nextStop[k + 1];
  let text = '';
  let i = 0;
  const flush = () => {
    if (text) parts.push({ text, param: false });
    text = '';
  };
  while (i < path.length) {
    const char = path[i];
    if (char === '{') {
      // The next "}" or "/" after this brace, found once for the whole path.
      const close = nextStop[i + 1] ?? -1;
      if (close > i + 1 && path[close] === '}') {
        flush();
        parts.push({ text: path.slice(i, close + 1), param: true });
        i = close + 1;
        continue;
      }
    } else if (char === ':' && path[i - 1] === '/' && /[A-Za-z_]/.test(path[i + 1] ?? '')) {
      let end = i + 2;
      while (end < path.length && /\w/.test(path[end])) end += 1;
      flush();
      parts.push({ text: path.slice(i, end), param: true });
      i = end;
      continue;
    }
    text += char;
    i += 1;
  }
  flush();
  return parts;
}

/**
 * @param {number} bytes
 * @param {string} locale
 * @returns {string}
 */
function formatSize(bytes, locale) {
  if (bytes < 1000) return `${formatNumber(bytes, locale)} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
