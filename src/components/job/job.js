// @ts-check
/**
 * Reads a job (CI run, pipeline, batch task) from JSON or a short text format, and
 * computes its progress and durations.
 *
 * Text format:
 *
 * ```text
 * # Build and test
 * status: running
 *
 * ## Checkout
 * status: success
 * duration: 2s
 * Cloning into 'app'...
 *
 * ## Test
 * status: running
 * progress: 40
 * > vitest run
 * ```
 *
 * `# name` names the job, `## name` starts a step, `key: value` lines right after a heading
 * set its fields (`status`, `started`, `finished`, `duration`, `progress`), and every other
 * line is log text of the current step.
 *
 * @module components/job/job
 */

export const STATUSES = /** @type {const} */ ([
  'queued', 'running', 'success', 'failure', 'cancelled', 'skipped',
]); // prettier-ignore

/** @typedef {typeof STATUSES[number]} JobStatus */

/**
 * @typedef {object} JobStep
 * @property {string} name
 * @property {JobStatus} status
 * @property {string} started - As written (ISO date, or empty).
 * @property {string} finished
 * @property {number | null} duration - Milliseconds, from `duration` or the two dates.
 * @property {number | null} progress - 0 to 100, or `null` when unknown.
 * @property {string} log
 */

/**
 * @typedef {object} Job
 * @property {string} name
 * @property {JobStatus} status
 * @property {string} started
 * @property {string} finished
 * @property {number | null} duration
 * @property {number | null} progress - Given progress, 0 to 100, or `null`.
 * @property {JobStep[]} steps
 */

/** Steps read at most. */
export const MAX_STEPS = 500;

const ALIASES = /** @type {Record<string, JobStatus>} */ ({
  pending: 'queued', waiting: 'queued', queued: 'queued', todo: 'queued',
  running: 'running', in_progress: 'running', 'in-progress': 'running', started: 'running',
  success: 'success', succeeded: 'success', passed: 'success', ok: 'success', done: 'success',
  completed: 'success',
  failure: 'failure', failed: 'failure', error: 'failure', errored: 'failure',
  cancelled: 'cancelled', canceled: 'cancelled', aborted: 'cancelled',
  skipped: 'skipped', neutral: 'skipped',
}); // prettier-ignore

export class JobError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'JobError';
  }
}

/**
 * @param {unknown} value
 * @param {JobStatus} [fallback]
 * @returns {JobStatus}
 */
export function normalizeStatus(value, fallback = 'queued') {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  return ALIASES[key] ?? fallback;
}

/**
 * Milliseconds from `90`, `1.5s`, `2m 10s`, `1h`, `350ms` (a bare number is seconds).
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseDuration(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value * 1000 : null;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * 1000;
  const units = /** @type {Record<string, number>} */ ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 });
  let total = 0;
  let found = false;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)\b/g)) {
    total += Number(match[1]) * units[match[2]];
    found = true;
  }
  return found ? total : null;
}

/**
 * @param {string} text
 * @returns {number | null}
 */
function dateValue(text) {
  if (!text) return null;
  const value = Date.parse(text);
  return Number.isNaN(value) ? null : value;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function percent(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace('%', ''));
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ name: string, status: JobStatus, started: string, finished: string, duration: number | null, progress: number | null }}
 */
function common(raw) {
  const started = String(raw.started ?? raw.startedAt ?? raw.started_at ?? raw.start ?? '');
  const finished = String(
    raw.finished ?? raw.finishedAt ?? raw.completed_at ?? raw.end ?? raw.ended ?? '',
  );
  const status = normalizeStatus(raw.status ?? raw.conclusion ?? raw.state);
  let duration = parseDuration(raw.duration);
  const from = dateValue(started);
  const to = dateValue(finished);
  if (duration === null && from !== null && to !== null && to >= from) duration = to - from;
  return {
    name: String(raw.name ?? raw.title ?? ''),
    status,
    started,
    finished,
    duration,
    progress: percent(raw.progress),
  };
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {JobStep}
 */
function readStep(raw, index) {
  const object = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const step = common(object);
  const log = Array.isArray(object.log)
    ? object.log.join('\n')
    : String(object.log ?? object.output ?? '');
  return { ...step, name: step.name || `Step ${index + 1}`, log };
}

/**
 * Reads a job from JSON (`{ name, status, steps: [...] }`, or an array of steps).
 *
 * @param {unknown} data
 * @returns {Job}
 */
export function jobFromData(data) {
  const object = Array.isArray(data)
    ? { steps: data }
    : data && typeof data === 'object'
      ? /** @type {Record<string, unknown>} */ (data)
      : null;
  if (!object) throw new JobError('a job is an object with "steps", or an array of steps');
  const raw = Array.isArray(object.steps) ? object.steps : [];
  const steps = raw.slice(0, MAX_STEPS).map(readStep);
  const job = common(object);
  if (!('status' in object) && !('conclusion' in object) && !('state' in object))
    job.status = overallStatus(steps);
  return { ...job, steps };
}

/**
 * Status of a job from its steps: failure wins, then running, then queued.
 *
 * @param {JobStep[]} steps
 * @returns {JobStatus}
 */
export function overallStatus(steps) {
  const has = (/** @type {JobStatus} */ s) => steps.some((step) => step.status === s);
  if (has('failure')) return 'failure';
  if (has('running')) return 'running';
  if (has('cancelled')) return 'cancelled';
  if (!steps.length || has('queued')) return has('success') ? 'running' : 'queued';
  return steps.every((step) => step.status === 'skipped') ? 'skipped' : 'success';
}

/**
 * @param {string} text
 * @returns {Job}
 */
export function jobFromText(text) {
  /** @type {Record<string, unknown>} */
  const job = { name: '' };
  /** @type {Record<string, unknown>[]} */
  const steps = [];
  /** @type {Record<string, unknown>} */
  let current = job;
  let fields = true;
  /** @type {string[]} */
  let log = [];
  const flush = () => {
    if (current !== job) current.log = log.join('\n').replace(/\n+$/, '');
    log = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      if (heading[1] === '#' && !steps.length) current = job;
      else {
        if (steps.length >= MAX_STEPS) break;
        current = {};
        steps.push(current);
      }
      current.name = heading[2];
      fields = true;
      continue;
    }
    const field = fields && /^(status|started|finished|duration|progress)\s*:\s*(.*)$/i.exec(line);
    if (field) {
      current[field[1].toLowerCase()] = field[2].trim();
      continue;
    }
    if (fields && !line.trim() && !log.length) continue;
    fields = false;
    if (current !== job) log.push(line);
  }
  flush();
  return jobFromData({ ...job, steps });
}

/**
 * Reads a job from JSON or the text format.
 *
 * @param {string} text
 * @returns {Job | null}
 */
export function readJob(text) {
  if (!text.trim()) return null;
  if (/^\s*[[{]/.test(text)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new JobError(error instanceof Error ? error.message : String(error));
    }
    return jobFromData(data);
  }
  return jobFromText(text);
}

const DONE = new Set(['success', 'failure', 'cancelled', 'skipped']);

/**
 * Progress of a step, 0 to 100, or `null` when unknown (running without a value).
 *
 * @param {JobStep} step
 * @returns {number | null}
 */
export function stepProgress(step) {
  if (DONE.has(step.status)) return 100;
  if (step.status === 'queued') return 0;
  return step.progress;
}

/**
 * Progress of the job, 0 to 100, or `null` when unknown.
 *
 * @param {Job} job
 * @returns {number | null}
 */
export function jobProgress(job) {
  if (job.progress !== null) return job.progress;
  if (DONE.has(job.status)) return 100;
  if (!job.steps.length) return job.status === 'queued' ? 0 : null;
  let total = 0;
  for (const step of job.steps) {
    const value = stepProgress(step);
    // A running step without progress counts as half done.
    total += value ?? 50;
  }
  return Math.round(total / job.steps.length);
}

/**
 * Total duration: the job's own, else the sum of its steps.
 *
 * @param {Job} job
 * @returns {number | null}
 */
export function jobDuration(job) {
  if (job.duration !== null) return job.duration;
  const known = job.steps.filter((step) => step.duration !== null);
  return known.length
    ? known.reduce((sum, step) => sum + /** @type {number} */ (step.duration), 0)
    : null;
}

/**
 * `850 ms`, `12 s`, `2 min 05 s`, `1 h 04 min`.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * The whole log as text, each step under a `## name` heading.
 *
 * @param {Job} job
 * @returns {string}
 */
export function jobLog(job) {
  return job.steps
    .map((step) => `## ${step.name} (${step.status})\n${step.log}`.trimEnd())
    .join('\n\n');
}
