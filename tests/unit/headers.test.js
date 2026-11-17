import { describe, expect, it } from 'vitest';
import {
  analyze,
  checkCookie,
  checkCsp,
  grade,
  parseResponse,
} from '../../src/components/headers/headers.js';
import { VtHeaders } from '../../src/components/headers/vt-headers.js';
import { headersFromData } from '../../src/core/data-formats.js';

const GOOD = `HTTP/2 200
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: default-src 'self'; script-src 'nonce-r4nd0m' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=()
cross-origin-opener-policy: same-origin
set-cookie: __Host-sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax`;

const BAD = `HTTP/1.1 200 OK
Server: Apache/2.4.41 (Ubuntu)
X-Powered-By: PHP/7.4.3
Set-Cookie: session=abc; Path=/; SameSite=None
X-XSS-Protection: 1; mode=block
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true`;

/** @param {string} text */
const ids = (text) => analyze(parseResponse(text)).map((f) => `${f.level} ${f.id}`);

describe('parseResponse', () => {
  it('keeps the last response of curl -I and reads curl -v', () => {
    const r = parseResponse('HTTP/1.1 301 Moved\nLocation: /x\n\nHTTP/2 200\nServer: a\n  folded');
    expect(r.status).toBe('HTTP/2 200');
    expect(r.headers).toEqual([{ name: 'server', value: 'a folded' }]);
    const v = parseResponse(
      '> GET / HTTP/2\n> Host: a\n< HTTP/2 200\n< X-Frame-Options: DENY\n* done',
    );
    expect(v.headers).toEqual([{ name: 'x-frame-options', value: 'DENY' }]);
  });

  it('reads a policy alone', () => {
    const r = parseResponse("default-src 'self';\n script-src 'self'");
    expect(r.cspOnly).toBe(true);
  });
});

describe('analyze', () => {
  it('passes a hardened response', () => {
    const findings = analyze(parseResponse(GOOD));
    expect(findings.filter((f) => f.level !== 'ok')).toEqual([]);
    expect(grade(findings)).toBe('A+');
  });

  it('reports a weak response', () => {
    const list = ids(BAD);
    expect(list).toEqual(expect.arrayContaining(['bad hstsMissing', 'bad cspMissing', 'warn framingMissing', 'warn xctoMissing', 'bad cookieSameSiteNone', 'warn cookieSecure', 'bad corsCredentials', 'warn serverVersion', 'warn poweredBy', 'warn xxssEnabled'])); // prettier-ignore
    expect(grade(analyze(parseResponse(BAD)))).toBe('F');
  });

  it('skips HTTPS checks over HTTP', () => {
    expect(analyze(parseResponse(BAD), { https: false }).map((f) => f.id)).not.toContain('hstsMissing'); // prettier-ignore
  });
});

describe('checkCsp', () => {
  /** @param {string} policy */
  const csp = (policy) => checkCsp(policy).map((f) => f.id);

  it('flags unsafe sources unless nonces or strict-dynamic make them inert', () => {
    expect(csp("default-src 'self' 'unsafe-inline' https:; object-src 'none'; base-uri 'self'")).toEqual(['cspUnsafeInline', 'cspWildcard']); // prettier-ignore
    expect(csp("script-src 'nonce-a' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'; base-uri 'none'")).toEqual(['cspOk']); // prettier-ignore
    expect(csp('img-src *')).toEqual(['cspNoScriptSrc', 'cspObjectSrc', 'cspBaseUri']);
    expect(csp("script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'")).toEqual(['cspUnsafeEval']); // prettier-ignore
  });
});

describe('checkCookie', () => {
  it('checks prefixes', () => {
    expect(checkCookie('__Host-a=1; Secure; Path=/app; HttpOnly; SameSite=Strict', true).map((f) => f.id)).toEqual(['cookieHostPrefix']); // prettier-ignore
    expect(checkCookie('__Secure-a=1; HttpOnly; SameSite=Lax', false).map((f) => f.id)).toEqual(['cookieSecurePrefix']); // prettier-ignore
  });
});

describe('headersFromData', () => {
  it('reads objects, lists and HAR responses without injecting lines', () => {
    expect(headersFromData({ 'X-A': '1', 'Set-Cookie': ['a=1', 'b=2'] }).content).toBe('X-A: 1\nSet-Cookie: a=1\nSet-Cookie: b=2'); // prettier-ignore
    expect(headersFromData({ response: { status: 200, httpVersion: 'HTTP/2', headers: [{ name: 'Server', value: 'x\nEvil: 1' }] } }).content).toBe('HTTP/2 200\nServer: x Evil: 1'); // prettier-ignore
  });
});

describe('<vt-headers>', () => {
  if (!customElements.get('vt-headers')) customElements.define('vt-headers', VtHeaders);

  it('shows a grade, the findings and the policy', () => {
    const el = /** @type {VtHeaders} */ (document.createElement('vt-headers'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = BAD.replace('X-XSS', "Content-Security-Policy: script-src 'self' 'unsafe-inline'\nX-XSS"); // prettier-ignore
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('[part="grade"]')?.textContent).toBe('F');
    expect(root.querySelector('.hdr-finding .hdr-level-text')?.textContent).toBe('Problem');
    expect(root.querySelector('.hdr-source.risky')?.textContent).toBe("'unsafe-inline'");
    expect(el.reportText()).toMatch(/^Grade F\n\n\[Problem\]/);
    el.setAttribute('passed', 'false');
    el.render();
    expect(el.root.querySelector('.hdr-finding.ok')).toBeNull();
    el.remove();
  });

  it('asks for headers when there are none', () => {
    const el = /** @type {VtHeaders} */ (document.createElement('vt-headers'));
    el.setAttribute('lang-ui', 'fr');
    el.content = 'bonjour';
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.notice')?.textContent).toContain('Aucun en-tête');
    expect(el.grade).toBeNull();
    el.remove();
  });
});
