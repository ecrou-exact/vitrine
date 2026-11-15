// @ts-check
import installCss from '../../styles/install.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { readContainer } from '../../core/content.js';
import { isObject } from '../../core/data.js';
import { dedent, h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { createTabs, noticeView } from '../../core/ui.js';
import {
  ACTIONS,
  DEFAULT_MANAGERS,
  MANAGERS,
  intent,
  linesText,
  readCommands,
  shellQuote,
  writeLines,
} from './commands.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./commands.js').Token} Token */
/** @typedef {import('./commands.js').Line} Line */
/** @typedef {import('./commands.js').Ecosystem} Ecosystem */

/**
 * A tab: the commands of one manager, or text given as it is.
 *
 * @typedef {object} InstallTab
 * @property {string} id
 * @property {string} label
 * @property {Token[][] | null} lines - `null` when the manager has no equivalent.
 * @property {boolean} custom - Text given for this tab, shown as written.
 */

/** Tabs given as text. */
const MAX_CUSTOM = 12;
const STORAGE_PREFIX = 'vitrine-install:';

/** Elements of each sync group on the page, and the choice of the group. */
/** @type {Map<string, Set<VtInstall>>} */
const groups = new Map();
/** @type {Map<string, string>} */
const choices = new Map();

/**
 * @param {string} group
 * @returns {string | null}
 */
function storedChoice(group) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + group);
  } catch {
    return null;
  }
}

/**
 * @param {string} group
 * @param {string} label
 */
function storeChoice(group, label) {
  try {
    localStorage.setItem(STORAGE_PREFIX + group, label);
  } catch {
    // Storage refused (private mode, quota): the choice lasts for this page.
  }
}

/**
 * Another window chose a manager: the elements of its group follow.
 *
 * @param {StorageEvent} event
 */
function onStorage(event) {
  if (!event.key?.startsWith(STORAGE_PREFIX) || !event.newValue) return;
  const group = event.key.slice(STORAGE_PREFIX.length);
  choices.set(group, event.newValue);
  for (const el of groups.get(group) ?? []) el.follow(event.newValue);
}

/**
 * The commands and tabs written in the element: commands, or JSON
 * `{ command, tabs: { label: text } }`.
 *
 * @param {string} text
 * @returns {{ command: string, tabs: [string, string][] }}
 */
export function readSource(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return { command: text, tabs: [] };
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { command: text, tabs: [] };
  }
  if (!isObject(value)) return { command: '', tabs: [] };
  const command = typeof value.command === 'string' ? value.command : Array.isArray(value.command) ? value.command.filter((c) => typeof c === 'string').join('\n') : ''; // prettier-ignore
  const given = isObject(value.tabs) ? value.tabs : {};
  /** @type {[string, string][]} */
  const tabs = Object.entries(given)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [cleanLabel(k, 40), /** @type {string} */ (v)]);
  return { command, tabs: tabs.filter(([k]) => k).slice(0, MAX_CUSTOM) };
}

/**
 * Text given for a tab, line by line, shown as written.
 *
 * @param {string} text
 * @returns {Token[][]}
 */
function rawLines(text) {
  return dedent(text)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => [{ text: line, kind: line.trim().startsWith('#') ? 'comment' : 'raw' }]);
}

/**
 * Shows an install command for every package manager, as tabs: write it once in the syntax of
 * npm, pnpm, yarn, bun, pip, uv, poetry or pdm (or set `package`), and each tab gets the command
 * of its manager. The reader's choice is shared by every `<vt-install>` of the page and kept for
 * their next visit.
 *
 * Commands are only displayed and copied, never run. Words are quoted for a POSIX shell when
 * they need it (`'requests>=2.31'`); a line that is not understood is kept as written.
 *
 * @element vt-install
 * @since 0.15.0
 *
 * @attr {string} package - Packages to install, separated by spaces (when no command is written).
 * @attr {"add"|"install"|"ci"|"remove"|"global"|"exec"|"create"|"init"|"run"} action - What to do with `package` (default `add`).
 * @attr {boolean} dev - Development dependency (with `package`).
 * @attr {"js"|"python"} ecosystem - Managers to show (default: read from the command, else `js`).
 * @attr {string} managers - Tabs, separated by commas (default `npm,pnpm,yarn,bun` or `pip,uv,poetry`; `deno` and `pdm` too).
 * @attr {string} manager - Tab selected at first when the reader has not chosen one.
 * @attr {string} sync - Group of elements that change tabs together, kept in `localStorage` (default `install`; `false`: none).
 * @attr {string} prompt - Prompt shown before commands (default `$`; `false`: none).
 *
 * @prop {string} content - The commands, or JSON `{ command, tabs }`.
 * @prop {any} data - `{ command, tabs }` or `{ package, dev, action }`.
 * @prop {InstallTab[]} tabs - The tabs (read-only).
 * @prop {string} selected - The label of the selected tab.
 *
 * @fires vt-tab-change - The reader chose a manager. Detail: `{ tab }`.
 * @fires vt-copy - Commands copied. Detail: `{ text }`.
 *
 * @csspart tabs - The managers.
 * @csspart code - The commands.
 * @csspart prompt - A prompt.
 *
 * @example
 * <vt-install>npm install -D vitrine</vt-install>
 */
export class VtInstall extends VtBase {
  static type = 'install';

  static componentAttributes = Object.freeze(['package', 'action', 'dev', 'ecosystem', 'managers', 'manager', 'sync', 'prompt']); // prettier-ignore

  static dataAttributes = Object.freeze(['package', 'action', 'dev', 'ecosystem', 'managers', 'manager']); // prettier-ignore

  static presets = {
    simple: { header: true, copy: true },
    full: { header: true, dot: true, copy: true },
  };

  static styles = [installCss];

  static allowEmpty = true;

  /**
   * `{ command, tabs }` is read as it is; `{ package, dev, action }` sets those attributes.
   *
   * @param {unknown} value
   * @returns {string | import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join('\n');
    if (!isObject(value)) return '';
    const attributes = Object.fromEntries(
      ['package', 'action', 'dev', 'ecosystem', 'managers', 'manager']
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, Array.isArray(value[k]) ? value[k].join(k === 'managers' ? ',' : ' ') : value[k]]), // prettier-ignore
    );
    return { content: JSON.stringify({ command: value.command ?? '', tabs: value.tabs ?? {} }), attributes }; // prettier-ignore
  }

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {string | null} Tab chosen in this element. */
    this.choice = null;
    /** @type {[string, string][]} `<script data-tab>` and `<template data-tab>` children. */
    this.inlineTabs = [];
    /** @type {string | null} */
    this.group = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.join();
  }

  disconnectedCallback() {
    this.leave();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'sync' && oldValue !== newValue && this._connected) {
      this.leave();
      this.join();
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** Joins the sync group named by `sync`. */
  join() {
    const value = this.getAttribute('sync');
    this.group = parseBoolean(value) === false ? null : cleanLabel(value, 60) || 'install';
    if (!this.group) return;
    if (!groups.size && typeof window !== 'undefined') window.addEventListener('storage', onStorage); // prettier-ignore
    const members = groups.get(this.group) ?? new Set();
    members.add(this);
    groups.set(this.group, members);
  }

  leave() {
    if (!this.group) return;
    const members = groups.get(this.group);
    members?.delete(this);
    if (members && !members.size) groups.delete(this.group);
    if (!groups.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage); // prettier-ignore
    this.group = null;
  }

  /**
   * Another element of the group chose a manager.
   *
   * @param {string} label
   */
  follow(label) {
    if (!this.tabs.some((tab) => tab.label === label) || this.choice === label) return;
    this.choice = label;
    if (this._connected) this.render();
  }

  /**
   * Children with `data-tab` are tabs given as they are; the rest is the command.
   *
   * @returns {string | null}
   */
  readInline() {
    this.inlineTabs = [];
    /** @type {string | null} */
    let main = null;
    for (const child of Array.from(this.children)) {
      if (child.hasAttribute('data-json')) continue;
      const text = readContainer(child);
      if (text === null) continue;
      const label = child.getAttribute('data-tab');
      if (label === null) main ??= text;
      else if (this.inlineTabs.length < MAX_CUSTOM)
        this.inlineTabs.push([cleanLabel(label, 40) || String(this.inlineTabs.length + 1), text]);
    }
    if (main !== null || !this.inlineTabs.length) return main ?? super.readInline();
    const text = Array.from(this.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue ?? '')
      .join('');
    return dedent(text) || null;
  }

  /** @returns {Ecosystem} */
  ecosystemFor(/** @type {Ecosystem | null} */ found) {
    const asked = this.getAttribute('ecosystem');
    return asked ? parseEnum(asked, /** @type {const} */ (['js', 'python']), 'js') : (found ?? 'js'); // prettier-ignore
  }

  /** @returns {InstallTab[]} */
  get tabs() {
    const source = readSource(this.text ?? '');
    const read = readCommands(source.command);
    const ecosystem = this.ecosystemFor(read.ecosystem);
    /** @type {Line[]} */
    let lines = read.lines;
    if (!lines.length) {
      const packages = (this.getAttribute('package') ?? '').split(/\s+/).filter(Boolean).slice(0, 50); // prettier-ignore
      const action = parseEnum(this.getAttribute('action'), ACTIONS, packages.length ? 'add' : 'install'); // prettier-ignore
      const needsPackage = ['add', 'remove', 'global', 'exec', 'create', 'run'].includes(action);
      if (this.hasAttribute('package') || this.hasAttribute('action'))
        if (!needsPackage || packages.length)
          lines = [{ parts: [{ intent: intent(ecosystem, action, { packages, flags: { dev: parseBoolean(this.getAttribute('dev')) === true } }) }] }]; // prettier-ignore
    }
    const known = /** @type {readonly string[]} */ (MANAGERS[ecosystem]);
    const asked = (this.getAttribute('managers') ?? '').split(',').map((m) => m.trim().toLowerCase()).filter((m) => known.includes(m)); // prettier-ignore
    const managers = [...new Set(asked.length ? asked : DEFAULT_MANAGERS[ecosystem])];
    /** @type {InstallTab[]} */
    const tabs = lines.length
      ? managers.map((m) => ({ id: '', label: m, lines: writeLines(lines, m), custom: false }))
      : [];
    for (const [label, text] of [...source.tabs, ...this.inlineTabs]) {
      const same = tabs.find((tab) => tab.label.toLowerCase() === label.toLowerCase());
      if (same) Object.assign(same, { lines: rawLines(text), custom: true });
      else tabs.push({ id: '', label, lines: rawLines(text), custom: true });
    }
    return tabs.map((tab, n) => ({ ...tab, id: `t${n}` }));
  }

  /** @returns {string} */
  get selected() {
    return this.current(this.tabs)?.label ?? '';
  }

  set selected(label) {
    this.choice = String(label);
    if (this._connected) this.render();
  }

  /**
   * The tab shown: chosen here, then by the group, then `manager`, then the first.
   *
   * @param {InstallTab[]} tabs
   * @returns {InstallTab | undefined}
   */
  current(tabs) {
    const group = this.group;
    const wanted = [
      this.choice,
      group ? (choices.get(group) ?? storedChoice(group)) : null,
      this.getAttribute('manager'),
    ];
    for (const label of wanted) {
      const tab = label ? tabs.find((t) => t.label.toLowerCase() === label.toLowerCase()) : null;
      if (tab) return tab;
    }
    return tabs[0];
  }

  /**
   * The reader chose a tab: the group follows, and remembers it.
   *
   * @param {InstallTab} tab
   */
  choose(tab) {
    this.choice = tab.label;
    if (this.group) {
      choices.set(this.group, tab.label);
      storeChoice(this.group, tab.label);
      for (const el of groups.get(this.group) ?? []) if (el !== this) el.follow(tab.label);
    }
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${tab.id}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab: tab.label });
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const tabs = this.tabs;
    const tab = this.current(tabs);
    if (!tab) {
      frame.append(...this.chrome(null), h('div', { class: 'body', part: 'body' }, noticeView(t('installEmpty')))); // prettier-ignore
      return;
    }
    const tabList =
      tabs.length > 1
        ? createTabs({
            tabs: tabs.map(({ id, label }) => ({ id, label })),
            selected: tab.id,
            label: t('installManagers'),
            panelId: this.panelId,
            onSelect: (id) => {
              const next = tabs.find((x) => x.id === id);
              if (next) this.choose(next);
            },
          })
        : null;
    const panel = h('div', {
      class: 'panel',
      attrs: {
        id: this.panelId,
        role: tabList ? 'tabpanel' : null,
        'aria-label': t('installCommands', { manager: tab.label }),
      },
    });
    const body = h('div', { class: 'body ins-body', part: 'body' });
    body.append(tab.lines ? this.codeView(tab) : h('p', { class: 'ins-none', text: t('installNone', { manager: tab.label }) })); // prettier-ignore
    panel.append(body);
    const text = tab.lines ? linesText(tab.lines) : '';
    const actions = [this.feature('copy') && text ? this.copyButton(() => text, t('installCopy')) : null]; // prettier-ignore
    frame.append(...this.chrome({ tabs: tabList, actions }), panel);
  }

  /**
   * @param {InstallTab} tab
   * @returns {HTMLElement}
   */
  codeView(tab) {
    const value = this.getAttribute('prompt');
    const prompt = tab.custom || parseBoolean(value) === false ? '' : cleanLabel(value, 10) || '$';
    const code = h('code');
    for (const [n, tokens] of /** @type {Token[][]} */ (tab.lines).entries()) {
      if (n) code.append('\n');
      const line = h('span', { class: 'ins-line' });
      const comment = tokens[0]?.kind === 'comment';
      if (prompt && !comment) line.append(h('span', { class: 'ins-prompt', part: 'prompt', text: prompt, attrs: { 'aria-hidden': 'true' } }), ' '); // prettier-ignore
      for (const [k, token] of tokens.entries()) {
        if (k) line.append(' ');
        const quoted = ['comment', 'op', 'raw'].includes(token.kind) ? token.text : shellQuote(token.text); // prettier-ignore
        line.append(h('span', { class: `ins-${token.kind}`, text: quoted }));
      }
      code.append(line);
    }
    return h('pre', { class: 'ins-code', part: 'code', attrs: { tabindex: '0' } }, code);
  }
}
