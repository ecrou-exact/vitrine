import { describe, expect, it } from 'vitest';
import {
  analyzeUrl,
  chainSummary,
  cleanUrl,
  defangUrl,
  hiddenUrl,
  lookalikes,
  punycodeDecode,
  readUrls,
  splitDomain,
} from '../../src/components/url/url.js';
import { VtUrl } from '../../src/components/url/vt-url.js';
import { urlFromData } from '../../src/core/data-formats.js';

/** @param {string} url */
const ids = (url) => analyzeUrl(url).findings.map((f) => f.id);

describe('parts', () => {
  it('takes a URL apart', () => {
    const a = analyzeUrl(
      'https://user:secret@www.shop.example.co.uk:8443/a%20b/c?x=1&utm_source=mail&q=a+b#top',
    );
    expect(a.parts).toMatchObject({
      scheme: 'https',
      username: 'user',
      password: 'secret',
      host: 'www.shop.example.co.uk',
      domain: 'example.co.uk',
      subdomain: 'www.shop',
      suffix: 'co.uk',
      port: '8443',
      path: '/a b/c',
      segments: ['a b', 'c'],
      fragment: 'top',
    });
    expect(a.parts?.query.map((p) => [p.name, p.value, p.tracking])).toEqual([['x', '1', false], ['utm_source', 'mail', true], ['q', 'a b', false]]); // prettier-ignore
  });

  it('decodes punycode', () => {
    expect(punycodeDecode('mnchen-3ya')).toBe('münchen');
    expect(punycodeDecode('80ak6aa92e')).toBe('аррӏе');
    expect(punycodeDecode('!!')).toBeNull();
  });

  it('splits domains with common public suffixes', () => {
    expect(splitDomain('a.b.example.com')).toEqual({ subdomain: 'a.b', domain: 'example.com', suffix: 'com' }); // prettier-ignore
    expect(splitDomain('me.github.io').domain).toBe('me.github.io');
  });
});

describe('findings', () => {
  it('finds the host hidden after @', () => {
    const a = analyzeUrl('https://www.paypal.com@evil.example/login');
    expect(a.verdict).toBe('danger');
    expect(a.findings[0]).toMatchObject({ id: 'userinfoHost', params: { fake: 'www.paypal.com', host: 'evil.example' } }); // prettier-ignore
  });

  it('finds disguised IP addresses', () => {
    expect(analyzeUrl('http://3232235777/').findings[0]).toMatchObject({ id: 'ipObfuscated', params: { ip: '192.168.1.1' } }); // prettier-ignore
    expect(ids('http://0x7f.1/')).toContain('ipObfuscated');
    expect(ids('https://203.0.113.5/')).toEqual(expect.arrayContaining(['ipHost', 'ipSpecial']));
  });

  it('finds homographs', () => {
    expect(lookalikes('раураl.com')).toEqual({ lookalike: 'paypal.com', mixed: true });
    const a = analyzeUrl('https://xn--80ak6aa92e.com/');
    expect(a.parts?.hostUnicode).toBe('аррӏе.com');
    expect(a.findings[0]).toMatchObject({ id: 'homograph', params: { lookalike: 'apple.com' } });
    expect(ids('https://münchen.example/')).toEqual(['punycode']);
  });

  it('finds deceptive and deep subdomains', () => {
    expect(analyzeUrl('https://paypal.com.secure-login.xyz/').findings[0]).toMatchObject({ id: 'deceptiveSubdomain', params: { fake: 'paypal.com', domain: 'secure-login.xyz' } }); // prettier-ignore
    expect(ids('https://a.b.c.d.example.com/')).toContain('deepSubdomain');
  });

  it('finds dangerous schemes', () => {
    expect(analyzeUrl('javascript:alert(1)').findings[0]).toMatchObject({ id: 'scheme', level: 'danger' }); // prettier-ignore
    expect(analyzeUrl('data:text/html;base64,PGgxPg==').findings[0].params.mime).toBe('text/html');
    expect(ids('mailto:a@example.com')).toEqual(['opaque']);
  });

  it('finds URLs hidden in parameters', () => {
    const google = analyzeUrl('https://www.google.com/url?q=https://evil.example/x&sa=D');
    expect(google.nested[0]).toMatchObject({ param: 'q', encoding: 'plain' });
    expect(google.findings[0]).toMatchObject({ id: 'redirect', level: 'warning' });
    expect(hiddenUrl('aHR0cHM6Ly9ldmlsLmV4YW1wbGUvcGF0aA==')).toEqual({ url: 'https://evil.example/path', encoding: 'base64' }); // prettier-ignore
    expect(hiddenUrl('https-3A__evil.example_a_b')).toEqual({ url: 'https://evil.example/a/b', encoding: 'proofpoint' }); // prettier-ignore
    expect(analyzeUrl('https://x.example/?to=https%253A%252F%252Fevil.example').nested[0]?.encoding).toBe('percent'); // prettier-ignore
    expect(analyzeUrl('https://x.example/#/r?to=https%3A%2F%2Fevil.example').nested[0]).toMatchObject({ param: '#to', encoding: 'plain' }); // prettier-ignore
  });

  it('finds the rest', () => {
    expect(ids('hxxps://evil[.]example/setup.exe')).toEqual(['download', 'defanged']);
    expect(ids('http://bit.ly/abc')).toEqual(expect.arrayContaining(['http', 'shortener']));
    expect(ids('https://site.pages.dev/?email=alice@example.org')).toEqual(['email', 'sharedHost']);
    expect(ids('https://x.example/?e=YWxpY2VAZXhhbXBsZS5vcmc=')).toContain('email');
    expect(ids('https://x.example/%252e%252e/')).toContain('doubleEncoded');
    expect(ids('https://x.example/‮exe.pdf')).toContain('invisible');
    expect(ids('https:\\\\x.example\\a')).toContain('backslash');
    expect(ids('example.com/a')).toEqual(['noScheme']);
    expect(analyzeUrl('https://example.org/').verdict).toBe('none');
    expect(analyzeUrl('not a url').ok).toBe(false);
  });
});

describe('output', () => {
  it('cleans, defangs, reads lists and chains', () => {
    const a = analyzeUrl('https://x.example/p?a=1&utm_medium=x&fbclid=y#f');
    expect(cleanUrl(/** @type {any} */ (a.parts))).toBe('https://x.example/p?a=1#f');
    expect(defangUrl('https://a.example/b.c')).toBe('hxxps[://]a[.]example/b.c');
    expect(readUrls('a\n\n# note\nb').urls).toEqual(['a', 'b']);
    const steps = ['https://a.example/', 'http://b.example/', 'https://b.example/x'].map((u) => analyzeUrl(u)); // prettier-ignore
    expect(chainSummary(steps)).toEqual({ domains: ['a.example', 'b.example'], downgrade: 2 });
    expect(urlFromData({ response: { redirects: ['https://a.example/', 'https://b.example/'] } }).content).toBe('https://a.example/\nhttps://b.example/'); // prettier-ignore
  });
});

describe('<vt-url>', () => {
  if (!customElements.get('vt-url')) customElements.define('vt-url', VtUrl);

  it('renders a card per URL, defanged, never as links', () => {
    const el = /** @type {VtUrl} */ (document.createElement('vt-url'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.setAttribute('chain', '');
    el.content = 'https://www.paypal.com@evil.example/login\nhttps://www.google.com/url?q=https://evil.example/x'; // prettier-ignore
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.url-chain-title')?.textContent).toBe('Redirect chain: 2 steps across 2 domains'); // prettier-ignore
    expect(root.querySelectorAll('.url-body > .url-card')).toHaveLength(2);
    expect(root.querySelector('.url-verdict')?.textContent).toBe('Dangerous');
    expect(root.querySelector('.u-domain')?.textContent).toBe('evil[.]example');
    expect(root.querySelector('[data-finding="userinfoHost"]')?.textContent).toContain('opens evil[.]example'); // prettier-ignore
    expect(root.querySelector('.url-nested .u-domain')?.textContent).toBe('evil[.]example');
    expect(root.querySelector('a')).toBeNull();
    el.setAttribute('defang', 'false');
    el.render();
    expect(el.root.querySelector('.u-domain')?.textContent).toBe('evil.example');
    el.remove();
  });
});
