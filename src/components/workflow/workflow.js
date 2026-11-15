// @ts-check
/**
 * Workflow runs: jobs that need other jobs, each with its steps and logs. Read from GitHub
 * Actions (a run and its jobs), GitLab pipelines (jobs by stage, `needs`) or a plain
 * `{ jobs: [{ id, needs, steps }] }`, and laid out in columns by what each job needs.
 *
 * @module components/workflow/workflow
 */
import { firstText, isObject, safeLink, text, toTime } from '../../core/data.js';
import { normalizeStatus, parseDuration } from '../job/job.js';

/** @typedef {import('../job/job.js').JobStatus} Status */

/**
 * @typedef {object} WorkflowStep
 * @property {string} name
 * @property {Status} status
 * @property {number | null} duration - Milliseconds.
 * @property {string} log
 */

/**
 * @typedef {object} WorkflowJob
 * @property {string} id
 * @property {string} name
 * @property {Status} status
 * @property {string} stage
 * @property {string[]} needs - Ids of the jobs it waits for.
 * @property {number | null} started
 * @property {number | null} duration
 * @property {string | null} url
 * @property {string} runner
 * @property {WorkflowStep[]} steps
 * @property {string} log - The log of a job without steps.
 * @property {number} column
 * @property {number} row
 */

/**
 * @typedef {object} Workflow
 * @property {string} name
 * @property {string} title - What the run is about: a commit message, a pull request title.
 * @property {Status} status
 * @property {string} event
 * @property {string} branch
 * @property {string} commit
 * @property {string} actor
 * @property {string | null} url
 * @property {number | null} started
 * @property {number | null} duration
 * @property {WorkflowJob[]} jobs
 * @property {string[]} columns - Names of the columns (stages), when they have one.
 */

export class WorkflowError extends Error {}

/** Jobs read at most. */
const MAX_JOBS = 300;
/** Steps of one job read at most. */
const MAX_STEPS = 300;

/**
 * GitHub writes `status: completed` and a `conclusion`; GitLab `created`, `manual`, `canceled`.
 *
 * @param {Record<string, any>} item
 * @returns {Status}
 */
export function statusOf(item) {
  const conclusion = text(item.conclusion, 30).toLowerCase();
  if (conclusion) return normalizeStatus(conclusion === 'timed_out' || conclusion === 'startup_failure' ? 'failure' : conclusion === 'action_required' ? 'queued' : conclusion, 'skipped'); // prettier-ignore
  const status = text(item.status ?? item.state ?? item.result, 30).toLowerCase();
  if (['created', 'manual', 'scheduled', 'preparing', 'waiting_for_resource', 'requested'].includes(status)) return 'queued'; // prettier-ignore
  return normalizeStatus(status, 'queued');
}

/**
 * @param {Record<string, any>} item
 * @returns {{ started: number | null, duration: number | null }}
 */
function timing(item) {
  const started = toTime(item.started_at ?? item.startedAt ?? item.started ?? item.start);
  const finished = toTime(item.completed_at ?? item.finished_at ?? item.finishedAt ?? item.finished ?? item.end); // prettier-ignore
  const given = item.duration !== undefined && item.duration !== null ? parseDuration(item.duration) : null; // prettier-ignore
  return { started, duration: given ?? (started !== null && finished !== null && finished >= started ? finished - started : null) }; // prettier-ignore
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function logText(value) {
  if (Array.isArray(value)) return value.filter((l) => typeof l === 'string').join('\n').slice(0, 2_000_000); // prettier-ignore
  return typeof value === 'string' ? value.slice(0, 2_000_000) : '';
}

/**
 * @param {Record<string, any>} item
 * @param {number} index
 * @returns {WorkflowJob}
 */
function readJob(item, index) {
  const name = firstText(item, ['name', 'title', 'job'], 200) || `job ${index + 1}`;
  const id = text(item.id ?? item.key, 100) || name;
  const needs =
    (Array.isArray(item.needs) ? item.needs : typeof item.needs === 'string' ? [item.needs] : []) // prettier-ignore
      .map((n) => (isObject(n) ? text(n.name ?? n.job ?? n.id, 100) : text(n, 100)))
      .filter(Boolean);
  const steps = (Array.isArray(item.steps) ? item.steps : [])
    .filter(isObject)
    .slice(0, MAX_STEPS)
    .map((s, n) => ({
      name: firstText(s, ['name', 'title'], 300) || `step ${n + 1}`,
      status: statusOf(s),
      duration: timing(s).duration,
      log: logText(s.log ?? s.output),
    }));
  const { started, duration } = timing(item);
  return {
    id,
    name,
    status: statusOf(item),
    stage: text(item.stage, 100),
    needs,
    started,
    duration,
    url: safeLink(item.html_url ?? item.web_url ?? item.url),
    runner: isObject(item.runner) ? text(item.runner.description ?? item.runner.name, 100) : text(item.runner_name ?? item.runner ?? item.runsOn, 100), // prettier-ignore
    steps,
    log: logText(item.log ?? item.trace ?? item.output),
    column: 0,
    row: 0,
  };
}

/**
 * The status of a run from its jobs: running while one runs, then failed if one failed.
 *
 * @param {WorkflowJob[]} jobs
 * @returns {Status}
 */
export function overallStatus(jobs) {
  const has = (/** @type {Status} */ s) => jobs.some((j) => j.status === s);
  if (has('running')) return 'running';
  if (has('failure')) return 'failure';
  if (has('cancelled')) return 'cancelled';
  if (jobs.length && jobs.every((j) => j.status === 'queued')) return 'queued';
  if (jobs.length && jobs.every((j) => j.status === 'skipped')) return 'skipped';
  return has('queued') ? 'running' : 'success';
}

/**
 * Places jobs in columns: after every job they need, or by stage, in the order of the stages.
 *
 * @param {WorkflowJob[]} jobs
 * @returns {string[]} Names of the columns, when they are stages.
 */
export function layout(jobs) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  for (const j of jobs) if (!byId.has(j.name)) byId.set(j.name, j);
  const linked = jobs.some((j) => j.needs.some((n) => byId.has(n)));
  /** @type {string[]} */
  const stages = [];
  for (const j of jobs) if (j.stage && !stages.includes(j.stage)) stages.push(j.stage);
  /** @type {Map<WorkflowJob, number>} */
  const depth = new Map();
  /**
   * @param {WorkflowJob} job
   * @param {Set<WorkflowJob>} seen
   * @returns {number}
   */
  const columnOf = (job, seen) => {
    const known = depth.get(job);
    if (known !== undefined) return known;
    if (seen.has(job)) return 0; // A cycle: break it.
    seen.add(job);
    const after = job.needs.map((n) => byId.get(n)).filter((j) => j !== undefined && j !== job);
    const own = stages.length ? Math.max(0, stages.indexOf(job.stage)) : 0;
    const value = Math.max(linked ? 0 : own, ...after.map((j) => columnOf(/** @type {WorkflowJob} */ (j), seen) + 1)); // prettier-ignore
    depth.set(job, value);
    return value;
  };
  for (const job of jobs) job.column = columnOf(job, new Set());
  // Stages still order jobs that need nothing.
  if (linked && stages.length) for (const job of jobs) if (!job.needs.length) job.column = Math.max(job.column, 0); // prettier-ignore
  /** @type {number[]} */
  const rows = [];
  for (const job of jobs) {
    job.row = rows[job.column] ?? 0;
    rows[job.column] = job.row + 1;
  }
  return !linked && stages.length ? stages : [];
}

/**
 * Reads a run: GitHub Actions (`{ ...run, jobs }`, `{ workflow_run, jobs }`, or `/jobs`),
 * a GitLab pipeline, or `{ name, status, jobs: [...] }`.
 *
 * @param {unknown} data
 * @returns {Workflow}
 */
export function readWorkflow(data) {
  if (Array.isArray(data)) data = { jobs: data };
  if (!isObject(data)) throw new WorkflowError('shape');
  const run = isObject(data.workflow_run) ? data.workflow_run : isObject(data.pipeline) ? data.pipeline : data; // prettier-ignore
  const list = [data.jobs, isObject(data.jobs) ? data.jobs.jobs : null, run.jobs].find(
    Array.isArray,
  );
  if (!list) throw new WorkflowError('shape');
  const jobs = list.filter(isObject).slice(0, MAX_JOBS).map(readJob);
  const columns = layout(jobs);
  const commit = isObject(run.head_commit)
    ? run.head_commit
    : isObject(run.commit)
      ? run.commit
      : {};
  const { started, duration } = timing({ started_at: run.run_started_at ?? run.started_at ?? run.created_at ?? run.started, completed_at: run.updated_at && (run.status === 'completed' || run.conclusion) ? run.updated_at : (run.finished_at ?? run.finished), duration: run.duration }); // prettier-ignore
  const actor = isObject(run.actor) ? text(run.actor.login, 100) : isObject(run.user) ? text(run.user.username ?? run.user.name, 100) : text(run.actor ?? run.author, 100); // prettier-ignore
  const given = run.status !== undefined || run.conclusion !== undefined || run.state !== undefined;
  return {
    name: firstText(run, ['name', 'workflow', 'pipeline'], 200),
    title: firstText(run, ['display_title', 'title'], 300) || text(commit.message, 300).split('\n')[0] || '', // prettier-ignore
    status: given && !(run.status === 'completed' && !run.conclusion) ? statusOf(run) : overallStatus(jobs), // prettier-ignore
    event: firstText(run, ['event', 'source', 'trigger'], 60),
    branch: firstText(run, ['head_branch', 'ref', 'branch'], 200),
    commit: (text(run.head_sha ?? run.sha ?? commit.id, 64) || '').slice(0, 40),
    actor,
    url: safeLink(run.html_url ?? run.web_url ?? run.url),
    started,
    duration,
    jobs,
    columns,
  };
}

/**
 * Lines of a log, with the `##[group]` / `::group::` and `##[error]` markers of GitHub and the
 * timestamps it writes before each line.
 *
 * @param {string} line
 * @returns {{ kind: 'group' | 'end' | 'error' | 'warning' | 'command' | 'line', text: string, time: string }}
 */
export function readLogLine(line) {
  const stamp = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?/.exec(line);
  const time = stamp ? stamp[1].slice(11, 19) : '';
  const rest = stamp ? line.slice(stamp[0].length) : line;
  const marker = /^(?:##\[(group|endgroup|error|warning|command)\]|::(group|endgroup|error|warning)(?: [^:]*)?::)(.*)$/.exec(rest); // prettier-ignore
  if (!marker) return { kind: 'line', text: rest, time };
  const kind = /** @type {any} */ ({ group: 'group', endgroup: 'end', error: 'error', warning: 'warning', command: 'command' })[marker[1] ?? marker[2]]; // prettier-ignore
  return { kind, text: marker[3], time };
}
