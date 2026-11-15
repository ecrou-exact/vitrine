// @ts-check
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activate,
  choose,
  consentModeOf,
  cookieValue,
  makeChoice,
  readChoice,
  readSettings,
} from '../../src/components/consent/consent.js';
import { VtConsent } from '../../src/components/consent/vt-consent.js';

if (!customElements.get('vt-consent')) customElements.define('vt-consent', VtConsent);

const DAY = 86400000;

/**
 * @param {Record<string, string>} [attributes]
 * @returns {Promise<VtConsent>}
 */
async function mount(attributes = {}) {
  const el = /** @type {VtConsent} */ (document.createElement('vt-consent'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return el;
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  document.body.replaceChildren();
  delete (/** @type {any} */ (window).dataLayer);
});

describe('consent', () => {
  it('reads categories, with necessary always first and always on', () => {
    const settings = readSettings({ categories: [{ id: 'analytics', label: 'Stats', cookies: [{ name: '_pk_id', provider: 'Matomo', purpose: 'Visitor id', duration: '13 months' }] }, { id: 'BAD id' }, 'marketing'], policy: 'javascript:alert(1)' }); // prettier-ignore
    expect(settings.categories.map((c) => [c.id, c.required])).toEqual([['necessary', true], ['analytics', false], ['marketing', false]]); // prettier-ignore
    expect(settings.categories[1].cookies[0].provider).toBe('Matomo');
    expect(settings.policy).toBeNull();
    expect(readSettings(null).categories.map((c) => c.id)).toEqual(['necessary', 'preferences', 'analytics', 'marketing']); // prettier-ignore
    expect(choose(settings, false)).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it('keeps a choice only for its version and its lifetime', () => {
    const settings = readSettings(null);
    const now = Date.parse('2026-11-15T12:00:00Z');
    const stored = JSON.stringify(
      makeChoice(choose(settings, true), 'accept', '2', now - 10 * DAY),
    );
    expect(readChoice(stored, settings, { version: '2', days: 180, now })?.categories.analytics).toBe(true); // prettier-ignore
    expect(readChoice(stored, settings, { version: '3', days: 180, now })).toBeNull();
    expect(readChoice(stored, settings, { version: '2', days: 7, now })).toBeNull();
    expect(readChoice('not json', settings, { version: '2', days: 180, now })).toBeNull();
    // A category added since is off until asked.
    const more = readSettings({ categories: ['analytics', 'video'] });
    expect(readChoice(stored, more, { version: '2', days: 180, now })?.categories).toEqual({ necessary: true, analytics: true, video: false }); // prettier-ignore
  });

  it('maps a choice to Google Consent Mode v2 and to a cookie', () => {
    const settings = readSettings(null);
    expect(
      consentModeOf(
        settings,
        choose(settings, (c) => c.id === 'analytics'),
      ),
    ).toEqual({
      security_storage: 'granted',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(cookieValue({ necessary: true, analytics: true, marketing: false })).toBe('necessary.analytics'); // prettier-ignore
  });

  it('turns on held-back scripts and frames when all their categories are accepted', () => {
    const box = document.createElement('div');
    box.innerHTML = `
      <script type="text/plain" data-consent="analytics" src="https://stats.example.com/a.js" async></script>
      <script type="text/plain" data-consent="analytics marketing" data-type="module" src="https://ads.example.com/b.js"></script>
      <iframe data-consent="marketing" data-src="https://www.youtube-nocookie.com/embed/x"></iframe>
      <img data-consent="analytics" data-src="javascript:alert(1)" alt="">`;
    document.body.append(box);
    expect(activate(box, { necessary: true, analytics: true, marketing: false })).toBe(2);
    const scripts = [...box.querySelectorAll('script:not([type="text/plain"])')];
    expect(scripts.map((s) => [s.getAttribute('src'), s.hasAttribute('async')])).toEqual([['https://stats.example.com/a.js', true]]); // prettier-ignore
    expect(box.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(activate(box, { necessary: true, analytics: true, marketing: true })).toBe(2);
    expect(box.querySelector('script[type="module"]')?.getAttribute('src')).toBe('https://ads.example.com/b.js'); // prettier-ignore
    expect(box.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/x'); // prettier-ignore
    // Each element is turned on once.
    expect(activate(box, { necessary: true, analytics: true, marketing: true })).toBe(0);
  });
});

describe('<vt-consent>', () => {
  it('shows a banner where refusing is as easy as accepting, and stores the choice', async () => {
    const el = await mount({ policy: '/privacy', version: '2', 'consent-mode': '' });
    const buttons = [...el.root.querySelectorAll('.cs-banner button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Customize', 'Reject all', 'Accept all']);
    expect(buttons[1].className).toBe(buttons[2].className);
    expect(el.root.querySelector('.cs-policy')?.getAttribute('href')).toBe('/privacy');
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-consent', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    buttons[1].click();
    expect(el.consent).toEqual({ necessary: true, preferences: false, analytics: false, marketing: false }); // prettier-ignore
    expect(seen[0]).toMatchObject({ action: 'reject', categories: { analytics: false } });
    expect(JSON.parse(localStorage.getItem('vitrine-consent') ?? '{}')).toMatchObject({ version: '2', source: 'reject' }); // prettier-ignore
    expect(el.root.querySelector('.cs-banner')).toBeNull();
    expect(el.root.querySelector('.cs-reopen')?.getAttribute('aria-label')).toBe('Cookie settings');
    const update = /** @type {any} */ (window).dataLayer[0];
    expect([...update]).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'denied', security_storage: 'granted' })]); // prettier-ignore
  });

  it('restores a stored choice without asking, and asks again for a new version', async () => {
    localStorage.setItem('vitrine-consent', JSON.stringify(makeChoice({ necessary: true, analytics: true }, 'save', '1', Date.now()))); // prettier-ignore
    const el = await mount({ categories: 'analytics' });
    expect(el.root.querySelector('.cs-banner')).toBeNull();
    expect(el.has('analytics')).toBe(true);
    const newer = await mount({ categories: 'analytics', version: '2' });
    expect(newer.root.querySelector('.cs-banner')).not.toBeNull();
  });

  it('saves the switches of the settings', async () => {
    const el = await mount({ categories: 'analytics,marketing' });
    el.show();
    const switches = /** @type {HTMLInputElement[]} */ ([...el.root.querySelectorAll('.cs-switch-input')]); // prettier-ignore
    expect(switches.map((s) => [s.getAttribute('role'), s.checked, s.disabled])).toEqual([['switch', true, true], ['switch', false, false], ['switch', false, false]]); // prettier-ignore
    switches[1].checked = true;
    switches[1].dispatchEvent(new Event('change'));
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="save"]')).click();
    expect(el.consent).toEqual({ necessary: true, analytics: true, marketing: false });
    expect(el.choice?.source).toBe('save');
  });

  it('opens from any element with data-consent-open, and resets', async () => {
    const el = await mount();
    el.reject();
    const link = document.createElement('a');
    link.setAttribute('data-consent-open', '');
    document.body.append(link);
    link.click();
    expect(el.root.querySelector('.cs-dialog')).not.toBeNull();
    el.reset();
    expect(localStorage.getItem('vitrine-consent')).toBeNull();
    expect(el.root.querySelector('.cs-banner')).not.toBeNull();
  });

  it('shows the settings in the page with position="inline"', async () => {
    const el = await mount({ position: 'inline', categories: 'analytics' });
    expect(el.root.querySelector('.cs-banner')).toBeNull();
    expect(el.root.querySelectorAll('.cs-category')).toHaveLength(2);
    expect(el.root.querySelector('.cs-status')?.textContent).toBe('You have not chosen yet.');
  });
});
