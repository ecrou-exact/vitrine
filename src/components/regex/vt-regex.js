// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import regexCss from '../../styles/regex.css?raw';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { noticeView } from '../../core/ui.js';
import { explain } from './explain.js';
import {
  FLAGS,
  MAX_PATTERN_LENGTH,
  MAX_REGEX_MATCHES,
  MAX_TEXT_LENGTH,
  TIME_BUDGET,
  cleanFlags,
  compile,
  isRisky,
  parsePattern,
  patternTokens,
  runMatches,
  toLiteral,
} from './pattern.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./pattern.js').RegexNode} RegexNode */
/** @typedef {import('./pattern.js').RegexMatch} RegexMatch */
/** @typedef {import('./pattern.js').MatchResult} MatchResult */
/** @typedef {import('./explain.js').Explanation} Explanation */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Group colors cycle through this many tokens. */
const GROUP_COLORS = 6;
/** Most group columns in the match table. */
const MAX_GROUP_COLUMNS = 12;

/**
 * Shows a regular expression and what it matches: the pattern colored by part, an
 * explanation in plain words, the test text with every match and group marked, a table of
 * matches, and the result of a replacement.
 *
 * In edit mode the pattern and the test text are edited live. Matching runs with limits:
 * at most 100,000 characters of text, 1,000 matches and 100 ms, checked between matches.
 * Patterns that repeat a repetition, like `(a+)+`, can take exponential time on a single
 * match: they only run after the reader asks.
 *
 * @element vt-regex
 * @since 0.9.0
 *
 * @attr {string} pattern - The regular expression, without slashes.
 * @attr {string} flags - Flags among `d g i m s u v y` (default `g`).
 * @attr {string} replace - Replacement shown with its result (`$1`, `$<name>`, `$&`).
 * @attr {boolean} flag-buttons - Buttons to switch each flag. Full variant: on.
 * @attr {boolean} explain - Explanation of the pattern. Full variant: on.
 * @attr {boolean} table - Table of matches and groups. Full variant: on.
 *
 * @prop {string} content - The test text.
 * @prop {string} pattern - The pattern (reflects the attribute; edits update it).
 * @prop {string} flags - The flags (reflects the attribute; flag buttons update it).
 * @prop {RegexMatch[]} results - Matches of the current pattern (read-only copies).
 *
 * @fires vt-change - The pattern, flags or text changed. Detail: `{ pattern, flags, value }`.
 * @fires vt-match - Matching ran. Detail: `{ count, capped, timedOut }`.
 *
 * @csspart pattern - The colored pattern.
 * @csspart pattern-input - The pattern field in edit mode.
 * @csspart flags - The flag buttons.
 * @csspart text - The test text with matches.
 * @csspart match - A match in the text.
 * @csspart group - A group inside a match.
 * @csspart table - The table of matches.
 * @csspart replace - The replacement result.
 * @csspart explanation - The explanation tree.
 *
 * @example
 * <vt-regex variant="full" pattern="(?<user>[\w.]+)@(?<host>[\w.-]+)" flags="g">
 *   <template>ada@example.com, alan@test.org</template>
 * </vt-regex>
 */
export class VtRegex extends VtBase {
  static type = 'regex';

  static componentAttributes = Object.freeze([
    'pattern', 'flags', 'replace', 'flag-buttons', 'explain', 'table',
  ]); // prettier-ignore

  static presets = {
    simple: {},
    full: {
      header: true, dot: true, copy: true, download: true, fullscreen: true,
      'flag-buttons': true, explain: true, table: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, regexCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'pattern', 'flags'];

  constructor() {
    super();
    /** @type {string | null} Pattern typed in edit mode. */
    this.patternState = null;
    /** @type {string | null} Flags chosen with the buttons. */
    this.flagState = null;
    /** Run a risky pattern anyway. */
    this.forceRun = false;
    /** @type {{ key: string, result: MatchResult | null, error: string, risky: boolean } | null} */
    this.cache = null;
    /** @type {HTMLElement | null} */
    this.resultsHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    this.textId = uid('regex-text');
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'pattern') {
      this.patternState = null;
      this.forceRun = false;
    }
    if (name === 'flags') this.flagState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  /** @returns {string} */
  get pattern() {
    return (this.patternState ?? this.getAttribute('pattern') ?? '').slice(0, MAX_PATTERN_LENGTH);
  }

  set pattern(value) {
    this.setAttribute('pattern', String(value ?? ''));
  }

  /** @returns {string} */
  get flags() {
    return cleanFlags(this.flagState ?? this.getAttribute('flags') ?? 'g');
  }

  set flags(value) {
    this.setAttribute('flags', String(value ?? ''));
  }

  /** @returns {RegexMatch[]} */
  get results() {
    return (this.run().result?.matches ?? []).map((m) => ({
      ...m,
      groups: [...m.groups],
      ranges: [...m.ranges],
      named: { ...m.named },
    }));
  }

  /** @returns {{ result: MatchResult | null, error: string, risky: boolean }} */
  run() {
    const text = this.text ?? '';
    const key = `${this.flags}\u0000${this.forceRun}\u0000${this.pattern}\u0000${text}`;
    if (this.cache?.key === key) return this.cache;
    const { regex, error } = compile(this.pattern, this.flags);
    const risky = Boolean(regex) && isRisky(parsePattern(this.pattern).tree) && !this.forceRun;
    const result = regex && !risky ? runMatches(regex, text) : null;
    this.cache = { key, result, error, risky };
    if (result)
      emit(this, EVENTS.MATCH, {
        count: result.matches.length,
        capped: result.capped,
        timedOut: result.timedOut,
      });
    return this.cache;
  }

  /** @returns {string} Matches as JSON. */
  matchesJson() {
    const matches = this.run().result?.matches ?? [];
    return JSON.stringify(
      matches.map((m) => ({
        index: m.index,
        match: m.text,
        groups: m.groups,
        ...(Object.keys(m.named).length ? { named: m.named } : {}),
      })),
      null,
      2,
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const body = h('div', { class: 'body re-body', part: 'body' });
    /** @type {HTMLElement[]} */
    let extra = [];
    if (this.editing) {
      const input = h('input', {
        class: 're-input',
        part: 'pattern-input',
        attrs: {
          type: 'text',
          value: this.pattern,
          'aria-label': t('regexPattern'),
          spellcheck: 'false',
          autocomplete: 'off',
          maxlength: MAX_PATTERN_LENGTH,
          'data-focus-key': 'regex-pattern',
        },
        on: {
          input: (event) => {
            this.patternState = /** @type {HTMLInputElement} */ (event.target).value;
            this.forceRun = false;
            this.changed();
          },
        },
      });
      input.value = this.pattern;
      const editor = this.createEditor();
      body.append(
        h(
          'label',
          { class: 're-field' },
          h('span', { class: 're-slash', text: '/' }),
          input,
          h('span', { class: 're-slash', text: `/${this.flags}` }),
        ),
        h('div', { class: 'editor-body', part: 'source' }, editor.element),
      );
      extra = this.historyButtons(editor);
    }
    this.resultsHost = h('div', { class: 're-results' });
    body.append(this.resultsHost);
    this.renderResults();

    const actions = [
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.matchesJson(),
            this.downloadName('matches.json'),
            'application/json',
          )
        : null,
      this.feature('copy')
        ? this.copyButton(() => this.matchesJson(), t('regexCopyMatches'), 'copy-matches')
        : null,
      this.feature('copy')
        ? this.copyButton(() => toLiteral(this.pattern, this.flags), t('regexCopyPattern'))
        : null,
    ];
    frame.append(...this.chrome({ badge: this.badge(), actions }), body);
    this.editor?.align();
  }

  /** @returns {string} */
  badge() {
    const { result, error } = this.run();
    if (error) return this.t('regexInvalidBadge');
    if (!result) return '';
    const count = result.matches.length;
    return this.t('regexCount', {
      count: `${formatNumber(count, this.locale)}${result.capped || result.timedOut ? '+' : ''}`,
    });
  }

  /** Everything that depends on the pattern, flags and text. */
  renderResults() {
    const host = this.resultsHost;
    if (!host) return;
    const t = this.t;
    const { result, error, risky } = this.run();
    const { tree, groups } = parsePattern(this.pattern);
    /** @type {(HTMLElement | null)[]} */
    const parts = [this.patternView(tree)];
    if (this.feature('flag-buttons')) parts.push(this.flagButtons());
    if (error) parts.push(noticeView(t('regexInvalid', { message: error })));
    if (risky) parts.push(this.riskyNotice());
    if (result?.truncated)
      parts.push(
        noticeView(t('regexTruncated', { max: formatNumber(MAX_TEXT_LENGTH, this.locale) })),
      );
    if (result?.capped)
      parts.push(
        noticeView(t('regexCapped', { max: formatNumber(MAX_REGEX_MATCHES, this.locale) })),
      );
    if (result?.timedOut) parts.push(noticeView(t('regexTimeout', { ms: TIME_BUDGET })));
    const names = groupNames(tree);
    parts.push(this.textView(result?.matches ?? [], names));
    const replace = this.getAttribute('replace');
    if (replace !== null && result && !error) parts.push(this.replaceView(replace, result));
    if (this.feature('table') && result) parts.push(this.matchTable(result.matches, groups, names));
    if (this.feature('explain') && this.pattern && !error) parts.push(this.explanation(tree));
    host.replaceChildren(...parts.filter((part) => part !== null));
    const badge = this.root.querySelector('[part~="badge"]');
    if (badge) badge.textContent = this.badge();
  }

  /**
   * @param {RegexNode} tree
   * @returns {HTMLElement}
   */
  patternView(tree) {
    const pattern = this.pattern;
    const code = h('code', {
      class: 're-pattern',
      part: 'pattern',
      attrs: { 'aria-label': this.t('regexPattern') },
    });
    code.append(h('span', { class: 'tok-delim', text: '/' }));
    let at = 0;
    for (const token of patternTokens(tree)) {
      if (token.start < at) continue;
      if (token.start > at) code.append(pattern.slice(at, token.start));
      code.append(
        h('span', {
          class: `tok tok-${token.kind}`,
          text: pattern.slice(token.start, token.end),
          attrs: { 'data-pair': token.pair ?? null },
        }),
      );
      at = token.end;
    }
    if (at < pattern.length) code.append(pattern.slice(at));
    code.append(h('span', { class: 'tok-delim', text: `/${this.flags}` }));
    const pairs = (/** @type {Event} */ event, /** @type {boolean} */ on) => {
      const pair = /** @type {HTMLElement} */ (event.target).closest?.('[data-pair]');
      const id = pair instanceof HTMLElement ? pair.dataset.pair : null;
      if (!id) return;
      for (const el of code.querySelectorAll(`[data-pair="${id}"]`))
        el.classList.toggle('paired', on);
    };
    code.addEventListener('mouseover', (event) => pairs(event, true));
    code.addEventListener('mouseout', (event) => pairs(event, false));
    return h('div', { class: 're-pattern-row' }, code);
  }

  /** @returns {HTMLElement} */
  flagButtons() {
    const t = this.t;
    const current = this.flags;
    const bar = h('div', {
      class: 're-flags',
      part: 'flags',
      attrs: { role: 'group', 'aria-label': t('regexFlags') },
    });
    for (const flag of FLAGS) {
      bar.append(
        h(
          'button',
          {
            class: 're-flag',
            attrs: {
              type: 'button',
              'aria-pressed': String(current.includes(flag)),
              title: t(/** @type {StringKey} */ (`regexFlag_${flag}`)),
              'data-focus-key': `flag-${flag}`,
            },
            on: { click: () => this.toggleFlag(flag) },
          },
          h('code', { text: flag }),
          h('span', {
            class: 're-flag-name',
            text: t(/** @type {StringKey} */ (`regexFlag_${flag}`)),
          }),
        ),
      );
    }
    return bar;
  }

  /**
   * @param {string} flag
   */
  toggleFlag(flag) {
    const set = new Set(this.flags.split(''));
    if (set.has(flag)) set.delete(flag);
    else {
      set.add(flag);
      if (flag === 'u') set.delete('v');
      if (flag === 'v') set.delete('u');
    }
    this.flagState = cleanFlags([...set].join(''));
    this.render();
    this.changed(true);
  }

  /** @returns {HTMLElement} */
  riskyNotice() {
    const notice = noticeView(this.t('regexRisky'));
    notice.append(
      h('button', {
        class: 'text-btn re-run',
        text: this.t('regexRunAnyway'),
        attrs: { type: 'button', 'data-focus-key': 'regex-run' },
        on: {
          click: () => {
            this.forceRun = true;
            this.renderResults();
          },
        },
      }),
    );
    return notice;
  }

  /**
   * The test text with matches and groups marked.
   *
   * @param {RegexMatch[]} matches
   * @param {Map<number, string>} names
   * @returns {HTMLElement}
   */
  textView(matches, names) {
    const text = this.text ?? '';
    const pre = h('pre', {
      class: 're-text',
      part: 'text',
      attrs: {
        id: this.textId,
        tabindex: '0',
        role: 'region',
        'aria-label': this.t('regexTestText'),
      },
    });
    if (!text) {
      pre.append(h('span', { class: 'empty', text: this.t('regexNoText') }));
      return pre;
    }
    let at = 0;
    matches.forEach((m, i) => {
      if (m.index > at) pre.append(text.slice(at, m.index));
      pre.append(this.markMatch(m, i, text, names));
      at = Math.max(at, m.end);
    });
    if (at < text.length) pre.append(text.slice(at));
    return pre;
  }

  /**
   * @param {RegexMatch} m
   * @param {number} i
   * @param {string} text
   * @param {Map<number, string>} names
   * @returns {HTMLElement}
   */
  markMatch(m, i, text, names) {
    const t = this.t;
    const mark = h('mark', {
      class: `re-match${i % 2 ? ' odd' : ''}${m.text ? '' : ' empty'}`,
      part: 'match',
      attrs: { title: t('regexMatchTitle', { n: i + 1 }) },
    });
    if (!m.text) return mark;
    const cuts = new Set([m.index, m.end]);
    for (const r of m.ranges) if (r) cuts.add(r[0]).add(r[1]);
    const points = [...cuts].filter((p) => p >= m.index && p <= m.end).sort((a, b) => a - b);
    for (let k = 0; k < points.length - 1; k += 1) {
      const [a, b] = [points[k], points[k + 1]];
      let inner = -1;
      m.ranges.forEach((r, g) => {
        if (!r || r[0] > a || r[1] < b) return;
        if (
          inner < 0 ||
          r[1] - r[0] <=
            /** @type {[number, number]} */ (m.ranges[inner])[1] -
              /** @type {[number, number]} */ (m.ranges[inner])[0]
        )
          inner = g;
      });
      const slice = text.slice(a, b);
      if (inner < 0) mark.append(slice);
      else {
        const n = inner + 1;
        const name = names.get(n);
        mark.append(
          h('span', {
            class: `re-group g${(inner % GROUP_COLORS) + 1}`,
            part: 'group',
            text: slice,
            attrs: {
              title: name ? t('regexNamedGroupTitle', { n, name }) : t('regexGroupTitle', { n }),
            },
          }),
        );
      }
    }
    return mark;
  }

  /**
   * @param {string} replace
   * @param {MatchResult} result
   * @returns {HTMLElement | null}
   */
  replaceView(replace, result) {
    if (result.capped || result.timedOut || result.truncated) return null;
    const { regex } = compile(this.pattern, this.flags);
    if (!regex) return null;
    const output = (this.text ?? '').replace(regex, replace);
    return h(
      'section',
      { class: 're-section', attrs: { 'aria-label': this.t('regexResult') } },
      h(
        'h3',
        { class: 're-heading' },
        this.t('regexResult'),
        ' ',
        h('code', { class: 're-replace-source', text: replace }),
      ),
      h('pre', { class: 're-text re-replaced', part: 'replace', text: output }),
    );
  }

  /**
   * @param {RegexMatch[]} matches
   * @param {number} groups
   * @param {Map<number, string>} names
   * @returns {HTMLElement}
   */
  matchTable(matches, groups, names) {
    const t = this.t;
    const section = h(
      'section',
      { class: 're-section', attrs: { 'aria-label': t('regexMatches') } },
      h('h3', { class: 're-heading', text: t('regexMatches') }),
    );
    if (!matches.length) {
      section.append(h('div', { class: 'empty', part: 'empty', text: t('regexNoMatch') }));
      return section;
    }
    const shown = Math.min(groups, MAX_GROUP_COLUMNS);
    const head = h(
      'tr',
      {},
      h('th', { class: 'num', attrs: { scope: 'col' }, text: '#' }),
      h('th', { attrs: { scope: 'col' }, text: t('regexPosition') }),
      h('th', { attrs: { scope: 'col' }, text: t('regexMatch') }),
    );
    for (let n = 1; n <= shown; n += 1) {
      const name = names.get(n);
      head.append(
        h(
          'th',
          { attrs: { scope: 'col' } },
          h('span', {
            class: `re-swatch g${((n - 1) % GROUP_COLORS) + 1}`,
            attrs: { 'aria-hidden': 'true' },
          }),
          name ? `${n} · ${name}` : String(n),
        ),
      );
    }
    const body = h('tbody');
    matches.forEach((m, i) => {
      const row = h(
        'tr',
        {},
        h('td', { class: 'num', text: String(i + 1) }),
        h('td', { class: 'pos', text: `${m.index}–${m.end}` }),
        h('td', {}, cellValue(m.text, t)),
      );
      for (let g = 0; g < shown; g += 1) row.append(h('td', {}, cellValue(m.groups[g], t)));
      body.append(row);
    });
    section.append(
      h(
        'div',
        { class: 're-table-wrap' },
        h('table', { class: 're-table', part: 'table' }, h('thead', {}, head), body),
      ),
    );
    return section;
  }

  /**
   * @param {RegexNode} tree
   * @returns {HTMLElement}
   */
  explanation(tree) {
    const t = this.t;
    const items = explain(tree, this.pattern, this.flags, t);
    /** @type {(nodes: Explanation[]) => HTMLElement} */
    const list = (nodes) =>
      h(
        'ul',
        {},
        ...nodes.map((node) =>
          h(
            'li',
            {},
            h(
              'div',
              { class: 're-explain-line' },
              h('code', { class: 're-explain-source', text: node.source }),
              h('span', { text: node.text }),
            ),
            node.children.length ? list(node.children) : null,
          ),
        ),
      );
    return h(
      'details',
      { class: 're-section re-explain', part: 'explanation', attrs: { open: true } },
      h('summary', { class: 're-heading', text: t('regexExplanation') }),
      list(items),
    );
  }

  // ------------------------------------------------------------------ editing

  /**
   * The pattern, flags or text changed: re-run after a pause.
   *
   * @param {boolean} [now]
   */
  changed(now = false) {
    const fire = () => {
      this.renderResults();
      emit(this, EVENTS.CHANGE, {
        pattern: this.pattern,
        flags: this.flags,
        value: this.text ?? '',
      });
    };
    clearTimeout(this.timer);
    if (now)
      emit(this, EVENTS.CHANGE, {
        pattern: this.pattern,
        flags: this.flags,
        value: this.text ?? '',
      });
    else this.timer = setTimeout(fire, 150);
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
      label: this.t('regexTestText'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    this.changed();
  }
}

/**
 * @param {string | undefined} value
 * @param {import('../../core/ui.js').Translate} t
 * @returns {HTMLElement}
 */
function cellValue(value, t) {
  if (value === undefined) return h('span', { class: 'blank', text: t('regexUnmatched') });
  if (value === '') return h('span', { class: 'blank', text: t('regexEmptyMatch') });
  return h('code', { text: value.length > 200 ? `${value.slice(0, 199)}…` : value });
}

/**
 * Names of the named groups, by number.
 *
 * @param {RegexNode} node
 * @param {Map<number, string>} [names]
 * @returns {Map<number, string>}
 */
function groupNames(node, names = new Map()) {
  if (node.type === 'group') {
    if (node.kind === 'named') names.set(node.n, node.name);
    groupNames(node.body, names);
  } else if (node.type === 'quant') groupNames(node.target, names);
  else if (node.type === 'seq') for (const item of node.items) groupNames(item, names);
  else if (node.type === 'alt') for (const item of node.alternatives) groupNames(item, names);
  return names;
}
