import { describe, expect, it } from 'vitest';
import {
  formatVector,
  parseVector,
  roundUp,
  scores,
  severity,
} from '../../src/components/cvss/cvss.js';
import { VtCvss } from '../../src/components/cvss/vt-cvss.js';
import { cvssFromData } from '../../src/core/data-formats.js';

/** @param {string} vector */
const score = (vector) => {
  const result = parseVector(vector);
  if (!result.ok) throw new Error(result.error);
  return scores(result.vector);
};

describe('parseVector', () => {
  it('reads 3.0, 3.1 and 4.0 vectors, and a vector without prefix as 3.1', () => {
    const v31 = parseVector('  CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H ');
    expect(v31.ok && v31.vector.version).toBe('3.1');
    const bare = parseVector('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    expect(bare.ok && bare.vector.vector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    const v4 = parseVector('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N/U:Red');
    expect(v4.ok && v4.vector.metrics.U).toBe('Red');
  });

  it('rejects bad vectors with the metric at fault', () => {
    expect(parseVector('')).toEqual({ ok: false, error: 'empty' });
    expect(parseVector('CVSS:2.0/AV:N')).toEqual({ ok: false, error: 'version' });
    expect(parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H')).toEqual({ ok: false, error: 'missing', metric: 'A' }); // prettier-ignore
    expect(parseVector('CVSS:3.1/AV:Q').ok).toBe(false);
    expect(parseVector('CVSS:3.1/AV:N/AV:N')).toMatchObject({ error: 'duplicate', metric: 'AV' });
    expect(parseVector('CVSS:3.1/AT:N')).toMatchObject({ error: 'unknown', metric: 'AT' });
    expect(parseVector('CVSS:3.1/<b>')).toMatchObject({ error: 'syntax' });
    expect(parseVector(`CVSS:3.1/${'AV:N/'.repeat(300)}`)).toEqual({ ok: false, error: 'length' });
  });

  it('writes metrics in the order of the specification, without Not Defined', () => {
    expect(formatVector('3.1', { A: 'H', AV: 'N', E: 'X', AC: 'L' })).toBe(
      'CVSS:3.1/AV:N/AC:L/A:H',
    );
  });
});

describe('CVSS 3.x scores', () => {
  it('matches the reference calculator', () => {
    expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')?.base).toBe(9.8);
    expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')?.base).toBe(10);
    expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')?.base).toBe(6.1);
    expect(score('CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H')?.base).toBe(7.8);
    expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')?.base).toBe(0);
  });

  it('computes temporal and environmental scores', () => {
    expect(score('CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C')).toMatchObject({ base: 8.1, temporal: 7.3, environmental: null }); // prettier-ignore
    expect(score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:R/CR:H/IR:H/AR:H/MAV:N/MAC:H/MPR:L/MUI:R/MS:C/MC:H/MI:H/MA:H')).toMatchObject({ temporal: 8.2, environmental: 6.8 }); // prettier-ignore
  });

  it('rounds up as CVSS 3.1 Appendix A says', () => {
    expect(roundUp(4.02, '3.1')).toBe(4.1);
    expect(roundUp(4.0, '3.1')).toBe(4);
    expect(roundUp(4.000001, '3.1')).toBe(4);
  });

  it('does not compute CVSS 4.0 scores', () => {
    expect(score('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N')).toBeNull();
  });

  it('names the severity', () => {
    expect([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map(severity)).toEqual(['none', 'low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical']); // prettier-ignore
  });
});

describe('cvssFromData', () => {
  it('reads NVD objects', () => {
    expect(cvssFromData({ cvssData: { vectorString: 'CVSS:3.1/AV:N', baseScore: 9.8 } })).toEqual({ content: 'CVSS:3.1/AV:N', attributes: { score: 9.8 } }); // prettier-ignore
  });
});

describe('<vt-cvss>', () => {
  if (!customElements.get('vt-cvss')) customElements.define('vt-cvss', VtCvss);

  it('shows the score, severity and each metric in words', () => {
    const el = /** @type {VtCvss} */ (document.createElement('vt-cvss'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N';
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.cvss-number')?.textContent).toBe('6.1');
    expect(root.querySelector('[part="severity"]')?.textContent).toBe('Medium');
    expect(root.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('6.1');
    expect(root.querySelector('.cvss-table tbody td')?.textContent).toContain('Network');
    expect(el.score).toBe(6.1);
    el.remove();
  });

  it('works as a calculator with editable', () => {
    const el = /** @type {VtCvss} */ (document.createElement('vt-cvss'));
    el.setAttribute('editable', '');
    el.content = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
    document.body.append(el);
    el.render();
    /** @type {string[]} */
    const changes = [];
    el.addEventListener('vt-change', (e) => changes.push(/** @type {CustomEvent} */ (e).detail.value)); // prettier-ignore
    const select = /** @type {HTMLSelectElement} */ (el.root.querySelector('select[aria-label="Scope"]')); // prettier-ignore
    select.value = 'C';
    select.dispatchEvent(new Event('change'));
    expect(changes).toEqual(['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H']);
    expect(el.score).toBe(10);
    // Optional groups are listed with Not Defined.
    expect(el.root.querySelectorAll('.cvss-select').length).toBe(22);
    el.remove();
  });

  it('explains CVSS 4.0 vectors and shows a given score', () => {
    const el = /** @type {VtCvss} */ (document.createElement('vt-cvss'));
    el.setAttribute('lang-ui', 'fr');
    el.content = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N/E:A';
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.cvss-number')?.textContent).toBe('–');
    expect(el.root.textContent).toContain('Attaquée');
    el.setAttribute('score', '9.3');
    el.render();
    expect(el.root.querySelector('[part="severity"]')?.textContent).toBe('Critique');
    el.remove();
  });

  it('explains why a vector cannot be read', () => {
    const el = /** @type {VtCvss} */ (document.createElement('vt-cvss'));
    el.content = 'CVSS:3.1/AV:N';
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.notice')?.textContent).toContain('“AC”');
    expect(el.vector).toBeNull();
    el.remove();
  });
});
