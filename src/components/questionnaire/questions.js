// @ts-check
/**
 * The model of `<vt-questionnaire>`: reads questions from JSON, keeps answers in the shape of
 * their question, and checks them. Nothing here touches the DOM.
 *
 * @module components/questionnaire/questions
 */
import { isObject } from '../../core/data.js';

/** Types of question. */
export const TYPES = /** @type {const} */ ([
  'single', 'multiple', 'text', 'textarea', 'email', 'number', 'tags', 'date',
]); // prettier-ignore

/** @typedef {(typeof TYPES)[number]} QuestionType */

/** Types answered with a text box. */
export const TEXT_TYPES = new Set(['text', 'textarea', 'email']);

/** Most questions, options and tags read; longest texts kept. */
export const LIMITS = Object.freeze({
  questions: 200,
  options: 500,
  tags: 100,
  label: 300,
  hint: 600,
  text: 10000,
  pattern: 200,
});

/**
 * @typedef {object} Option
 * @property {string} value
 * @property {string} label
 * @property {string} description
 * @property {string} group
 */

/**
 * @typedef {object} Question
 * @property {string} id
 * @property {QuestionType} type
 * @property {string} label
 * @property {string} short - A shorter name for the step list.
 * @property {string} hint
 * @property {string} placeholder
 * @property {boolean} required
 * @property {Option[]} options
 * @property {number | null} min - Fewest choices or tags, or smallest number.
 * @property {number | null} max - Most choices or tags, or largest number.
 * @property {string} minDate - Earliest date (`YYYY-MM-DD`), or empty.
 * @property {string} maxDate - Latest date, or empty.
 * @property {number | null} minLength
 * @property {number | null} maxLength
 * @property {string} pattern
 */

/** @typedef {string | string[] | number | null} Answer */

/**
 * What is wrong with an answer: a code the element turns into words.
 *
 * @typedef {{ code: 'required' | 'tooFew' | 'tooMany' | 'underflow' | 'overflow' | 'tooShort' | 'tooLong' | 'pattern' | 'email' | 'number' | 'date' | 'dateMin' | 'dateMax' | 'unknown', params: Record<string, string | number> }} Problem
 */

/** Keys that would reach the prototype if they named an answer. */
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function clip(value, max) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function count(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function truthy(value) {
  return value === true || value === 'true' || value === '';
}

/**
 * @param {unknown} list
 * @param {string} groupKey - Name of the key that holds an option's group.
 * @returns {Option[]}
 */
function readOptions(list, groupKey) {
  if (!Array.isArray(list)) return [];
  /** @type {Option[]} */
  const options = [];
  const seen = new Set();
  for (const item of list.slice(0, LIMITS.options)) {
    const raw = isObject(item) ? item : { value: item };
    const value = clip(raw.value ?? raw.id ?? raw.label, LIMITS.label);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({
      value,
      label: clip(raw.label ?? raw.name ?? value, LIMITS.label) || value,
      description: clip(raw.description, LIMITS.hint),
      group: clip(raw[groupKey] ?? raw.group, LIMITS.label),
    });
  }
  return options;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readDate(value) {
  const text = clip(value, 10);
  return validDate(text) ? text : '';
}

/**
 * Whether a text is a real calendar day, `YYYY-MM-DD`.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function validDate(text) {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; // prettier-ignore
}

/**
 * @param {unknown} item
 * @param {number} index
 * @param {Set<string>} used
 * @returns {Question | null}
 */
function readQuestion(item, index, used) {
  if (!isObject(item)) return null;
  const type = TYPES.find((name) => name === String(item.type ?? 'text').toLowerCase());
  if (!type) return null;
  let id = clip(item.id, 64).replace(/[^\w.-]/g, '_');
  if (!id || RESERVED.has(id) || used.has(id)) id = `q${index + 1}`;
  while (used.has(id)) id += '_';
  used.add(id);
  const isDate = type === 'date';
  const groupKey = typeof item.groupBy === 'string' ? item.groupBy.slice(0, 40) : 'group';
  return {
    id,
    type,
    label: clip(item.label ?? item.title ?? item.question, LIMITS.label) || id,
    short: clip(item.short, 60),
    hint: clip(item.hint, LIMITS.hint),
    placeholder: clip(item.placeholder, LIMITS.label),
    required: truthy(item.required),
    options: type === 'single' || type === 'multiple' ? readOptions(item.options, groupKey) : [],
    min: isDate ? null : count(item.min),
    max: isDate ? null : count(item.max),
    minDate: isDate ? readDate(item.min) : '',
    maxDate: isDate ? readDate(item.max) : '',
    minLength: count(item.minLength ?? item.minlength),
    maxLength: count(item.maxLength ?? item.maxlength),
    pattern: clip(item.pattern, LIMITS.pattern),
  };
}

/**
 * Normalizes a list of questions: unknown types and malformed entries are dropped, ids are
 * made unique and safe, and texts are clipped.
 *
 * @param {unknown} list
 * @returns {Question[]}
 */
export function normalizeQuestions(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  /** @type {Question[]} */
  const questions = [];
  for (const [index, item] of list.slice(0, LIMITS.questions).entries()) {
    const question = readQuestion(item, index, used);
    if (question) questions.push(question);
  }
  return questions;
}

/**
 * Reads questions from JSON text: a list, or `{ "questions": [...] }`.
 *
 * @param {string} text
 * @returns {{ questions: Question[], error: string }}
 */
export function parseQuestions(text) {
  if (!text.trim()) return { questions: [], error: '' };
  try {
    const value = JSON.parse(text);
    const list = Array.isArray(value) ? value : isObject(value) ? value.questions : null;
    if (!Array.isArray(list)) return { questions: [], error: 'questions' };
    return { questions: normalizeQuestions(list), error: '' };
  } catch (error) {
    return { questions: [], error: error instanceof Error ? error.message : 'json' };
  }
}

/**
 * Whether there is no answer.
 *
 * @param {Answer | undefined} answer
 * @returns {boolean}
 */
export function isEmpty(answer) {
  if (answer === null || answer === undefined) return true;
  if (Array.isArray(answer)) return answer.length === 0;
  return typeof answer === 'string' ? answer.trim() === '' : false;
}

/**
 * Turns anything into an answer of the shape the question takes, or `null` for none.
 *
 * @param {Question} question
 * @param {unknown} raw
 * @returns {Answer}
 */
export function coerceAnswer(question, raw) {
  switch (question.type) {
    case 'single': {
      const value = typeof raw === 'string' ? raw : '';
      return question.options.some((o) => o.value === value) ? value : null;
    }
    case 'multiple': {
      const list = Array.isArray(raw) ? raw.map(String) : [];
      const picked = question.options.map((o) => o.value).filter((v) => list.includes(v));
      return picked.length ? picked : null;
    }
    case 'tags': {
      const list = Array.isArray(raw) ? raw : [];
      const tags = [...new Set(list.map((t) => clip(t, 100)).filter(Boolean))];
      return tags.length ? tags.slice(0, LIMITS.tags) : null;
    }
    case 'number': {
      const n = count(raw);
      return n === null ? null : n;
    }
    case 'date':
      return typeof raw === 'string' && validDate(raw) ? raw : null;
    default: {
      const text = typeof raw === 'string' ? raw.slice(0, LIMITS.text) : '';
      return text.trim() === '' ? null : text;
    }
  }
}

/**
 * The answers of a value object, keyed by question id, in the shape each question takes.
 * Unknown ids and empty answers are left out.
 *
 * @param {Question[]} questions
 * @param {unknown} value
 * @returns {Record<string, Answer>}
 */
export function coerceValue(questions, value) {
  /** @type {Record<string, Answer>} */
  const answers = {};
  if (!isObject(value)) return answers;
  for (const question of questions) {
    if (!Object.hasOwn(value, question.id)) continue;
    const answer = coerceAnswer(question, value[question.id]);
    if (answer !== null) answers[question.id] = answer;
  }
  return answers;
}

/**
 * Compiles a pattern the way a native input does: it must match the whole text.
 *
 * @param {string} pattern
 * @returns {RegExp | null} `null` when the pattern is not valid.
 */
export function wholeMatch(pattern) {
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags);
    } catch {
      // Try the next flag set.
    }
  }
  return null;
}

/**
 * @param {Question} question
 * @param {string} text
 * @returns {Problem | null}
 */
function checkText(question, text) {
  const { minLength, maxLength } = question;
  if (question.type === 'email' && (text.length > 254 || !EMAIL.test(text)))
    return { code: 'email', params: {} };
  if (minLength !== null && text.length < minLength) return { code: 'tooShort', params: { min: minLength } }; // prettier-ignore
  if (maxLength !== null && text.length > maxLength) return { code: 'tooLong', params: { max: maxLength } }; // prettier-ignore
  const pattern = question.pattern ? wholeMatch(question.pattern) : null;
  if (pattern && !pattern.test(text)) return { code: 'pattern', params: {} };
  return null;
}

/**
 * @param {Question} question
 * @param {number} n - How many were chosen, or the number.
 * @param {boolean} isCount
 * @returns {Problem | null}
 */
function checkRange(question, n, isCount) {
  const { min, max } = question;
  if (min !== null && n < min) return { code: isCount ? 'tooFew' : 'underflow', params: { min } };
  if (max !== null && n > max) return { code: isCount ? 'tooMany' : 'overflow', params: { max } };
  return null;
}

/**
 * Checks one answer. An empty answer is a problem only for a required question.
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @returns {Problem | null} `null` when the answer is acceptable.
 */
export function validateAnswer(question, answer) {
  if (isEmpty(answer)) return question.required ? { code: 'required', params: {} } : null;
  switch (question.type) {
    case 'single':
      return question.options.some((o) => o.value === answer) ? null : { code: 'unknown', params: {} }; // prettier-ignore
    case 'multiple':
    case 'tags':
      return Array.isArray(answer) ? checkRange(question, answer.length, true) : { code: 'unknown', params: {} }; // prettier-ignore
    case 'number':
      return typeof answer === 'number' && Number.isFinite(answer)
        ? checkRange(question, answer, false)
        : { code: 'number', params: {} };
    case 'date':
      if (typeof answer !== 'string' || !validDate(answer)) return { code: 'date', params: {} };
      if (question.minDate && answer < question.minDate) return { code: 'dateMin', params: { min: question.minDate } }; // prettier-ignore
      if (question.maxDate && answer > question.maxDate) return { code: 'dateMax', params: { max: question.maxDate } }; // prettier-ignore
      return null;
    default:
      return typeof answer === 'string' ? checkText(question, answer) : { code: 'unknown', params: {} }; // prettier-ignore
  }
}

/**
 * The first question whose answer is not acceptable.
 *
 * @param {Question[]} questions
 * @param {Record<string, Answer>} answers
 * @returns {{ index: number, problem: Problem } | null}
 */
export function firstProblem(questions, answers) {
  for (const [index, question] of questions.entries()) {
    const problem = validateAnswer(question, answers[question.id]);
    if (problem) return { index, problem };
  }
  return null;
}

/**
 * The position to go to from a step: the next one, or the review screen after the last.
 *
 * @param {number} from
 * @param {number} total - Number of questions.
 * @param {boolean} review - Whether a review screen follows the questions.
 * @returns {number} The next position, or `-1` when there is no next one.
 */
export function nextPosition(from, total, review) {
  const last = review ? total : total - 1;
  return from < last ? from + 1 : -1;
}
