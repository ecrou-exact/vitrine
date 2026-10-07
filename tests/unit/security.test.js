// @vitest-environment jsdom
// DOMPurify does not support happy-dom; jsdom is its reference test environment.
import { describe, expect, it } from 'vitest';
import {
  isSafeUrl,
  sanitizeHighlight,
  sanitizeHtml,
  sanitizerWorks,
} from '../../src/core/security.js';

const html = (fragment) => {
  const div = document.createElement('div');
  div.append(fragment);
  return div.innerHTML;
};

describe('sanitizerWorks', () => {
  it('passes its self-test in a supported environment', () => {
    expect(sanitizerWorks()).toBe(true);
  });
});

describe('isSafeUrl', () => {
  it('accepts relative URLs, fragments and safe schemes', () => {
    for (const url of [
      '',
      '/a',
      './b',
      '../c',
      'd.html?x=1#y',
      '#top',
      '?q',
      'https://x.y',
      'http://x.y',
      'mailto:a@b.c',
      'tel:+33',
      'HTTPS://X.Y',
    ]) {
      expect(isSafeUrl(url), url).toBe(true);
    }
  });
  it('rejects script and data URLs, including obfuscated ones', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      '\u0001javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'file:///etc/passwd',
      'blob:https://x/y',
      'ftp://x',
    ]) {
      expect(isSafeUrl(url), JSON.stringify(url)).toBe(false);
    }
  });
  it('accepts raster data images only when allowed', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(isSafeUrl(png)).toBe(false);
    expect(isSafeUrl(png, { allowDataImage: true })).toBe(true);
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz4=', { allowDataImage: true })).toBe(false);
    expect(isSafeUrl('data:image/png;base64,<script>', { allowDataImage: true })).toBe(false);
  });
});

describe('sanitizeHtml', () => {
  it('removes scripts, handlers, styles, ids and unknown elements', () => {
    const out = html(
      sanitizeHtml(
        '<p id="x" style="color:red" onclick="a()">ok<script>b()</script><iframe src="x"></iframe><style>*{}</style></p>',
      ),
    );
    expect(out).toBe('<p>ok</p>');
  });
  it('keeps text of removed elements', () => {
    expect(html(sanitizeHtml('<font color=red>text</font>'))).toBe('text');
  });
  it('removes dangerous links but keeps their text', () => {
    expect(html(sanitizeHtml('<a href="javascript:alert(1)">x</a>'))).toBe('<a>x</a>');
  });
  it('marks external links and opens them in a new tab', () => {
    expect(html(sanitizeHtml('<a href="https://ext.example/">x</a>'))).toBe(
      '<a href="https://ext.example/" rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
    expect(
      html(sanitizeHtml('<a href="https://ext.example/">x</a>', { externalLinks: 'same' })),
    ).toBe('<a href="https://ext.example/" rel="noopener noreferrer nofollow">x</a>');
  });
  it('never opens mailto: and tel: links in a new tab', () => {
    expect(html(sanitizeHtml('<a href="mailto:a@b.c">m</a><a href="tel:+33">t</a>'))).toBe(
      '<a href="mailto:a@b.c" rel="noopener noreferrer nofollow">m</a><a href="tel:+33" rel="noopener noreferrer nofollow">t</a>',
    );
  });
  it('keeps only language-* classes on code', () => {
    expect(
      html(
        sanitizeHtml('<code class="language-js vt-toolbar">a</code><p class="language-js">b</p>'),
      ),
    ).toBe('<code class="language-js">a</code><p>b</p>');
  });
  it('applies the image policy', () => {
    const img = '<img src="https://ext.example/p.png" alt="pixel">';
    expect(html(sanitizeHtml(img, { images: 'block' }))).toContain('vt-blocked-image');
    expect(html(sanitizeHtml(img, { images: 'same-origin' }))).toContain('vt-blocked-image');
    expect(
      html(sanitizeHtml('<img src="/local.png" alt="l">', { images: 'same-origin' })),
    ).toContain('<img');
    expect(html(sanitizeHtml(img))).toContain('referrerpolicy="no-referrer"');
  });
  it('only keeps disabled checkboxes', () => {
    expect(
      html(
        sanitizeHtml(
          '<input type="checkbox" checked><input type="text" value="x"><input type="password">',
        ),
      ),
    ).toBe('<input type="checkbox" checked="" disabled="">');
  });
  it('resolves relative URLs against a base URL', () => {
    const out = html(
      sanitizeHtml('<a href="b.md">b</a><img src="i.png" alt="">', {
        baseUrl: 'https://docs.example/guide/a.md',
      }),
    );
    expect(out).toContain('href="https://docs.example/guide/b.md"');
    expect(out).toContain('src="https://docs.example/guide/i.png"');
  });
});

describe('sanitizeHighlight', () => {
  it('keeps only hljs spans', () => {
    const out = html(
      sanitizeHighlight(
        '<span class="hljs-keyword evil">if</span><b>x</b><img src=x onerror=alert(1)><span class="hljs-title function_">f</span>',
      ),
    );
    expect(out).toBe(
      '<span class="hljs-keyword">if</span>x<span class="hljs-title function_">f</span>',
    );
  });
});
