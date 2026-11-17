// @ts-check
import dockerfileCss from '../../styles/dockerfile.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { parseDockerfile, worst } from './dockerfile.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./dockerfile.js').Dockerfile} Dockerfile */
/** @typedef {import('./dockerfile.js').Stage} Stage */
/** @typedef {import('./dockerfile.js').Instruction} Instruction */
/** @typedef {import('./dockerfile.js').Finding} Finding */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"stages" | "source"} View */

/** @type {readonly View[]} */
const VIEWS = Object.freeze(['stages', 'source']);
/** Instructions that add a layer to the image. */
const LAYERS = new Set(['RUN', 'COPY', 'ADD']);

/**
 * Shows a Dockerfile as build stages: each stage with its base image, what it copies from
 * other stages, the user and ports of the image, and its instructions with what each one does
 * and the problems found on it. Checks what linters and reviewers flag: unpinned or `latest`
 * base images, running as root, secrets in `ENV` or `ARG`, `ADD` where `COPY` does, package
 * caches left in layers, `curl | sh`, shell-form `CMD`, `cd` instead of `WORKDIR`, unused
 * stages. Reads continuation lines, heredocs and the escape directive; nothing is built.
 *
 * @element vt-dockerfile
 * @since 0.15.0
 *
 * @attr {"stages" | "source"} view - Tab shown first. Default: stages.
 * @attr {boolean} lint - The problems found. Default: on.
 * @attr {boolean} explain - What each instruction does, on hover and for screen readers. Default: on.
 *
 * @prop {string} content - The Dockerfile.
 * @prop {Dockerfile} dockerfile - The Dockerfile read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "dockerfile" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-copy - The Dockerfile copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary.
 * @csspart findings - The list of problems.
 * @csspart stage - The card of a stage.
 * @csspart instruction - An instruction.
 * @csspart source - The colored source.
 *
 * @example
 * <vt-dockerfile variant="full" src="Dockerfile"></vt-dockerfile>
 */
export class VtDockerfile extends VtBase {
  static type = 'dockerfile';

  static componentAttributes = Object.freeze(['view', 'lint', 'explain', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [dockerfileCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {View | null} */
    this.viewState = null;
    /** @type {{ text: string, file: Dockerfile } | null} */
    this.parsed = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Dockerfile} */
  get dockerfile() {
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, file: parseDockerfile(text) };
    return this.parsed.file;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'stages');
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const file = this.dockerfile;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'stages', label: t('dockerTabStages', { count: file.stages.length }) },
            { id: 'source', label: t('dockerTabSource') },
          ],
          selected: this.view,
          label: t('dockerTabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const body = h('div', { class: 'body docker-body', part: 'body' });
    if (!file.instructions.length) body.append(noticeView(t('dockerEmpty')));
    else if (this.view === 'source' && tabs) body.append(this.sourceView(file));
    else {
      body.append(this.summaryView(file));
      const general = file.findings.filter(
        (f) => !file.instructions.some((i) => i.line === f.line),
      );
      if (this.flag('lint', true) && general.length) body.append(this.findingsView(general, true));
      for (const stage of file.stages) body.append(this.stageView(stage, file));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }); // prettier-ignore
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('docker-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body editor' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') && this.text ? this.copyButton(() => this.text ?? '', t('dockerCopy')) : null, // prettier-ignore
    ];
    frame.append(...this.chrome({ badge: 'Dockerfile', tabs, actions }), panel);
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
   * @param {Dockerfile} file
   * @returns {HTMLElement}
   */
  summaryView(file) {
    const t = this.t;
    const level = worst(file.findings.filter((f) => f.level !== 'info'));
    const problems = file.findings.filter((f) => f.level === 'danger' || f.level === 'warning').length; // prettier-ignore
    const final = file.stages.at(-1);
    const layers = final ? this.chainOf(final, file).flatMap((s) => s.instructions).filter((i) => LAYERS.has(i.keyword)).length : 0; // prettier-ignore
    return h(
      'div',
      { class: 'docker-summary', part: 'summary' },
      h('strong', {
        text:
          file.stages.length === 1
            ? t('dockerOneStage')
            : t('dockerStages', { count: file.stages.length }),
      }),
      h('span', { text: t('dockerInstructions', { count: file.instructions.length }) }),
      final ? h('span', { text: t('dockerLayers', { count: layers }) }) : null,
      file.args.length ? h('span', { class: 'docker-muted', text: t('dockerArgs', { list: file.args.join(', ') }) }) : null, // prettier-ignore
      this.flag('lint', true)
        ? h('span', { class: `docker-verdict ${level}` }, icon(level === 'none' ? 'check' : 'alert'), h('span', { text: problems ? (problems === 1 ? t('dockerProblem') : t('dockerProblems', { count: problems })) : t('dockerNoProblem') })) // prettier-ignore
        : null,
    );
  }

  /**
   * The stages a stage is built on, from the first.
   *
   * @param {Stage} stage
   * @param {Dockerfile} file
   * @returns {Stage[]}
   */
  chainOf(stage, file) {
    /** @type {Stage[]} */
    const chain = [stage];
    let s = stage;
    while (s.parent >= 0 && chain.length < 50) {
      s = file.stages[s.parent];
      chain.unshift(s);
    }
    return chain;
  }

  /**
   * @param {Finding[]} findings
   * @param {boolean} [withLine]
   * @returns {HTMLElement}
   */
  findingsView(findings, withLine = false) {
    const t = this.t;
    return h(
      'ul',
      { class: 'docker-findings', part: 'findings', attrs: { 'aria-label': t('dockerFindings') } },
      ...findings.map((f) =>
        h(
          'li',
          { class: `docker-finding ${f.level}`, attrs: { 'data-finding': f.id } },
          icon(f.level === 'info' ? 'help' : 'alert'),
          h('span', { text: t(/** @type {StringKey} */ (`dockerFinding_${f.id}`), f.params) }),
          withLine && f.line ? h('span', { class: 'docker-muted', text: ` ${t('dockerLine', { line: f.line })}` }) : null, // prettier-ignore
        ),
      ),
    );
  }

  /**
   * @param {Stage} stage
   * @param {Dockerfile} file
   * @returns {HTMLElement}
   */
  stageView(stage, file) {
    const t = this.t;
    const parent = stage.parent >= 0 ? file.stages[stage.parent] : null;
    const chips = [
      stage.final ? h('span', { class: 'docker-chip final', text: t('dockerFinal') }) : null,
      parent ? h('span', { class: 'docker-chip', text: t('dockerOnStage', { name: parent.name || String(parent.index) }) }) : null, // prettier-ignore
      stage.from.length ? h('span', { class: 'docker-chip', text: t('dockerCopiesFrom', { list: [...new Set(stage.from)].join(', ') }) }) : null, // prettier-ignore
      stage.platform ? h('span', { class: 'docker-chip', text: t('dockerPlatform', { platform: stage.platform }) }) : null, // prettier-ignore
      stage.final ? h('span', { class: `docker-chip ${!stage.user || /^(root|0)(:|$)/.test(stage.user) ? 'warn' : ''}`, text: stage.user && !/^(root|0)(:|$)/.test(stage.user) ? t('dockerUser', { user: stage.user }) : t('dockerRoot') }) : null, // prettier-ignore
      stage.ports.length ? h('span', { class: 'docker-chip', text: t('dockerPorts', { list: stage.ports.join(', ') }) }) : null, // prettier-ignore
    ];
    const rows = [stage.origin, ...stage.instructions];
    return h(
      'section',
      { class: `docker-stage${stage.final ? ' final' : ''}`, part: 'stage', attrs: { 'aria-label': stage.name || t('dockerStage', { index: stage.index + 1 }), 'data-stage': stage.name || String(stage.index) } }, // prettier-ignore
      h(
        'header',
        { class: 'docker-stage-head' },
        h('h3', {}, h('span', { class: 'docker-muted', text: `${t('dockerStage', { index: stage.index + 1 })} ` }), stage.name ? h('code', { text: stage.name }) : null), // prettier-ignore
        h('code', { class: 'docker-image', text: t('dockerFrom', { image: stage.image }) }),
        ...chips,
      ),
      h('ol', { class: 'docker-list' }, ...rows.map((i) => this.instructionView(i, file))),
    );
  }

  /**
   * @param {Instruction} ins
   * @param {Dockerfile} file
   * @returns {HTMLElement}
   */
  instructionView(ins, file) {
    const t = this.t;
    const findings = this.flag('lint', true)
      ? file.findings.filter((f) => f.line === ins.line)
      : [];
    const hint = this.flag('explain', true) ? t(/** @type {StringKey} */ (`dockerKw_${ins.keyword}`)) : ''; // prettier-ignore
    const shown = [ins.flags.join(' '), ins.args].filter(Boolean).join(' ');
    return h(
      'li',
      {
        class: `docker-ins ${worst(findings)}`,
        part: 'instruction',
        attrs: { 'data-line': ins.line },
      },
      h('span', { class: 'docker-line', text: String(ins.line) }),
      h(
        'div',
        { class: 'docker-ins-body' },
        h(
          'code',
          { class: 'docker-code' },
          h('span', { class: `d-kw${LAYERS.has(ins.keyword) ? ' layer' : ''}`, attrs: { title: hint || null }, text: ins.keyword }), // prettier-ignore
          hint ? h('span', { class: 'sr-only', text: ` (${hint})` }) : null,
          ' ',
          h('span', { text: shown.length > 600 ? `${shown.slice(0, 600)} …` : shown }),
        ),
        ...ins.heredocs.map((doc) => h('pre', { class: 'docker-heredoc' }, h('code', { text: doc.slice(0, 4000) }))), // prettier-ignore
        findings.length ? this.findingsView(findings) : null,
      ),
    );
  }

  /**
   * The source with keywords, flags, variables and comments told apart.
   *
   * @param {Dockerfile} file
   * @returns {HTMLElement}
   */
  sourceView(file) {
    const lines = (this.text ?? '').split(/\r?\n/).slice(0, 10000);
    const starts = new Set(file.instructions.map((i) => i.line));
    const marks = new Map(file.findings.map((f) => [f.line, f.level]));
    return h(
      'pre',
      { class: 'docker-source', part: 'source' },
      h(
        'code',
        {},
        ...lines.map((line, i) => {
          const n = i + 1;
          const row = h('span', { class: `docker-src-line ${marks.get(n) ?? ''}` }, h('span', { class: 'docker-line', attrs: { 'aria-hidden': 'true' }, text: String(n) })); // prettier-ignore
          if (/^\s*#/.test(line)) row.append(h('span', { class: 'd-comment', text: line }));
          else {
            const m = starts.has(n) ? /^(\s*)([A-Za-z]+)(.*)$/.exec(line) : null;
            const rest = m ? m[3] : line;
            if (m) row.append(m[1], h('span', { class: 'd-kw', text: m[2] }));
            for (const part of rest.split(
              /(--[a-z-]+(?:=\S*)?|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|"[^"]*")/,
            )) {
              if (!part) continue;
              const cls = part.startsWith('--') ? 'd-flag' : part.startsWith('$') ? 'd-var' : part.startsWith('"') ? 'd-str' : ''; // prettier-ignore
              row.append(cls ? h('span', { class: cls, text: part }) : part);
            }
          }
          row.append('\n');
          return row;
        }),
      ),
    );
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
