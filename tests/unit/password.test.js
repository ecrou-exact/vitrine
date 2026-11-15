// @ts-check
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  breachCount,
  checkRules,
  estimate,
  generatePassword,
  sha1Hex,
  userWords,
} from '../../src/components/password/strength.js';
import { VtPassword, humanTime } from '../../src/components/password/vt-password.js';
import { translator } from '../../src/core/i18n.js';

if (!customElements.get('vt-password')) customElements.define('vt-password', VtPassword);

/**
 * @param {Record<string, string>} attributes
 * @returns {Promise<VtPassword>}
 */
async function mount(attributes = {}) {
  const el = /** @type {VtPassword} */ (document.createElement('vt-password'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

/**
 * @param {VtPassword} el
 * @param {string} text
 * @param {string} [id]
 */
function type(el, text, id = el.ids.control) {
  const input = /** @type {HTMLInputElement} */ (el.root.getElementById(id));
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('password strength', () => {
  it('finds common passwords, words with leet, reversed words and keyboard runs', () => {
    expect(estimate('password')).toMatchObject({ score: 0, warning: 'pwWarnCommon' });
    expect(estimate('P@ssw0rd!').sequence[0]).toMatchObject({ kind: 'dictionary', leet: true, caps: 'first' }); // prettier-ignore
    expect(estimate('P@ssw0rd!').suggestions).toContain('pwSuggestLeet');
    expect(estimate('drowssap').sequence[0]).toMatchObject({ kind: 'dictionary', reversed: true }); // prettier-ignore
    expect(estimate('zxcvbnm,./')).toMatchObject({ score: 0, warning: 'pwWarnKeyboard' });
    expect(estimate('azertyuiop').warning).toBe('pwWarnKeyboard');
  });

  it('finds repeats, sequences, dates and the user name', () => {
    expect(estimate('aaaaaaaaaa').warning).toBe('pwWarnRepeat');
    expect(estimate('abcabcabc').sequence).toEqual([expect.objectContaining({ kind: 'repeat', token: 'abcabcabc' })]); // prettier-ignore
    expect(estimate('xQ!mnopqrs').sequence.map((m) => m.kind)).toContain('sequence');
    expect(estimate('01/05/1990').warning).toBe('pwWarnDate');
    const named = estimate('Jean.Dupont75', userWords('Jean Dupont <jean.dupont@example.com>'));
    expect(named.warning).toBe('pwWarnUser');
    expect(named.sequence.filter((m) => m.kind === 'user').map((m) => m.token)).toEqual(['Jean', 'Dupont']); // prettier-ignore
  });

  it('scores random passwords high and gives the time of each attack', () => {
    const strong = estimate('kL9#mQ2$vX7!nB4@');
    expect(strong.score).toBe(4);
    expect(strong.warning).toBeNull();
    expect(strong.classes).toEqual({ lower: true, upper: true, digit: true, symbol: true, other: false }); // prettier-ignore
    expect(strong.seconds.offlineFast).toBeLessThan(strong.seconds.offlineSlow);
    expect(strong.seconds.offlineSlow).toBeGreaterThan(3e9);
    expect(estimate('').score).toBe(0);
    // Characters outside the BMP count once.
    expect(estimate('🔑🔑🔑').length).toBe(3);
  });

  it('checks the rules asked', () => {
    const rules = { minLength: 10, maxLength: 64, require: ['upper', 'digit'], minClasses: 3, minScore: 3, noUser: true }; // prettier-ignore
    const text = 'jeanpassword';
    const result = checkRules(text, rules, estimate(text, ['jean']), ['jean']);
    expect(Object.fromEntries(result.map((r) => [r.id, r.ok]))).toEqual({ length: true, upper: false, digit: false, classes: false, user: false, score: false }); // prettier-ignore
  });

  it('generates passwords with every class, without ambiguous characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePassword({ length: 12, avoidAmbiguous: true });
      expect([...password]).toHaveLength(12);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password).not.toMatch(/[Il1O0o|]/);
    }
    expect(generatePassword({ length: 30, classes: ['digit'] })).toMatch(/^\d{30}$/);
  });

  it('asks about breaches with only five characters of the hash, padded', async () => {
    const hash = await sha1Hex('password');
    expect(hash).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
    /** @type {[string, RequestInit][]} */
    const calls = [];
    const fake = /** @type {typeof fetch} */ (
      async (url, init) => {
        calls.push([String(url), /** @type {RequestInit} */ (init)]);
        return new Response(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${hash.slice(5)}:9659365\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`); // prettier-ignore
      }
    );
    expect(await breachCount('password', { fetch: fake })).toBe(9659365);
    expect(calls[0][0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(calls[0][1]).toMatchObject({ headers: { 'Add-Padding': 'true' }, credentials: 'omit', referrerPolicy: 'no-referrer' }); // prettier-ignore
    expect(await breachCount('other', { fetch: fake })).toBe(0);
  });

  it('says durations in words', () => {
    const t = translator('en');
    expect(humanTime(0.2, t, 'en')).toBe('an instant');
    expect(humanTime(90, t, 'en')).toBe('2 minutes');
    expect(humanTime(86400 * 3, t, 'en')).toBe('3 days');
    expect(humanTime(86400 * 365 * 5, t, 'en')).toBe('5 years');
    expect(humanTime(1e12, t, 'en')).toBe('centuries');
  });
});

describe('<vt-password>', () => {
  it('shows the meter, advice and rules while typing, without the password in events', async () => {
    const el = await mount({ require: 'upper,digit', 'user-inputs': 'alice@example.com' });
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-input', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    type(el, 'alice2024');
    const meter = /** @type {HTMLElement} */ (el.root.querySelector('[role="meter"]'));
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(el.root.querySelector('.pw-label')?.textContent).toBe('Very weak');
    expect(el.root.querySelector('.pw-warning')?.textContent).toBe('It contains your name or email.'); // prettier-ignore
    const rules = [...el.root.querySelectorAll('.pw-rule')].map((li) => [/** @type {HTMLElement} */ (li).dataset.rule, li.classList.contains('ok')]); // prettier-ignore
    expect(rules).toEqual([['length', true], ['upper', false], ['digit', true], ['user', false], ['score', false]]); // prettier-ignore
    expect(seen.at(-1)).toEqual({ score: 0, valid: false, length: 9 });
    expect(JSON.stringify(seen)).not.toContain('alice2024');
    type(el, 'Qv7#pLm2!xR9wZ');
    expect(el.root.querySelector('.pw-label')?.textContent).toBe('Very strong');
    expect(el.valid).toBe(true);
    // The password is never written to an attribute.
    expect(el.outerHTML).not.toContain('Qv7#');
  });

  it('says what is wrong, in order', async () => {
    const el = await mount({ required: '', confirm: '', 'min-score': '3' });
    expect(el.check().message).toBe('Enter a password.');
    type(el, 'short');
    expect(el.check()).toMatchObject({ flags: { tooShort: true }, message: 'Use at least 8 characters.' }); // prettier-ignore
    type(el, 'football123');
    expect(el.check().message).toBe('Choose a stronger password.');
    type(el, 'Qv7#pLm2!xR9wZ');
    expect(el.check()).toMatchObject({ confirm: true, message: 'Confirm the password.' });
    type(el, 'Qv7#pLm2!xR9w', el.ids.confirm);
    expect(el.check().message).toBe('The two passwords are not the same.');
    type(el, 'Qv7#pLm2!xR9wZ', el.ids.confirm);
    expect(el.valid).toBe(true);
    expect(el.root.querySelector('.pw-match')?.textContent).toBe('Passwords match');
  });

  it('signs in without meter or rules, with the right autocomplete', async () => {
    const el = await mount({ mode: 'current', required: '' });
    const input = /** @type {HTMLInputElement} */ (el.root.getElementById(el.ids.control));
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    expect(el.root.querySelector('.pw-meter, .pw-rules, [aria-label="Generate a strong password"]')).toBeNull(); // prettier-ignore
    type(el, 'abc');
    expect(el.valid).toBe(true);
  });

  it('generates a strong password, shows it, fills the confirmation and offers to copy it', async () => {
    const el = await mount({ confirm: '', 'generate-length': '24' });
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-generate', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="generate"]')).click();
    expect([...el.value]).toHaveLength(24);
    expect(el.strength.score).toBe(4);
    expect(el.valid).toBe(true);
    expect(el.root.getElementById(el.ids.control)?.getAttribute('type')).toBe('text');
    expect(el.root.querySelector('[data-focus-key="copy"]')).not.toBeNull();
    expect(el.root.querySelector('.pw-generated')).not.toBeNull();
    expect(seen).toEqual([{ length: 24 }]);
  });

  it('shows the reveal state and the attack times in the full variant', async () => {
    const el = await mount({ variant: 'full' });
    type(el, 'monkey1990');
    const reveal = /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="reveal"]'));
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    reveal.click();
    expect(el.root.getElementById(el.ids.control)?.getAttribute('type')).toBe('text');
    expect(el.root.querySelectorAll('.pw-attacks tbody tr')).toHaveLength(4);
    expect([...el.root.querySelectorAll('.pw-pattern span')].map((s) => s.textContent)).toEqual(['word', 'year']); // prettier-ignore
  });

  it('checks breaches after a pause and blocks a breached password', async () => {
    vi.useFakeTimers();
    const hash = await sha1Hex('Qv7#pLm2!xR9wZ');
    const fetchMock = vi.fn(async () => new Response(`${hash.slice(5)}:3\n`));
    vi.stubGlobal('fetch', fetchMock);
    const el = await mountWithTimers({ 'breach-check': '' });
    type(el, 'Qv7#pLm2!xR9wZ');
    expect(el.root.querySelector('.pw-breach')?.textContent).toBe('Checking known data breaches…');
    await vi.advanceTimersByTimeAsync(800);
    // The hash is computed by the browser, outside the fake timers.
    vi.useRealTimers();
    await vi.waitFor(() => expect(el.breaches).toBe(3));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(el.check().message).toBe('This password is known from data breaches. Choose another one.'); // prettier-ignore
    vi.unstubAllGlobals();
  });
});

/**
 * @param {Record<string, string>} attributes
 * @returns {Promise<VtPassword>}
 */
async function mountWithTimers(attributes) {
  const el = /** @type {VtPassword} */ (document.createElement('vt-password'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  document.body.append(el);
  await vi.advanceTimersByTimeAsync(0);
  el.render();
  return el;
}
