import { describe, expect, it } from 'vitest';
import { grade, parseColor, ratio, readInput, suggest, toHex } from '../../src/components/contrast/contrast.js'; // prettier-ignore
import { VtContrast } from '../../src/components/contrast/vt-contrast.js';

const r = (a, b) => Math.floor(ratio(/** @type {any} */ (parseColor(a)), /** @type {any} */ (parseColor(b))) * 100) / 100; // prettier-ignore

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(r('#000', '#fff')).toBe(21);
    expect(r('#fff', '#fff')).toBe(1);
    expect(r('#777777', '#ffffff')).toBe(4.47);
    expect(r('#767676', 'white')).toBe(4.54);
    expect(r('#767676', 'white')).toBe(r('white', '#767676'));
  });

  it('reads CSS colors', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('#11223380')?.a).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgba(10, 20, 30, 0.25)')?.a).toBe(0.25);
    expect(toHex(/** @type {any} */ (parseColor('hsl(120 100% 25%)')))).toBe('#008000');
    expect(toHex(/** @type {any} */ (parseColor('hwb(0 0% 0%)')))).toBe('#ff0000');
    expect(toHex(/** @type {any} */ (parseColor('RebeccaPurple')))).toBe('#663399');
    expect(parseColor('url(x)')).toBeNull();
    expect(parseColor('expression(alert(1))')).toBeNull();
  });

  it('lays transparent colors over the background', () => {
    // Black at 50% over white is about #808080.
    expect(r('rgb(0 0 0 / 50%)', '#fff')).toBeCloseTo(r('#808080', '#fff'), 1);
  });

  it('grades without rounding up', () => {
    expect(grade(4.49).aaNormal).toBe(false);
    expect(grade(4.5)).toMatchObject({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true, nonText: true }); // prettier-ignore
  });

  it('suggests the nearest passing color', () => {
    const fix = /** @type {any} */ (suggest(/** @type {any} */ (parseColor('#999')), /** @type {any} */ (parseColor('#fff')), 4.5)); // prettier-ignore
    expect(ratio(fix, /** @type {any} */ (parseColor('#fff')))).toBeGreaterThanOrEqual(4.5);
    expect(toHex(fix)).toBe('#767676');
    expect(suggest(/** @type {any} */ (parseColor('#000')), /** @type {any} */ (parseColor('#fff')), 4.5)).toBeNull(); // prettier-ignore
  });

  it('reads pairs and palettes', () => {
    expect(readInput('Body: #333 on #fff\nrgb(0, 102, 204) / white\n#ff0\nnothing here')).toEqual({
      pairs: [
        { label: 'Body', fg: '#333', bg: '#fff' },
        { label: '', fg: 'rgb(0, 102, 204)', bg: 'white' },
      ],
      palette: [{ label: '', color: '#ff0' }],
      invalid: ['nothing here'],
    });
  });
});

describe('<vt-contrast>', () => {
  if (!customElements.get('vt-contrast')) customElements.define('vt-contrast', VtContrast);

  it('checks a pair, suggests a fix and follows the fields', () => {
    const el = /** @type {VtContrast} */ (document.createElement('vt-contrast'));
    el.setAttribute('lang-ui', 'en');
    el.setAttribute('fg', '#999999');
    el.setAttribute('bg', '#ffffff');
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.contrast-value')?.textContent).toBe('2.84:1');
    expect(root.querySelector('[data-level="aaNormal"] td:last-child')?.textContent).toBe('Fail');
    expect(root.querySelector('[data-level="nonText"] td:last-child')?.textContent).toBe('Fail');
    expect(root.querySelector('.contrast-suggest')?.textContent).toContain('#767676');
    /** @type {string | null} */
    let changed = null;
    el.addEventListener(
      'vt-change',
      (e) => (changed = /** @type {CustomEvent} */ (e).detail.ratio),
    );
    const fg = /** @type {HTMLInputElement} */ (root.querySelector('[data-focus-key="fg"]'));
    fg.value = '#000';
    fg.dispatchEvent(new Event('input'));
    expect(changed).toBe(21);
    expect(root.querySelector('.contrast-value')?.textContent).toBe('21.00:1');
    expect(root.querySelector('.contrast-suggest')).toBeNull();
    el.remove();
  });

  it('draws a palette as a grid', () => {
    const el = /** @type {VtContrast} */ (document.createElement('vt-contrast'));
    el.content = 'ink: #1a1a1a\npaper: #ffffff\naccent: #0b6bcb';
    document.body.append(el);
    el.render();
    expect(el.root.querySelectorAll('.contrast-grid tbody tr')).toHaveLength(3);
    expect(el.root.querySelectorAll('.contrast-grid td.cell')).toHaveLength(6);
    el.remove();
  });
});
