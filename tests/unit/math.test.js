// @vitest-environment jsdom
// jsdom has no style on MathML elements, which Temml's render() sets: here Temml writes
// MathML as text, read back as XML. Browsers run render() itself in the e2e tests.
// @ts-check
import temml from 'temml';
import { describe, expect, it } from 'vitest';
import {
  parseMacros,
  scrubMath,
  splitEquations,
  splitMath,
} from '../../src/components/math/math.js';
import { useMathEngine } from '../../src/components/math/temml-loader.js';
import { VtMath } from '../../src/components/math/vt-math.js';

if (!customElements.get('vt-math')) customElements.define('vt-math', VtMath);
useMathEngine({
  /**
   * @param {string} tex
   * @param {Element} target
   * @param {Record<string, unknown>} options
   */
  render(tex, target, options) {
    const xml = temml.renderToString(tex, { ...options, xml: true });
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    target.append(document.importNode(doc.documentElement, true));
  },
  ParseError: temml.ParseError,
});

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtMath>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtMath} */ (document.createElement('vt-math'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('splitEquations', () => {
  it('splits at blank lines, keeps environments whole, removes $$ around', () => {
    expect(
      splitEquations(
        'a = b\n\n$$c = d$$\n\n\\begin{aligned}\nx &= 1\n\n\\\\ y &= 2\n\\end{aligned}',
      ),
    ).toEqual(['a = b', 'c = d', '\\begin{aligned}\nx &= 1\n\n\\\\ y &= 2\n\\end{aligned}']);
  });
});

describe('splitMath', () => {
  it('finds inline and display math between delimiters', () => {
    expect(splitMath('Euler: $e^{i\\pi}+1=0$ and \\[x^2\\] then \\(y\\) or $$z$$.')).toEqual([
      { type: 'text', text: 'Euler: ' },
      { type: 'math', tex: 'e^{i\\pi}+1=0', display: false },
      { type: 'text', text: ' and ' },
      { type: 'math', tex: 'x^2', display: true },
      { type: 'text', text: ' then ' },
      { type: 'math', tex: 'y', display: false },
      { type: 'text', text: ' or ' },
      { type: 'math', tex: 'z', display: true },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves prices and escaped dollars as text', () => {
    expect(splitMath('It costs $5 and $10, or \\$3.')).toEqual([
      { type: 'text', text: 'It costs $5 and $10, or $3.' },
    ]);
    expect(splitMath('an $ alone')).toEqual([{ type: 'text', text: 'an $ alone' }]);
  });
});

describe('parseMacros', () => {
  it('keeps commands with text definitions only', () => {
    const macros = parseMacros(
      '{"\\\\R": "\\\\mathbb{R}", "bad": "x", "\\\\N": 3, "__proto__": "y"}',
    );
    expect(Object.keys(macros)).toEqual(['\\R']);
    expect(parseMacros('not json')).toEqual({});
  });
});

describe('scrubMath', () => {
  it('removes what MathML does not need: scripts, links, events, url() styles', () => {
    const root = document.createElement('span');
    const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
    const mi = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi');
    mi.textContent = 'x';
    mi.setAttribute('href', 'javascript:alert(1)');
    mi.setAttribute('onclick', 'alert(2)');
    mi.setAttribute('mathcolor', 'red');
    mi.setAttribute('mathbackground', 'url(http://tracker.example/x)');
    const script = document.createElement('script');
    script.textContent = 'alert(3)';
    math.append(mi, script);
    const styled = document.createElement('span');
    styled.style.backgroundImage = 'url(http://tracker.example/y)';
    styled.style.color = 'blue';
    root.append(math, styled);
    scrubMath(root);
    expect(root.querySelector('script')).toBeNull();
    expect(mi.hasAttribute('href')).toBe(false);
    expect(mi.hasAttribute('onclick')).toBe(false);
    expect(mi.hasAttribute('mathbackground')).toBe(false);
    expect(mi.getAttribute('mathcolor')).toBe('red');
    expect(styled.style.backgroundImage).toBe('');
    expect(styled.style.color).toBe('blue');
  });
});

describe('<vt-math>', () => {
  it('draws TeX as MathML, with the TeX kept for screen readers and copy', async () => {
    const el = await mount({}, '\\frac{a}{b}');
    const math = el.root.querySelector('math');
    expect(math?.getAttribute('display')).toBe('block');
    expect(math?.querySelector('mfrac')).not.toBeNull();
    expect(math?.querySelector('annotation')?.textContent).toBe('\\frac{a}{b}');
  });

  it('numbers equations and shows TeX that cannot be read, with the reason', async () => {
    const el = await mount({ numbered: '' }, 'x^2\n\n\\frac{a');
    const equations = el.root.querySelectorAll('.math-display');
    expect(equations).toHaveLength(2);
    expect(equations[0].querySelector('.math-number')?.textContent).toBe('(1)');
    expect(equations[1].classList.contains('error')).toBe(true);
    expect(equations[1].querySelector('.math-tex')?.textContent).toBe('\\frac{a');
    expect(equations[1].querySelector('.math-error')?.textContent).toMatch(/could not be read/);
  });

  it('never makes links, images or HTML from TeX', async () => {
    const el = await mount({}, '\\href{javascript:alert(1)}{x} \\includegraphics{y.png} \\htmlId{a}{b} <img src=x onerror=alert(1)>'); // prettier-ignore
    expect(el.root.querySelector('a, img, [href], [onerror]')).toBeNull();
  });

  it('uses macros, and renders math in text between delimiters', async () => {
    const el = await mount({ delimiters: '', macros: '{"\\\\R": "\\\\mathbb{R}"}' }, 'Let $x \\in \\R$ be real.'); // prettier-ignore
    expect(el.root.querySelector('.math-body')?.textContent).toContain('Let ');
    expect(el.root.querySelector('math')?.getAttribute('display')).not.toBe('block');
    expect(
      el.root.querySelector('math mi[mathvariant="double-struck"], math mi')?.textContent,
    ).toBeTruthy();
  });

  it('sits in a line of text with inline', async () => {
    const el = await mount({ inline: '' }, 'e^{i\\pi}');
    expect(el.root.querySelector('.vt')?.classList.contains('inline-math')).toBe(true);
    expect(el.root.querySelector('.header')).toBeNull();
    expect(el.root.querySelector('math')).not.toBeNull();
  });
});
