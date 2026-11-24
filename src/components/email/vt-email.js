// @ts-check
import emailCss from '../../styles/email.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { defang } from '../ioc/ioc.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { analyze, hasDoubleExtension, isRiskyAttachment, parseMessage } from './email.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./email.js').Message} Message */
/** @typedef {import('./email.js').Finding} Finding */
/** @typedef {import('./email.js').Address} Address */
/** @typedef {import('./email.js').Attachment} Attachment */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const VIEWS = /** @type {const} */ (['summary', 'path', 'body', 'links', 'attachments', 'headers']);
/** @typedef {typeof VIEWS[number]} View */

/** @type {Record<string, string>} */
const ICONS = { bad: 'shield-alert', warn: 'alert', info: 'status-circle' };

/**
 * Analyzes a raw e-mail message (`.eml`) for phishing: sender, recipients and subject (encoded
 * words decoded), SPF / DKIM / DMARC results, the Received path with delays, the body as text,
 * links (deceptive ones marked), attachments with their SHA-256, every header, and findings
 * (spoofed display name, Reply-To elsewhere, failed authentication, risky attachments…).
 *
 * The message is only read: HTML is reduced to text without being parsed into a DOM, links
 * are shown defanged and never opened, images are never loaded.
 *
 * @element vt-email
 * @since 0.15.0
 *
 * @attr {"summary" | "path" | "body" | "links" | "attachments" | "headers"} view - Tab shown first. Default: summary.
 * @attr {boolean} defang - Show links and addresses defanged. Default: on.
 * @attr {boolean} hashes - Compute the SHA-256 of attachments. Default: on.
 *
 * @prop {string} content - The raw message.
 * @prop {Message | null} message - The message read (read-only), `null` without headers.
 * @prop {Finding[]} findings - The findings (read-only), most severe first.
 *
 * @fires vt-ready - Message rendered. Detail: `{ type: "email" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-copy - Headers copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary fields.
 * @csspart auth - The authentication results.
 * @csspart findings - The list of findings.
 * @csspart hops - The Received path table.
 * @csspart text - The body text.
 * @csspart links - The links table.
 * @csspart attachments - The attachments table.
 * @csspart headers - The headers table.
 *
 * @example
 * <vt-email variant="full" src="suspicious.eml"></vt-email>
 */
export class VtEmail extends VtBase {
  static type = 'email';

  static componentAttributes = Object.freeze(['view', 'defang', 'hashes']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [emailCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {{ text: string, message: Message | null } | null} */
    this.parsed = null;
    /** @type {WeakMap<Attachment, string | null>} */
    this.hashCache = new WeakMap();
    /** @type {WeakSet<Attachment>} */
    this.pendingHashes = new WeakSet();
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Message | null} */
  get message() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, message: parseMessage(text) };
    return this.parsed.message;
  }

  /** @type {Finding[]} */
  get findings() {
    const message = this.message;
    return message ? analyze(message) : [];
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'summary');
  }

  get defanged() {
    return parseBoolean(this.getAttribute('defang')) !== false;
  }

  /**
   * @param {string} type
   * @param {string} value
   */
  safe(type, value) {
    return this.defanged ? defang(/** @type {import('../ioc/ioc.js').IocType} */ (type), value) : value; // prettier-ignore
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const message = this.message;
    const view = this.view;
    const body = h('div', { class: 'body email-body', part: 'body', attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('emailSummary') } }); // prettier-ignore
    let tabs = null;
    if (!message) body.append(noticeView(t('emailInvalid')));
    else {
      tabs = !this.feature('tabs')
        ? null
        : createTabs({
            tabs: [
              { id: 'summary', label: t('emailSummary') },
              { id: 'path', label: t('emailPath') },
              { id: 'body', label: t('emailBody') },
              { id: 'links', label: t('emailLinks', { count: message.links.length }) },
              { id: 'attachments', label: t('emailAttachments', { count: message.attachments.length }) }, // prettier-ignore
              { id: 'headers', label: t('emailHeaders', { count: message.headers.length }) },
            ],
            selected: view,
            label: t('emailTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectView(/** @type {View} */ (id)),
          });
      if (view === 'path') body.append(this.pathView(message));
      else if (view === 'body') body.append(this.bodyView(message));
      else if (view === 'links') body.append(this.linksView(message));
      else if (view === 'attachments') body.append(this.attachmentsView(message));
      else if (view === 'headers') body.append(this.headersView(message));
      else body.append(...this.summaryView(message));
      if (view === 'attachments') this.computeHashes(message);
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('email-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && message
        ? this.copyButton(() => message.headers.map((x) => `${x.name}: ${x.value}`).join('\n'), t('emailCopyHeaders')) // prettier-ignore
        : null,
    ];
    frame.append(...this.chrome({ badge: 'EML', tabs, actions }), panel);
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
   * @param {Address[]} list
   */
  addresses(list) {
    return list.map((a) => (a.name ? `${a.name} <${this.safe('email', a.address)}>` : this.safe('email', a.address))).join(', '); // prettier-ignore
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement[]}
   */
  summaryView(message) {
    const t = this.t;
    /** @type {[StringKey, string][]} */
    const fields = [
      ['emailFrom', this.addresses(message.from)],
      ['emailReplyTo', this.addresses(message.replyTo)],
      ['emailTo', this.addresses(message.to)],
      ['emailCc', this.addresses(message.cc)],
      ['emailSubject', message.subject],
      ['emailDate', message.date === null ? '' : this.formatDate(message.date)],
      ['emailReturnPath', message.returnPath ? this.safe('email', message.returnPath) : ''],
      ['emailMessageId', message.messageId],
    ];
    const list = h(
      'dl',
      { class: 'email-fields', part: 'summary' },
      ...fields.filter(([, v]) => v).map(([key, value]) => h('div', {}, h('dt', { text: t(key) }), h('dd', { text: value }))), // prettier-ignore
    );
    const auth = message.auth.length
      ? h(
          'div',
          {
            class: 'email-auth',
            part: 'auth',
            attrs: { role: 'group', 'aria-label': t('emailAuth') },
          },
          ...message.auth.map((r) => {
            const tone = r.result === 'pass' ? 'ok' : r.result === 'fail' || r.result === 'permerror' ? 'bad' : 'warn'; // prettier-ignore
            return h(
              'span',
              { class: `email-auth-item ${tone}`, attrs: { title: r.detail } },
              icon(tone === 'ok' ? 'check' : 'alert'),
              h('span', { text: `${r.method.toUpperCase()} ${r.result}` }),
            );
          }),
        )
      : null;
    const findings = analyze(message);
    const list2 = findings.length
      ? h(
          'ul',
          {
            class: 'email-findings',
            part: 'findings',
            attrs: { 'aria-label': t('emailFindings') },
          },
          ...findings.map((f) =>
            h(
              'li',
              { class: `email-finding ${f.level}` },
              h('span', { class: 'email-level' }, icon(ICONS[f.level]), h('span', { text: t(/** @type {StringKey} */ (`emailLevel_${f.level}`)) })), // prettier-ignore
              h('span', {
                text: t(/** @type {StringKey} */ (`email_${f.id}`), this.safeParams(f)),
              }),
            ),
          ),
        )
      : h('p', { class: 'email-muted', text: t('emailNoFindings') });
    /** @type {HTMLElement[]} */
    const out = [list];
    if (auth) out.push(auth);
    out.push(list2, h('p', { class: 'email-note', text: t('emailNotRun') }));
    return out;
  }

  /**
   * Finding parameters with addresses defanged.
   *
   * @param {Finding} f
   */
  safeParams(f) {
    if (!f.params) return undefined;
    /** @type {Record<string, string | number>} */
    const params = { ...f.params };
    for (const key of ['address', 'shown'])
      if (typeof params[key] === 'string') params[key] = this.safe('email', String(params[key]));
    return params;
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement}
   */
  pathView(message) {
    const t = this.t;
    if (!message.hops.length) return h('p', { class: 'email-muted', text: t('emailNoHops') });
    const rows = message.hops.map((hop, i) => {
      const previous = i ? message.hops[i - 1].date : null;
      const delay = hop.date !== null && previous !== null ? Math.round((hop.date - previous) / 1000) : null; // prettier-ignore
      return h(
        'tr',
        { attrs: { title: hop.raw } },
        h('th', { attrs: { scope: 'row' }, text: String(i + 1) }),
        h('td', {}, h('code', { text: hop.from })),
        h('td', {}, h('code', { text: hop.ip ? this.safe(hop.ip.includes(':') ? 'ipv6' : 'ipv4', hop.ip) : '' })), // prettier-ignore
        h('td', {}, h('code', { text: hop.by })),
        h('td', { text: hop.with }),
        h('td', { text: hop.date === null ? '' : this.formatDate(hop.date) }),
        h('td', { class: delay !== null && delay > 300 ? 'email-slow' : '', text: delay === null ? '' : `${delay} s` }), // prettier-ignore
      );
    });
    return this.table('hops', ['emailHop', 'emailHopFrom', 'emailHopIp', 'emailHopBy', 'emailHopWith', 'emailHopTime', 'emailHopDelay'], rows); // prettier-ignore
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement}
   */
  bodyView(message) {
    const t = this.t;
    if (!message.text) return h('p', { class: 'email-muted', text: t('emailNoBody') });
    return h(
      'div',
      { class: 'email-text-box' },
      message.fromHtml ? h('p', { class: 'email-note', text: t('emailFromHtml') }) : null,
      h('pre', { class: 'email-text', part: 'text', text: message.text }),
    );
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement}
   */
  linksView(message) {
    const t = this.t;
    if (!message.links.length) return h('p', { class: 'email-muted', text: t('emailNoLinks') });
    const rows = message.links.map((link) =>
      h(
        'tr',
        { class: link.deceptive ? 'deceptive' : '' },
        h('td', { text: link.text }),
        h(
          'td',
          {},
          h('code', { class: 'email-url', text: /^https?:|^ftp:/i.test(link.href) ? this.safe('url', link.href) : link.href }), // prettier-ignore
          link.deceptive ? h('span', { class: 'email-tag bad' }, icon('alert'), h('span', { text: t('emailDeceptive') })) : null, // prettier-ignore
        ),
      ),
    );
    return this.table('links', ['emailLinkText', 'emailLinkUrl'], rows);
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement}
   */
  attachmentsView(message) {
    const t = this.t;
    if (!message.attachments.length) return h('p', { class: 'email-muted', text: t('emailNoAttachments') }); // prettier-ignore
    const rows = message.attachments.map((a) => {
      const risky = isRiskyAttachment(a.name) || hasDoubleExtension(a.name);
      const hash = this.hashCache.get(a);
      return h(
        'tr',
        { class: risky ? 'deceptive' : '' },
        h('td', {}, h('span', { text: a.name }), risky ? h('span', { class: 'email-tag bad' }, icon('alert'), h('span', { text: t('emailRisky') })) : null), // prettier-ignore
        h('td', {}, h('code', { text: a.type })),
        h('td', { class: 'email-num', text: this.formatSize(a.size) }),
        h('td', {}, h('code', { class: 'email-hash', text: hash ?? (hash === null ? '–' : '…') })),
      );
    });
    return this.table('attachments', ['emailName', 'emailType', 'emailSize', 'emailSha256'], rows);
  }

  /**
   * @param {Message} message
   * @returns {HTMLElement}
   */
  headersView(message) {
    const rows = message.headers.map(
      (x) =>
      h('tr', {}, h('th', { attrs: { scope: 'row' } }, h('code', { text: x.name })), h('td', {}, h('code', { class: 'email-value', text: x.value }))), // prettier-ignore
    );
    return this.table('headers', ['emailHeaderName', 'emailHeaderValue'], rows);
  }

  /**
   * @param {string} part
   * @param {StringKey[]} columns
   * @param {HTMLElement[]} rows
   */
  table(part, columns, rows) {
    return h(
      'div',
      { class: 'email-scroll' },
      h(
        'table',
        { class: 'email-table', part },
        h('thead', {}, h('tr', {}, ...columns.map((key) => h('th', { attrs: { scope: 'col' }, text: this.t(key) })))), // prettier-ignore
        h('tbody', {}, ...rows),
      ),
    );
  }

  /**
   * SHA-256 of the attachments, computed once, then a single render.
   *
   * @param {Message} message
   */
  computeHashes(message) {
    if (parseBoolean(this.getAttribute('hashes')) === false) return;
    const missing = message.attachments.filter((a) => !this.hashCache.has(a) && !this.pendingHashes.has(a)); // prettier-ignore
    if (!missing.length) return;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      for (const a of missing) this.hashCache.set(a, null);
      return;
    }
    for (const a of missing) this.pendingHashes.add(a);
    Promise.all(
      missing.map(async (a) => {
        try {
          const digest = new Uint8Array(await subtle.digest('SHA-256', a.bytes.slice()));
          this.hashCache.set(
            a,
            Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(''),
          );
        } catch {
          this.hashCache.set(a, null);
        }
        this.pendingHashes.delete(a);
      }),
    ).then(() => {
      if (this.isConnected && this.view === 'attachments' && this.parsed?.message === message) this.render(); // prettier-ignore
    });
  }

  /**
   * @param {number} bytes
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${unit ? value.toFixed(1) : value} ${units[unit]}`;
  }

  /**
   * @param {number} time
   */
  formatDate(time) {
    try {
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(time); // prettier-ignore
    } catch {
      return new Date(time).toISOString();
    }
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
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}
