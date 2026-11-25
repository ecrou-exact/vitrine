// @ts-check
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coerceAnswer,
  coerceValue,
  firstProblem,
  isEmpty,
  nextPosition,
  normalizeQuestions,
  parseQuestions,
  validateAnswer,
  validDate,
  wholeMatch,
} from '../../src/components/questionnaire/questions.js';
import { en, fr } from '../../src/components/questionnaire/strings.js';
import { VtQuestionnaire } from '../../src/components/questionnaire/vt-questionnaire.js';

if (!customElements.get('vt-questionnaire'))
  customElements.define('vt-questionnaire', VtQuestionnaire);

/**
 * @param {Record<string, unknown>} extra
 * @returns {import('../../src/components/questionnaire/questions.js').Question}
 */
function question(extra) {
  const [q] = normalizeQuestions([{ id: 'q', type: 'text', label: 'Q', ...extra }]);
  return q;
}

const QUESTIONS = [
  {
    id: 'renderer',
    type: 'single',
    label: 'How do you render?',
    required: true,
    options: [
      { value: 'csr', label: 'CSR' },
      { value: 'ssr', label: 'SSR' },
    ],
  },
  {
    id: 'components',
    type: 'multiple',
    label: 'Which components?',
    required: true,
    min: 1,
    max: 2,
    options: ['code', 'json', 'csv'],
  },
  { id: 'note', type: 'text', label: 'Note' },
];

/**
 * @param {Record<string, string>} [attrs]
 * @returns {any}
 */
function mount(attrs = {}) {
  const el = document.createElement('vt-questionnaire');
  el.setAttribute('lang-ui', 'en');
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  /** @type {any} */ (el).questions = QUESTIONS;
  document.body.append(el);
  el.render();
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('questions', () => {
  it('reads types, drops what is unknown and keeps ids unique and safe', () => {
    const list = normalizeQuestions([
      { id: 'a', type: 'single', label: 'A', options: ['x', { value: 'y', label: 'Y' }, 'x'] },
      { id: 'a', type: 'text', label: 'Duplicate' },
      { id: '__proto__', type: 'email', label: 'Proto' },
      { id: 'bad id!', type: 'tags' },
      { id: 'z', type: 'carousel' },
      null,
      'text',
    ]);
    expect(list.map((q) => q.type)).toEqual(['single', 'text', 'email', 'tags']);
    expect(new Set(list.map((q) => q.id)).size).toBe(4);
    expect(list.map((q) => q.id)).not.toContain('__proto__');
    expect(list[3].id).toBe('bad_id_');
    expect(list[0].options.map((o) => o.value)).toEqual(['x', 'y']);
  });

  it('reads a list or an object with questions, and reports bad JSON', () => {
    expect(parseQuestions(JSON.stringify(QUESTIONS)).questions).toHaveLength(3);
    expect(parseQuestions(JSON.stringify({ questions: QUESTIONS })).questions).toHaveLength(3);
    expect(parseQuestions('{ nope').error).not.toBe('');
    expect(parseQuestions('{"a": 1}').error).toBe('questions');
    expect(parseQuestions('  ')).toEqual({ questions: [], error: '' });
  });

  it('groups options by the key named in groupBy', () => {
    const q = question({
      type: 'multiple',
      groupBy: 'family',
      options: [{ value: 'a', family: 'Code' }, { value: 'b', family: 'Forms' }, 'c'],
    });
    expect(q.options.map((o) => o.group)).toEqual(['Code', 'Forms', '']);
  });

  it('limits what a hostile list can cost', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: `q${i}`, type: 'text' }));
    expect(normalizeQuestions(many).length).toBeLessThanOrEqual(200);
    const long = question({ label: 'x'.repeat(5000), pattern: 'a'.repeat(5000) });
    expect(long.label.length).toBeLessThanOrEqual(300);
    expect(long.pattern.length).toBeLessThanOrEqual(200);
    expect(normalizeQuestions('not a list')).toEqual([]);
  });
});

describe('answers', () => {
  it('coerces each answer to the shape of its question', () => {
    const single = question({ type: 'single', options: ['a', 'b'] });
    const multiple = question({ type: 'multiple', options: ['a', 'b', 'c'] });
    expect(coerceAnswer(single, 'a')).toBe('a');
    expect(coerceAnswer(single, 'zzz')).toBeNull();
    expect(coerceAnswer(multiple, ['c', 'a', 'nope'])).toEqual(['a', 'c']);
    expect(coerceAnswer(multiple, 'a')).toBeNull();
    expect(coerceAnswer(question({ type: 'number' }), '12.5')).toBe(12.5);
    expect(coerceAnswer(question({ type: 'number' }), 'abc')).toBeNull();
    expect(coerceAnswer(question({ type: 'date' }), '2026-02-30')).toBeNull();
    expect(coerceAnswer(question({ type: 'date' }), '2026-02-28')).toBe('2026-02-28');
    expect(coerceAnswer(question({ type: 'tags' }), ['a', ' a ', 'b', ''])).toEqual(['a', 'b']);
    expect(coerceAnswer(question({}), '   ')).toBeNull();
  });

  it('builds a value object that ignores unknown ids and prototype keys', () => {
    const list = normalizeQuestions(QUESTIONS);
    const value = coerceValue(list, JSON.parse('{"renderer":"ssr","components":["json"],"__proto__":{"x":1},"extra":1}')); // prettier-ignore
    expect(value).toEqual({ renderer: 'ssr', components: ['json'] });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(/** @type {any} */ ({}).x).toBeUndefined();
    expect(coerceValue(list, 'nope')).toEqual({});
  });

  it('knows what is empty', () => {
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('  ')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(['a'])).toBe(false);
  });

  it('checks real dates only', () => {
    expect(validDate('2028-02-29')).toBe(true);
    expect(validDate('2027-02-29')).toBe(false);
    expect(validDate('2026-13-01')).toBe(false);
    expect(validDate('26-1-1')).toBe(false);
  });
});

describe('validation', () => {
  const code = (/** @type {any} */ q, /** @type {any} */ answer) =>
    validateAnswer(q, answer)?.code ?? null;

  it('requires an answer only when the question is required', () => {
    expect(code(question({ required: true }), undefined)).toBe('required');
    expect(code(question({ required: true }), '   ')).toBe('required');
    expect(code(question({}), undefined)).toBeNull();
    expect(code(question({ type: 'multiple', required: true, options: ['a'] }), [])).toBe('required'); // prettier-ignore
  });

  it('checks the number of choices and tags', () => {
    const q = question({ type: 'multiple', options: ['a', 'b', 'c'], min: 2, max: 2 });
    expect(code(q, ['a'])).toBe('tooFew');
    expect(code(q, ['a', 'b', 'c'])).toBe('tooMany');
    expect(code(q, ['a', 'b'])).toBeNull();
    expect(code(question({ type: 'tags', max: 1 }), ['a', 'b'])).toBe('tooMany');
  });

  it('checks numbers, with min and max', () => {
    const q = question({ type: 'number', min: 1, max: 10 });
    expect(code(q, 0)).toBe('underflow');
    expect(code(q, 11)).toBe('overflow');
    expect(code(q, 5)).toBeNull();
    expect(code(q, 'abc')).toBe('number');
    expect(code(q, Number.NaN)).toBe('number');
  });

  it('checks length, pattern and email', () => {
    const q = question({ minLength: 3, maxLength: 5, pattern: '[a-z]+' });
    expect(code(q, 'ab')).toBe('tooShort');
    expect(code(q, 'abcdef')).toBe('tooLong');
    expect(code(q, 'ab1c')).toBe('pattern');
    expect(code(q, 'abcd')).toBeNull();
    const email = question({ type: 'email' });
    expect(code(email, 'name@example.com')).toBeNull();
    for (const bad of ['name', 'a@b', '@x.io', 'a b@c.io', `${'a'.repeat(250)}@b.io`])
      expect(code(email, bad)).toBe('email');
  });

  it('matches a pattern against the whole answer, and ignores a broken one', () => {
    expect(wholeMatch('[a-z]+')?.test('abc1')).toBe(false);
    expect(wholeMatch('a|b')?.test('ab')).toBe(false);
    expect(wholeMatch('(')).toBeNull();
    expect(code(question({ pattern: '(' }), 'anything')).toBeNull();
  });

  it('checks dates and their bounds', () => {
    const q = question({ type: 'date', min: '2026-01-01', max: '2026-12-31' });
    expect(code(q, '2025-12-31')).toBe('dateMin');
    expect(code(q, '2027-01-01')).toBe('dateMax');
    expect(code(q, '2026-06-15')).toBeNull();
    expect(code(q, 'tomorrow')).toBe('date');
  });

  it('refuses a single choice that is not an option', () => {
    expect(code(question({ type: 'single', options: ['a'] }), 'b')).toBe('unknown');
  });

  it('finds the first question with a problem', () => {
    const list = normalizeQuestions(QUESTIONS);
    expect(firstProblem(list, {})?.index).toBe(0);
    expect(firstProblem(list, { renderer: 'csr' })?.index).toBe(1);
    expect(firstProblem(list, { renderer: 'csr', components: ['code'] })).toBeNull();
  });
});

describe('navigation', () => {
  it('moves forward until the last position, which depends on the review screen', () => {
    expect(nextPosition(0, 3, false)).toBe(1);
    expect(nextPosition(2, 3, false)).toBe(-1);
    expect(nextPosition(2, 3, true)).toBe(3);
    expect(nextPosition(3, 3, true)).toBe(-1);
  });
});

describe('strings', () => {
  it('has the same keys in English and French', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) expect(key.startsWith('questionnaire')).toBe(true);
  });
});

describe('<vt-questionnaire>', () => {
  it('draws one question at a time in a fieldset with a legend and a live "Step 1 of 3"', async () => {
    const el = mount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fieldsets = el.root.querySelectorAll('fieldset');
    expect(fieldsets).toHaveLength(1);
    expect(fieldsets[0].querySelector('legend h2').textContent).toBe('How do you render?');
    expect(el.root.querySelectorAll('input[type=radio]')).toHaveLength(2);
    expect(el.root.querySelector('.progress-text').textContent).toBe('Step 1 of 3');
    expect(el.root.querySelector('[role=progressbar]').getAttribute('aria-valuetext')).toBe('Step 1 of 3'); // prettier-ignore
    expect(fieldsets[0].getAttribute('aria-current')).toBe('step');
  });

  it('checks only the current step before moving on, and links the error to the group', async () => {
    const el = mount();
    const steps = [];
    el.addEventListener('vt-step', (/** @type {any} */ e) => steps.push(e.detail));
    expect(el.next()).toBe(false);
    const group = el.root.querySelector('.options');
    const error = el.root.querySelector('[data-error]');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('Choose an option.');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-describedby').split(' ')).toContain(error.id);
    el.value = { renderer: 'csr' };
    expect(el.next()).toBe(true);
    expect(el.step).toBe(1);
    expect(steps).toEqual([{ from: 0, to: 1, id: 'components' }]);
  });

  it('keeps answers in the value object and fires input and change events', async () => {
    const el = mount();
    const seen = [];
    el.addEventListener('vt-input', (/** @type {any} */ e) => seen.push(['input', e.detail]));
    el.addEventListener('vt-change', (/** @type {any} */ e) => seen.push(['change', e.detail]));
    const radio = el.root.querySelector('input[value=ssr]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.value).toEqual({ renderer: 'ssr' });
    expect(seen).toEqual([
      ['input', { id: 'renderer', value: 'ssr' }],
      ['change', { id: 'renderer', value: 'ssr' }],
    ]);
  });

  it('goes back without checking, and to a step by id', () => {
    const el = mount();
    el.value = { renderer: 'csr' };
    expect(el.goTo('components')).toBe(true);
    expect(el.back()).toBe(true);
    expect(el.step).toBe(0);
    expect(el.back()).toBe(false);
    expect(el.goTo('nope')).toBe(false);
    expect(el.goTo('note')).toBe(true);
  });

  it('will not go forward past an invalid step with goTo()', () => {
    const el = mount();
    expect(el.goTo('note')).toBe(false);
    expect(el.step).toBe(0);
  });

  it('auto-advances after a single choice, but not on the last step without a review', () => {
    vi.useFakeTimers();
    const el = mount({ 'auto-advance': '' });
    const radio = el.root.querySelector('input[value=csr]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.step).toBe(0);
    vi.advanceTimersByTime(400);
    expect(el.step).toBe(1);
  });

  it('shows a review screen with Edit buttons and submits the answers', () => {
    const el = mount({ review: '' });
    const submitted = [];
    el.addEventListener('vt-submit', (/** @type {any} */ e) => submitted.push(e.detail.value));
    el.value = { renderer: 'ssr', components: ['code', 'csv'] };
    el.next();
    el.next();
    el.next();
    expect(el.step).toBe(3);
    expect(el.root.querySelector('.review')).not.toBeNull();
    const rows = [...el.root.querySelectorAll('.review-row')].map((r) => r.textContent);
    expect(rows[0]).toContain('SSR');
    expect(rows[1]).toContain('code, csv');
    expect(rows[2]).toContain('Skipped');
    el.root.querySelectorAll('.review-edit button')[1].click();
    expect(el.step).toBe(1);
    expect(el.next()).toBe(true);
    expect(el.step).toBe(3);
    expect(el.submit()).toBe(true);
    expect(submitted).toEqual([{ renderer: 'ssr', components: ['code', 'csv'] }]);
  });

  it('sends the user to the first invalid step when it submits', () => {
    const el = mount({ layout: 'steps' });
    const submitted = [];
    el.addEventListener('vt-submit', () => submitted.push(1));
    el.value = { renderer: 'csr' };
    el.goTo('note');
    expect(el.submit()).toBe(false);
    expect(el.step).toBe(1);
    expect(submitted).toEqual([]);
  });

  it('shows every question in the all layout and submits once', () => {
    const el = mount({ layout: 'all' });
    expect(el.root.querySelectorAll('fieldset')).toHaveLength(3);
    expect(el.submit()).toBe(false);
    expect(el.root.querySelectorAll('[data-error]:not([hidden])')).toHaveLength(2);
    el.value = { renderer: 'csr', components: ['json'] };
    expect(el.submit()).toBe(true);
  });

  it('skips an optional question and clears its answer', () => {
    const el = mount();
    el.value = { renderer: 'csr', components: ['json'], note: 'hi' };
    el.goTo('note');
    el.skip();
    expect(el.value).toEqual({ renderer: 'csr', components: ['json'] });
  });

  it('resets to the first step with no answers', () => {
    const el = mount();
    el.value = { renderer: 'csr' };
    el.next();
    el.reset();
    expect(el.step).toBe(0);
    expect(el.value).toEqual({});
  });

  it('reads questions from a JSON script child and from fromData()', async () => {
    document.body.innerHTML = `<vt-questionnaire lang-ui="en"><script type="application/json" data-json>${JSON.stringify({ questions: QUESTIONS, layout: 'all' })}</script></vt-questionnaire>`; // prettier-ignore
    await new Promise((resolve) => setTimeout(resolve, 20));
    const el = /** @type {any} */ (document.body.firstElementChild);
    expect(el.questions).toHaveLength(3);
    expect(el.getAttribute('layout')).toBe('all');
    expect(VtQuestionnaire.fromData(QUESTIONS).content).toContain('"renderer"');
    expect(VtQuestionnaire.fromData({ questions: QUESTIONS, autoAdvance: true }).attributes).toEqual({ 'auto-advance': true }); // prettier-ignore
  });

  it('renders hostile labels, hints and options as text', () => {
    const payload = '<img src=x onerror="window.__q=1"><script>window.__q=1</script>';
    const el = document.createElement('vt-questionnaire');
    /** @type {any} */ (el).questions = [
      { id: 'a', type: 'single', label: payload, hint: payload, options: [{ value: payload, label: payload, description: payload }] }, // prettier-ignore
    ];
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('img')).toBeNull();
    expect(el.root.querySelector('script')).toBeNull();
    expect(el.root.querySelector('h2').textContent).toBe(payload.replace(/\s+/g, ' '));
    expect(/** @type {any} */ (window).__q).toBeUndefined();
  });

  it('does not read answers named like prototype keys', () => {
    const el = mount();
    el.value = JSON.parse('{"__proto__":{"renderer":"csr"},"constructor":"x"}');
    expect(el.value).toEqual({});
  });
});
