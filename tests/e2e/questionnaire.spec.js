import { expect, test } from '@playwright/test';
import { STRICT, collectErrors } from './helpers.js';

const QUESTIONS = [
  {
    id: 'renderer',
    type: 'single',
    label: 'How do you render?',
    hint: 'Pick one.',
    required: true,
    options: [
      { value: 'csr', label: 'CSR', description: 'Client-side rendering.' },
      { value: 'ssr', label: 'SSR' },
      { value: 'ssg', label: 'SSG' },
    ],
  },
  {
    id: 'components',
    type: 'multiple',
    label: 'Which components?',
    required: true,
    min: 1,
    max: 2,
    options: [
      { value: 'code', label: 'Code blocks', group: 'Code' },
      { value: 'json', label: 'JSON', group: 'Code' },
      { value: 'field', label: 'Fields', group: 'Forms' },
    ],
  },
  {
    id: 'name',
    type: 'text',
    label: 'Project name',
    required: true,
    pattern: '^[a-z][a-z0-9-]{2,29}$',
  },
  { id: 'email', type: 'email', label: 'Email' },
  { id: 'tags', type: 'tags', label: 'Tags' },
  { id: 'start', type: 'date', label: 'Start date' },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} [attrs]
 * @param {boolean} [inForm]
 */
async function place(page, attrs = {}, inForm = false) {
  await page.evaluate(
    ({ attrs, questions, inForm }) => {
      const el = document.createElement('vt-questionnaire');
      el.id = 'el';
      el.setAttribute('lang-ui', 'en');
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      /** @type {any} */ (el).questions = questions;
      /** @type {any} */ (window).__events = [];
      for (const type of ['vt-input', 'vt-change', 'vt-step', 'vt-submit'])
        el.addEventListener(type, (event) =>
          /** @type {any} */ (window).__events.push({
            type,
            detail: /** @type {any} */ (event).detail,
          }),
        );
      const root = document.getElementById('root');
      if (!inForm) {
        root?.replaceChildren(el);
        return;
      }
      const form = document.createElement('form');
      form.id = 'form';
      form.append(el);
      const send = document.createElement('button');
      send.id = 'send';
      send.textContent = 'Send';
      form.append(send);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        /** @type {any} */ (window).__sent = Object.fromEntries(new FormData(form));
      });
      root?.replaceChildren(form);
    },
    { attrs, questions: QUESTIONS, inForm },
  );
  await expect(page.locator('#el h2').first()).toBeVisible();
}

const events = (/** @type {import('@playwright/test').Page} */ page) =>
  page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('<vt-questionnaire>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('walks through the steps with the keyboard, reviews and submits', async ({ page }) => {
    await place(page, { variant: 'full' });
    const title = page.locator('#el h2');
    await expect(title).toHaveText('How do you render?');
    await expect(page.locator('#el [part~="progress"] .progress-text')).toHaveText('Step 1 of 6');
    await expect(page.locator('#el fieldset legend h2')).toHaveText('How do you render?');

    // Radio group: Tab into it, arrow keys choose and do not advance on their own.
    await page.keyboard.press('Tab');
    await expect(page.locator('#el input[value="csr"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#el input[value="ssr"]')).toBeChecked();
    await page.waitForTimeout(600);
    await expect(title).toHaveText('How do you render?');

    // A choice by Space moves on by itself after the pause, and the focus goes to the heading.
    await page.locator('#el input[value="ssg"]').check();
    await expect(title).toHaveText('Which components?');
    await expect(title).toBeFocused();
    await expect(page.locator('#el [aria-live="polite"]').first()).toHaveText('Step 2 of 6');
    await expect(page.locator('#el [aria-current="step"]')).toContainText('Which components?');

    // Check boxes: arrow keys move the focus; Enter goes on.
    await page.locator('#el input[value="code"]').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#el input[value="json"]')).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Project name');

    // A text answer that does not match its pattern is reported and blocks the step.
    const name = page.locator('#el vt-field input');
    await name.fill('Not Valid');
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Project name');
    const error = page.locator('#el [data-error]');
    await expect(error).toContainText('does not have the expected format');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#el fieldset')).toHaveAttribute('aria-describedby', /error/);

    await name.fill('my-app');
    await expect(error).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Email');

    // Optional questions can be skipped.
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(title).toHaveText('Tags');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(title).toHaveText('Start date');
    await page.getByRole('button', { name: 'Skip' }).click();

    // Review: every answer, with an Edit button.
    await expect(title).toHaveText('Review your answers');
    await expect(page.locator('#el [part~="review"]')).toContainText('SSG');
    await expect(page.locator('#el [part~="review"]')).toContainText('Code blocks');
    await expect(page.locator('#el [part~="review"]')).toContainText('my-app');
    await expect(page.locator('#el [part~="review"] .skipped')).toHaveCount(3);
    await page.getByRole('button', { name: 'Edit: Project name' }).click();
    await expect(title).toHaveText('Project name');
    await name.fill('other-app');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(title).toHaveText('Review your answers');

    await page.getByRole('button', { name: 'Submit' }).click();
    const submitted = (await events(page)).find((e) => e.type === 'vt-submit');
    expect(submitted.detail.value).toEqual({
      renderer: 'ssg',
      components: ['code', 'json'],
      name: 'other-app',
    });
    await expect(page.locator('#el .done h2')).toBeFocused();
    const steps = (await events(page)).filter((e) => e.type === 'vt-step');
    expect(steps[0].detail).toEqual({ from: 0, to: 1, id: 'components' });
  });

  test('shows an error for a required choice, linked to the group, and not by colour alone', async ({
    page,
  }) => {
    await place(page);
    await page.getByRole('button', { name: 'Next' }).click();
    const error = page.locator('#el [data-error]');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Choose an option.');
    // An icon and a screen-reader prefix accompany the text.
    await expect(error.locator('svg')).toHaveCount(1);
    await expect(error.locator('.sr-only')).toHaveText('Error:');
    const group = page.locator('#el [role="radiogroup"]');
    await expect(group).toHaveAttribute('aria-invalid', 'true');
    const id = await error.getAttribute('id');
    expect(await group.getAttribute('aria-describedby')).toContain(id);
    await page.locator('#el input[value="csr"]').check();
    await expect(error).toBeHidden();
  });

  test('Back returns without checking, and the step list goes to reached steps', async ({
    page,
  }) => {
    await place(page, { variant: 'full', 'auto-advance': 'false' });
    await page.locator('#el input[value="csr"]').check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#el h2')).toHaveText('Which components?');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#el h2')).toHaveText('How do you render?');
    await page.getByRole('button', { name: 'Step 2: Which components?' }).click();
    await expect(page.locator('#el h2')).toHaveText('Which components?');
    // Steps not reached yet are not buttons.
    await expect(page.getByRole('button', { name: 'Step 4: Email' })).toHaveCount(0);
  });

  test('a form with a questionnaire submits the answers as JSON, and blocks while incomplete', async ({
    page,
  }) => {
    await place(page, { name: 'setup', variant: 'simple' }, true);
    await page.locator('#send').click();
    // Incomplete: the form did not submit and the first question shows its error.
    expect(await page.evaluate(() => /** @type {any} */ (window).__sent)).toBeUndefined();
    await expect(page.locator('#el [data-error]')).toContainText('Choose an option.');

    await page.evaluate(() => {
      /** @type {any} */ (document.getElementById('el')).value = {
        renderer: 'csr',
        components: ['field'],
        name: 'abc',
      };
    });
    await page.locator('#send').click();
    const sent = await page.evaluate(() => /** @type {any} */ (window).__sent);
    expect(JSON.parse(sent.setup)).toEqual({ renderer: 'csr', components: ['field'], name: 'abc' });
  });

  test('the all layout shows every question on one page and checks them all', async ({ page }) => {
    await place(page, { layout: 'all' });
    await expect(page.locator('#el fieldset')).toHaveCount(6);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#el [data-error]:visible')).toHaveCount(3);
    expect((await events(page)).some((e) => e.type === 'vt-submit')).toBe(false);
  });

  test('speaks French', async ({ page }) => {
    await place(page, { 'lang-ui': 'fr' });
    await expect(page.locator('#el [part~="progress"] .progress-text')).toHaveText('Étape 1 sur 6');
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeVisible();
  });

  /**
   * Answers the first steps from code and goes to a question.
   *
   * @param {import('@playwright/test').Page} page
   * @param {string} id
   */
  async function arrive(page, id) {
    await page.evaluate((id) => {
      const el = /** @type {any} */ (document.getElementById('el'));
      el.value = {
        renderer: 'csr',
        components: ['code'],
        name: id === 'name' ? undefined : 'my-app',
      };
      el.goTo(id);
    }, id);
  }

  const changes = async (/** @type {import('@playwright/test').Page} */ page) =>
    (await events(page)).filter((e) => e.type === 'vt-change');

  test('an answer that fails its check is not in value and fires no vt-change', async ({
    page,
  }) => {
    await place(page, { variant: 'simple' });
    await arrive(page, 'name');
    const name = page.locator('#el vt-field input');
    await name.fill('Bad Name');
    await name.blur();
    await expect(page.locator('#el [data-error]')).toBeHidden();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#el [data-error]')).toContainText(
      'does not have the expected format',
    );
    expect(await changes(page)).toEqual([]);
    const typed = (await events(page)).filter((e) => e.type === 'vt-input');
    expect(typed.at(-1).detail).toEqual({ id: 'name', value: 'Bad Name' });
    expect(
      await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).value),
    ).toEqual({
      renderer: 'csr',
      components: ['code'],
    });
    // The control keeps what was typed, so it can be corrected.
    await expect(name).toHaveValue('Bad Name');

    await name.fill('good-name');
    await name.blur();
    expect((await changes(page)).at(-1).detail).toEqual({ id: 'name', value: 'good-name' });
    // A valid answer that becomes invalid is taken out of value.
    await name.fill('Bad Again');
    await name.blur();
    expect((await changes(page)).at(-1).detail).toEqual({ id: 'name', value: '' });
    expect(
      await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).value.name),
    ).toBeUndefined();
  });

  test('a date that cannot be read fires no vt-change', async ({ page }) => {
    await place(page, { variant: 'full' });
    await arrive(page, 'start');
    const input = page.locator('#el vt-date-picker input');
    await input.fill('01152027');
    await input.blur();
    await expect(page.locator('#el vt-date-picker')).toContainText('Enter a date such as');
    expect(await changes(page)).toEqual([]);
    // Optional, but not left behind with text nobody can read.
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.locator('#el h2')).toHaveText('Start date');
    await expect(page.locator('#el [data-error]')).toContainText('Enter a date');
    await input.fill('2027-01-15');
    await input.blur();
    expect((await changes(page)).map((e) => e.detail)).toEqual([
      { id: 'start', value: '2027-01-15' },
    ]);
  });

  test('Enter goes on from tags only when the tag editor did not use it', async ({ page }) => {
    await place(page, { variant: 'full' });
    await arrive(page, 'tags');
    const input = page.locator('#el vt-tags input');
    await input.focus();
    await page.keyboard.type('alpha');
    await page.keyboard.press('Enter');
    // The text became a tag: still on the step.
    await expect(page.locator('#el h2')).toHaveText('Tags');
    await expect(page.locator('#el vt-tags')).toContainText('alpha');
    await page.keyboard.press('Enter');
    await expect(page.locator('#el h2')).toHaveText('Start date');
    expect((await changes(page)).map((e) => e.detail)).toEqual([{ id: 'tags', value: ['alpha'] }]);
  });

  test('Enter goes on from a date once the typed date is valid and the calendar is closed', async ({
    page,
  }) => {
    await place(page, { variant: 'full' });
    await arrive(page, 'start');
    const input = page.locator('#el vt-date-picker input');
    // Not readable: the step stays, with the error.
    await input.fill('01152027');
    await page.keyboard.press('Enter');
    await expect(page.locator('#el h2')).toHaveText('Start date');
    await expect(page.locator('#el [data-error]')).toContainText('Enter a date');
    // Readable: Enter commits it and goes on, like a text answer.
    await input.fill('2027-01-15');
    await page.keyboard.press('Enter');
    await expect(page.locator('#el h2')).toHaveText('Review your answers');
    expect((await changes(page)).map((e) => e.detail)).toEqual([
      { id: 'start', value: '2027-01-15' },
    ]);
  });

  test('Enter in the open calendar chooses a day and does not go on', async ({ page }) => {
    await place(page, { variant: 'full' });
    await arrive(page, 'start');
    await page.locator('#el vt-date-picker [data-focus-key="toggle"]').click();
    await expect(page.locator('#el vt-date-picker [data-day]:focus')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#el h2')).toHaveText('Start date');
    expect(await changes(page)).toHaveLength(1);
  });

  test('goTo() moves the focus only when it is already inside the questionnaire', async ({
    page,
  }) => {
    await place(page);
    await page.evaluate(() => {
      const el = /** @type {any} */ (document.getElementById('el'));
      el.value = { renderer: 'csr', components: ['code'] };
      /** @type {any} */ (document.activeElement)?.blur();
      el.goTo('name');
    });
    await expect(page.locator('#el h2')).toHaveText('Project name');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

    await page.locator('#el vt-field input').focus();
    await page.evaluate(() => /** @type {any} */ (document.getElementById('el')).goTo('renderer'));
    await expect(page.locator('#el h2')).toHaveText('How do you render?');
    await expect(page.locator('#el h2')).toBeFocused();
  });
});
