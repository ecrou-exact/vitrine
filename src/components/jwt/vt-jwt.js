// @ts-check
import jsonCss from '../../styles/json.css?raw';
import jwtCss from '../../styles/jwt.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { parseJson } from '../json/parser.js';
import { JsonTree } from '../json/tree.js';
import { en as strings, fr as stringsFr } from './strings.js';
import {
  DATE_CLAIMS,
  KNOWN_CLAIMS,
  decodeToken,
  isObject,
  numericDate,
  validity,
  warnings,
} from './token.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./token.js').Token} Token */
/** @typedef {import('./token.js').TokenPart} TokenPart */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * Decodes a JSON Web Token and shows its parts, header, payload and claims.
 *
 * The token is only decoded: the signature is never verified, the token is never
 * sent anywhere, and URLs found in its header (`jku`, `x5u`) are never fetched.
 * Every value is rendered with DOM text APIs.
 *
 * @element vt-jwt
 * @since 0.4.0
 *
 * @attr {string} now - Date used to tell whether the token is valid (ISO 8601 or seconds). Default: the current time.
 * @attr {boolean} mask-signature - Hides the signature until "Show signature" is pressed.
 * @attr {boolean} claims - Claims table with the meaning of each claim. Default: on.
 * @attr {boolean} warnings - Notices about risky values (alg "none", no expiry…). Default: on.
 * @attr {number} depth - Levels open at first in the JSON trees (default 2).
 *
 * @prop {string} content - The token.
 * @prop {Token | null} token - The decoded token (read-only), `null` when it cannot be read.
 *
 * @fires vt-ready - Token rendered. Detail: `{ type: "jwt" }`.
 * @fires vt-copy - Token, header or payload copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart token - The token, colored by part.
 * @csspart token-header - The header part of the token.
 * @csspart token-payload - The payload part of the token.
 * @csspart token-signature - The signature part of the token.
 * @csspart status - Validity of the token.
 * @csspart section - A section (header, payload, claims).
 * @csspart claims - The claims table.
 * @csspart warning - A warning.
 *
 * @example
 * <vt-jwt variant="full">
 *   <template>eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl</template>
 * </vt-jwt>
 */
export class VtJwt extends VtBase {
  static type = 'jwt';

  static componentAttributes = Object.freeze([
    'now',
    'mask-signature',
    'claims',
    'warnings',
    'depth',
  ]);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [jsonCss, jwtCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {boolean | null} Signature shown or hidden by the user; `null` follows `mask-signature`. */
    this.signatureShown = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Token | null} */
  get token() {
    const result = decodeToken(this.text ?? '');
    return result.ok ? result.token : null;
  }

  /** @returns {number} The time used for validity, in milliseconds. */
  get now() {
    const value = this.getAttribute('now');
    if (value) {
      const seconds = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value);
      if (Number.isFinite(seconds)) return seconds;
    }
    return Date.now();
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = decodeToken(this.text ?? '');
    const body = h('div', { class: 'body jwt-body', part: 'body' });
    /** @type {string} */
    let badge = '';
    if (!result.ok) {
      const key = /** @type {StringKey} */ (
        `jwtInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`
      );
      body.append(noticeView(t(key)), h('pre', { class: 'jwt-token raw', text: this.text ?? '' }));
    } else {
      const token = result.token;
      badge = this.statusText(token);
      body.append(this.tokenView(token), this.statusLine(token));
      if (this.flag('warnings'))
        for (const warning of warnings(token)) body.append(this.warningView(warning));
      body.append(this.section('jwtHeader', 'header', this.partView(token.header)));
      if (token.payload) {
        body.append(this.section('jwtPayload', 'payload', this.partView(token.payload)));
        if (this.flag('claims') && isObject(token.payload.value))
          body.append(this.section('jwtClaims', 'claims', this.claimsTable(token.payload.value)));
      }
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('jwt-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      history = this.historyButtons(editor);
    } else panel.append(body);

    const token = result.ok ? result.token : null;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      token && this.feature('copy') && token.payload?.text
        ? this.copyTextButton(() => pretty(token.payload), t('jwtCopyPayload'), 'copy-payload')
        : null,
      token && this.feature('copy')
        ? this.copyTextButton(() => pretty(token.header), t('jwtCopyHeader'), 'copy-header')
        : null,
      this.feature('copy')
        ? this.copyButton(() => token?.compact ?? this.text ?? '', t('jwtCopyToken'))
        : null,
    ];
    frame.append(...this.chrome({ badge: badge || 'JWT', actions }), panel);
    this.editor?.align();
  }

  /**
   * A boolean attribute that is on unless set to false.
   *
   * @param {string} name
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) !== false;
  }

  /** Whether the signature is shown. */
  get showSignature() {
    return this.signatureShown ?? !this.hasAttribute('mask-signature');
  }

  /**
   * The token, colored by part, with a button to show or hide the signature.
   *
   * @param {Token} token
   * @returns {HTMLElement}
   */
  tokenView(token) {
    const t = this.t;
    const names = token.kind === 'jwe'
      ? ['header', 'key', 'iv', 'payload', 'signature']
      : ['header', 'payload', 'signature']; // prettier-ignore
    const code = h('code', {
      class: 'jwt-token',
      part: 'token',
      attrs: { 'aria-label': t('jwtToken') },
    });
    token.parts.forEach((raw, index) => {
      if (index) code.append(h('span', { class: 'jwt-dot', text: '.' }));
      const name = names[index];
      const last = index === token.parts.length - 1;
      const masked = last && !this.showSignature && raw.length > 0;
      code.append(
        h('span', {
          class: `jwt-part part-${name}${masked ? ' masked' : ''}`,
          part: name === 'header' || name === 'payload' ? `token-${name}` : 'token-signature',
          text: masked ? '•'.repeat(Math.min(raw.length, 24)) : raw,
        }),
      );
    });
    const toggle = token.signature
      ? iconButton({
          icon: this.showSignature ? 'eye-off' : 'eye',
          label: this.showSignature ? t('jwtHideSignature') : t('jwtShowSignature'),
          key: 'signature',
          pressed: this.showSignature,
          onClick: () => {
            this.signatureShown = !this.showSignature;
            this.render();
          },
        })
      : null;
    return h('div', { class: 'jwt-token-box' }, code, toggle);
  }

  /**
   * @param {Token} token
   * @returns {string}
   */
  statusText(token) {
    const t = this.t;
    if (token.kind === 'jwe') return t('jwtEncryptedBadge');
    const { state, at } = validity(token.payload?.value, this.now);
    const relative = at === null ? '' : this.relative(at);
    if (state === 'expired') return t('jwtExpired', { relative });
    if (state === 'early') return t('jwtEarly', { relative });
    if (state === 'valid') return at === null ? t('jwtValid') : t('jwtValidUntil', { relative });
    return t('jwtNoDates');
  }

  /**
   * Validity line and the reminder that nothing is verified.
   *
   * @param {Token} token
   * @returns {HTMLElement}
   */
  statusLine(token) {
    const { state } =
      token.kind === 'jwe' ? { state: 'unknown' } : validity(token.payload?.value, this.now);
    const tone = state === 'valid' ? 'ok' : state === 'unknown' ? 'muted' : 'bad';
    return h(
      'div',
      { class: 'jwt-status' },
      h(
        'span',
        { class: `jwt-state ${tone}`, part: 'status' },
        icon(tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : 'status-circle'),
        h('span', { text: this.statusText(token) }),
      ),
      h('span', { class: 'jwt-note', text: this.t('jwtNotVerified') }),
    );
  }

  /**
   * @param {import('./token.js').Warning} warning
   * @returns {HTMLElement}
   */
  warningView(warning) {
    const key = /** @type {StringKey} */ (
      `jwtWarn${warning.key[0].toUpperCase()}${warning.key.slice(1)}`
    );
    const notice = noticeView(this.t(key, warning.params));
    notice.classList.add('jwt-warning');
    notice.setAttribute('part', 'warning');
    return notice;
  }

  /**
   * @param {StringKey} titleKey
   * @param {string} name
   * @param {HTMLElement} content
   * @returns {HTMLElement}
   */
  section(titleKey, name, content) {
    return h(
      'section',
      {
        class: `jwt-section section-${name}`,
        part: 'section',
        attrs: { 'aria-label': this.t(titleKey) },
      },
      h('h3', { class: 'jwt-title', text: this.t(titleKey) }),
      content,
    );
  }

  /**
   * A decoded part: a JSON tree, or its text when it is not JSON.
   *
   * @param {TokenPart} part
   * @returns {HTMLElement}
   */
  partView(part) {
    const parsed =
      part.text === null ? null : parseJson(part.text, { maxDepth: getConfig().maxDepth });
    if (!parsed?.ok) return h('pre', { class: 'jwt-text', text: part.text ?? '' });
    const tree = new JsonTree(parsed.value, {
      t: this.t,
      locale: this.locale,
      depth: parseInteger(this.getAttribute('depth'), { min: 0, max: 1000, fallback: 2 }),
      sortKeys: false,
      showTypes: false,
      label: this.t(part === this.token?.header ? 'jwtHeader' : 'jwtPayload'),
      onSelect: () => {},
    });
    tree.render();
    return h('div', { class: 'tree-body' }, tree.element);
  }

  /**
   * Claims with their meaning; dates in the page language with a relative time.
   *
   * @param {Record<string, unknown>} payload
   * @returns {HTMLElement}
   */
  claimsTable(payload) {
    const t = this.t;
    const names = Object.keys(payload).sort((a, b) => rank(a) - rank(b));
    const rows = names.map((name) => {
      const value = payload[name];
      const known = KNOWN_CLAIMS.includes(name);
      const date = DATE_CLAIMS.includes(name) ? numericDate(value) : null;
      const cell = h('td', { class: 'jwt-value' });
      if (date !== null) {
        cell.append(
          h('time', {
            text: this.formatDate(date),
            attrs: { datetime: new Date(date).toISOString() },
          }),
          h('span', { class: 'jwt-relative', text: this.relative(date) }),
        );
      } else cell.append(h('code', { text: claimText(value) }));
      return h(
        'tr',
        {},
        h('th', { attrs: { scope: 'row' } }, h('code', { text: name })),
        cell,
        h('td', {
          class: known ? 'jwt-meaning' : 'jwt-meaning other',
          text: known ? t(/** @type {StringKey} */ (`jwtClaim_${name}`)) : t('jwtClaimOther'),
        }),
      );
    });
    return h(
      'table',
      { class: 'jwt-claims', part: 'claims' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { attrs: { scope: 'col' }, text: t('jwtClaim') }),
          h('th', { attrs: { scope: 'col' }, text: t('jwtValue') }),
          h('th', { attrs: { scope: 'col' }, text: t('jwtMeaning') }),
        ),
      ),
      h('tbody', {}, ...rows),
    );
  }

  /**
   * @param {number} time
   * @returns {string}
   */
  formatDate(time) {
    try {
      return new Intl.DateTimeFormat(this.locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(time);
    } catch {
      return new Date(time).toISOString();
    }
  }

  /**
   * "in 3 hours", "2 days ago", relative to `now`.
   *
   * @param {number} time
   * @returns {string}
   */
  relative(time) {
    const seconds = Math.round((time - this.now) / 1000);
    /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1],
    ];
    const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? ['second', 1];
    try {
      return new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' }).format(
        Math.round(seconds / size),
        unit,
      );
    } catch {
      return `${Math.round(seconds / size)} ${unit}`;
    }
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
    this.previewTimer = setTimeout(() => this.render(), 200);
  }
}

/**
 * Registered claims first, in their usual order, then the others by name.
 *
 * @param {string} name
 */
function rank(name) {
  const index = KNOWN_CLAIMS.indexOf(name);
  return index === -1 ? KNOWN_CLAIMS.length : index;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function claimText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return value.join(', ');
  return JSON.stringify(value) ?? String(value);
}

/**
 * @param {TokenPart | null} part
 * @returns {string}
 */
function pretty(part) {
  if (!part) return '';
  return part.value === undefined ? (part.text ?? '') : JSON.stringify(part.value, null, 2);
}
