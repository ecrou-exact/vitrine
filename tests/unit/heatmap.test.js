// @ts-check
import { describe, expect, it } from 'vitest';
import { dayNumber, toIso } from '../../src/components/date-picker/dates.js';
import {
  HeatmapError,
  calendarLayout,
  heatToCsv,
  levelOf,
  period,
  readHeat,
  toDay,
} from '../../src/components/heatmap/heatmap.js';
import { VtHeatmap } from '../../src/components/heatmap/vt-heatmap.js';

if (!customElements.get('vt-heatmap')) customElements.define('vt-heatmap', VtHeatmap);

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtHeatmap>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtHeatmap} */ (document.createElement('vt-heatmap'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('readHeat', () => {
  it('reads days from objects, lists, pairs and CSV, adding the same day', () => {
    const iso = (/** @type {import('../../src/components/heatmap/heatmap.js').HeatData} */ d) =>
      Object.fromEntries([...d.days].map(([day, v]) => [toIso(day), v]));
    expect(iso(readHeat('{"2026-01-05": 3, "2026-01-06": "2", "nope": 1}'))).toEqual({ '2026-01-05': 3, '2026-01-06': 2 }); // prettier-ignore
    expect(iso(readHeat('[{"date":"2026-01-05T10:00:00Z","value":1},{"date":"2026-01-05","count":2},{"day":"2026-01-07"}]'))).toEqual({ '2026-01-05': 3, '2026-01-07': 1 }); // prettier-ignore
    expect(iso(readHeat('[["2026-02-01", 4]]'))).toEqual({ '2026-02-01': 4 });
    expect(iso(readHeat('day,commits\n2026-03-01,5\n2026-03-01,1'))).toEqual({ '2026-03-01': 6 });
  });

  it('reads two categories and a value as a matrix', () => {
    const data = readHeat('weekday,hour,load\nMon,9,4\nMon,10,2\nTue,9,7');
    expect(data.kind).toBe('matrix');
    expect(data.xs).toEqual(['Mon', 'Tue']);
    expect(data.ys).toEqual(['9', '10']);
    expect(data.cells.get('Tue\u00009')).toBe(7);
    expect(readHeat('[{"x":"a","y":"b","value":1}]').kind).toBe('matrix');
    // A "day" column of weekday names is a category, not a date.
    const weekdays = readHeat('day,hour,load\nMon,9h,3\nTue,9h,5');
    expect([weekdays.kind, ...weekdays.xs]).toEqual(['matrix', 'Mon', 'Tue']);
  });

  it('refuses what holds no values', () => {
    expect(() => readHeat('')).toThrow(HeatmapError);
    expect(() => readHeat('{"a": 1}')).toThrow('noValues');
    expect(() => readHeat('single')).toThrow('format');
  });
});

describe('calendar', () => {
  it('reads dates and timestamps', () => {
    expect(toDay('2026-01-05')).toBe(dayNumber(2026, 1, 5));
    expect(toDay(Date.UTC(2026, 0, 5, 12) / 1000)).toBe(dayNumber(2026, 1, 5));
    expect(toDay('05/01/2026')).toBeNull();
  });

  it('shows a year ending on the last value, or a given year', () => {
    const days = new Map([[dayNumber(2026, 6, 30), 1]]);
    expect(period(days, {})).toEqual({ from: dayNumber(2025, 7, 1), to: dayNumber(2026, 6, 30) });
    expect(period(days, { year: '2025' })).toEqual({ from: dayNumber(2025, 1, 1), to: dayNumber(2025, 12, 31) }); // prettier-ignore
  });

  it('lays days out in weeks from the first day of the week', () => {
    // Thursday 1 January 2026, weeks starting on Monday.
    const layout = calendarLayout(new Map(), { from: dayNumber(2026, 1, 1), to: dayNumber(2026, 1, 31), firstDay: 1 }); // prettier-ignore
    expect(layout.cells[0]).toMatchObject({ row: 0, column: 0, inRange: false });
    expect(layout.cells.find((c) => c.inRange)).toMatchObject({ row: 3, column: 0 });
    expect(layout.columns).toBe(5);
    expect(layout.months).toEqual([{ column: 0, month: 1, year: 2026 }]);
  });

  it('gives levels from 0 (none) to the darkest', () => {
    expect([null, 0, 1, 5, 10].map((v) => levelOf(v, 10, 5))).toEqual([0, 0, 1, 2, 4]);
  });

  it('writes CSV', () => {
    expect(heatToCsv(readHeat('{"2026-01-06": 2, "2026-01-05": 3}'))).toBe('date,value\n2026-01-05,3\n2026-01-06,2'); // prettier-ignore
  });
});

describe('<vt-heatmap>', () => {
  it('draws a calendar whose cells say their date and value', async () => {
    const el = await mount({ 'lang-ui': 'en', unit: 'commits', from: '2026-01-05', to: '2026-01-11' }, '{"2026-01-06": 4, "2026-01-07": 1}'); // prettier-ignore
    const cells = el.root.querySelectorAll('[role="gridcell"]:not([aria-hidden])');
    expect(cells).toHaveLength(7);
    const labels = Array.from(cells, (c) => c.getAttribute('aria-label'));
    expect(labels).toContain('Tuesday, January 6, 2026: 4 commits');
    expect(labels).toContain('Monday, January 5, 2026: no value');
    expect(el.root.querySelector('.hm-summary')?.textContent).toBe('5 commits in all, most 4 commits on Jan 6, 2026'); // prettier-ignore
    expect(el.root.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('moves with the arrows and sends the chosen day', async () => {
    const el = await mount({ from: '2026-01-05', to: '2026-01-18', 'first-day': '1' }, '{"2026-01-12": 2}'); // prettier-ignore
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-select', (e) => events.push(/** @type {CustomEvent} */ (e).detail));
    const grid = /** @type {HTMLElement} */ (el.root.querySelector('[role="grid"]'));
    const focused = /** @type {HTMLElement} */ (el.root.querySelector('[tabindex="0"]'));
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    const now = /** @type {HTMLElement} */ (grid.querySelector('[tabindex="0"]'));
    expect(now).not.toBe(focused);
    now.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const home = /** @type {HTMLElement} */ (grid.querySelector('[tabindex="0"]'));
    home.click();
    expect(events[0]).toEqual({ date: '2026-01-10', value: null });
  });

  it('draws a matrix with category names as text', async () => {
    const el = await mount({}, 'x,y,value\n<b>Mon</b>,9,1');
    expect(el.root.querySelector('b')).toBeNull();
    expect(el.root.querySelector('.hm-x')?.textContent).toBe('<b>Mon</b>');
  });
});
