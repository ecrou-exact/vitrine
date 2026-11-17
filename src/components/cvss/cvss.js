// @ts-check
/**
 * CVSS vectors: parsing, validation and the CVSS 3.0 / 3.1 scores (base, temporal and
 * environmental), following the FIRST specifications. CVSS 4.0 vectors are parsed and
 * validated; their score depends on a lookup table of the specification and is not computed
 * here (it can be given with the `score` attribute).
 *
 * @module components/cvss/cvss
 */

/**
 * @typedef {'3.0' | '3.1' | '4.0'} CvssVersion
 * @typedef {'base' | 'temporal' | 'environmental' | 'threat' | 'supplemental'} MetricGroup
 * @typedef {{ key: string, group: MetricGroup, values: readonly string[], required: boolean }} MetricDef
 * @typedef {{ version: CvssVersion, metrics: Record<string, string>, vector: string }} Vector
 * @typedef {{ ok: true, vector: Vector } | { ok: false, error: string, metric?: string }} ParseResult
 * @typedef {'none' | 'low' | 'medium' | 'high' | 'critical'} Severity
 * @typedef {{ base: number, impact: number, exploitability: number, temporal: number | null, environmental: number | null }} Scores
 */

/**
 * @param {string} key
 * @param {MetricGroup} group
 * @param {string} values
 * @param {boolean} [required]
 * @returns {MetricDef}
 */
const m = (key, group, values, required = false) =>
  Object.freeze({ key, group, values: Object.freeze(values.split(' ')), required });

/** CVSS 3.0 and 3.1 metrics, in the order of the specification. */
export const METRICS_3 = Object.freeze([
  m('AV', 'base', 'N A L P', true),
  m('AC', 'base', 'L H', true),
  m('PR', 'base', 'N L H', true),
  m('UI', 'base', 'N R', true),
  m('S', 'base', 'U C', true),
  m('C', 'base', 'H L N', true),
  m('I', 'base', 'H L N', true),
  m('A', 'base', 'H L N', true),
  m('E', 'temporal', 'X H F P U'),
  m('RL', 'temporal', 'X U W T O'),
  m('RC', 'temporal', 'X C R U'),
  m('CR', 'environmental', 'X H M L'),
  m('IR', 'environmental', 'X H M L'),
  m('AR', 'environmental', 'X H M L'),
  m('MAV', 'environmental', 'X N A L P'),
  m('MAC', 'environmental', 'X L H'),
  m('MPR', 'environmental', 'X N L H'),
  m('MUI', 'environmental', 'X N R'),
  m('MS', 'environmental', 'X U C'),
  m('MC', 'environmental', 'X H L N'),
  m('MI', 'environmental', 'X H L N'),
  m('MA', 'environmental', 'X H L N'),
]);

/** CVSS 4.0 metrics, in the order of the specification. */
export const METRICS_4 = Object.freeze([
  m('AV', 'base', 'N A L P', true),
  m('AC', 'base', 'L H', true),
  m('AT', 'base', 'N P', true),
  m('PR', 'base', 'N L H', true),
  m('UI', 'base', 'N P A', true),
  m('VC', 'base', 'H L N', true),
  m('VI', 'base', 'H L N', true),
  m('VA', 'base', 'H L N', true),
  m('SC', 'base', 'H L N', true),
  m('SI', 'base', 'H L N', true),
  m('SA', 'base', 'H L N', true),
  m('E', 'threat', 'X A P U'),
  m('CR', 'environmental', 'X H M L'),
  m('IR', 'environmental', 'X H M L'),
  m('AR', 'environmental', 'X H M L'),
  m('MAV', 'environmental', 'X N A L P'),
  m('MAC', 'environmental', 'X L H'),
  m('MAT', 'environmental', 'X N P'),
  m('MPR', 'environmental', 'X N L H'),
  m('MUI', 'environmental', 'X N P A'),
  m('MVC', 'environmental', 'X H L N'),
  m('MVI', 'environmental', 'X H L N'),
  m('MVA', 'environmental', 'X H L N'),
  m('MSC', 'environmental', 'X H L N'),
  m('MSI', 'environmental', 'X S H L N'),
  m('MSA', 'environmental', 'X S H L N'),
  m('S', 'supplemental', 'X N P'),
  m('AU', 'supplemental', 'X N Y'),
  m('R', 'supplemental', 'X A U I'),
  m('V', 'supplemental', 'X D C'),
  m('RE', 'supplemental', 'X L M H'),
  m('U', 'supplemental', 'X Clear Green Amber Red'),
]);

/** Longest vector read (a full CVSS 4.0 vector is about 250 characters). */
export const MAX_VECTOR_LENGTH = 1024;

/**
 * @param {CvssVersion} version
 * @returns {readonly MetricDef[]}
 */
export function metricsOf(version) {
  return version === '4.0' ? METRICS_4 : METRICS_3;
}

/**
 * Reads a vector such as `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`. Spaces around it
 * are ignored; metric names and values are case-sensitive, as in the specification. A vector
 * without prefix is read as CVSS 3.1.
 *
 * @param {string} text
 * @returns {ParseResult}
 */
export function parseVector(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: false, error: 'empty' };
  if (raw.length > MAX_VECTOR_LENGTH) return { ok: false, error: 'length' };
  const parts = raw.split('/');
  /** @type {CvssVersion} */
  let version = '3.1';
  const head = /^CVSS:(\d+\.\d+)$/.exec(parts[0]);
  if (head) {
    if (head[1] !== '3.0' && head[1] !== '3.1' && head[1] !== '4.0')
      return { ok: false, error: 'version' };
    version = /** @type {CvssVersion} */ (head[1]);
    parts.shift();
  } else if (/^CVSS:/i.test(parts[0])) return { ok: false, error: 'version' };
  const defs = metricsOf(version);
  /** @type {Record<string, string>} */
  const metrics = {};
  for (const part of parts) {
    const pair = /^([A-Za-z]{1,3}):([A-Za-z]{1,5})$/.exec(part);
    if (!pair) return { ok: false, error: 'syntax', metric: part };
    const [, key, value] = pair;
    const def = defs.find((d) => d.key === key);
    if (!def) return { ok: false, error: 'unknown', metric: key };
    if (Object.hasOwn(metrics, key)) return { ok: false, error: 'duplicate', metric: key };
    if (!def.values.includes(value)) return { ok: false, error: 'value', metric: key };
    metrics[key] = value;
  }
  const missing = defs.find((d) => d.required && !Object.hasOwn(metrics, d.key));
  if (missing) return { ok: false, error: 'missing', metric: missing.key };
  return { ok: true, vector: { version, metrics, vector: formatVector(version, metrics) } };
}

/**
 * The vector in the order of the specification, without metrics set to X (Not Defined).
 *
 * @param {CvssVersion} version
 * @param {Record<string, string>} metrics
 * @returns {string}
 */
export function formatVector(version, metrics) {
  const parts = metricsOf(version)
    .filter((d) => metrics[d.key] && (d.required || metrics[d.key] !== 'X'))
    .map((d) => `${d.key}:${metrics[d.key]}`);
  return [`CVSS:${version}`, ...parts].join('/');
}

/**
 * @param {number | null} score
 * @returns {Severity}
 */
export function severity(score) {
  if (score === null || score <= 0) return 'none';
  if (score < 4) return 'low';
  if (score < 7) return 'medium';
  if (score < 9) return 'high';
  return 'critical';
}

// ---------------------------------------------------------------- CVSS 3.x scores

const WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
  E: { X: 1, H: 1, F: 0.97, P: 0.94, U: 0.91 },
  RL: { X: 1, U: 1, W: 0.97, T: 0.96, O: 0.95 },
  RC: { X: 1, C: 1, R: 0.96, U: 0.92 },
  REQ: { X: 1, H: 1.5, M: 1, L: 0.5 },
};

/**
 * @param {string} value
 * @param {boolean} changed - Scope changed.
 */
function privileges(value, changed) {
  if (value === 'N') return 0.85;
  if (value === 'L') return changed ? 0.68 : 0.62;
  return changed ? 0.5 : 0.27;
}

/**
 * Round up to one decimal: CVSS 3.1 Appendix A (avoids floating point errors);
 * CVSS 3.0 uses a plain ceiling.
 *
 * @param {number} value
 * @param {CvssVersion} version
 */
export function roundUp(value, version) {
  if (version === '3.0') return Math.ceil(value * 10) / 10;
  const whole = Math.round(value * 100000);
  if (whole % 10000 === 0) return whole / 100000;
  return (Math.floor(whole / 10000) + 1) / 10;
}

/** @param {number} value */
const one = (value) => Math.round(value * 10) / 10;

/**
 * @param {Vector} vector
 * @returns {Scores | null} `null` for CVSS 4.0.
 */
export function scores(vector) {
  if (vector.version === '4.0') return null;
  const v = vector.version;
  const get = (/** @type {string} */ key) => vector.metrics[key] ?? 'X';
  const k = (/** @type {Record<string, number>} */ table, /** @type {string} */ key) =>
    table[get(key)] ?? 1;

  // Base
  const changed = get('S') === 'C';
  const iss = 1 - (1 - k(WEIGHTS.CIA, 'C')) * (1 - k(WEIGHTS.CIA, 'I')) * (1 - k(WEIGHTS.CIA, 'A')); // prettier-ignore
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  const exploitability =
    8.22 * k(WEIGHTS.AV, 'AV') * k(WEIGHTS.AC, 'AC') * privileges(get('PR'), changed) * k(WEIGHTS.UI, 'UI'); // prettier-ignore
  const base =
    impact <= 0 ? 0 : roundUp(Math.min((changed ? 1.08 : 1) * (impact + exploitability), 10), v);

  // Temporal
  const temporalSet = ['E', 'RL', 'RC'].some((key) => get(key) !== 'X');
  const factor = k(WEIGHTS.E, 'E') * k(WEIGHTS.RL, 'RL') * k(WEIGHTS.RC, 'RC');
  const temporal = temporalSet ? roundUp(base * factor, v) : null;

  // Environmental
  const environmentalSet = METRICS_3.some((d) => d.group === 'environmental' && get(d.key) !== 'X');
  let environmental = null;
  if (environmentalSet) {
    const mod = (/** @type {string} */ key) => (get(`M${key}`) === 'X' ? get(key) : get(`M${key}`)); // prettier-ignore
    const mChanged = mod('S') === 'C';
    const cia = (/** @type {string} */ key) => WEIGHTS.CIA[/** @type {'H'} */ (mod(key))];
    const req = (/** @type {string} */ key) => k(WEIGHTS.REQ, key);
    const miss = Math.min(
      1 - (1 - req('CR') * cia('C')) * (1 - req('IR') * cia('I')) * (1 - req('AR') * cia('A')),
      0.915,
    );
    const mImpact = mChanged
      ? 7.52 * (miss - 0.029) - 3.25 * (v === '3.0' ? miss - 0.02 : miss * 0.9731 - 0.02) ** (v === '3.0' ? 15 : 13) // prettier-ignore
      : 6.42 * miss;
    const mExploitability =
      8.22 *
      WEIGHTS.AV[/** @type {'N'} */ (mod('AV'))] *
      WEIGHTS.AC[/** @type {'L'} */ (mod('AC'))] *
      privileges(mod('PR'), mChanged) *
      WEIGHTS.UI[/** @type {'N'} */ (mod('UI'))];
    environmental =
      mImpact <= 0
        ? 0
        : roundUp(
            roundUp(Math.min((mChanged ? 1.08 : 1) * (mImpact + mExploitability), 10), v) * factor,
            v,
          );
  }

  return {
    base,
    impact: impact <= 0 ? 0 : one(impact),
    exploitability: one(exploitability),
    temporal,
    environmental,
  };
}

/**
 * The score that best describes the vector: environmental, then temporal, then base.
 *
 * @param {Scores} s
 * @returns {number}
 */
export function overall(s) {
  return s.environmental ?? s.temporal ?? s.base;
}
