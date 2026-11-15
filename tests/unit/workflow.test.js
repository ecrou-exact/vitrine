// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  layout,
  overallStatus,
  readLogLine,
  readWorkflow,
} from '../../src/components/workflow/workflow.js';
import { VtWorkflow, jobLog } from '../../src/components/workflow/vt-workflow.js';

if (!customElements.get('vt-workflow')) customElements.define('vt-workflow', VtWorkflow);

const RUN = {
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  event: 'pull_request',
  head_branch: 'feat/login',
  head_sha: '9f1c2ab4e6d8c0b1a2f3e4d5c6b7a8091a2b3c4d',
  display_title: 'Add login page',
  actor: { login: 'ada' },
  run_started_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T10:06:30Z',
  html_url: 'https://github.com/o/r/actions/runs/1',
  jobs: [
    { id: 'lint', name: 'Lint', status: 'completed', conclusion: 'success', started_at: '2026-11-15T10:00:05Z', completed_at: '2026-11-15T10:00:50Z', steps: [{ name: 'Run eslint', status: 'completed', conclusion: 'success', log: '\u001b[32m✔ no problems\u001b[0m' }] }, // prettier-ignore
    { id: 'test', name: 'Test (node 22)', status: 'completed', conclusion: 'failure', needs: ['lint'], started_at: '2026-11-15T10:01:00Z', completed_at: '2026-11-15T10:04:00Z', steps: [{ name: 'Install', conclusion: 'success', status: 'completed' }, { name: 'Run tests', status: 'completed', conclusion: 'failure', log: '2026-11-15T10:02:00.1234567Z ##[group]Run npm test\nnpm test\n##[endgroup]\n##[error]Process completed with exit code 1.' }] }, // prettier-ignore
    {
      id: 'build',
      name: 'Build',
      status: 'completed',
      conclusion: 'success',
      needs: ['lint'],
      duration: 70,
    },
    {
      id: 'deploy',
      name: 'Deploy',
      status: 'completed',
      conclusion: 'skipped',
      needs: ['test', 'build'],
    },
  ],
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtWorkflow>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtWorkflow} */ (document.createElement('vt-workflow'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', now: '2026-11-15T10:10:00Z', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('workflows', () => {
  it('reads a GitHub Actions run with its jobs, and places them by what they need', () => {
    const w = readWorkflow(RUN);
    expect(w).toMatchObject({ name: 'CI', title: 'Add login page', status: 'failure', event: 'pull_request', branch: 'feat/login', actor: 'ada', duration: 390000 }); // prettier-ignore
    expect(w.jobs.map((j) => [j.id, j.status, j.column, j.row])).toEqual([
      ['lint', 'success', 0, 0],
      ['test', 'failure', 1, 0],
      ['build', 'success', 1, 1],
      ['deploy', 'skipped', 2, 0],
    ]);
    expect(w.jobs[0].duration).toBe(45000);
    expect(w.jobs[2].duration).toBe(70000);
  });

  it('reads a GitLab pipeline by stage', () => {
    const w = readWorkflow({
      id: 42,
      status: 'running',
      ref: 'main',
      jobs: [
        { id: 1, name: 'compile', stage: 'build', status: 'success', duration: 31.2 },
        { id: 2, name: 'unit', stage: 'test', status: 'running' },
        { id: 3, name: 'e2e', stage: 'test', status: 'created' },
        { id: 4, name: 'release', stage: 'deploy', status: 'manual' },
      ],
    });
    expect(w.columns).toEqual(['build', 'test', 'deploy']);
    expect(w.jobs.map((j) => [j.name, j.status, j.column, j.row])).toEqual([
      ['compile', 'success', 0, 0],
      ['unit', 'running', 1, 0],
      ['e2e', 'queued', 1, 1],
      ['release', 'queued', 2, 0],
    ]);
  });

  it('survives cycles and unknown needs', () => {
    const jobs = readWorkflow({ jobs: [{ name: 'a', needs: ['b'] }, { name: 'b', needs: ['a', 'zzz'] }] }).jobs; // prettier-ignore
    expect(jobs.every((j) => Number.isFinite(j.column))).toBe(true);
    expect(layout([])).toEqual([]);
    expect(() => readWorkflow({ nothing: true })).toThrow();
  });

  it('derives the status of a run from its jobs', () => {
    const jobs = (/** @type {string[]} */ s) => s.map((status) => /** @type {any} */ ({ status }));
    expect(overallStatus(jobs(['success', 'running', 'failure']))).toBe('running');
    expect(overallStatus(jobs(['success', 'failure']))).toBe('failure');
    expect(overallStatus(jobs(['success', 'queued']))).toBe('running');
    expect(overallStatus(jobs(['success', 'skipped']))).toBe('success');
  });

  it('reads the markers and timestamps of GitHub logs', () => {
    expect(readLogLine('2026-11-15T10:02:00.1234567Z ##[group]Run npm test')).toEqual({ kind: 'group', text: 'Run npm test', time: '10:02:00' }); // prettier-ignore
    expect(readLogLine('::error file=a.js,line=1::Boom')).toEqual({ kind: 'error', text: 'Boom', time: '' }); // prettier-ignore
    expect(readLogLine('##[endgroup]').kind).toBe('end');
    expect(readLogLine('plain').kind).toBe('line');
  });
});

describe('<vt-workflow>', () => {
  it('draws the graph with links, and opens the failed job and step', async () => {
    const el = await mount({ variant: 'full' }, RUN);
    expect(el.root.querySelectorAll('.wf-job')).toHaveLength(4);
    expect(el.root.querySelectorAll('.wf-link')).toHaveLength(4);
    expect(el.root.querySelector('.wf-job.chosen')?.getAttribute('data-job')).toBe('test');
    const open = el.root.querySelector('.wf-step.open');
    expect(open?.querySelector('.wf-step-name')?.textContent).toBe('Run tests');
    expect(open?.querySelector('.wf-group summary .wf-text')?.textContent).toBe('Run npm test');
    expect(open?.querySelector('.wf-line.error .wf-text')?.textContent).toBe('Process completed with exit code 1.'); // prettier-ignore
    expect(el.root.querySelector('.wf-summary .wf-pill')?.textContent).toBe('Failed');
  });

  it('chooses a job and opens a step', async () => {
    const el = await mount({}, RUN);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-select', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    el.addEventListener('vt-toggle', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLElement} */ (el.root.querySelector('[data-job="lint"]')).click();
    /** @type {HTMLElement} */ (el.root.querySelector('.wf-step-head')).click();
    expect(seen).toEqual([{ id: 'lint', name: 'Lint', status: 'success' }, { job: 'lint', step: 'Run eslint', open: true }]); // prettier-ignore
    expect(el.root.querySelector('.wf-log .fg-2')).not.toBeNull();
  });

  it('follows a run live', async () => {
    const el = await mount({}, { name: 'Deploy', jobs: [{ id: 'a', name: 'Build', status: 'running', started: '2026-11-15T10:08:30Z', steps: [{ name: 'Compile', status: 'running' }] }] }); // prettier-ignore
    expect(el.root.querySelector('.wf-job-time')?.textContent).toBe('1 min 30 s');
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-job-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    el.appendLog('a', 'compiled 12 files');
    expect(el.root.querySelector('.wf-step.open .wf-text')?.textContent).toBe('compiled 12 files');
    el.updateJob('a', { status: 'success', duration: 95000, steps: [{ name: 'Compile', status: 'success' }] }); // prettier-ignore
    expect(seen).toEqual([{ job: 'a', status: 'success', previous: 'running' }]);
    expect(el.workflow?.status).toBe('success');
    expect(jobLog(/** @type {any} */ (el.workflow).jobs[0])).toBe('## Compile (success)\ncompiled 12 files'); // prettier-ignore
  });
});
