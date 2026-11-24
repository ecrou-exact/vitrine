import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  baseDomain,
  decodeWords,
  hasDoubleExtension,
  htmlLinks,
  htmlToText,
  parseAddresses,
  parseMessage,
  quotedPrintableBytes,
} from '../../src/components/email/email.js';
import { VtEmail } from '../../src/components/email/vt-email.js';

const PHISH = readFileSync(join(import.meta.dirname, 'fixtures', 'security', 'phish.eml'), 'utf8');

describe('headers', () => {
  it('decodes encoded words and addresses', () => {
    expect(decodeWords('=?UTF-8?B?w6l0w6k=?= =?ISO-8859-1?Q?_=E0_Paris?=')).toBe('été à Paris');
    expect(parseAddresses('"Doe, Jane" <jane@a.org>, bob@b.org')).toEqual([
      { name: 'Doe, Jane', address: 'jane@a.org' },
      { name: '', address: 'bob@b.org' },
    ]);
    expect(new TextDecoder().decode(quotedPrintableBytes('caf=C3=A9 =\nok'))).toBe('café ok');
    expect(baseDomain('mail.example.co.uk')).toBe('example.co.uk');
  });
});

describe('parseMessage', () => {
  const message = /** @type {import('../../src/components/email/email.js').Message} */ (parseMessage(PHISH)); // prettier-ignore

  it('reads the summary, path and authentication', () => {
    expect(message.subject).toBe('Un problème avec votre compte');
    expect(message.from[0].address).toBe('security@paypa1-support.xyz');
    expect(message.hops.map((h) => h.ip)).toEqual(['203.0.113.66', '198.51.100.7']);
    expect(message.auth.map((a) => `${a.method}=${a.result}`)).toEqual(['spf=softfail', 'dkim=none', 'dmarc=fail']); // prettier-ignore
  });

  it('reads the HTML body as text, its links and attachments', () => {
    expect(message.fromHtml).toBe(true);
    expect(message.text).toContain('vérifiez votre compte');
    expect(message.text).not.toContain('alert');
    expect(message.links).toEqual([{ text: 'https://www.paypal.com/signin', href: 'https://paypa1-support.xyz/login', deceptive: true }]); // prettier-ignore
    expect(message.remoteImages).toBe(1);
    expect(message.attachments.map((a) => [a.name, a.size])).toEqual([['facture.pdf.exe', 64]]);
  });

  it('finds the signs of phishing', () => {
    expect(analyze(message).map((f) => f.id)).toEqual(['authFail', 'displaySpoof', 'deceptiveLinks', 'doubleExtension', 'authWeak', 'authWeak', 'replyTo', 'returnPath', 'remoteImages']); // prettier-ignore
  });

  it('returns null without headers', () => {
    expect(parseMessage('hello')).toBeNull();
  });
});

describe('HTML as text', () => {
  it('drops scripts, styles and comments, and stays linear on hostile input', () => {
    expect(htmlToText('<p>a&amp;b</p><script>x</script><!-- c --><style>y</style>d<br>e')).toBe('a&b\nd\ne'); // prettier-ignore
    expect(htmlToText('ok<script>never closed')).toBe('ok');
    const start = performance.now();
    htmlToText('<script'.repeat(100000));
    htmlToText('<!--'.repeat(100000));
    htmlLinks('<a href=x>'.repeat(50000));
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('tells deceptive links', () => {
    const { links } = htmlLinks('<a href="https://www.example.com/a">www.example.com</a><a href="https://evil.xyz">bank.com</a>'); // prettier-ignore
    expect(links.map((l) => l.deceptive)).toEqual([false, true]);
    expect(hasDoubleExtension('invoice.pdf.exe')).toBe(true);
  });
});

describe('<vt-email>', () => {
  if (!customElements.get('vt-email')) customElements.define('vt-email', VtEmail);

  it('shows the summary with findings, and tabs for the rest', () => {
    const el = /** @type {VtEmail} */ (document.createElement('vt-email'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = PHISH;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(6);
    expect(root.querySelector('.email-finding.bad')?.textContent).toContain('DMARC fail');
    expect(root.querySelector('.email-fields')?.textContent).toContain(
      'security[@]paypa1-support[.]xyz',
    );
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-tab="links"]')).click();
    expect(el.root.querySelector('.email-url')?.textContent).toBe(
      'hxxps[://]paypa1-support[.]xyz/login',
    );
    expect(el.root.querySelector('a, img, iframe, script')).toBeNull();
    el.remove();
  });

  it('explains when there is no message', () => {
    const el = /** @type {VtEmail} */ (document.createElement('vt-email'));
    el.content = 'not a message';
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.notice')).not.toBeNull();
    expect(el.message).toBeNull();
    el.remove();
  });
});
