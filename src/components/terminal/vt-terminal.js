// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import terminalCss from '../../styles/terminal.css?raw';
import { parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { deferChunk } from '../../core/chunks.js';
import { CHUNK_LINES, CHUNK_THRESHOLD, revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { highlight } from '../../core/highlighter.js';
import { formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { iconButton } from '../../core/ui.js';
import { decodeLiteralEscapes, lineText, parseAnsi } from './ansi.js';
import { commandsText, parsePrompts, parseTranscript } from './transcript.js';
import { TypingPlayer } from './typing.js';

/** @typedef {import('./ansi.js').Segment} Segment */
/** @typedef {import('./ansi.js').AnsiColor} AnsiColor */
/** @typedef {import('./transcript.js').Entry} Entry */

/** Longest command highlighted as shell code (longer ones are shown as text). */
const HIGHLIGHT_COMMAND = 2000;

/**
 * Shows a terminal session: commands after their prompt, and their output with ANSI
 * colors.
 *
 * Lines starting with a prompt (`$` by default) are commands: they are highlighted as
 * shell code and get their own copy button, which copies the command without the
 * prompt. Other lines are output, where ANSI colors, bold, underline, progress bars
 * (carriage returns) and OSC 8 links are rendered; other escape sequences are removed.
 *
 * @element vt-terminal
 * @since 0.7.0
 *
 * @attr {string} prompt - Prompts that start a command, separated by spaces (default `$ ❯`), or `none` for output only.
 * @attr {boolean} escapes - Also read literal `\e`, `\x1b`, `\033` and `\u001b` as the escape character.
 * @attr {boolean} colors - ANSI colors and text styles (default on). Off: plain text.
 * @attr {boolean} command-copy - A copy button on each command (default on).
 * @attr {number} collapse-output - Output blocks longer than this many lines are collapsed (default: never).
 * @attr {boolean} typing - Replays the session: commands are typed, then their output appears.
 * @attr {number} typing-speed - Milliseconds per typed character, 5–200 (default 35).
 * @attr {boolean} wrap - Wraps long lines (default on).
 *
 * @prop {string} content - The transcript.
 * @prop {string[]} commands - The commands, without prompts (read-only).
 * @prop {{ type: "command" | "output", prompt?: string, text: string }[]} entries - Commands
 *   and output blocks as plain text, in order (read-only).
 *
 * @fires vt-typing-end - The typing replay finished (or was stopped).
 *
 * @csspart terminal - The transcript.
 * @csspart command - A command line (prompt and command).
 * @csspart prompt - A prompt.
 * @csspart command-text - The command itself.
 * @csspart command-copy - The copy button of a command.
 * @csspart output - An output block.
 * @csspart output-more - "Show N more lines" button of a collapsed output.
 *
 * @example
 * <vt-terminal variant="full" label="Install">
 *   <template>$ npm install vitrine
 *   added 1 package in 2s</template>
 * </vt-terminal>
 */
export class VtTerminal extends VtBase {
  static type = 'terminal';

  static componentAttributes = Object.freeze([
    'prompt', 'escapes', 'colors', 'command-copy', 'collapse-output', 'typing', 'typing-speed',
    'wrap',
  ]); // prettier-ignore

  static presets = {
    simple: { colors: true, 'command-copy': true, wrap: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      colors: true, 'command-copy': true, wrap: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, terminalCss];

  static keepCarriageReturns = true;

  constructor() {
    super();
    /** @type {{ key: string, entries: Entry[] } | null} */
    this.parsed = null;
    /** @type {Set<number>} Output blocks expanded by the user. */
    this.expanded = new Set();
    /** @type {TypingPlayer | null} */
    this.player = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {HTMLElement | null} */
    this.previewHost = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    /** Replay requested once (typing runs on first render only, then on demand). */
    this.typingDone = false;
  }

  disconnectedCallback() {
    this.player?.stop();
    this.player = null;
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.expanded.clear();
    this.typingDone = false;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'prompt' || name === 'escapes') this.parsed = null;
    if (name === 'typing') this.typingDone = false;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  /** @returns {Entry[]} */
  parse() {
    const text = this.text ?? '';
    const prompt = this.getAttribute('prompt');
    const escapes = this.feature('escapes');
    const key = `${prompt}\u0000${escapes}\u0000${text}`;
    if (this.parsed?.key !== key) {
      const source = escapes ? decodeLiteralEscapes(text) : text;
      this.parsed = { key, entries: parseTranscript(parseAnsi(source), parsePrompts(prompt)) };
    }
    return this.parsed.entries;
  }

  /** @returns {string[]} */
  get commands() {
    return this.parse()
      .filter((entry) => entry.type === 'command')
      .map((entry) =>
        /** @type {import('./transcript.js').CommandEntry} */ (entry).lines.join('\n'),
      );
  }

  /** @returns {{ type: "command" | "output", prompt?: string, text: string }[]} */
  get entries() {
    return this.parse().map((entry) =>
      entry.type === 'command'
        ? { type: 'command', prompt: entry.prompt, text: entry.lines.join('\n') }
        : { type: 'output', text: entry.lines.map(lineText).join('\n') },
    );
  }

  /** The transcript as plain text (prompts kept, escape sequences removed). */
  plainText() {
    return this.parse()
      .map((entry) =>
        entry.type === 'command'
          ? `${entry.prompt} ${entry.lines.join('\n')}`
          : entry.lines.map(lineText).join('\n'),
      )
      .join('\n');
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    this.player?.stop();
    this.player = null;
    const panel = h('div', { class: 'panel' });
    /** @type {HTMLElement[]} */
    let extra = [];
    /** @type {TextSearch | null} */
    let search = null;

    if (this.editing) {
      const editor = this.createEditor();
      this.previewHost = h('div', { class: 'body term-body term-preview', part: 'body preview' });
      panel.classList.add('term-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        this.previewHost,
      );
      this.renderPreview();
      extra = this.historyButtons(editor);
    } else {
      this.previewHost = null;
      panel.append(this.renderTranscript());
    }

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.player?.stop();
        const root = this.root.querySelector('.terminal');
        search = root ? new TextSearch(root, { skip: '.prompt, .sr-only, button' }) : null;
        return search ? search.run(query) : { total: 0, capped: false };
      },
      /** @param {number} index */
      go: (index) => {
        const mark = search?.go(index) ?? null;
        // Matches in a collapsed output: expand it first.
        const hidden = mark?.closest('.collapsed-lines');
        if (hidden) hidden.classList.remove('collapsed-lines');
        revealMatch(mark);
      },
      clear: () => search?.clear(),
    };

    const typing = this.feature('typing') && !this.editing;
    const actions = [
      this.searchButton(target),
      ...extra,
      typing
        ? iconButton({
            icon: 'replay',
            label: t('replay'),
            key: 'replay',
            part: 'replay-button',
            onClick: () => this.replay(),
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.plainText(),
            this.downloadName('session.txt'),
            'text/plain',
          )
        : null,
      this.feature('copy')
        ? this.copyButton(() => commandsText(this.parse()), t('copyCommands'))
        : null,
    ];
    frame.append(...this.chrome({ badge: '', actions }), panel);
    this.editor?.align();

    if (typing && !this.typingDone && !reducedMotion()) this.replay();
  }

  /** Plays the typing replay (again). */
  replay() {
    const terminal = /** @type {HTMLElement | null} */ (this.root.querySelector('.terminal'));
    if (!terminal || this.editing) return;
    this.typingDone = true;
    this.player?.stop();
    this.player = new TypingPlayer(terminal, {
      speed: parseInteger(this.getAttribute('typing-speed'), { min: 5, max: 200, fallback: 35 }),
      onEnd: () => emit(this, EVENTS.TYPING_END, {}),
    });
    this.player.start();
  }

  /** @returns {HTMLElement} The scrollable transcript. */
  renderTranscript() {
    const entries = this.parse();
    const terminal = h('div', {
      class: `terminal${this.feature('wrap') ? ' wrapped' : ''}`,
      part: 'terminal',
    });
    if (!entries.length || (entries.length === 1 && isBlankOutput(entries[0]))) {
      terminal.append(h('div', { class: 'empty', part: 'empty', text: this.t('empty') }));
    }
    entries.forEach((entry, index) => {
      terminal.append(
        entry.type === 'command' ? this.commandRow(entry, index) : this.outputBlock(entry, index),
      );
    });
    return h(
      'div',
      {
        class: 'body term-body',
        part: 'body',
        attrs: {
          tabindex: '0',
          role: 'region',
          'aria-label': this.heading || this.t('terminal'),
        },
      },
      terminal,
    );
  }

  /**
   * @param {import('./transcript.js').CommandEntry} entry
   * @param {number} index
   * @returns {HTMLElement}
   */
  commandRow(entry, index) {
    const text = entry.lines.join('\n');
    const command = h('span', { class: 'cmd', part: 'command-text' });
    if (text.length <= HIGHLIGHT_COMMAND) command.append(highlight(text, 'bash'));
    else command.textContent = text;
    const row = h(
      'div',
      { class: 'entry command', part: 'command', attrs: { 'data-line': entry.line } },
      h('span', { class: 'sr-only', text: `${this.t('command')}: ` }),
      h('span', {
        class: 'prompt',
        part: 'prompt',
        text: `${entry.prompt} `,
        attrs: { 'aria-hidden': 'true' },
      }),
      command,
    );
    if (this.feature('command-copy') && text.trim()) {
      const button = this.copyButton(() => text, this.t('copyCommand'), `copy-command-${index}`);
      button.classList.add('cmd-copy');
      button.setAttribute('part', 'button command-copy');
      row.append(button);
    }
    return row;
  }

  /**
   * @param {import('./transcript.js').OutputEntry} entry
   * @param {number} index
   * @returns {HTMLElement}
   */
  outputBlock(entry, index) {
    const block = h('div', {
      class: 'entry output',
      part: 'output',
      attrs: { 'data-line': entry.line },
    });
    const lines = entry.lines;
    const limit = parseInteger(this.getAttribute('collapse-output'), {
      min: 0,
      max: 100_000,
      fallback: 0,
    });
    const collapsed = limit > 0 && lines.length > limit + 1 && !this.expanded.has(index);
    const shown = collapsed ? limit : lines.length;
    this.appendLines(block, lines, 0, shown);
    if (collapsed) {
      // The hidden lines are built too (so search finds them), and shown on demand.
      const rest = h('div', { class: 'collapsed-lines' });
      this.appendLines(rest, lines, shown, lines.length);
      const more = h('button', {
        class: 'more output-more',
        part: 'output-more',
        text: this.t('showMoreLines', { count: formatNumber(lines.length - shown, this.locale) }),
        attrs: { type: 'button', 'data-focus-key': `output-more-${index}` },
        on: {
          click: () => {
            this.expanded.add(index);
            rest.classList.remove('collapsed-lines');
            more.remove();
          },
        },
      });
      block.append(rest, more);
    }
    return block;
  }

  /**
   * Appends output lines, in blocks built on demand when there are many.
   *
   * @param {HTMLElement} parent
   * @param {Segment[][]} lines
   * @param {number} from
   * @param {number} to
   */
  appendLines(parent, lines, from, to) {
    const colors = this.feature('colors');
    /** @param {Node} target @param {number} a @param {number} b */
    const build = (target, a, b) => {
      const fragment = document.createDocumentFragment();
      for (let i = a; i < b; i += 1) fragment.append(lineNode(lines[i], colors));
      target.appendChild(fragment);
    };
    if (to - from <= CHUNK_THRESHOLD) {
      build(parent, from, to);
      return;
    }
    for (let start = from; start < to; start += CHUNK_LINES) {
      const end = Math.min(to, start + CHUNK_LINES);
      const chunk = h('span', { class: 'chunk', attrs: { 'data-count': end - start } });
      chunk.style.setProperty('--_chunk-lines', String(end - start));
      parent.append(chunk);
      if (start === from) build(chunk, start, end);
      else {
        chunk.setAttribute('data-pending', '');
        deferChunk(chunk, () => {
          chunk.removeAttribute('data-pending');
          build(chunk, start, end);
        });
      }
    }
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
    this.parsed = null;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.renderPreview(), 120);
  }

  /** Renders the live preview under the editor. */
  renderPreview() {
    const host = this.previewHost;
    if (!host) return;
    const scroll = host.scrollTop;
    const transcript = this.renderTranscript();
    host.replaceChildren(...Array.from(transcript.childNodes));
    host.scrollTop = scroll;
    if (this.searchOpen && this.searchQuery) this.searchBar?.run();
  }
}

/**
 * @param {Entry} entry
 * @returns {boolean}
 */
function isBlankOutput(entry) {
  return entry.type === 'output' && entry.lines.every((line) => !lineText(line).trim());
}

/** @returns {boolean} */
function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One output line.
 *
 * @param {Segment[]} segments
 * @param {boolean} colors - Apply ANSI styles.
 * @returns {HTMLElement}
 */
function lineNode(segments, colors) {
  const line = h('span', { class: 'line' });
  for (const segment of segments) {
    line.append(colors ? segmentNode(segment) : document.createTextNode(segment.text));
  }
  line.append('\n');
  return line;
}

/**
 * A styled segment. Colors from the 16-color palette use classes (themed); 256-color
 * and 24-bit colors are set with CSSOM from validated numbers.
 *
 * @param {Segment} segment
 * @returns {Node}
 */
export function segmentNode(segment) {
  const style = segment.style;
  let fg = style.fg;
  let bg = style.bg;
  const plain =
    !fg && !bg && !style.bold && !style.dim && !style.italic && !style.underline &&
    !style.inverse && !style.strike && !style.link; // prettier-ignore
  if (plain) return document.createTextNode(segment.text);

  /** @type {string[]} */
  const classes = [];
  if (style.inverse) {
    [fg, bg] = [bg, fg];
    if (!fg) classes.push('fg-inverse');
    if (!bg) classes.push('bg-inverse');
  }
  // Bold text in one of the 8 base colors uses the bright variant, like most terminals.
  if (fg && 'index' in fg && style.bold && fg.index < 8) fg = { index: fg.index + 8 };
  if (style.bold) classes.push('bold');
  if (style.dim) classes.push('dim');
  if (style.italic) classes.push('italic');
  if (style.underline) classes.push('underline');
  if (style.strike) classes.push('strike');
  if (bg && !fg && !style.inverse) classes.push('on-bg');

  const node = style.link
    ? h('a', {
        attrs: { href: style.link, rel: 'noopener noreferrer nofollow', target: '_blank' },
      })
    : h('span');
  if (fg) {
    if ('index' in fg) classes.push(`fg-${fg.index}`);
    else node.style.color = rgb(fg.rgb);
  }
  if (bg) {
    if ('index' in bg) classes.push(`bg-${bg.index}`);
    else node.style.backgroundColor = rgb(bg.rgb);
  }
  node.className = classes.join(' ');
  node.textContent = segment.text;
  return node;
}

/**
 * @param {[number, number, number]} color
 * @returns {string}
 */
function rgb([r, g, b]) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}
