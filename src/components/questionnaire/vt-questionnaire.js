// @ts-check
import questionnaireCss from '../../styles/questionnaire.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { isObject } from '../../core/data.js';
import { jsonText, listIn } from '../../core/data-input.js';
import { VtDataElement } from '../../core/data-element.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { emptyView } from '../../core/ui.js';
import {
  coerceAnswer,
  coerceValue,
  firstProblem,
  isEmpty,
  nextPosition,
  parseQuestions,
  validateAnswer,
  normalizeQuestions,
  validDate,
} from './questions.js';
import { en as strings, fr as stringsFr } from './strings.js';
import {
  firstControl,
  navView,
  paintError,
  progressView,
  questionView,
  reviewView,
} from './views.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./questions.js').Question} Question */
/** @typedef {import('./questions.js').Answer} Answer */
/** @typedef {import('./questions.js').Problem} Problem */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Pause before a single choice moves on by itself, in milliseconds. */
const ADVANCE_DELAY = 350;

const LAYOUTS = /** @type {const} */ (['steps', 'all']);
const PROGRESS = /** @type {const} */ (['none', 'bar', 'steps']);

/** Attributes a JSON value may set, by their JSON names. */
const DATA_KEYS = {
  layout: 'layout', progress: 'progress', review: 'review', autoAdvance: 'auto-advance',
  allowSkip: 'allow-skip',
}; // prettier-ignore

/** Words of each problem, by code. */
const MESSAGES = /** @type {Record<Problem['code'], StringKey>} */ ({
  required: 'questionnaireRequiredText',
  tooFew: 'questionnaireTooFew',
  tooMany: 'questionnaireTooMany',
  underflow: 'questionnaireUnderflow',
  overflow: 'questionnaireOverflow',
  tooShort: 'questionnaireTooShort',
  tooLong: 'questionnaireTooLong',
  pattern: 'questionnairePattern',
  email: 'questionnaireEmail',
  number: 'questionnaireNumber',
  date: 'questionnaireDate',
  dateMin: 'questionnaireDateMin',
  dateMax: 'questionnaireDateMax',
  unknown: 'questionnaireUnknown',
});

/**
 * A guided form: one question per screen (or all on a page), with a progress indicator,
 * Back, Next and Skip, a check of each answer before moving on, an optional review screen
 * and a JSON result. Questions are JSON: single and multiple choice, text, text area, email,
 * number, tags and date.
 *
 * It takes part in `<form>` like a native field: the answers are submitted as JSON under
 * `name`, and it blocks submission while a required answer is missing.
 *
 * @element vt-questionnaire
 * @since 0.16.0
 *
 * @attr {"simple"|"full"} variant - `full` turns on the review screen, the step list and auto-advance.
 * @attr {string} name - Name of the value in the submitted form: the answers as JSON.
 * @attr {"steps"|"all"} layout - One question per screen (default), or every question on one page.
 *   (Not `mode`: that attribute is the view / edit switch of every element.)
 * @attr {boolean} auto-advance - A single choice moves on after a short pause. Full variant: on.
 * @attr {boolean} review - A review screen with an Edit button per answer before the end. Full variant: on.
 * @attr {"none"|"bar"|"steps"} progress - "Step 2 of 6" with a bar, or a list of steps you can go back to. Default: `bar`, `steps` for the full variant.
 * @attr {boolean} allow-skip - Optional questions get a Skip button. Default: on.
 * @attr {string} label - Accessible name of the questionnaire.
 * @attr {string} lang-ui - Language of the interface (`en` or `fr`, or one you registered).
 *
 * @prop {object[]} questions - The questions (read and write): `{ id, type, label, hint, required, options, … }`.
 * @prop {Record<string, unknown>} value - The answers, by question id (read and write). Unanswered and skipped questions are left out.
 * @prop {number} step - Index of the current step; the review screen comes after the last question (read-only).
 * @prop {HTMLFormElement | null} form - The form of the element (read-only).
 *
 * @fires vt-input - An answer is being edited. Detail: `{ id, value }`.
 * @fires vt-change - An answer was committed. Detail: `{ id, value }`.
 * @fires vt-step - The step changed. Detail: `{ from, to, id }` (`id` is `review` for the review screen).
 * @fires vt-submit - Every answer passed the check. Detail: `{ value }`.
 * @fires invalid - The form was submitted with a required answer missing or not valid.
 *
 * @csspart step - A question: its fieldset.
 * @csspart question - The legend with the question.
 * @csspart hint - The help under the question.
 * @csspart option - A choice of a single or multiple choice question.
 * @csspart progress - "Step 2 of 6" and the bar or the list of steps.
 * @csspart nav - The Back, Skip and Next buttons.
 * @csspart review - The review screen.
 * @csspart error - The message when an answer is not valid.
 *
 * @cssprop --vt-radius - Corner radius of the frame and of choices.
 * @cssprop --vt-accent - Selected choice, bar and focus ring.
 * @cssprop --vt-danger - Error messages.
 *
 * @method next() - Checks the current step and goes to the next one; on the last step it submits. Returns `true` when it moved or submitted.
 * @method back() - Goes to the previous step, without checking. Returns `true` when it moved.
 * @method goTo(target) - Goes to a step by question id or index (`review` for the review screen). Going forward checks the current step. Returns `true` when it moved.
 * @method reset() - Clears the answers and goes back to the first step.
 * @method submit() - Checks every answer and fires `vt-submit`. Returns `true` when it passed.
 *
 * @example
 * <vt-questionnaire variant="full" name="setup">
 *   <script type="application/json" data-json>
 *     { "questions": [
 *       { "id": "renderer", "type": "single", "label": "How do you render?", "required": true,
 *         "options": [{ "value": "csr", "label": "CSR" }, { "value": "ssr", "label": "SSR" }] },
 *       { "id": "email", "type": "email", "label": "Email" }
 *     ] }
 *   </script>
 * </vt-questionnaire>
 */
export class VtQuestionnaire extends VtDataElement {
  static type = 'questionnaire';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'name', 'layout', 'auto-advance', 'review', 'progress', 'allow-skip',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze(Object.values(DATA_KEYS));

  static upgradeProperties = Object.freeze(['content', 'questions', 'value']);

  static presets = {
    simple: { review: false, 'auto-advance': false },
    full: { review: true, 'auto-advance': true },
  };

  static styles = [questionnaireCss];

  /**
   * A list of questions, or `{ questions, layout, progress, review, autoAdvance, allowSkip }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    const list = listIn(value, ['questions']);
    if (!list) return { content: typeof value === 'string' ? value : jsonText(value) };
    /** @type {Record<string, unknown>} */
    const attributes = {};
    if (isObject(value))
      for (const [key, name] of Object.entries(DATA_KEYS))
        if (Object.hasOwn(value, key)) attributes[name] = value[key];
    return { content: jsonText(list), attributes };
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    /** @type {Question[] | null} Questions set through the property; `null` reads the content. */
    this.questionList = null;
    /** @type {{ text: string, result: { questions: Question[], error: string } } | null} */
    this.parsed = null;
    /** @type {Record<string, Answer>} */
    this.answers = {};
    /** Position: a question, or the review screen after the last one. */
    this.index = 0;
    /** The furthest position reached, so the step list can go back and forth. */
    this.reached = 0;
    /** @type {Map<string, string>} Messages of the steps with an error. */
    this.problems = new Map();
    this.done = false;
    /** The review screen sent the reader to a step: Next goes back to it. */
    this.fromReview = false;
    /** @type {'title' | 'control' | 'done' | null} What takes the focus after the next render. */
    this.pendingFocus = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.advanceTimer = undefined;
    this.arrowed = false;
    this.addEventListener('invalid', (event) => {
      // The message is written in the step: the browser bubble would repeat it.
      event.preventDefault();
      this.revealProblem();
    });
  }

  // ---------------------------------------------------------------- state

  /** @returns {Question[]} The questions in use (not a copy). */
  list() {
    if (this.questionList) return this.questionList;
    const text = this.text ?? '';
    if (this.parsed?.text !== text) this.parsed = { text, result: parseQuestions(text) };
    return this.parsed.result.questions;
  }

  /** @type {Question[]} */
  get questions() {
    return this.list().map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) }));
  }

  set questions(value) {
    this.questionList = Array.isArray(value) ? normalizeQuestions(value) : null;
    this.questionsChanged();
  }

  /** @type {Record<string, Answer>} */
  get value() {
    const copy = /** @type {Record<string, Answer>} */ ({});
    for (const [id, answer] of Object.entries(this.answers))
      copy[id] = Array.isArray(answer) ? [...answer] : answer;
    return copy;
  }

  set value(value) {
    this.answers = coerceValue(this.list(), value);
    this.problems.clear();
    this.sync();
    this.requestRender();
  }

  /** @type {number} */
  get step() {
    return this.index;
  }

  /** @type {HTMLFormElement | null} */
  get form() {
    return this.internals?.form ?? null;
  }

  /** @returns {"steps" | "all"} */
  get layout() {
    return parseEnum(this.getAttribute('layout'), LAYOUTS, 'steps');
  }

  /** @returns {boolean} Whether a review screen follows the last question. */
  get hasReview() {
    return this.layout === 'steps' && this.list().length > 0 && this.feature('review');
  }

  /** Re-reads the questions after they changed: keeps the answers that still fit. */
  questionsChanged() {
    const list = this.list();
    this.answers = coerceValue(list, this.answers);
    this.problems.clear();
    this.index = Math.min(this.index, this.lastPosition());
    this.reached = Math.min(this.reached, this.lastPosition());
    this.sync();
    this.requestRender();
  }

  contentChanged() {
    this.parsed = null;
    if (this.isConnected && !this.questionList) this.questionsChanged();
  }

  /** @returns {number} The last position: the review screen, or the last question. */
  lastPosition() {
    const total = this.list().length;
    return Math.max(0, this.hasReview ? total : total - 1);
  }

  /**
   * @param {number} position
   * @returns {string} The id of the question there, or `review`.
   */
  idAt(position) {
    return this.list()[position]?.id ?? 'review';
  }

  // ---------------------------------------------------------------- form

  /** Updates the submitted value and the validity. */
  sync() {
    if (!this.internals) return;
    const name = this.getAttribute('name');
    this.internals.setFormValue(name ? JSON.stringify(this.answers) : null);
    const problem = firstProblem(this.list(), this.answers);
    if (!problem) this.internals.setValidity({});
    else {
      const flags = problem.problem.code === 'required' ? { valueMissing: true } : { customError: true }; // prettier-ignore
      this.internals.setValidity(flags, this.t('questionnaireIncomplete'));
    }
  }

  formResetCallback() {
    this.reset();
  }

  /** @param {unknown} state */
  formStateRestoreCallback(state) {
    if (typeof state !== 'string') return;
    try {
      this.value = JSON.parse(state);
    } catch {
      // A state this element did not write.
    }
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    const fieldset = this.root.querySelector('fieldset');
    const target = fieldset ? firstControl(fieldset) : this.root.querySelector('h2');
    target?.focus(options);
  }

  disconnectedCallback() {
    clearTimeout(this.advanceTimer);
    super.disconnectedCallback();
  }

  // ---------------------------------------------------------------- answers

  /**
   * Stores an answer. A number that is not one is kept as typed, so it can be reported.
   *
   * @param {Question} question
   * @param {unknown} raw
   * @returns {Answer}
   */
  store(question, raw) {
    let answer = coerceAnswer(question, raw);
    if (answer === null && question.type === 'number' && typeof raw === 'string' && raw.trim())
      answer = raw.trim().slice(0, 50);
    if (answer === null) delete this.answers[question.id];
    else this.answers[question.id] = answer;
    this.sync();
    return answer;
  }

  /**
   * @param {Question} question
   * @param {unknown} raw
   * @param {boolean} commit
   */
  answered(question, raw, commit) {
    const answer = this.store(question, raw);
    const empty = question.type === 'multiple' || question.type === 'tags' ? [] : '';
    const detail = { id: question.id, value: answer ?? empty };
    // An error shown for this step goes away as soon as the answer is right.
    if (this.problems.has(question.id)) this.showProblem(question);
    if (!commit) emit(this, EVENTS.INPUT, detail);
    else {
      emit(this, EVENTS.CHANGE, detail);
      this.maybeAdvance(question);
    }
  }

  /** @param {Question} question */
  maybeAdvance(question) {
    clearTimeout(this.advanceTimer);
    if (question.type !== 'single' || this.arrowed) return;
    if (this.layout !== 'steps' || !this.feature('auto-advance')) return;
    if (nextPosition(this.index, this.list().length, this.hasReview) < 0) return;
    if (this.list()[this.index] !== question) return;
    this.advanceTimer = setTimeout(() => {
      if (this.list()[this.index] === question && !validateAnswer(question, this.answers[question.id])) this.next(); // prettier-ignore
    }, ADVANCE_DELAY);
  }

  // ---------------------------------------------------------------- errors

  /**
   * @param {Question} question
   * @returns {string} What is wrong with its answer, in words; empty when nothing is.
   */
  describe(question) {
    const problem = validateAnswer(question, this.answers[question.id]);
    if (!problem) return '';
    if (problem.code === 'required')
      return this.t(question.type === 'multiple' ? 'questionnaireRequiredMany' : question.type === 'single' ? 'questionnaireRequiredOne' : 'questionnaireRequiredText'); // prettier-ignore
    return this.t(MESSAGES[problem.code], problem.params);
  }

  /**
   * Checks a question and shows or clears its error, in place.
   *
   * @param {Question} question
   * @param {boolean} [speak] - Announce the message.
   * @returns {boolean} Whether the answer is acceptable.
   */
  showProblem(question, speak = false) {
    const message = this.describe(question);
    if (message) this.problems.set(question.id, message);
    else this.problems.delete(question.id);
    const fieldset = [...this.root.querySelectorAll('fieldset')].find((f) => f.dataset.question === question.id); // prettier-ignore
    if (fieldset) paintError(fieldset, message, this.t);
    if (message && speak) this.announce(message);
    return !message;
  }

  /** Shows the first problem to a reader who submitted the form around the element. */
  revealProblem() {
    const first = firstProblem(this.list(), this.answers);
    if (!first) return;
    this.done = false;
    if (this.layout === 'steps' && this.index !== first.index) this.move(first.index);
    this.showAll();
  }

  /** Shows the error of every question on the page, or of the step, and focuses the first. */
  showAll() {
    const questions = this.layout === 'all' ? this.list() : [this.list()[this.index]];
    let focus = null;
    for (const question of questions) {
      if (question && !this.showProblem(question, !focus)) focus ??= question;
    }
    if (!focus) return;
    const fieldset = [...this.root.querySelectorAll('fieldset')].find((f) => f.dataset.question === focus.id); // prettier-ignore
    if (fieldset) firstControl(fieldset)?.focus();
  }

  // ---------------------------------------------------------------- navigation

  /**
   * Goes to a position and draws it.
   *
   * @param {number} to
   */
  move(to) {
    const from = this.index;
    clearTimeout(this.advanceTimer);
    this.index = to;
    this.reached = Math.max(this.reached, to);
    if (to >= this.list().length) this.fromReview = false;
    this.pendingFocus = 'title';
    this.render();
    emit(this, EVENTS.STEP, { from, to, id: this.idAt(to) });
    this.announce(this.stepText());
  }

  /** @returns {string} "Step 2 of 6", or "Review". */
  stepText() {
    const total = this.list().length;
    if (this.index >= total) return this.t('questionnaireReviewStep');
    return this.t('questionnaireStepOf', {
      current: formatNumber(this.index + 1, this.locale),
      total: formatNumber(total, this.locale),
    });
  }

  /**
   * Checks the current step and goes to the next one. On the last step, it submits.
   *
   * @returns {boolean} Whether it moved or submitted.
   */
  next() {
    const list = this.list();
    if (this.done || !list.length) return false;
    if (this.layout === 'all' || this.index >= list.length) return this.submit();
    if (!this.showProblem(list[this.index], true)) return false;
    const to = this.fromReview
      ? list.length
      : nextPosition(this.index, list.length, this.hasReview);
    if (to < 0) return this.submit();
    this.move(to);
    return true;
  }

  /** @returns {boolean} Whether it moved. */
  back() {
    if (this.done || this.layout !== 'steps' || this.index <= 0) return false;
    this.fromReview = false;
    this.move(this.index - 1);
    return true;
  }

  /**
   * @param {string | number} target - A question id, an index, or `review`.
   * @returns {boolean} Whether it moved.
   */
  goTo(target) {
    if (this.done || this.layout !== 'steps') return false;
    const list = this.list();
    const to = typeof target === 'number' ? target : list.findIndex((q) => q.id === target);
    const position = to < 0 && target === 'review' && this.hasReview ? list.length : to;
    if (!Number.isInteger(position) || position < 0 || position > this.lastPosition()) return false;
    if (position === this.index) return false;
    if (position > this.index && this.index < list.length && !this.showProblem(list[this.index], true)) return false; // prettier-ignore
    this.fromReview = false;
    this.move(position);
    return true;
  }

  /** Leaves the optional question of the step without an answer, and goes on. */
  skip() {
    const question = this.list()[this.index];
    if (!question || question.required) return;
    this.store(question, null);
    this.problems.delete(question.id);
    const to = this.fromReview ? this.list().length : nextPosition(this.index, this.list().length, this.hasReview); // prettier-ignore
    if (to < 0) this.submit();
    else this.move(to);
  }

  /** @param {number} index - A question to change, from the review screen. */
  edit(index) {
    this.move(index);
    this.fromReview = true;
  }

  /** Clears the answers and goes back to the first step. */
  reset() {
    clearTimeout(this.advanceTimer);
    const from = this.index;
    this.answers = {};
    this.problems.clear();
    this.index = 0;
    this.reached = 0;
    this.done = false;
    this.fromReview = false;
    this.pendingFocus = null;
    this.sync();
    this.render();
    if (from !== 0) emit(this, EVENTS.STEP, { from, to: 0, id: this.idAt(0) });
  }

  /**
   * Checks every answer. If they are all acceptable, fires `vt-submit`; otherwise goes to the
   * first one that is not.
   *
   * @returns {boolean} Whether the answers passed.
   */
  submit() {
    if (this.done || !this.list().length) return false;
    const first = firstProblem(this.list(), this.answers);
    if (first) {
      if (this.layout === 'steps' && this.index !== first.index) this.move(first.index);
      this.showAll();
      return false;
    }
    this.done = true;
    this.pendingFocus = 'done';
    this.sync();
    this.render();
    this.announce(this.t('questionnaireDone'));
    emit(this, EVENTS.SUBMIT, { value: this.value });
    return true;
  }

  // ---------------------------------------------------------------- render

  render() {
    super.render();
    this.afterRender();
  }

  /** Moves the focus where the last navigation sent it. */
  afterRender() {
    const kind = this.pendingFocus;
    this.pendingFocus = null;
    if (!kind) return;
    const heading = this.root.querySelector(kind === 'done' ? '.done h2' : 'h2');
    if (kind === 'title' || kind === 'done') /** @type {HTMLElement | null} */ (heading)?.focus({ preventScroll: false }); // prettier-ignore
  }

  /** @param {HTMLElement} frame */
  renderContent(frame) {
    const list = this.list();
    if (!this.questionList && this.parsed?.result.error) {
      frame.append(this.dataNotice({ error: 'json', message: this.parsed.result.error }));
      return;
    }
    const body = h('div', { class: 'q-body', attrs: { role: this.heading ? 'group' : null, 'aria-label': this.heading || null } }); // prettier-ignore
    frame.append(body);
    if (!list.length) {
      body.append(emptyView(this.t));
      return;
    }
    this.index = Math.min(this.index, this.lastPosition());
    if (this.done) body.append(this.doneView());
    else if (this.layout === 'all') this.drawPage(body, list);
    else this.drawStep(body, list);
    for (const question of list) if (this.problems.has(question.id)) this.showProblem(question);
  }

  /** @returns {import('./views.js').ViewContext} */
  context() {
    return {
      t: this.t,
      locale: this.locale,
      onInput: (question, raw) => this.answered(question, raw, false),
      onChange: (question, raw) => this.answered(question, raw, true),
      onEnter: () => this.next(),
      onArrow: () => {
        this.arrowed = true;
        setTimeout(() => (this.arrowed = false), 0);
      },
    };
  }

  /**
   * @param {HTMLElement} body
   * @param {Question[]} list
   */
  drawStep(body, list) {
    const t = this.t;
    const ctx = this.context();
    const progress = this.progressKind();
    if (progress) body.append(this.progress(list, progress));
    const question = list[this.index];
    const last = nextPosition(this.index, list.length, this.hasReview) < 0;
    if (question) {
      body.append(questionView(question, this.answers[question.id], ctx, { current: progress !== 'steps' })); // prettier-ignore
    } else {
      body.append(reviewView({ questions: list, summary: (q) => this.summary(q), t, onEdit: (i) => this.edit(i) })); // prettier-ignore
    }
    const text = !question || last ? t('questionnaireSubmit') : this.hasReview && this.index === list.length - 1 ? t('questionnaireReview') : t('questionnaireNext'); // prettier-ignore
    body.append(
      navView({
        back: this.index > 0,
        skip: Boolean(question) && !question.required && this.flag('allow-skip'),
        next: text,
        t,
        on: { back: () => this.back(), skip: () => this.skip(), next: () => this.next() },
      }),
    );
  }

  /**
   * @param {HTMLElement} body
   * @param {Question[]} list
   */
  drawPage(body, list) {
    const ctx = this.context();
    for (const question of list) body.append(questionView(question, this.answers[question.id], ctx, { current: false })); // prettier-ignore
    body.append(
      navView({
        back: false,
        skip: false,
        next: this.t('questionnaireSubmit'),
        t: this.t,
        on: { back: () => {}, skip: () => {}, next: () => this.submit() },
      }),
    );
  }

  /** @returns {HTMLElement} */
  doneView() {
    return h(
      'section',
      { class: 'step done', attrs: { 'aria-labelledby': 'done-title' } },
      h('h2', { class: 'q-title', text: this.t('questionnaireDone'), attrs: { id: 'done-title', tabindex: '-1' } }), // prettier-ignore
      h('div', { class: 'nav', part: 'nav' }, h('button', { class: 'btn-q ghost', text: this.t('questionnaireRestart'), attrs: { type: 'button' }, on: { click: () => this.reset() } })), // prettier-ignore
    );
  }

  /** @returns {'bar' | 'steps' | null} */
  progressKind() {
    if (this.layout !== 'steps') return null;
    const kind = parseEnum(this.getAttribute('progress'), PROGRESS, this.variant === 'full' ? 'steps' : 'bar'); // prettier-ignore
    return kind === 'none' ? null : kind;
  }

  /**
   * @param {Question[]} list
   * @param {'bar' | 'steps'} kind
   * @returns {HTMLElement}
   */
  progress(list, kind) {
    const steps = list.map((q, i) => ({
      label: q.short || q.label,
      done: !isEmpty(this.answers[q.id]) || (i < this.reached && !q.required),
      reachable: i <= this.reached,
    }));
    if (this.hasReview)
      steps.push({ label: this.t('questionnaireReviewStep'), done: false, reachable: this.reached >= list.length }); // prettier-ignore
    return progressView({
      kind,
      steps,
      index: this.index,
      text: this.stepText(),
      t: this.t,
      onGo: (i) => this.goTo(i),
    });
  }

  /**
   * An answer in words, for the review screen.
   *
   * @param {Question} question
   * @returns {string} Empty when there is none.
   */
  summary(question) {
    const answer = this.answers[question.id];
    if (isEmpty(answer)) return '';
    const label = (/** @type {string} */ value) => question.options.find((o) => o.value === value)?.label ?? value; // prettier-ignore
    if (Array.isArray(answer)) return answer.map(label).join(', ');
    if (typeof answer === 'number') return formatNumber(answer, this.locale);
    if (question.type === 'date' && validDate(String(answer))) {
      const [y, m, d] = String(answer).split('-').map(Number);
      return this.formatDate(Date.UTC(y, m - 1, d), { dateStyle: 'medium', timeZone: 'UTC' });
    }
    return label(String(answer));
  }
}
