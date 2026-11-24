// @ts-check
import semverCss from '../../styles/semver.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { append, h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { bounds, compare, diff, format, maxSatisfying, parseRange, parseVersion, readVersions, satisfies } from './semver.js'; // prettier-ignore

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./semver.js').Version} Version */
/** @typedef {import('./semver.js').Range} Range */
/** @typedef {import('./semver.js').RangeSet} RangeSet */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Versions drawn at first. */
const SHOWN = 400;

/**
 * Explains a version range (`^1.2.3`, `~2.1`, `>=1.4 <2`, `1.x || 2.x`, `1.2 - 2.3`) as npm,
 * Cargo and Composer read it: each term in words, the bounds it comes to, and what to watch
 * (no upper bound, a pinned version, `^` below 1.0.0, bounds that cross). Given a list of
 * versions (one per line, a JSON array or an npm registry document), it marks those that
 * match, says which one would be installed and where the latest version stands. A field
 * edits the range and another tests a version.
 *
 * @element vt-semver
 * @since 0.15.0
 *
 * @attr {string} range - The range. Without it, the first line of the content is the range.
 * @attr {boolean} field - The fields to edit the range and test a version. Default: on.
 * @attr {boolean} prerelease - Pre-releases match like other versions. Default: off.
 *
 * @prop {string} content - Versions (or the range, then versions).
 * @prop {string} range - The range shown.
 * @prop {string[]} matching - The versions that match (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "semver" }`.
 * @fires vt-change - The range was edited. Detail: `{ value }`.
 * @fires vt-match - Versions were matched. Detail: `{ range, matches, resolved }`.
 * @fires vt-copy - The range or the matches copied. Detail: `{ text }`.
 *
 * @csspart field - The range field.
 * @csspart reading - The range in words.
 * @csspart warnings - What to watch.
 * @csspart result - The version installed and the latest one.
 * @csspart versions - The list of versions.
 * @csspart test - The field to test a version.
 *
 * @example
 * <vt-semver range="^1.2.3">1.2.0 1.2.3 1.4.2 2.0.0</vt-semver>
 */
export class VtSemver extends VtBase {
  static type = 'semver';

  static componentAttributes = Object.freeze(['range', 'field', 'prerelease']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [semverCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'range'];

  constructor() {
    super();
    this.ids = { range: uid('range'), test: uid('test'), testResult: uid('test-result') };
    /** @type {string | null} Range typed in the field. */
    this.rangeState = null;
    this.testValue = '';
    /** @type {HTMLElement | null} */
    this.resultsHost = null;
    /** @type {HTMLElement | null} */
    this.testHost = null;
    this.lastMatch = '';
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {{ range: string, versionsText: string }} */
  source() {
    const text = this.text ?? '';
    const attr = this.getAttribute('range');
    if (attr !== null || /^\s*[[{]/.test(text)) return { range: attr ?? '*', versionsText: text };
    const lines = text.trim().split(/\r?\n/);
    return { range: lines[0] ?? '', versionsText: lines.slice(1).join('\n') };
  }

  /** @type {string} */
  get range() {
    return this.rangeState ?? this.source().range.trim();
  }

  set range(value) {
    this.rangeState = null;
    this.setAttribute('range', String(value));
  }

  /** @type {string[]} */
  get matching() {
    const range = parseRange(this.range);
    return readVersions(this.source().versionsText).versions.filter((v) => satisfies(v, range, this.pre)).map(format); // prettier-ignore
  }

  get pre() {
    return parseBoolean(this.getAttribute('prerelease')) === true;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const body = h('div', { class: 'body semver-body', part: 'body' });
    this.resultsHost = h('div', { class: 'semver-results', attrs: { 'aria-live': 'polite' } });
    if (parseBoolean(this.getAttribute('field')) !== false) body.append(this.fieldView());
    body.append(this.resultsHost);
    if (parseBoolean(this.getAttribute('field')) !== false) body.append(this.testView());
    this.refresh();

    const panel = h('div', { class: 'panel' });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('semver-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') ? this.copyTextButton(() => this.matching.join('\n'), t('semverCopyMatches'), 'copy-matches') : null, // prettier-ignore
      this.feature('copy') ? this.copyButton(() => this.range, t('semverCopyRange')) : null,
    ];
    frame.append(...this.chrome({ badge: 'SemVer', actions }), panel);
    this.editor?.align();
  }

  /** @returns {HTMLElement} */
  fieldView() {
    const t = this.t;
    const input = h('input', {
      class: 'semver-input',
      attrs: { id: this.ids.range, type: 'text', value: this.range, spellcheck: 'false', autocomplete: 'off', placeholder: t('semverRangePlaceholder'), 'data-focus-key': 'range' }, // prettier-ignore
      on: {
        input: () => {
          this.rangeState = input.value.slice(0, 1024);
          this.refresh();
          emit(this, EVENTS.CHANGE, { value: this.rangeState });
        },
      },
    });
    return h('div', { class: 'semver-field', part: 'field' }, h('label', { attrs: { for: this.ids.range }, text: t('semverRange') }), input); // prettier-ignore
  }

  /** @returns {HTMLElement} */
  testView() {
    const t = this.t;
    this.testHost = h('p', { class: 'semver-test-result', attrs: { id: this.ids.testResult, 'aria-live': 'polite' } }); // prettier-ignore
    const input = h('input', {
      class: 'semver-input',
      attrs: { id: this.ids.test, type: 'text', value: this.testValue, spellcheck: 'false', autocomplete: 'off', placeholder: t('semverTestPlaceholder'), 'aria-describedby': this.ids.testResult, 'data-focus-key': 'test' }, // prettier-ignore
      on: {
        input: () => {
          this.testValue = input.value.slice(0, 256);
          this.refreshTest();
        },
      },
    });
    return h('div', { class: 'semver-test', part: 'test' }, h('label', { attrs: { for: this.ids.test }, text: t('semverTest') }), input, this.testHost); // prettier-ignore
  }

  /** Rebuilds the reading, the warnings and the versions. */
  refresh() {
    const host = this.resultsHost;
    if (!host) return;
    const t = this.t;
    const range = parseRange(this.range);
    host.replaceChildren();
    if (!range.ok) {
      host.append(noticeView(range.error === 'long' ? t('semverInvalidLong') : t('semverInvalid', { near: range.near }))); // prettier-ignore
      this.refreshTest();
      return;
    }
    append(host, [this.readingView(range), this.warningsView(range), this.versionsView(range)]);
    this.refreshTest();
  }

  /**
   * @param {Extract<Range, { ok: true }>} range
   * @returns {HTMLElement}
   */
  readingView(range) {
    const t = this.t;
    const setView = (/** @type {RangeSet} */ set) => {
      const { low, high } = bounds(set.comparators);
      const words = [low ? `${low.op === '>' ? '>' : '≥'} ${format(low.version)}` : '', high ? `${high.op === '<=' ? '≤' : '<'} ${format(high.version).replace(/-0$/, '')}` : ''].filter(Boolean); // prettier-ignore
      return h(
        'li',
        { class: set.empty ? 'empty' : '' },
        h('code', { class: 'semver-set', text: set.text }),
        h('span', { class: 'semver-words', text: ` — ${set.parts.map((p) => t(/** @type {StringKey} */ (`semverPart_${p.kind}`), p.params)).join(`, ${t('semverAnd')} `)}` }), // prettier-ignore
        h('span', { class: 'semver-bounds', text: words.length ? t('semverBounds', { bounds: words.join(` ${t('semverAnd')} `) }) : t('semverAll') }), // prettier-ignore
      );
    };
    return h(
      'div',
      { class: 'semver-reading', part: 'reading' },
      h('p', { class: 'semver-label', text: range.sets.length > 1 ? `${t('semverReadsAs')} — ${t('semverEither')}` : t('semverReadsAs') }), // prettier-ignore
      h('ul', {}, ...range.sets.map(setView)),
    );
  }

  /**
   * @param {Extract<Range, { ok: true }>} range
   * @returns {HTMLElement | null}
   */
  warningsView(range) {
    if (!range.warnings.length) return null;
    const t = this.t;
    return h(
      'ul',
      { class: 'semver-warnings', part: 'warnings' },
      ...range.warnings.map((w) => h('li', { class: w.id === 'empty' ? 'danger' : 'warning', attrs: { 'data-warning': w.id } }, icon('alert'), h('span', { text: t(/** @type {StringKey} */ (`semverWarning_${w.id}`), w.params) }))), // prettier-ignore
    );
  }

  /**
   * @param {Extract<Range, { ok: true }>} range
   * @returns {HTMLElement | null}
   */
  versionsView(range) {
    const t = this.t;
    const { versions, invalid, tags, capped } = readVersions(this.source().versionsText);
    if (!versions.length && !invalid.length) return null;
    const matched = versions.filter((v) => satisfies(v, range, this.pre));
    const resolved = maxSatisfying(versions.filter((v) => !v.pre.length || this.pre), range) ?? maxSatisfying(versions, range); // prettier-ignore
    const latest = tags.latest ? parseVersion(tags.latest) : versions.filter((v) => !v.pre.length).at(-1) ?? null; // prettier-ignore
    const signature = `${this.range}|${matched.length}|${resolved ? format(resolved) : ''}`;
    if (signature !== this.lastMatch) {
      this.lastMatch = signature;
      emit(this, EVENTS.MATCH, { range: this.range, matches: matched.map(format), resolved: resolved ? format(resolved) : null }); // prettier-ignore
    }
    const byTag = new Map(Object.entries(tags).map(([tag, ver]) => [ver, tag]));
    const shown = versions.slice(-SHOWN);
    return h(
      'div',
      { class: 'semver-versions-box' },
      h(
        'div',
        { class: 'semver-result', part: 'result' },
        resolved
          ? h('p', { class: 'semver-resolved' }, icon('check'), h('strong', { text: t('semverResolves', { version: format(resolved) }) }), h('span', { class: 'semver-muted', text: ` · ${t('semverMatches', { count: matched.length, total: versions.length })}` })) // prettier-ignore
          : h('p', { class: 'semver-resolved none' }, icon('alert'), h('strong', { text: t('semverNoMatch') })), // prettier-ignore
        latest
          ? h('p', { class: 'semver-muted', text: satisfies(latest, range, this.pre) ? t('semverLatestIn', { version: format(latest) }) : t('semverLatest', { version: format(latest), change: t(/** @type {StringKey} */ (`semverChange_${resolved ? diff(resolved, latest) : 'major'}`)) }) }) // prettier-ignore
          : null,
      ),
      h('p', { class: 'semver-label', text: t('semverVersions') }),
      versions.length > SHOWN ? h('p', { class: 'semver-muted', text: t('semverVersionsMore', { count: versions.length - SHOWN }) }) : null, // prettier-ignore
      h(
        'ul',
        { class: 'semver-versions', part: 'versions' },
        ...shown.map((v) => {
          const ok = satisfies(v, range, this.pre);
          const name = format(v);
          const tag = byTag.get(name);
          const isResolved = resolved && compare(v, resolved) === 0;
          return h(
            'li',
            { class: `${ok ? 'ok' : 'no'}${v.pre.length ? ' pre' : ''}${isResolved ? ' resolved' : ''}`, attrs: { 'data-version': name } }, // prettier-ignore
            ok ? icon('check') : null,
            h('code', { text: name }),
            tag ? h('span', { class: 'semver-tag', text: tag }) : null,
            h('span', {
              class: 'sr-only',
              text: ` ${ok ? t('semverMatch') : t('semverNoMatchOne')}`,
            }),
          );
        }),
      ),
      invalid.length ? h('p', { class: 'semver-muted', text: t('semverInvalidVersions', { list: invalid.slice(0, 10).join(', ') }) }) : null, // prettier-ignore
      capped ? noticeView(t('semverCapped', { count: versions.length })) : null,
    );
  }

  refreshTest() {
    const host = this.testHost;
    if (!host) return;
    const t = this.t;
    const value = this.testValue.trim();
    host.className = 'semver-test-result';
    if (!value) {
      host.replaceChildren();
      return;
    }
    const version = parseVersion(value);
    const range = parseRange(this.range);
    if (!version) {
      host.classList.add('no');
      host.replaceChildren(icon('alert'), h('span', { text: t('semverInvalidVersion', { version: value }) })); // prettier-ignore
      return;
    }
    const ok = satisfies(version, range, this.pre);
    const name = format(version);
    const preBlocked = !ok && version.pre.length && satisfies(version, range, true);
    host.classList.add(ok ? 'ok' : 'no');
    host.replaceChildren(icon(ok ? 'check' : 'alert'), h('span', { text: preBlocked ? t('semverTestPre', { version: name, base: `${version.major}.${version.minor}.${version.patch}` }) : t(ok ? 'semverTestYes' : 'semverTestNo', { version: name }) })); // prettier-ignore
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
    this.previewTimer = setTimeout(() => this.refresh(), 250);
  }
}
