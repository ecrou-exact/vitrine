// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import certCss from '../../styles/cert.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { contents, hex, oid, tagName, text, time, TAG } from './der.js';
import { issuerIndex, nameText, oidName, parseCertificates, toPem, validity } from './x509.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./x509.js').Certificate} Certificate */
/** @typedef {import('./x509.js').CertResult} CertResult */
/** @typedef {import('./x509.js').NamePart} NamePart */
/** @typedef {import('./der.js').DerNode} DerNode */

const VIEWS = /** @type {const} */ (['details', 'structure']);
/** @typedef {typeof VIEWS[number]} View */

/** Rows built at most in the ASN.1 view. */
const MAX_TREE_ROWS = 5000;

/**
 * Displays X.509 certificates, certificate chains and certificate requests (PEM or DER):
 * subject, issuer, validity, key, signature, extensions and fingerprints, with the raw
 * ASN.1 structure one tab away.
 *
 * Nothing is verified and nothing is fetched: signatures are not checked, and the URLs of
 * extensions (CRL, OCSP, CA issuers) are shown as text. A private key found in the input
 * is never shown.
 *
 * @element vt-cert
 * @since 0.9.0
 *
 * @attr {string} now - Date used for the validity status (ISO 8601). Default: the current time.
 * @attr {boolean} tabs - Details / ASN.1 tabs. Full variant: on.
 * @attr {"details"|"structure"} view - Initial view (default `details`).
 * @attr {boolean} fingerprints - SHA-256 and SHA-1 fingerprints (default on).
 * @attr {boolean} extensions - Extensions of each certificate (default on).
 *
 * @prop {string} content - PEM text, or base64 or hex DER.
 * @prop {object[]} certificates - Certificates read (read-only plain objects).
 *
 * @fires vt-tab-change - Details / ASN.1 changed. Detail: `{ tab }`.
 *
 * @csspart certificate - The card of one certificate.
 * @csspart status - The validity status.
 * @csspart name - A distinguished name.
 * @csspart extension - One extension.
 * @csspart fingerprint - A fingerprint.
 * @csspart structure - The ASN.1 tree.
 *
 * @example
 * <vt-cert variant="full" src="/certs/chain.pem"></vt-cert>
 */
export class VtCert extends VtBase {
  static type = 'cert';

  static componentAttributes = Object.freeze([
    'now', 'tabs', 'view', 'fingerprints', 'extensions',
  ]); // prettier-ignore

  static presets = {
    simple: { fingerprints: true, extensions: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      tabs: true, fingerprints: true, extensions: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, certCss];

  static allowEmpty = true;

  constructor() {
    super();
    /** @type {{ text: string, result: CertResult } | null} */
    this.parsed = null;
    /** @type {WeakMap<Certificate, { sha256: string, sha1: string } | null>} */
    this.fingerprintCache = new WeakMap();
    /** @type {WeakSet<Certificate>} Fingerprints being computed. */
    this.pending = new WeakSet();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.parsed = null;
  }

  // ------------------------------------------------------------------ model

  /** @returns {CertResult} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseCertificates(text) };
    return this.parsed.result;
  }

  /** Certificates read, as plain objects (no DER structure). */
  get certificates() {
    return this.parse().certificates.map((cert) => ({
      kind: cert.kind,
      version: cert.version,
      serial: cert.serial,
      subject: nameText(cert.subject),
      issuer: nameText(cert.issuer),
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      publicKey: { ...cert.publicKey },
      signatureAlgorithm: cert.signatureAlgorithm,
      selfSigned: cert.selfSigned,
      weaknesses: [...cert.weaknesses],
      extensions: cert.extensions.map((ext) => ({
        ...ext,
        entries: ext.entries.map((e) => ({ ...e })),
      })),
      pem: toPem(cert),
    }));
  }

  /** @returns {Date} */
  get now() {
    const value = this.getAttribute('now');
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : new Date();
  }

  /** @returns {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'details');
  }

  /** @returns {string} Every certificate as PEM. */
  pemText() {
    return this.parse().certificates.map(toPem).join('');
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.parse();
    const view = this.view;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'details', label: t('certDetails'), icon: 'lock' },
            { id: 'structure', label: t('certStructure'), icon: 'list' },
          ],
          selected: view,
          label: t('tabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const panel = h('div', {
      class: 'panel',
      attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null },
    });
    const body = h('div', {
      class: 'body cert-body',
      part: 'body',
      attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('cert') },
    });
    body.append(...this.notices(result));
    if (view === 'structure')
      body.append(...result.certificates.map((cert) => this.structure(cert)));
    else body.append(...result.certificates.map((cert, index) => this.card(cert, index, result)));
    if (!result.certificates.length && this.text?.trim() && !result.errors.length) {
      body.append(h('div', { class: 'empty', part: 'empty', text: t('certNone') }));
    }

    /** @type {(HTMLElement | null)[]} */
    let extra = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('cert-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);

    const search = new TextSearch(body);
    const target = {
      /** @param {string} query */
      run: (query) => search.run(query),
      /** @param {number} index */
      go: (index) => revealMatch(search.go(index)),
      clear: () => search.clear(),
    };
    const count = result.certificates.length;
    const pem = () => this.pemText();
    const actions = [
      this.searchButton(target),
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') && count
        ? this.downloadButton(pem, this.downloadName(count > 1 ? 'chain.pem' : 'certificate.pem'), 'application/x-pem-file') // prettier-ignore
        : null,
      this.feature('copy') && count ? this.copyButton(pem, t('certCopyPem')) : null,
    ];
    const badge = tabs || !count ? '' : count > 1 ? t('certCount', { count }) : 'X.509';
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
    this.editor?.align();
    if (this.feature('fingerprints')) this.computeFingerprints(result);
  }

  /** Title: the label, else the common name of the first certificate. */
  get heading() {
    const first = this.parse().certificates[0];
    return super.heading || (first ? commonName(first.subject) : '');
  }

  /**
   * @param {CertResult} result
   * @returns {HTMLElement[]}
   */
  notices(result) {
    const t = this.t;
    /** @type {HTMLElement[]} */
    const out = [];
    if (result.privateKeys) out.push(noticeView(t('certPrivateKey')));
    for (const error of result.errors) {
      out.push(noticeView(t('certInvalid', { index: error.index + 1, message: error.message })));
    }
    if (result.skipped) out.push(noticeView(t('certSkipped', { count: result.skipped })));
    return out;
  }

  /**
   * The card of one certificate.
   *
   * @param {Certificate} cert
   * @param {number} index
   * @param {CertResult} result
   * @returns {HTMLElement}
   */
  card(cert, index, result) {
    const t = this.t;
    const list = result.certificates;
    const status = validity(cert, this.now);
    const card = h('article', {
      class: `cert-card state-${status.state}`,
      part: 'certificate',
      attrs: { id: this.cardId(index), 'aria-label': commonName(cert.subject) || t('cert') },
    });
    const head = h(
      'header',
      { class: 'cert-head' },
      list.length > 1 ? h('span', { class: 'cert-index', text: String(index + 1) }) : null,
      h('h3', {
        class: 'cert-cn',
        text: commonName(cert.subject) || nameText(cert.subject) || '—',
      }),
      cert.kind === 'request' ? h('span', { class: 'cert-tag', text: t('certRequest') }) : null,
      cert.selfSigned ? h('span', { class: 'cert-tag', text: t('certSelfSigned') }) : null,
      this.statusView(status),
    );
    card.append(head);
    for (const weakness of cert.weaknesses) {
      const key = { sha1: 'certWeakSha1', md5: 'certWeakMd5', 'rsa-small': 'certWeakRsa' }[
        weakness
      ];
      if (key)
        card.append(noticeView(t(/** @type {any} */ (key), { bits: cert.publicKey.bits ?? 0 })));
    }

    const facts = h('dl', { class: 'cert-facts' });
    const fact = (/** @type {string} */ label, /** @type {(Node | string | null)[]} */ ...value) =>
      facts.append(h('div', {}, h('dt', { text: label }), h('dd', {}, ...value)));
    fact(t('certSubject'), this.nameView(cert.subject));
    if (cert.kind === 'certificate') {
      const issuer = issuerIndex(cert, list);
      fact(
        t('certIssuer'),
        this.nameView(cert.issuer),
        cert.selfSigned
          ? null
          : issuer >= 0
            ? h('a', {
                class: 'cert-link',
                text: t('certIssuedBy', { index: issuer + 1 }),
                attrs: { href: `#${this.cardId(issuer)}` },
                on: { click: (event) => this.goToCard(event, issuer) },
              })
            : list.length > 1
              ? h('span', { class: 'cert-muted', text: t('certIssuerMissing') })
              : null,
      );
      fact(t('certValidity'), this.validityView(cert));
      fact(t('certSerial'), h('code', { class: 'cert-hex', text: cert.serial }));
    }
    fact(t('certVersion'), String(cert.version));
    const key = cert.publicKey;
    fact(
      t('certPublicKey'),
      [key.algorithm, key.curve, key.bits && !key.curve ? t('certBits', { bits: key.bits }) : null]
        .filter(Boolean)
        .join(' · '),
    );
    fact(t('certSignature'), cert.signatureAlgorithm);
    if (this.feature('fingerprints') && cert.kind === 'certificate') {
      fact(t('certFingerprints'), this.fingerprintView(cert));
    }
    card.append(facts);
    if (this.feature('extensions')) card.append(this.extensionsView(cert));
    return card;
  }

  /**
   * @param {{ state: string, days: number }} status
   * @returns {HTMLElement | null}
   */
  statusView(status) {
    if (status.state === 'none') return null;
    const key = {
      valid: 'certValid',
      expiring: 'certExpiring',
      expired: 'certExpired',
      future: 'certFuture',
    }[status.state];
    return h('span', {
      class: `cert-status ${status.state}`,
      part: 'status',
      text: this.t(/** @type {any} */ (key), { days: formatNumber(status.days, this.locale) }),
    });
  }

  /**
   * @param {NamePart[]} name
   * @returns {HTMLElement}
   */
  nameView(name) {
    const list = h('span', { class: 'cert-name', part: 'name' });
    for (const part of [...name].reverse()) {
      list.append(
        h(
          'span',
          { class: `rdn${part.type === 'CN' ? ' cn' : ''}`, attrs: { title: part.oid } },
          h('span', { class: 'rdn-type', text: `${part.type}=` }),
          part.value,
        ),
      );
    }
    return list;
  }

  /**
   * @param {Certificate} cert
   * @returns {HTMLElement}
   */
  validityView(cert) {
    const t = this.t;
    const format = new Intl.DateTimeFormat(this.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });
    const date = (/** @type {Date | null} */ value) =>
      value
        ? h('time', {
            text: `${format.format(value)} UTC`,
            attrs: { datetime: value.toISOString() },
          })
        : '—';
    return h(
      'span',
      { class: 'cert-dates' },
      h(
        'span',
        {},
        h('span', { class: 'cert-muted', text: `${t('certFrom')} ` }),
        date(cert.notBefore),
      ),
      h(
        'span',
        {},
        h('span', { class: 'cert-muted', text: `${t('certTo')} ` }),
        date(cert.notAfter),
      ),
    );
  }

  /**
   * @param {Certificate} cert
   * @returns {HTMLElement}
   */
  fingerprintView(cert) {
    const t = this.t;
    const prints = this.fingerprintCache.get(cert);
    if (prints === null)
      return h('span', { class: 'cert-muted', text: t('certFingerprintUnavailable') });
    const box = h('span', { class: 'cert-prints' });
    if (!prints) return box;
    for (const [label, value] of /** @type {const} */ ([
      ['SHA-256', prints.sha256],
      ['SHA-1', prints.sha1],
    ])) {
      box.append(
        h(
          'span',
          { class: 'cert-print', part: 'fingerprint' },
          h('span', { class: 'cert-muted', text: label }),
          h('code', { class: 'cert-hex', text: value }),
          this.copyTextButton(
            () => value,
            t('certCopyFingerprint'),
            `print-${label}-${cert.serial}`,
          ),
        ),
      );
    }
    return box;
  }

  /**
   * @param {Certificate} cert
   * @returns {HTMLElement}
   */
  extensionsView(cert) {
    const t = this.t;
    const section = h('section', { class: 'cert-exts' }, h('h4', { text: t('certExtensions') }));
    if (!cert.extensions.length) {
      section.append(h('p', { class: 'cert-muted', text: t('certNoExtensions') }));
      return section;
    }
    for (const ext of cert.extensions) {
      const values = h('ul', { class: 'ext-values' });
      for (const entry of ext.entries) {
        values.append(
          h(
            'li',
            {},
            entry.label ? h('span', { class: 'ext-label', text: entry.label }) : null,
            h('code', { text: entry.value }),
          ),
        );
      }
      section.append(
        h(
          'div',
          { class: 'ext', part: 'extension' },
          h(
            'div',
            { class: 'ext-name', attrs: { title: ext.oid } },
            ext.name,
            ext.critical
              ? h('span', { class: 'cert-tag critical', text: t('certCritical') })
              : null,
          ),
          values,
        ),
      );
    }
    return section;
  }

  /**
   * The ASN.1 structure of one certificate, as nested disclosure elements.
   *
   * @param {Certificate} cert
   * @returns {HTMLElement}
   */
  structure(cert) {
    const counter = { rows: 0 };
    const root = h('div', { class: 'asn1', part: 'structure' });
    root.append(
      h('h3', { class: 'cert-cn', text: commonName(cert.subject) || this.t('cert') }),
      this.asn1Node(cert.root, 0, counter),
    );
    return root;
  }

  /**
   * @param {DerNode} node
   * @param {number} depth
   * @param {{ rows: number }} counter
   * @returns {HTMLElement}
   */
  asn1Node(node, depth, counter) {
    counter.rows += 1;
    const label = h(
      'span',
      { class: 'asn1-row' },
      h('span', { class: 'asn1-tag', text: tagName(node) }),
      h('span', { class: 'asn1-len', text: this.t('certLength', { length: node.length }) }),
      node.constructed ? null : h('span', { class: 'asn1-value', text: preview(node) }),
    );
    if (!node.constructed || !node.children?.length) return h('div', { class: 'asn1-leaf' }, label);
    const details = h(
      'details',
      { class: 'asn1-node', attrs: { open: depth < 3 } },
      h('summary', {}, label),
    );
    for (const next of node.children) {
      if (counter.rows >= MAX_TREE_ROWS) break;
      details.append(this.asn1Node(next, depth + 1, counter));
    }
    return details;
  }

  /**
   * @param {number} index
   * @returns {string}
   */
  cardId(index) {
    return `${this.panelId}-c${index}`;
  }

  /**
   * @param {Event} event
   * @param {number} index
   */
  goToCard(event, index) {
    event.preventDefault();
    const card = this.root.getElementById?.(this.cardId(index));
    if (!card) return;
    card.scrollIntoView({ block: 'nearest' });
    card.classList.add('current');
    setTimeout(() => card.classList.remove('current'), 1200);
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
   * Computes missing fingerprints, then renders again once.
   *
   * @param {CertResult} result
   */
  computeFingerprints(result) {
    const missing = result.certificates.filter(
      (cert) =>
        cert.kind === 'certificate' && !this.fingerprintCache.has(cert) && !this.pending.has(cert),
    );
    if (!missing.length) return;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      for (const cert of missing) this.fingerprintCache.set(cert, null);
      return;
    }
    for (const cert of missing) this.pending.add(cert);
    const digest = async (/** @type {Certificate} */ cert) => {
      try {
        const data = cert.der.slice();
        const [a, b] = await Promise.all([
          subtle.digest('SHA-256', data),
          subtle.digest('SHA-1', data),
        ]);
        this.fingerprintCache.set(cert, {
          sha256: hex(new Uint8Array(a)),
          sha1: hex(new Uint8Array(b)),
        });
      } catch {
        this.fingerprintCache.set(cert, null);
      }
      this.pending.delete(cert);
    };
    Promise.all(missing.map(digest)).then(() => {
      if (this.parsed?.result === result && this.isConnected) this.render();
    });
  }

  // ------------------------------------------------------------------ editing

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
    this.previewTimer = setTimeout(() => {
      this.parsed = null;
      this.render();
    }, 400);
  }
}

/**
 * @param {NamePart[]} name
 * @returns {string}
 */
function commonName(name) {
  return [...name].reverse().find((part) => part.type === 'CN')?.value ?? '';
}

/**
 * Short text of a primitive value for the ASN.1 view.
 *
 * @param {DerNode} node
 * @returns {string}
 */
function preview(node) {
  if (node.cls !== 0) {
    const data = contents(node);
    return node.length <= 64 && data.every((b) => b >= 0x20 && b < 0x7f)
      ? Array.from(data, (b) => String.fromCharCode(b)).join('')
      : clip(hex(contents(node), ' '));
  }
  try {
    switch (node.tag) {
      case TAG.OID: {
        const value = oid(node);
        const name = oidName(value);
        return name ? `${value} (${name})` : value;
      }
      case TAG.BOOLEAN:
        return contents(node)[0] ? 'true' : 'false';
      case TAG.NULL:
        return '';
      case TAG.UTC_TIME:
      case TAG.GENERALIZED_TIME:
        return time(node).toISOString();
      case TAG.UTF8:
      case TAG.PRINTABLE:
      case TAG.IA5:
      case TAG.T61:
      case TAG.VISIBLE:
      case TAG.NUMERIC:
      case TAG.BMP:
      case TAG.UNIVERSAL:
        return clip(text(node));
      default:
        return clip(hex(contents(node), ' '));
    }
  } catch {
    return clip(hex(contents(node), ' '));
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function clip(value) {
  return value.length > 96 ? `${value.slice(0, 95)}…` : value;
}
