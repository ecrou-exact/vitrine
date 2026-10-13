import { describe, expect, it } from 'vitest';
import {
  JobError,
  formatDuration,
  jobDuration,
  jobLog,
  jobProgress,
  normalizeStatus,
  overallStatus,
  parseDuration,
  readJob,
  stepProgress,
} from '../../src/components/job/job.js';

const TEXT = `# Build and test

## Checkout
status: success
duration: 2s
Cloning into 'app'...

## Install
status: success
duration: 1m 5s
added 312 packages

## Test
status: running
progress: 40
> vitest run
 ✓ parser (12)

## Deploy
`;

describe('readJob (text)', () => {
  it('reads the job name, steps, fields and logs', () => {
    const job = /** @type {import('../../src/components/job/job.js').Job} */ (readJob(TEXT));
    expect(job.name).toBe('Build and test');
    expect(job.steps.map((s) => s.name)).toEqual(['Checkout', 'Install', 'Test', 'Deploy']);
    expect(job.steps[0]).toMatchObject({
      status: 'success',
      duration: 2000,
      log: "Cloning into 'app'...",
    });
    expect(job.steps[1].duration).toBe(65_000);
    expect(job.steps[2]).toMatchObject({ status: 'running', progress: 40 });
    expect(job.steps[2].log).toBe('> vitest run\n ✓ parser (12)');
    expect(job.steps[3]).toMatchObject({ status: 'queued', log: '' });
    expect(job.status).toBe('running');
  });

  it('returns null for empty text', () => {
    expect(readJob('  \n')).toBeNull();
  });
});

describe('readJob (JSON)', () => {
  it('reads GitHub-like fields and computes durations from dates', () => {
    const job = readJob(
      JSON.stringify({
        name: 'ci',
        conclusion: 'failed',
        steps: [
          {
            name: 'lint',
            conclusion: 'passed',
            started_at: '2026-10-13T10:00:00Z',
            completed_at: '2026-10-13T10:00:12Z',
          },
          { name: 'test', status: 'error', log: ['a', 'b'] },
        ],
      }),
    );
    expect(job?.status).toBe('failure');
    expect(job?.steps[0]).toMatchObject({ status: 'success', duration: 12_000 });
    expect(job?.steps[1]).toMatchObject({ status: 'failure', log: 'a\nb' });
  });

  it('accepts an array of steps and derives the status', () => {
    const job = readJob('[{"name":"a","status":"success"},{"name":"b","status":"skipped"}]');
    expect(job?.status).toBe('success');
  });

  it('throws a JobError on invalid JSON', () => {
    expect(() => readJob('{ nope')).toThrow(JobError);
  });
});

describe('status and progress', () => {
  it('normalizes status aliases', () => {
    expect(normalizeStatus('in_progress')).toBe('running');
    expect(normalizeStatus('Canceled')).toBe('cancelled');
    expect(normalizeStatus('weird', 'success')).toBe('success');
  });

  it('derives the overall status', () => {
    /** @param {string[]} list */
    const steps = (list) => list.map((status) => /** @type {any} */ ({ status }));
    expect(overallStatus(steps(['success', 'failure', 'running']))).toBe('failure');
    expect(overallStatus(steps(['success', 'queued']))).toBe('running');
    expect(overallStatus(steps(['queued']))).toBe('queued');
    expect(overallStatus(steps(['success', 'skipped']))).toBe('success');
    expect(overallStatus(steps([]))).toBe('queued');
  });

  it('computes progress from steps', () => {
    const job = /** @type {any} */ (readJob(TEXT));
    // 100 + 100 + 40 + 0 over 4 steps.
    expect(jobProgress(job)).toBe(60);
    expect(stepProgress(job.steps[3])).toBe(0);
    expect(jobProgress({ ...job, progress: 12 })).toBe(12);
    expect(jobProgress({ ...job, status: 'success', progress: null })).toBe(100);
  });

  it('counts a running step without progress as half done', () => {
    const job = /** @type {any} */ (readJob('## a\nstatus: running'));
    expect(stepProgress(job.steps[0])).toBeNull();
    expect(jobProgress(job)).toBe(50);
  });
});

describe('durations and log', () => {
  it('parses and formats durations', () => {
    expect(parseDuration('350ms')).toBe(350);
    expect(parseDuration('2m 10s')).toBe(130_000);
    expect(parseDuration('1.5')).toBe(1500);
    expect(parseDuration(3)).toBe(3000);
    expect(parseDuration('soon')).toBeNull();
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(12_000)).toBe('12 s');
    expect(formatDuration(125_000)).toBe('2 min 05 s');
    expect(formatDuration(3_840_000)).toBe('1 h 04 min');
  });

  it('sums step durations and writes the whole log', () => {
    const job = /** @type {any} */ (readJob(TEXT));
    expect(jobDuration(job)).toBe(67_000);
    expect(jobLog(job)).toContain("## Checkout (success)\nCloning into 'app'...");
  });
});
