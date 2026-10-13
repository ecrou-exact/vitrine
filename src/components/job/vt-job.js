// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import ansiCss from '../../styles/ansi.css?raw';
import jobCss from '../../styles/job.css?raw';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { lineText, parseAnsi } from '../terminal/ansi.js';
import { segmentNode } from '../terminal/ansi-dom.js';
import {
  JobError,
  formatDuration,
  jobDuration,
  jobLog,
  jobProgress,
  normalizeStatus,
  overallStatus,
  readJob,
  stepProgress,
} from './job.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./job.js').Job} Job */
/** @typedef {import('./job.js').JobStep} JobStep */
/** @typedef {import('./job.js').JobStatus} JobStatus */

/** Log lines shown per step; the rest is in copy and download. */
const MAX_LOG_LINES = 5000;

/**
 * Shows a job — a CI run, a pipeline, a batch task — with its progress, its steps and
 * their logs, like the job page of a CI service.
 *
 * Reads JSON (`{ name, status, started, finished, progress, steps: [{ name, status,
 * started, finished, duration, progress, log }] }`) or a short text format where
 * `# name` names the job, `## name` starts a step and `status:`, `duration:` or
 * `progress:` lines set its fields. Each step opens to show its log with ANSI colors;
 * failed steps are open at first. `update()`, `setStep()` and `appendLog()` follow a
 * running job live.
 *
 * @element vt-job
 * @since 0.9.0
 *
 * @attr {boolean} progress - The progress bar of the job (default on).
 * @attr {boolean} durations - Durations of the job and its steps (default on).
 * @attr {boolean} open-failed - Opens failed steps at first (default on).
 * @attr {boolean} follow - Keeps the end of the running step's log in view.
 *
 * @prop {string} content - The job, as JSON or text.
 * @prop {Job | null} job - The job read from the content (a copy).
 *
 * @method update - `update(patch)` changes fields of the job (`status`, `progress`, `name`…).
 * @method setStep - `setStep(name, patch)` changes a step, or adds it at the end.
 * @method appendLog - `appendLog(name, text)` adds text at the end of a step's log.
 *
 * @fires vt-step-toggle - A step was opened or closed. Detail: `{ name, open }`.
 * @fires vt-job-change - The status of the job or a step changed. Detail: `{ status, step, previous }`.
 *
 * @csspart summary - The status, name, duration and progress of the job.
 * @csspart progress - The progress bar of the job.
 * @csspart steps - The list of steps.
 * @csspart step - A step (also `step-success`, `step-failure`…).
 * @csspart step-head - The button that opens a step.
 * @csspart step-log - The log of a step.
 * @csspart status - A status icon and word.
 *
 * @example
 * <vt-job variant="full" src="/runs/1841.json"></vt-job>
 */
export class VtJob extends VtBase {
  static type = 'job';

  static componentAttributes = Object.freeze(['progress', 'durations', 'open-failed', 'follow']);

  static presets = {
    simple: { progress: true, durations: true, 'open-failed': true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      progress: true, durations: true, 'open-failed': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, ansiCss, jobCss];

  constructor() {
    super();
    /** @type {{ text: string, job: Job | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {Map<string, boolean>} Steps opened or closed by the reader. */
    this.toggled = new Map();
    this.query = '';
    this.matchCount = 0;
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.listHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    /** @type {string} Status last announced. */
    this.lastStatus = '';
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.toggled.clear();
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ job: Job | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, job: readJob(text), error: null };
    } catch (error) {
      this.parsed = {
        text,
        job: null,
        error: error instanceof Error ? error : new JobError(String(error)),
      };
    }
    return this.parsed;
  }

  /** @returns {Job | null} */
  get job() {
    const job = this.parse().job;
    return job ? structuredClone(job) : null;
  }

  /**
   * Replaces the job with a changed copy, without reloading: open steps, search and
   * scroll are kept.
   *
   * @param {(job: Job) => void} change
   */
  mutate(change) {
    const current = this.parse().job;
    const job = current
      ? structuredClone(current)
      : /** @type {Job} */ ({
          name: '', status: 'queued', started: '', finished: '', duration: null, progress: null,
          steps: [],
        }); // prettier-ignore
    const before = new Map(job.steps.map((step) => [step.name, step.status]));
    const previous = job.status;
    change(job);
    const text = JSON.stringify(job, null, 2);
    this.text = text;
    this.error = null;
    this.parsed = { text, job, error: null };
    for (const step of job.steps) {
      const was = before.get(step.name);
      if (was && was !== step.status)
        emit(this, EVENTS.JOB_CHANGE, { status: step.status, step: step.name, previous: was });
    }
    if (previous !== job.status)
      emit(this, EVENTS.JOB_CHANGE, { status: job.status, step: null, previous });
    if (this.editing) return;
    this.requestRender();
  }

  /**
   * Changes fields of the job.
   *
   * @param {Partial<Pick<Job, 'name' | 'status' | 'started' | 'finished' | 'progress'>> & { duration?: number | null }} patch
   */
  update(patch) {
    this.mutate((job) => {
      Object.assign(job, patch);
      if (patch.status !== undefined) job.status = normalizeStatus(patch.status, job.status);
    });
  }

  /**
   * Changes a step, or adds it at the end. Without a status of its own, the job follows
   * its steps.
   *
   * @param {string} name
   * @param {Partial<JobStep>} patch
   */
  setStep(name, patch) {
    this.mutate((job) => {
      let step = job.steps.find((s) => s.name === name);
      if (!step) {
        step = { name, status: 'queued', started: '', finished: '', duration: null, progress: null, log: '' }; // prettier-ignore
        job.steps.push(step);
      }
      Object.assign(step, patch, { name });
      if (patch.status !== undefined) step.status = normalizeStatus(patch.status, step.status);
      job.status = overallStatus(job.steps);
    });
  }

  /**
   * Adds text at the end of a step's log (the step is added when missing).
   *
   * @param {string} name
   * @param {string} text
   */
  appendLog(name, text) {
    this.mutate((job) => {
      let step = job.steps.find((s) => s.name === name);
      if (!step) {
        step = { name, status: 'running', started: '', finished: '', duration: null, progress: null, log: '' }; // prettier-ignore
        job.steps.push(step);
      }
      step.log = step.log ? `${step.log}\n${String(text)}` : String(text);
    });
  }

  /**
   * @param {JobStep} step
   * @returns {boolean}
   */
  isOpen(step) {
    const choice = this.toggled.get(step.name);
    if (choice !== undefined) return choice;
    if (this.query) return step.log.toLowerCase().includes(this.query.toLowerCase());
    return this.feature('open-failed') && step.status === 'failure';
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { job, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body job-body', part: 'body' });

    if (error) body.append(noticeView(t('jobInvalid', { message: error.message })));
    else if (!job) body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else {
      body.append(this.summary(job));
      this.listHost = h('ol', { class: 'job-steps', part: 'steps' });
      body.append(this.listHost);
      this.renderSteps();
      this.announceStatus(job);
    }

    /** @type {HTMLElement[]} */
    let extra = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('job-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.toggled.clear();
        this.renderSteps();
        return { total: this.matchCount, capped: this.matchCount >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        // Focus stays in the search field so typing goes on; the match is only marked.
        const marks = this.listHost?.querySelectorAll('mark.match') ?? [];
        for (const mark of marks) mark.classList.remove('current');
        const mark = marks[index];
        if (!mark) return;
        mark.classList.add('current');
        mark.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.renderSteps();
      },
    };

    const actions = [
      this.searchButton(target),
      ...extra,
      job && !this.editing
        ? iconButton({
            icon: 'expand-all',
            label: t('expandAll'),
            key: 'expand-all',
            onClick: () => this.openAll(true),
          })
        : null,
      job && !this.editing
        ? iconButton({
            icon: 'collapse-all',
            label: t('collapseAll'),
            key: 'collapse-all',
            onClick: () => this.openAll(false),
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => {
              const current = this.parse().job;
              return current ? jobLog(current) : '';
            },
            this.downloadName('job.log'),
            'text/plain',
          )
        : null,
      this.feature('copy')
        ? this.copyButton(() => {
            const current = this.parse().job;
            return current ? jobLog(current) : '';
          }, t('jobCopyLog'))
        : null,
    ];
    const badge = job ? this.statusLabel(job.status) : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /** Header title: the label, else the job name. */
  get heading() {
    return super.heading || this.parse().job?.name || '';
  }

  /**
   * @param {JobStatus} status
   * @returns {string}
   */
  statusLabel(status) {
    const key = /** @type {any} */ (`jobStatus${status[0].toUpperCase()}${status.slice(1)}`);
    return this.t(key);
  }

  /**
   * Status icon and word.
   *
   * @param {JobStatus} status
   * @param {boolean} [word]
   * @returns {HTMLElement}
   */
  statusView(status, word = true) {
    const name = status === 'cancelled' ? 'skipped' : status === 'queued' ? 'circle' : status;
    return h(
      'span',
      { class: `job-status status-${status}`, part: 'status' },
      icon(`status-${name}`),
      h('span', { class: word ? 'status-word' : 'sr-only', text: this.statusLabel(status) }),
    );
  }

  /**
   * A progress bar: determinate with a value, indeterminate with `null`.
   *
   * @param {number | null} value
   * @param {string} label
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  progressBar(value, label, className = '') {
    const bar = h('div', {
      class: `job-progress ${className}${value === null ? ' indeterminate' : ''}`,
      attrs: {
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': value === null ? null : String(Math.round(value)),
        'aria-valuetext': value === null ? this.t('jobInProgress') : `${Math.round(value)} %`,
      },
    });
    const fill = h('span', { class: 'job-progress-fill' });
    if (value !== null) fill.style.setProperty('--_value', `${value}%`);
    bar.append(fill);
    return bar;
  }

  /**
   * @param {Job} job
   * @returns {HTMLElement}
   */
  summary(job) {
    const t = this.t;
    const done = job.steps.filter((s) => s.status !== 'queued' && s.status !== 'running').length;
    const duration = jobDuration(job);
    const facts = h(
      'div',
      { class: 'job-facts' },
      h('span', {
        text: t('jobSteps', {
          done: formatNumber(done, this.locale),
          total: formatNumber(job.steps.length, this.locale),
        }),
      }),
    );
    if (this.feature('durations') && duration !== null)
      facts.append(h('span', { class: 'job-duration', text: formatDuration(duration) }));
    const progress = jobProgress(job);
    const summary = h(
      'div',
      { class: `job-summary status-${job.status}`, part: 'summary' },
      h(
        'div',
        { class: 'job-title' },
        this.statusView(job.status),
        job.name ? h('h2', { text: job.name }) : null,
        progress !== null ? h('span', { class: 'job-percent', text: `${progress} %` }) : null,
      ),
      facts,
    );
    if (this.feature('progress')) {
      const bar = this.progressBar(
        job.status === 'running' && job.progress === null && !job.steps.length ? null : progress,
        t('jobProgress'),
      );
      bar.setAttribute('part', 'progress');
      summary.append(bar);
    }
    return summary;
  }

  /** Renders the steps for the current search. */
  renderSteps() {
    const host = this.listHost;
    const job = this.parse().job;
    if (!host || !job) return;
    this.matchCount = 0;
    if (!job.steps.length) {
      host.replaceChildren(h('li', { class: 'empty', part: 'empty', text: this.t('jobNoSteps') }));
      return;
    }
    host.replaceChildren(...job.steps.map((step, index) => this.stepItem(step, index)));
    if (this.query && !this.matchCount)
      host.append(h('li', { class: 'empty', part: 'empty', text: this.t('jobNoMatch') }));
    if (this.feature('follow')) {
      const running = host.querySelector('.job-step.status-running .job-log');
      if (running) running.scrollTop = running.scrollHeight;
    }
  }

  /**
   * @param {JobStep} step
   * @param {number} index
   * @returns {HTMLElement}
   */
  stepItem(step, index) {
    const open = this.isOpen(step);
    const logId = `${this.panelId}-log-${index}`;
    const progress = stepProgress(step);
    const head = h(
      'button',
      {
        class: 'job-step-head',
        part: 'step-head',
        attrs: {
          type: 'button',
          'aria-expanded': String(open),
          'aria-controls': logId,
          'data-focus-key': `step-${index}`,
        },
        on: { click: () => this.toggle(step, !open, index) },
      },
      icon('chevron-right'),
      this.statusView(step.status, false),
      h('span', { class: 'job-step-name', text: step.name }),
      step.status === 'running'
        ? this.progressBar(progress, step.name, 'mini')
        : h('span', { class: 'job-step-word', text: this.statusLabel(step.status) }),
      this.feature('durations') && step.duration !== null
        ? h('span', { class: 'job-duration', text: formatDuration(step.duration) })
        : null,
    );
    const item = h(
      'li',
      { class: `job-step status-${step.status}`, part: `step step-${step.status}` },
      head,
    );
    const log = this.logView(step, logId);
    if (open) item.append(log);
    return item;
  }

  /**
   * The log of a step with ANSI colors and search marks.
   *
   * @param {JobStep} step
   * @param {string} id
   * @returns {HTMLElement}
   */
  logView(step, id) {
    const box = h('div', {
      class: 'job-log ansi',
      part: 'step-log',
      attrs: { id, tabindex: '0', role: 'region', 'aria-label': step.name },
    });
    if (!step.log) {
      box.append(h('div', { class: 'job-log-empty', text: this.t('jobNoLog') }));
      return box;
    }
    const lines = parseAnsi(step.log).slice(0, MAX_LOG_LINES);
    const q = this.query.toLowerCase();
    lines.forEach((segments, i) => {
      const line = h(
        'div',
        { class: 'job-line' },
        h('span', { class: 'job-ln', attrs: { 'aria-hidden': 'true' }, text: String(i + 1) }),
      );
      const text = h('span', { class: 'job-text' });
      if (q && lineText(segments).toLowerCase().includes(q)) this.markLine(text, segments, q);
      else for (const segment of segments) text.append(segmentNode(segment));
      line.append(text);
      box.append(line);
    });
    return box;
  }

  /**
   * Writes a line with each match of the query in a `<mark>` (styles dropped on that line).
   *
   * @param {HTMLElement} target
   * @param {import('../terminal/ansi.js').Segment[]} segments
   * @param {string} q
   */
  markLine(target, segments, q) {
    const text = lineText(segments);
    const lower = text.toLowerCase();
    let from = 0;
    let at = lower.indexOf(q);
    while (at !== -1 && this.matchCount < MAX_MATCHES) {
      target.append(
        text.slice(from, at),
        h('mark', { class: 'match', text: text.slice(at, at + q.length) }),
      );
      this.matchCount += 1;
      from = at + q.length;
      at = lower.indexOf(q, from);
    }
    target.append(text.slice(from));
  }

  /**
   * @param {JobStep} step
   * @param {boolean} open
   * @param {number} index
   */
  toggle(step, open, index) {
    this.toggled.set(step.name, open);
    this.renderSteps();
    this.restoreFocus(`step-${index}`);
    emit(this, EVENTS.STEP_TOGGLE, { name: step.name, open });
  }

  /**
   * @param {boolean} open
   */
  openAll(open) {
    const job = this.parse().job;
    if (!job) return;
    for (const step of job.steps) this.toggled.set(step.name, open);
    this.renderSteps();
  }

  /**
   * Announces the status when it changes (not on the first render).
   *
   * @param {Job} job
   */
  announceStatus(job) {
    const running = job.steps.find((s) => s.status === 'running');
    const status = `${job.status}:${running?.name ?? ''}`;
    if (this.lastStatus && this.lastStatus !== status) {
      this.announce(
        running && job.status === 'running'
          ? this.t('jobAnnounceStep', { step: running.name })
          : this.t('jobAnnounce', { status: this.statusLabel(job.status) }),
      );
    }
    this.lastStatus = status;
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const json = /^\s*[[{]/.test(this.text ?? '');
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: json ? 'json' : 'markdown',
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
