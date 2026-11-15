// @ts-check
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alphabetOf,
  copyAs,
  detectSecret,
  entropyBits,
  envName,
  expiryState,
  generateSecret,
  jwtTimes,
  maskSecret,
} from '../../src/components/secret/secrets.js';
import { VtSecret } from '../../src/components/secret/vt-secret.js';

/** @type {string[]} Texts copied. */
const writes = vi.hoisted(() => /** @type {string[]} */ ([]));
vi.mock('../../src/core/actions.js', async (original) => ({
  .../** @type {object} */ (await original()),
  copyText: async (/** @type {string} */ text) => {
    writes.push(text);
    return true;
  },
}));

if (!customElements.get('vt-secret')) customElements.define('vt-secret', VtSecret);

// Fake keys in the documented shapes; none of them is real.
const STRIPE = `sk_live_${'4eC39HqLyjWDarjtT1zdp7dc'}`;
const GITHUB = `ghp_${'a'.repeat(10)}${'B'.repeat(10)}${'1234567890abcdef'}`;
const AWS = 'AKIAIOSFODNN7EXAMPLE';

/**
 * @param {Record<string, string>} attributes
 * @param {string} [value]
 * @returns {Promise<VtSecret>}
 */
async function mount(attributes = {}, value) {
  const el = /** @type {VtSecret} */ (document.createElement('vt-secret'));
  for (const [name, v] of Object.entries({ 'lang-ui': 'en', now: '2026-11-15T12:00:00Z', ...attributes })) el.setAttribute(name, v); // prettier-ignore
  if (value !== undefined) el.value = value;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('secrets', () => {
  it('recognizes keys of many services, live or test, secret or publishable', () => {
    expect(detectSecret(STRIPE)).toMatchObject({ id: 'stripe', provider: 'Stripe', env: 'live', kind: 'secret', prefix: 8 }); // prettier-ignore
    expect(detectSecret(STRIPE.replace('sk_live', 'pk_test'))).toMatchObject({ env: 'test', kind: 'publishable' }); // prettier-ignore
    expect(detectSecret(GITHUB)).toMatchObject({ id: 'github-classic', provider: 'GitHub', kind: 'token' }); // prettier-ignore
    expect(detectSecret(AWS)).toMatchObject({ id: 'aws', kind: 'secret' });
    expect(detectSecret(AWS.replace('AKIA', 'ASIA'))?.kind).toBe('temporary');
    expect(detectSecret(`sk-ant-api03-${'x'.repeat(90)}`)?.provider).toBe('Anthropic');
    expect(detectSecret(`sk-proj-${'x'.repeat(40)}`)?.provider).toBe('OpenAI');
    expect(detectSecret(`glpat-${'x'.repeat(20)}`)?.provider).toBe('GitLab');
    expect(detectSecret('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----')?.kind).toBe('private-key'); // prettier-ignore
    expect(detectSecret('hello')).toBeNull();
  });

  it('masks a key without putting its hidden characters in the result', () => {
    const mask = maskSecret(STRIPE);
    expect(mask.start).toBe('sk_live_');
    expect(mask.end).toBe('p7dc');
    expect(mask.count).toBe(STRIPE.length - 12);
    const secretPart = STRIPE.slice(8, -4);
    expect(mask.hidden).not.toContain(secretPart.slice(0, 4));
    expect(mask.hidden).toHaveLength(mask.count);
    // Short keys show nothing; asking too much still hides at least half.
    expect(maskSecret('abcdef')).toMatchObject({ start: '', end: '' });
    const asked = maskSecret('0123456789abcdefghij', { start: 10, end: 10 });
    expect(asked.start.length + asked.end.length).toBeLessThanOrEqual(10);
  });

  it('measures randomness and generates keys', () => {
    expect(alphabetOf('deadbeef').name).toBe('hex');
    expect(alphabetOf('aB3').name).toBe('base62');
    expect(alphabetOf('a-b_').name).toBe('base64url');
    expect(entropyBits(STRIPE)).toBe(Math.round(24 * Math.log2(62)));
    expect(entropyBits('550e8400-e29b-41d4-a716-446655440000')).toBe(122);
    const key = generateSecret({ prefix: 'sk_test_', length: 32 });
    expect(key).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);
    expect(generateSecret({ length: 16, alphabet: 'hex' })).toMatch(/^[0-9a-f]{16}$/);
    expect(generateSecret({ prefix: '<x>"', length: 8 })).toMatch(/^x[0-9A-Za-z]{8}$/);
  });

  it('copies as .env, shell, PowerShell, header or JSON, quoted', () => {
    expect(copyAs('abc', 'env', 'stripe key')).toBe('STRIPE_KEY=abc');
    expect(copyAs('a b"c', 'env', 'K')).toBe('K="a b\\"c"');
    expect(copyAs("it's", 'shell', 'K')).toBe("export K='it'\\''s'");
    expect(copyAs("it's", 'powershell', 'K')).toBe("$env:K = 'it''s'");
    expect(copyAs('abc\n', 'header')).toBe('Authorization: Bearer abc');
    expect(copyAs('abc', 'json', 'k')).toBe('{"K":"abc"}');
    expect(envName('2fa code')).toBe('KEY_2FA_CODE');
  });

  it('reads the dates of a JWT and the state of an expiry', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-1', iat: 1763200000, exp: 1763204000 })).replace(/=+$/, ''); // prettier-ignore
    const times = jwtTimes(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`);
    expect(times?.subject).toBe('user-1');
    expect(times?.expires?.toISOString()).toBe('2025-11-15T10:53:20.000Z');
    expect(jwtTimes('not.a.jwt')).toBeNull();
    const now = new Date('2026-11-15T00:00:00Z');
    expect(expiryState(new Date('2026-11-10'), now, 7)).toBe('expired');
    expect(expiryState(new Date('2026-11-20'), now, 7)).toBe('soon');
    expect(expiryState(new Date('2027-01-01'), now, 7)).toBe('ok');
  });
});

describe('<vt-secret>', () => {
  it('shows the key blurred, with its kind, and never in the page until revealed', async () => {
    const el = await mount({ label: 'Stripe key', variant: 'full', created: '2026-09-01', expires: '2026-11-20', scopes: 'charges:write,refunds:read' }, STRIPE); // prettier-ignore
    expect(el.root.innerHTML).not.toContain(STRIPE.slice(8, -4));
    expect(el.root.querySelector('.sc-value.masked .sr-only')?.textContent).toBe(`Hidden key, ${STRIPE.length} characters, starts with sk_live_, ends with p7dc`); // prettier-ignore
    expect([...el.root.querySelectorAll('.sc-badge')].map((b) => b.textContent)).toEqual(['Stripe · API key', 'Live']); // prettier-ignore
    expect([...el.root.querySelectorAll('.sc-notice')].map((n) => n.textContent)).toEqual(['Live key: keep it on your server, never in browser code or a repository.', 'This key expires in 5 days.']); // prettier-ignore
    expect([...el.root.querySelectorAll('.sc-scope')].map((s) => s.textContent)).toEqual(['charges:write', 'refunds:read']); // prettier-ignore
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-toggle', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="reveal"]')).click();
    expect(el.root.querySelector('.sc-value.revealed')?.textContent).toBe(STRIPE);
    expect(seen).toEqual([{ visible: true }]);
  });

  it('copies without revealing, in the formats asked, and the event has no key', async () => {
    const el = await mount({ 'copy-as': 'env,shell', 'env-name': 'STRIPE_SECRET_KEY' }, STRIPE);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-copy', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    await el.copy('raw', null);
    await el.copy('env', null);
    expect(writes).toEqual([STRIPE, `STRIPE_SECRET_KEY=${STRIPE}`]);
    expect(seen).toEqual([{ format: 'raw' }, { format: 'env' }]);
    /** @type {HTMLElement} */ (el.root.querySelector('.sc-more')).click();
    expect([...el.root.querySelectorAll('.sc-menu-item > span')].map((s) => s.textContent)).toEqual(['.env line', 'Shell export']); // prettier-ignore
    expect(el.root.querySelector('.sc-value.revealed')).toBeNull();
  });

  it('shows a key once, then forgets it', async () => {
    const el = await mount({ 'show-once': '' }, GITHUB);
    expect(el.root.querySelector('.sc-notice')?.textContent).toBe('Copy this key now: it will not be shown again.'); // prettier-ignore
    el.toggle(true);
    el.toggle(false);
    expect(el.value).toBe('');
    expect(el.root.querySelector('[data-focus-key="reveal"]')).toBeNull();
    expect(el.root.querySelector('.sc-notice')?.textContent).toBe('This key is no longer shown. Regenerate it if it is lost.'); // prettier-ignore
    expect(el.root.querySelector('.sc-value .sr-only')?.textContent).toContain('starts with ghp_');
  });

  it('hides again after the delay asked', async () => {
    vi.useFakeTimers();
    const el = /** @type {VtSecret} */ (document.createElement('vt-secret'));
    el.setAttribute('auto-hide', '3');
    el.value = AWS;
    document.body.append(el);
    await vi.advanceTimersByTimeAsync(0);
    el.toggle(true);
    expect(el.root.querySelector('.sc-countdown')?.textContent).toBe('Hides in 3 s');
    await vi.advanceTimersByTimeAsync(3300);
    expect(el.visible).toBe(false);
    vi.useRealTimers();
  });

  it('regenerates after a confirmation, unless the event is cancelled', async () => {
    const el = await mount({ rotate: '' }, STRIPE.replace('live', 'test'));
    const button = () => /** @type {HTMLElement} */ (el.root.querySelector('.sc-rotate'));
    button().click();
    expect(button().textContent).toBe('Confirm: the old key stops working');
    el.addEventListener('vt-rotate', (e) => e.preventDefault(), { once: true });
    button().click();
    expect(el.value).toBe(STRIPE.replace('live', 'test'));
    button().click();
    button().click();
    expect(el.value).toMatch(/^sk_test_[0-9A-Za-z]{24}$/);
    expect(el.value).not.toBe(STRIPE.replace('live', 'test'));
    expect(el.visible).toBe(true);
    expect(el.root.querySelector('.sc-notice')?.textContent).toBe(
      'New key generated. Copy it now.',
    );
  });

  it('checks an editable key against the kinds expected, and trims pasted spaces', async () => {
    const el = await mount({ editable: '', required: '', expect: 'github' });
    const input = /** @type {HTMLInputElement} */ (el.root.querySelector('input'));
    expect(input.type).toBe('password');
    expect(input.hasAttribute('data-1p-ignore')).toBe(true);
    expect(el.check().message).toBe('Enter a key.');
    input.value = ` ${AWS}\n`;
    input.dispatchEvent(new Event('input'));
    expect(el.value).toBe(AWS);
    expect(el.root.getElementById(el.ids.status)?.textContent).toBe('Spaces and line breaks were removed from the key.'); // prettier-ignore
    expect(el.check()).toMatchObject({ flags: { typeMismatch: true } });
    expect(el.check().message).toContain('GitHub');
    input.value = GITHUB;
    input.dispatchEvent(new Event('input'));
    expect(el.valid).toBe(true);
    expect(el.root.querySelector('.sc-badge')?.textContent).toBe('GitHub · Personal access token (classic)'); // prettier-ignore
  });
});
