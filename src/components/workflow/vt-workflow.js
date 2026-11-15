// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import ansiCss from '../../styles/ansi.css?raw';
import workflowCss from '../../styles/workflow.css?raw';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { formatDuration, normalizeStatus } from '../job/job.js';
import { parseAnsi } from '../terminal/ansi.js';
import { segmentNode } from '../terminal/ansi-dom.js';
import { WorkflowError, overallStatus, readLogLine, readWorkflow } from './workflow.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./workflow.js').Workflow} Workflow */
/** @typedef {import('./workflow.js').WorkflowJob} WorkflowJob */
/** @typedef {import('./workflow.js').WorkflowStep} WorkflowStep */
/** @typedef {import('../job/job.js').JobStatus} Status */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Size of a job in the graph, and the space around it, in CSS pixels. */
const CARD = { width: 216, height: 52, gapX: 64, gapY: 14, head: 28 };
/** Lines of one log drawn. */
const MAX_LINES = 5000;
const ICONS = /** @type {Record<Status, string>} */ ({
  queued: 'status-circle',
  running: 'status-running',
  success: 'status-success',
  failure: 'status-failure',
  cancelled: 'status-skipped',
  skipped: 'status-skipped',
});
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A workflow run as a CI system shows it: the run and its status, a graph of its jobs linked by
 * what each one needs, and the steps and logs of the job chosen, with ANSI colors, folded
 * groups and errors marked. Reads GitHub Actions (a run with its jobs), GitLab pipelines (jobs
 * by stage, `needs`) or `{ name, jobs: [{ id, needs, status, steps: [{ name, status, log }] }] }`.
 *
 * Follow a run live with `updateJob()` and `appendLog()`; the time of running jobs counts up.
 *
 * @element vt-workflow
 * @since 0.15.0
 *
 * @attr {string} job - The job shown at first, by id or name (default: the first failed, else the first running).
 * @attr {string} now - The time running jobs are measured at, for documentation and tests.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The run, as a value.
 * @prop {Workflow | null} workflow - The run read, with live changes (read-only).
 *
 * @fires vt-select - A job was chosen. Detail: `{ id, name, status }`.
 * @fires vt-toggle - The log of a step was opened or closed. Detail: `{ job, step, open }`.
 * @fires vt-job-change - `updateJob()` changed a status. Detail: `{ job, status, previous }`.
 *
 * @csspart summary - The run: status, event, branch, commit, duration.
 * @csspart graph - The jobs.
 * @csspart job - A job.
 * @csspart details - The steps of the job chosen.
 * @csspart log - A log.
 *
 * @example
 * <vt-workflow variant="full" json-src="/runs/4821.json"></vt-workflow>
 */
export class VtWorkflow extends VtDataElement {
  static type = 'workflow';

  static componentAttributes = Object.freeze(['job', 'now']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, ansiCss, workflowCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {{ text: string, workflow: Workflow | null, error: string | null } | null} */
    this.model = null;
    /** @type {string | null} */
    this.selected = null;
    /** @type {Map<string, boolean>} Steps opened or closed by the reader. */
    this.opened = new Map();
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.ticker = undefined;
  }

  contentChanged() {
    this.model = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  /** @returns {{ workflow: Workflow | null, error: string | null }} */
  read() {
    const source = this.text ?? '';
    if (this.model?.text === source) return this.model;
    try {
      this.model = { text: source, workflow: readWorkflow(JSON.parse(source)), error: null };
    } catch (error) {
      const message = error instanceof WorkflowError ? this.t('workflowShape') : this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }); // prettier-ignore
      this.model = { text: source, workflow: null, error: message };
    }
    return this.model;
  }

  /** @returns {Workflow | null} */
  get workflow() {
    return this.read().workflow;
  }

  /**
   * @param {string} key - Id or name.
   * @returns {WorkflowJob | undefined}
   */
  findJob(key) {
    const jobs = this.workflow?.jobs ?? [];
    return jobs.find((j) => j.id === key) ?? jobs.find((j) => j.name === key);
  }

  // ---------------------------------------------------------------- live

  /**
   * Changes a job while the run goes on: `{ status, duration, steps }`.
   *
   * @param {string} key - Id or name of the job.
   * @param {{ status?: string, duration?: number, started?: number | string, steps?: { name: string, status?: string, duration?: number, log?: string }[] }} changes
   */
  updateJob(key, changes) {
    const workflow = this.workflow;
    const job = this.findJob(key);
    if (!workflow || !job) return;
    const previous = job.status;
    if (changes.status !== undefined) job.status = normalizeStatus(changes.status, job.status);
    if (typeof changes.duration === 'number') job.duration = changes.duration;
    if (changes.started !== undefined) job.started = typeof changes.started === 'number' ? changes.started : Date.parse(changes.started) || job.started; // prettier-ignore
    if (Array.isArray(changes.steps))
      for (const change of changes.steps) {
        let step = job.steps.find((s) => s.name === change.name);
        if (!step) job.steps.push((step = { name: String(change.name), status: 'queued', duration: null, log: '' })); // prettier-ignore
        if (change.status !== undefined) step.status = normalizeStatus(change.status, step.status);
        if (typeof change.duration === 'number') step.duration = change.duration;
        if (typeof change.log === 'string') step.log = change.log;
      }
    workflow.status = overallStatus(workflow.jobs);
    this.render();
    if (job.status !== previous) {
      this.announce(this.t('workflowJob', { name: job.name, status: this.statusWord(job.status) }));
      emit(this, EVENTS.JOB_CHANGE, { job: job.id, status: job.status, previous });
    }
  }

  /**
   * Adds lines to the log of a step (by name or index; default: the running step, else the last).
   *
   * @param {string} key - Id or name of the job.
   * @param {string} lines
   * @param {string | number} [step]
   */
  appendLog(key, lines, step) {
    const job = this.findJob(key);
    if (!job) return;
    const target =
      typeof step === 'number' ? job.steps[step] : typeof step === 'string' ? job.steps.find((s) => s.name === step) : (job.steps.find((s) => s.status === 'running') ?? job.steps.at(-1)); // prettier-ignore
    const text = String(lines);
    if (target) target.log = target.log ? `${target.log}\n${text}` : text;
    else job.log = job.log ? `${job.log}\n${text}` : text;
    this.render();
    const log = /** @type {HTMLElement | null} */ (
      this.root.querySelector('.wf-step.open:last-of-type .wf-log, .wf-job-log')
    );
    if (log) log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {Status} status
   * @returns {string}
   */
  statusWord(status) {
    return this.t(/** @type {StringKey} */ (`workflowStatus_${status}`));
  }

  /**
   * @param {Status} status
   * @returns {HTMLElement}
   */
  statusIcon(status) {
    return h('span', { class: `wf-icon status-${status}`, attrs: { 'aria-hidden': 'true' } }, icon(ICONS[status])); // prettier-ignore
  }

  /**
   * The time of a job or a step: its duration, or how long it has been running.
   *
   * @param {{ status: Status, started?: number | null, duration: number | null }} item
   * @returns {string}
   */
  timeOf(item) {
    if (item.status === 'running' && item.started) return formatDuration(Math.max(0, this.now - item.started)); // prettier-ignore
    return item.duration !== null ? formatDuration(item.duration) : '';
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { workflow, error } = this.read();
    const body = h('div', { class: 'body data-body wf-body', part: 'body' });
    if (!workflow) body.append(noticeView(error ?? ''));
    else if (!workflow.jobs.length)
      body.append(h('p', { class: 'data-none', text: t('workflowEmpty') })); // prettier-ignore
    else {
      const chosen = this.chosenJob(workflow);
      body.append(this.summaryView(workflow), this.graphView(workflow, chosen));
      body.append(chosen ? this.detailsView(chosen) : h('p', { class: 'wf-choose', text: t('workflowChoose') })); // prettier-ignore
    }
    const { panel, history } = this.previewPanel(body, this.panelId);
    const chosen = workflow ? this.chosenJob(workflow) : null;
    frame.append(
      ...this.chrome({
        badge: workflow ? this.statusWord(workflow.status) : '',
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName('workflow.json'), 'application/json') : null, // prettier-ignore
          this.feature('copy') && chosen ? this.copyButton(() => jobLog(chosen), t('workflowCopyLog')) : null, // prettier-ignore
        ],
      }),
      panel,
    );
    this.editor?.align();
    this.tick(workflow);
  }

  /**
   * Counts up the time of running jobs, once a second, while the page is visible.
   *
   * @param {Workflow | null} workflow
   */
  tick(workflow) {
    const running = Boolean(workflow?.jobs.some((j) => j.status === 'running' && j.started)) && !this.hasAttribute('now'); // prettier-ignore
    if (!running) {
      clearInterval(this.ticker);
      this.ticker = undefined;
      return;
    }
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (document.hidden) return;
      const jobs = this.workflow?.jobs ?? [];
      for (const node of this.root.querySelectorAll('[data-time-of]')) {
        const job = jobs.find((j) => j.id === /** @type {HTMLElement} */ (node).dataset.timeOf);
        if (job) node.textContent = this.timeOf(job);
      }
    }, 1000);
  }

  /**
   * @param {Workflow} workflow
   * @returns {WorkflowJob | null}
   */
  chosenJob(workflow) {
    const key = this.selected ?? this.getAttribute('job');
    const asked = key ? (workflow.jobs.find((j) => j.id === key) ?? workflow.jobs.find((j) => j.name === key)) : null; // prettier-ignore
    if (asked) return asked;
    if (this.selected === '') return null;
    return workflow.jobs.find((j) => j.status === 'failure') ?? workflow.jobs.find((j) => j.status === 'running') ?? null; // prettier-ignore
  }

  /**
   * @param {Workflow} workflow
   * @returns {HTMLElement}
   */
  summaryView(workflow) {
    const t = this.t;
    const count = (/** @type {Status} */ s) => workflow.jobs.filter((j) => j.status === s).length;
    const facts = h('div', { class: 'wf-facts' });
    /** @param {string} label @param {string | Node} value */
    const fact = (label, value) => facts.append(h('span', { class: 'wf-fact' }, h('span', { class: 'wf-fact-label', text: label }), value)); // prettier-ignore
    if (workflow.event) fact(t('workflowTrigger'), h('strong', { text: workflow.event })); // prettier-ignore
    if (workflow.branch) fact(t('workflowBranch'), h('code', { class: 'wf-branch', text: workflow.branch })); // prettier-ignore
    if (workflow.commit) fact(t('workflowCommit'), h('code', { text: workflow.commit.slice(0, 7), attrs: { title: workflow.commit } })); // prettier-ignore
    if (workflow.duration !== null) fact(t('workflowDuration'), h('strong', { text: formatDuration(workflow.duration) })); // prettier-ignore
    const meta = [workflow.actor ? t('workflowBy', { actor: workflow.actor }) : '', workflow.started !== null ? t('workflowStarted', { time: this.relativeTime(workflow.started) }) : ''].filter(Boolean).join(' · '); // prettier-ignore
    return h(
      'section',
      { class: `wf-summary status-${workflow.status}`, part: 'summary', attrs: { 'aria-label': t('workflowRun') } }, // prettier-ignore
      h('span', { class: `wf-big status-${workflow.status}` }, icon(ICONS[workflow.status])),
      h(
        'div',
        { class: 'wf-heading' },
        h(
          'p',
          { class: 'wf-title' },
          workflow.url ? h('a', { text: workflow.title || workflow.name, attrs: { href: workflow.url, rel: 'noopener' } }) : h('strong', { text: workflow.title || workflow.name || t('workflowRun') }), // prettier-ignore
          h('span', { class: `wf-pill status-${workflow.status}`, text: this.statusWord(workflow.status) }), // prettier-ignore
        ),
        h('p', { class: 'wf-sub', text: [workflow.title && workflow.name ? workflow.name : '', meta].filter(Boolean).join(' · ') }), // prettier-ignore
        facts,
      ),
      h('p', { class: 'wf-counts', text: t('workflowCounts', { success: formatNumber(count('success'), this.locale), failure: formatNumber(count('failure'), this.locale), running: formatNumber(count('running'), this.locale) }) }), // prettier-ignore
    );
  }

  /**
   * Jobs as cards in columns, linked by curves from each job to those that need it.
   *
   * @param {Workflow} workflow
   * @param {WorkflowJob | null} chosen
   * @returns {HTMLElement}
   */
  graphView(workflow, chosen) {
    const t = this.t;
    const jobs = workflow.jobs;
    const head = workflow.columns.length ? CARD.head : 0;
    const columns = Math.max(...jobs.map((j) => j.column)) + 1;
    const rows = Math.max(...jobs.map((j) => j.row)) + 1;
    const width = columns * (CARD.width + CARD.gapX) - CARD.gapX;
    const height = head + rows * (CARD.height + CARD.gapY) - CARD.gapY;
    const x = (/** @type {WorkflowJob} */ j) => j.column * (CARD.width + CARD.gapX);
    const y = (/** @type {WorkflowJob} */ j) => head + j.row * (CARD.height + CARD.gapY);
    const canvas = h('div', { class: 'wf-canvas' });
    canvas.style.setProperty('--_w', `${width}px`);
    canvas.style.setProperty('--_h', `${height}px`);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'wf-links');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('aria-hidden', 'true');
    const byKey = new Map(
      jobs.flatMap((j) => [
        [j.name, j],
        [j.id, j],
      ]),
    );
    for (const job of jobs)
      for (const need of new Set(
        job.needs.map((n) => byKey.get(n)).filter((j) => j && j !== job),
      )) {
        const from = /** @type {WorkflowJob} */ (need);
        const x1 = x(from) + CARD.width;
        const y1 = y(from) + CARD.height / 2;
        const x2 = x(job);
        const y2 = y(job) + CARD.height / 2;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M${x1} ${y1} C${x1 + CARD.gapX / 2} ${y1} ${x2 - CARD.gapX / 2} ${y2} ${x2} ${y2}`); // prettier-ignore
        path.setAttribute('class', `wf-link status-${from.status}${job.status === 'running' ? ' flowing' : ''}`); // prettier-ignore
        svg.append(path);
      }
    canvas.append(svg);
    workflow.columns.forEach((name, n) => {
      const label = h('span', { class: 'wf-column', text: name });
      label.style.setProperty('--_x', `${n * (CARD.width + CARD.gapX)}px`);
      canvas.append(label);
    });
    for (const job of jobs) {
      const time = this.timeOf(job);
      const card = h(
        'button',
        {
          class: `wf-job status-${job.status}${job === chosen ? ' chosen' : ''}`,
          part: 'job',
          attrs: {
            type: 'button',
            'aria-pressed': String(job === chosen),
            'data-job': job.id,
            'data-focus-key': `job-${job.id}`,
          },
          on: { click: () => this.choose(job) },
        },
        this.statusIcon(job.status),
        // The name heard holds the text seen, in order: "Lint 45 s, Success".
        h('span', { class: 'wf-job-name', text: job.name }),
        ' ',
        h('span', { class: 'wf-job-time', text: time, attrs: { 'data-time-of': job.status === 'running' ? job.id : null } }), // prettier-ignore
        h('span', { class: 'sr-only', text: `, ${this.statusWord(job.status)}` }),
      );
      card.style.setProperty('--_x', `${x(job)}px`);
      card.style.setProperty('--_y', `${y(job)}px`);
      canvas.append(card);
    }
    return h(
      'div',
      { class: 'wf-graph', part: 'graph', attrs: { role: 'group', 'aria-label': t('workflowGraph') }, on: { keydown: (e) => this.moveFocus(/** @type {KeyboardEvent} */ (e), jobs) } }, // prettier-ignore
      canvas,
    );
  }

  /**
   * Arrow keys move between jobs: up and down in a column, left and right to the nearest job
   * of the next column.
   *
   * @param {KeyboardEvent} event
   * @param {WorkflowJob[]} jobs
   */
  moveFocus(event, jobs) {
    const current = jobs.find(
      (j) => j.id === /** @type {HTMLElement} */ (event.target).dataset?.job,
    );
    if (!current) return;
    const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key]; // prettier-ignore
    if (!step) return;
    const column = current.column + step[0];
    const candidates = jobs.filter((j) => j.column === column && (step[1] === 0 || (step[1] < 0 ? j.row < current.row : j.row > current.row))); // prettier-ignore
    const next = candidates.sort((a, b) => Math.abs(a.row - current.row) - Math.abs(b.row - current.row))[0]; // prettier-ignore
    if (!next) return;
    event.preventDefault();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-job="${CSS.escape(next.id)}"]`)
    )?.focus();
  }

  /**
   * @param {WorkflowJob} job
   */
  choose(job) {
    this.selected = job.id;
    this.render();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-job="${CSS.escape(job.id)}"]`)
    )?.focus();
    emit(this, EVENTS.SELECT, { id: job.id, name: job.name, status: job.status });
  }

  /**
   * The steps of a job, each with its log.
   *
   * @param {WorkflowJob} job
   * @returns {HTMLElement}
   */
  detailsView(job) {
    const t = this.t;
    const time = this.timeOf(job);
    const panel = h(
      'section',
      { class: `wf-details status-${job.status}`, part: 'details', attrs: { 'aria-label': t('workflowSteps', { name: job.name }) } }, // prettier-ignore
      h(
        'div',
        { class: 'wf-details-head' },
        this.statusIcon(job.status),
        h('strong', { class: 'wf-details-name', text: job.name }),
        h('span', { class: 'wf-muted', text: [this.statusWord(job.status), time].filter(Boolean).join(' · '), attrs: { 'data-time-of': job.status === 'running' ? job.id : null } }), // prettier-ignore
        job.url ? h('a', { class: 'wf-open', text: t('workflowOpen'), attrs: { href: job.url, rel: 'noopener' } }) : null, // prettier-ignore
      ),
    );
    const notes = [job.needs.length ? t('workflowNeeds', { jobs: job.needs.join(', ') }) : '', job.runner ? t('workflowRunner', { runner: job.runner }) : ''].filter(Boolean); // prettier-ignore
    if (notes.length) panel.append(h('p', { class: 'wf-notes', text: notes.join(' · ') }));
    if (!job.steps.length) {
      panel.append(job.log ? this.logView(job.log, 'wf-job-log') : h('p', { class: 'wf-muted', text: t('workflowNoSteps') })); // prettier-ignore
      return panel;
    }
    const list = h('ol', { class: 'wf-steps' });
    job.steps.forEach((step, n) => {
      const key = `${job.id}\u0000${n}`;
      const open = this.opened.get(key) ?? (step.status === 'failure' || step.status === 'running');
      const logId = uid('log');
      list.append(
        h(
          'li',
          { class: `wf-step status-${step.status}${open ? ' open' : ''}` },
          h(
            'button',
            {
              class: 'wf-step-head',
              attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': open ? logId : null, 'data-focus-key': `step-${n}` }, // prettier-ignore
              on: {
                click: () => {
                  this.opened.set(key, !open);
                  this.render();
                  emit(this, EVENTS.TOGGLE, { job: job.id, step: step.name, open: !open });
                },
              },
            },
            icon('chevron-right'),
            this.statusIcon(step.status),
            h('span', { class: 'wf-step-name', text: step.name }),
            h('span', { class: 'wf-step-time', text: step.duration !== null ? formatDuration(step.duration) : '' }), // prettier-ignore
          ),
          open ? (step.log ? this.logView(step.log, 'wf-log', logId) : h('p', { class: 'wf-nolog', text: t('workflowNoLog'), attrs: { id: logId } })) : null, // prettier-ignore
        ),
      );
    });
    panel.append(list);
    return panel;
  }

  /**
   * A log: line numbers, ANSI colors, groups folded, errors and warnings marked.
   *
   * @param {string} text
   * @param {string} className
   * @param {string} [id]
   * @returns {HTMLElement}
   */
  logView(text, className, id) {
    const t = this.t;
    const lines = text.split(/\r?\n/);
    const log = h('div', { class: `wf-logbox ${className}`, part: 'log', attrs: { id: id ?? null, tabindex: '0', role: 'log' } }); // prettier-ignore
    /** @type {HTMLElement[]} */
    const stack = [log];
    lines.slice(0, MAX_LINES).forEach((raw, n) => {
      const line = readLogLine(raw);
      const parent = stack[stack.length - 1];
      if (line.kind === 'end') {
        if (stack.length > 1) stack.pop();
        return;
      }
      const row = h('div', { class: `wf-line ${line.kind}` }, h('span', { class: 'wf-ln', text: String(n + 1), attrs: { 'aria-hidden': 'true' } })); // prettier-ignore
      if (line.time) row.append(h('span', { class: 'wf-time', text: line.time }));
      const content = h('span', { class: 'wf-text' });
      const [segments = []] = parseAnsi(line.text);
      for (const segment of segments) content.append(segmentNode(segment));
      row.append(content);
      if (line.kind === 'group') {
        const group = h('details', { class: 'wf-group' }, h('summary', {}, row));
        parent.append(group);
        stack.push(group);
      } else parent.append(row);
    });
    if (lines.length > MAX_LINES) log.append(h('p', { class: 'wf-nolog', text: t('workflowTruncated', { count: formatNumber(MAX_LINES, this.locale) }) })); // prettier-ignore
    return log;
  }
}

/**
 * The log of a job as text, each step under a `## name` heading.
 *
 * @param {WorkflowJob} job
 * @returns {string}
 */
export function jobLog(job) {
  if (!job.steps.length) return job.log;
  return job.steps.map((s) => `## ${s.name} (${s.status})\n${s.log}`.trimEnd()).join('\n\n');
}
