// @ts-check
/**
 * The pieces `<vt-questionnaire>` draws: a step (a fieldset with its question and controls),
 * the review screen, the progress and the buttons. They are built from plain data and report
 * through the callbacks of a context, so the element only has to keep the state.
 *
 * @module components/questionnaire/views
 */
import { h, uid } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { isEmpty } from './questions.js';

/** @typedef {import('./questions.js').Question} Question */
/** @typedef {import('./questions.js').Answer} Answer */
/** @typedef {import('./questions.js').Option} Option */
/** @typedef {import('../../core/ui.js').Translate} Translate */

/**
 * What the views need from the element.
 *
 * @typedef {object} ViewContext
 * @property {Translate} t
 * @property {(question: Question, raw: unknown) => void} onInput - An answer is being edited.
 * @property {(question: Question, raw: unknown) => void} onChange - An answer was committed.
 * @property {() => void} onEnter - Enter was pressed in a control.
 * @property {() => void} onArrow - An arrow key moved the choice (it must not advance).
 * @property {string} locale
 */

/**
 * Creates a custom element, which `h()` does not type.
 *
 * @param {string} tag
 * @param {import('../../core/dom.js').ElementProps} props
 * @returns {any}
 */
function custom(tag, props) {
  return h(/** @type {any} */ (tag), props);
}

/**
 * @param {string} id
 * @returns {HTMLElement} The line an error is written in, empty and hidden until then.
 */
function errorLine(id) {
  return h('p', {
    class: 'q-error',
    part: 'error',
    attrs: { id, hidden: true, 'data-error': '' },
  });
}

/**
 * @param {Option[]} options
 * @returns {{ name: string, options: Option[] }[]} Options in runs of the same group.
 */
function groupOptions(options) {
  /** @type {{ name: string, options: Option[] }[]} */
  const groups = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === option.group) last.options.push(option);
    else groups.push({ name: option.group, options: [option] });
  }
  return groups;
}

/**
 * @param {Question} question
 * @param {Option} option
 * @param {boolean} checked
 * @param {string} name
 * @returns {HTMLElement}
 */
function optionView(question, option, checked, name) {
  const descriptionId = option.description ? uid('desc') : null;
  const input = h('input', {
    attrs: {
      type: question.type === 'multiple' ? 'checkbox' : 'radio',
      name,
      value: option.value,
      checked,
      'aria-describedby': descriptionId,
    },
  });
  return h(
    'label',
    { class: 'option', part: 'option' },
    input,
    h(
      'span',
      { class: 'option-text' },
      h('span', { class: 'option-label', text: option.label }),
      option.description
        ? h('span', {
            class: 'option-desc',
            text: option.description,
            attrs: { id: descriptionId },
          })
        : null,
    ),
  );
}

/**
 * Moves the focus between check boxes with the arrow keys (radio buttons do it natively).
 *
 * @param {KeyboardEvent} event
 * @param {HTMLElement} wrap
 */
function arrowFocus(event, wrap) {
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
  const boxes = /** @type {HTMLInputElement[]} */ ([...wrap.querySelectorAll('input')]);
  const at = boxes.indexOf(/** @type {HTMLInputElement} */ (event.target));
  if (at < 0) return;
  event.preventDefault();
  const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
  boxes[(at + step + boxes.length) % boxes.length].focus();
}

/**
 * A group of radio buttons (`single`) or check boxes (`multiple`).
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @param {{ heading: string, describedBy: string }} ids
 * @returns {HTMLElement}
 */
function choiceControl(question, answer, ctx, ids) {
  const multiple = question.type === 'multiple';
  const chosen = new Set(Array.isArray(answer) ? answer : [answer]);
  const name = uid('choice');
  const wrap = h('div', {
    class: 'options',
    attrs: {
      role: multiple ? 'group' : 'radiogroup',
      'aria-labelledby': ids.heading,
      'aria-describedby': ids.describedBy,
      'aria-required': !multiple && question.required ? 'true' : null,
    },
  });
  for (const group of groupOptions(question.options)) {
    const headingId = group.name ? uid('group') : null;
    const section = h('div', {
      class: 'option-group',
      attrs: { role: group.name ? 'group' : null, 'aria-labelledby': headingId },
    });
    if (group.name) section.append(h('p', { class: 'option-group-name', text: group.name, attrs: { id: headingId } })); // prettier-ignore
    for (const option of group.options)
      section.append(optionView(question, option, chosen.has(option.value), name));
    wrap.append(section);
  }
  wrap.addEventListener('change', () => {
    const picked = /** @type {HTMLInputElement[]} */ ([...wrap.querySelectorAll('input:checked')]);
    const value = multiple ? picked.map((i) => i.value) : (picked[0]?.value ?? '');
    ctx.onInput(question, value);
    ctx.onChange(question, value);
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) ctx.onArrow();
    if (multiple) arrowFocus(event, wrap);
    if (event.key === 'Enter') {
      event.preventDefault();
      ctx.onEnter();
    }
  });
  return wrap;
}

/**
 * A text, text area or email answer in a `<vt-field>`; a number is typed as text and read by
 * the questionnaire, so the field does not add messages of its own.
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @returns {HTMLElement}
 */
function fieldControl(question, answer, ctx) {
  const area = question.type === 'textarea';
  const field = custom('vt-field', {
    class: 'q-field',
    attrs: {
      type: area ? 'textarea' : 'text',
      label: question.label,
      value: isEmpty(answer) ? null : String(answer),
      placeholder: question.placeholder || null,
      inputmode:
        question.type === 'email' ? 'email' : question.type === 'number' ? 'decimal' : null,
      autocomplete: question.type === 'email' ? 'email' : null,
      maxlength: question.type === 'number' ? null : question.maxLength,
    },
  });
  field.addEventListener('vt-input', (/** @type {Event} */ event) => {
    event.stopPropagation();
    ctx.onInput(question, field.value);
  });
  field.addEventListener('vt-change', (/** @type {Event} */ event) => {
    event.stopPropagation();
    ctx.onChange(question, field.value);
  });
  if (!area)
    field.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      ctx.onEnter();
    });
  return field;
}

/**
 * Tags in a `<vt-tags>` editor.
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @returns {HTMLElement}
 */
function tagsControl(question, answer, ctx) {
  const tags = custom('vt-tags', {
    class: 'q-tags',
    attrs: { mode: 'edit', 'allow-create': true, label: question.label, placeholder: question.placeholder || null }, // prettier-ignore
  });
  tags.value = Array.isArray(answer) ? answer : [];
  tags.addEventListener('vt-change', (/** @type {Event} */ event) => {
    event.stopPropagation();
    ctx.onInput(question, tags.value);
    ctx.onChange(question, tags.value);
  });
  for (const name of ['vt-input', 'vt-tag-add', 'vt-tag-remove'])
    tags.addEventListener(name, (/** @type {Event} */ event) => event.stopPropagation());
  return tags;
}

/**
 * A date in a `<vt-date-picker>`.
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @returns {HTMLElement}
 */
function dateControl(question, answer, ctx) {
  const picker = custom('vt-date-picker', {
    class: 'q-date',
    attrs: {
      label: question.label,
      value: typeof answer === 'string' ? answer : null,
      min: question.minDate || null,
      max: question.maxDate || null,
      clearable: !question.required,
    },
  });
  picker.addEventListener('vt-input', (/** @type {Event} */ event) => {
    event.stopPropagation();
    ctx.onInput(question, picker.value);
  });
  picker.addEventListener('vt-change', (/** @type {Event} */ event) => {
    event.stopPropagation();
    ctx.onChange(question, picker.value);
  });
  return picker;
}

/**
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @param {{ heading: string, describedBy: string }} ids
 * @returns {HTMLElement}
 */
function controlFor(question, answer, ctx, ids) {
  switch (question.type) {
    case 'single':
    case 'multiple':
      return choiceControl(question, answer, ctx, ids);
    case 'tags':
      return tagsControl(question, answer, ctx);
    case 'date':
      return dateControl(question, answer, ctx);
    default:
      return fieldControl(question, answer, ctx);
  }
}

/**
 * One question: a fieldset whose legend is the question, then its hint, its controls and
 * the line an error is written in.
 *
 * @param {Question} question
 * @param {Answer | undefined} answer
 * @param {ViewContext} ctx
 * @param {{ current: boolean }} options - `current`: the step shown (`aria-current="step"`).
 * @returns {HTMLFieldSetElement}
 */
export function questionView(question, answer, ctx, { current }) {
  const base = uid('q');
  const ids = { heading: `${base}-title`, hint: `${base}-hint`, error: `${base}-error` };
  const describedBy = [question.hint ? ids.hint : '', ids.error].filter(Boolean).join(' ');
  const mark = ctx.t(question.required ? 'questionnaireRequired' : 'questionnaireOptional');
  const fieldset = h(
    'fieldset',
    {
      class: 'step',
      part: 'step',
      attrs: { 'data-question': question.id, 'aria-current': current ? 'step' : null, 'aria-describedby': describedBy }, // prettier-ignore
    },
    h(
      'legend',
      { class: 'q-legend', part: 'question' },
      h('h2', { class: 'q-title', text: question.label, attrs: { id: ids.heading, tabindex: '-1' } }), // prettier-ignore
      h('span', { class: 'q-mark', text: mark, attrs: { 'data-required': question.required ? '' : null } }), // prettier-ignore
    ),
    question.hint ? h('p', { class: 'q-hint', part: 'hint', text: question.hint, attrs: { id: ids.hint } }) : null, // prettier-ignore
    controlFor(question, answer, ctx, { heading: ids.heading, describedBy }),
    errorLine(ids.error),
  );
  return fieldset;
}

/**
 * Shows or clears the error of a step without drawing it again: the error line, and
 * `aria-invalid` on the controls (a `<vt-field>` gets the message too, so its input is
 * described by it).
 *
 * @param {Element} fieldset
 * @param {string} message - Empty to clear.
 * @param {Translate} t
 */
export function paintError(fieldset, message, t) {
  const line = /** @type {HTMLElement | null} */ (fieldset.querySelector('[data-error]'));
  if (!line) return;
  line.replaceChildren();
  line.hidden = !message;
  if (message)
    line.append(
      icon('alert'),
      h('span', { class: 'sr-only', text: t('questionnaireErrorPrefix') }),
      h('span', { text: message }),
    );
  fieldset.toggleAttribute('data-invalid', Boolean(message));
  for (const input of fieldset.querySelectorAll('.options'))
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  for (const field of fieldset.querySelectorAll('vt-field')) {
    const f = /** @type {any} */ (field);
    if (typeof f.setCustomValidity === 'function') f.setCustomValidity(message);
  }
}

/**
 * Where the focus goes to answer a step.
 *
 * @param {Element} fieldset
 * @returns {HTMLElement | null}
 */
export function firstControl(fieldset) {
  return /** @type {HTMLElement | null} */ (
    fieldset.querySelector('input, vt-field, vt-tags, vt-date-picker')
  );
}

/**
 * "Step 2 of 6" and a bar, or the list of steps.
 *
 * @param {object} options
 * @param {'bar' | 'steps'} options.kind
 * @param {{ label: string, done: boolean, reachable: boolean }[]} options.steps - One per
 *   question, and the review screen last when there is one.
 * @param {number} options.index - The current position.
 * @param {string} options.text - "Step 2 of 6", or "Review".
 * @param {Translate} options.t
 * @param {(index: number) => void} options.onGo
 * @returns {HTMLElement}
 */
export function progressView({ kind, steps, index, text, t, onGo }) {
  if (kind === 'bar') {
    const bar = h('div', { class: 'bar', attrs: { role: 'progressbar', 'aria-label': t('questionnaireProgress'), 'aria-valuemin': '1', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(index + 1), 'aria-valuetext': text } }, h('span', { class: 'bar-fill' })); // prettier-ignore
    bar.style.setProperty('--_ratio', String((index + 1) / Math.max(1, steps.length)));
    return h('div', { class: 'progress', part: 'progress' }, h('p', { class: 'progress-text', text }), bar); // prettier-ignore
  }
  const items = steps.map((step, i) => {
    const current = i === index;
    const inner = [
      h('span', { class: 'mark', attrs: { 'aria-hidden': 'true' } }, step.done && !current ? icon('check') : String(i + 1)), // prettier-ignore
      h('span', { class: 'step-name', text: step.label }),
    ];
    const label = t('questionnaireStepLabel', { current: i + 1, label: step.label });
    return h(
      'li',
      { class: `progress-item${current ? ' current' : ''}${step.done ? ' done' : ''}`, attrs: { 'aria-current': current ? 'step' : null } }, // prettier-ignore
      step.reachable && !current
        ? h('button', { class: 'progress-link', attrs: { type: 'button', 'aria-label': label }, on: { click: () => onGo(i) } }, ...inner) // prettier-ignore
        : h('span', { class: 'progress-link', attrs: { 'aria-label': current ? label : null } }, ...inner), // prettier-ignore
    );
  });
  return h(
    'div',
    { class: 'progress', part: 'progress' },
    h('p', { class: 'progress-text', text }),
    h(
      'ol',
      { class: 'progress-steps', attrs: { 'aria-label': t('questionnaireSteps') } },
      ...items,
    ),
  );
}

/**
 * The buttons under a step.
 *
 * @param {object} options
 * @param {boolean} options.back
 * @param {boolean} options.skip
 * @param {string} options.next - Text of the main button.
 * @param {Translate} options.t
 * @param {{ back(): void, skip(): void, next(): void }} options.on
 * @returns {HTMLElement}
 */
export function navView({ back, skip, next, t, on }) {
  const button = (/** @type {string} */ key, /** @type {string} */ text, /** @type {() => void} */ click, /** @type {string} */ kind) => // prettier-ignore
    h('button', { class: `btn-q ${kind}`, text, attrs: { type: 'button', 'data-focus-key': key }, on: { click } }); // prettier-ignore
  return h(
    'div',
    { class: 'nav', part: 'nav' },
    back ? button('back', t('questionnaireBack'), on.back, 'secondary') : h('span'),
    h(
      'span',
      { class: 'nav-end' },
      skip ? button('skip', t('questionnaireSkip'), on.skip, 'ghost') : null,
      button('next', next, on.next, 'primary'),
    ),
  );
}

/**
 * The review screen: every answer, with an Edit button that goes back to its step.
 *
 * @param {object} options
 * @param {Question[]} options.questions
 * @param {(question: Question) => string} options.summary - An answer in words; empty for none.
 * @param {Translate} options.t
 * @param {(index: number) => void} options.onEdit
 * @returns {HTMLElement}
 */
export function reviewView({ questions, summary, t, onEdit }) {
  const id = uid('review');
  const rows = questions.map((question, index) => {
    const text = summary(question);
    return h(
      'div',
      { class: 'review-row' },
      h('dt', { class: 'review-q', text: question.label }),
      h('dd', {
        class: `review-a${text ? '' : ' skipped'}`,
        text: text || t('questionnaireSkipped'),
      }),
      h(
        'dd',
        { class: 'review-edit' },
        h(
          'button',
          { class: 'btn-q ghost', attrs: { type: 'button', 'aria-label': t('questionnaireEditAnswer', { label: question.label }) }, on: { click: () => onEdit(index) } }, // prettier-ignore
          t('questionnaireEdit'),
        ),
      ),
    );
  });
  return h(
    'section',
    { class: 'step review', part: 'review', attrs: { 'aria-labelledby': id } },
    h('h2', {
      class: 'q-title',
      text: t('questionnaireReviewTitle'),
      attrs: { id, tabindex: '-1' },
    }),
    h('dl', { class: 'review-list' }, ...rows),
    errorLine(`${id}-error`),
  );
}
