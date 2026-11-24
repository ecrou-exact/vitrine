// @ts-check
/**
 * Reads the steps of `<vt-loading-steps>`: one per line, `status label — detail (duration)`,
 * or JSON.
 *
 * @module components/loading-steps/steps
 */

export const STATUSES = /** @type {const} */ (['pending', 'running', 'done', 'warning', 'error', 'skipped']); // prettier-ignore

/** @typedef {(typeof STATUSES)[number]} StepStatus */

/**
 * @typedef {object} Step
 * @property {string} label
 * @property {StepStatus} status
 * @property {string} detail
 * @property {number | null} duration - Milliseconds, when known.
 */

/** Words read as a status at the start of a line. */
const ALIASES = /** @type {Record<string, StepStatus>} */ ({
  pending: 'pending', todo: 'pending', waiting: 'pending', queued: 'pending', '[ ]': 'pending',
  running: 'running', active: 'running', current: 'running', 'in-progress': 'running', '[~]': 'running', '[>]': 'running',
  done: 'done', ok: 'done', success: 'done', complete: 'done', completed: 'done', '[x]': 'done',
  warning: 'warning', warn: 'warning', '[!]': 'warning',
  error: 'error', failed: 'error', fail: 'error', '[-]': 'error',
  skipped: 'skipped', skip: 'skipped', '[/]': 'skipped',
}); // prettier-ignore

export const MAX_STEPS = 200;
const MAX_TEXT = 300;

/**
 * A duration: `850ms`, `2.1s`, `1m 20s`, `1:20`.
 *
 * @param {string} text
 * @returns {number | null}
 */
export function parseStepDuration(text) {
  const t = text.trim().toLowerCase();
  let m = /^(\d+(?:\.\d+)?)\s*ms$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(?:(\d+)\s*h\s*)?(?:(\d+)\s*m(?:in)?\s*)?(?:(\d+(?:\.\d+)?)\s*s)?$/.exec(t);
  if (m && (m[1] || m[2] || m[3])) return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000; // prettier-ignore
  m = /^(\d+):(\d{2})$/.exec(t);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  return null;
}

/**
 * @param {unknown} value
 * @returns {StepStatus}
 */
function statusOf(value) {
  return ALIASES[String(value ?? '').toLowerCase()] ?? 'pending';
}

/**
 * @param {string} text
 * @returns {Step[]}
 */
export function parseSteps(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[[{]/.test(trimmed)) {
    try {
      /** @type {any} */
      const data = JSON.parse(trimmed);
      const list = Array.isArray(data) ? data : Array.isArray(data?.steps) ? data.steps : [];
      /** @type {Step[]} */
      const steps = [];
      for (const item of list.slice(0, MAX_STEPS)) {
        const step = fromObject(item);
        if (step) steps.push(step);
      }
      return steps;
    } catch {
      return [];
    }
  }
  /** @type {Step[]} */
  const steps = [];
  for (const raw of trimmed.split(/\r\n|\n|\r/)) {
    if (steps.length >= MAX_STEPS) break;
    let line = raw.trim().replace(/^[-*]\s+/, '');
    if (!line) continue;
    /** @type {StepStatus} */
    let status = 'pending';
    const box = /^(\[[ x~>!/-]\])\s*/i.exec(line);
    const word = /^([a-z-]+)(?::|\s)\s*/i.exec(line);
    if (box) {
      status = ALIASES[box[1].toLowerCase()] ?? 'pending';
      line = line.slice(box[0].length);
    } else if (word && ALIASES[word[1].toLowerCase()]) {
      status = ALIASES[word[1].toLowerCase()];
      line = line.slice(word[0].length);
    }
    let duration = null;
    const time = /\s*\(([^()]+)\)\s*$/.exec(line);
    if (time && parseStepDuration(time[1]) !== null) {
      duration = parseStepDuration(time[1]);
      line = line.slice(0, time.index);
    }
    const [label, ...rest] = line.split(/\s+(?:—|–|\|)\s+|\s+--\s+/);
    steps.push({ label: label.trim().slice(0, MAX_TEXT), status, detail: rest.join(' — ').trim().slice(0, MAX_TEXT), duration }); // prettier-ignore
  }
  return steps;
}

/**
 * @param {any} item
 * @returns {Step | null}
 */
function fromObject(item) {
  if (typeof item === 'string') return { label: item.slice(0, MAX_TEXT), status: 'pending', detail: '', duration: null }; // prettier-ignore
  if (!item || typeof item !== 'object') return null;
  const label = String(item.label ?? item.name ?? item.title ?? '').slice(0, MAX_TEXT);
  if (!label) return null;
  const duration = typeof item.duration === 'number' && item.duration >= 0 ? item.duration : typeof item.duration === 'string' ? parseStepDuration(item.duration) : null; // prettier-ignore
  return { label, status: statusOf(item.status ?? item.state), detail: String(item.detail ?? item.description ?? '').slice(0, MAX_TEXT), duration }; // prettier-ignore
}

/**
 * Overall status: error if a step failed, running while one runs, done when all are
 * finished.
 *
 * @param {Step[]} steps
 * @returns {"pending" | "running" | "done" | "error" | "warning"}
 */
export function overallStatus(steps) {
  if (steps.some((s) => s.status === 'error')) return 'error';
  if (
    steps.length &&
    steps.every((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'warning')
  )
    // prettier-ignore
    return steps.some((s) => s.status === 'warning') ? 'warning' : 'done';
  if (steps.some((s) => s.status === 'running' || s.status === 'done')) return 'running';
  return 'pending';
}
