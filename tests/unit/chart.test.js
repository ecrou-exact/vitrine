import { describe, expect, it } from 'vitest';
import {
  ChartDataError,
  niceScale,
  parseChartData,
  toCsvText,
  toNumber,
  valueRange,
} from '../../src/components/chart/data.js';

describe('toNumber', () => {
  it('reads numbers as written in data', () => {
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber(' 12% ')).toBe(12);
    expect(toNumber('-3e2')).toBe(-300);
    expect(toNumber('')).toBeNull();
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe('parseChartData', () => {
  const CSV = 'month,desktop,mobile\nJan,186,80\nFeb,305,\nMar,237,120';

  it('reads CSV: labels from the first text column, numeric columns as series', () => {
    const data = parseChartData(CSV);
    expect(data.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(data.series).toEqual([
      { name: 'desktop', values: [186, 305, 237] },
      { name: 'mobile', values: [80, null, 120] },
    ]);
  });

  it('picks columns with x and y, and keeps the labels when only y is given', () => {
    expect(parseChartData(CSV, { y: 'mobile' }).labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(parseChartData(CSV, { x: 'desktop', y: 'mobile' }).labels).toEqual([
      '186',
      '305',
      '237',
    ]);
    expect(() => parseChartData(CSV, { y: 'tablet' })).toThrow(ChartDataError);
  });

  it('reads JSON arrays of objects, Chart.js datasets, series and plain numbers', () => {
    expect(parseChartData('[{"m":"Jan","v":1},{"m":"Feb","v":2}]')).toMatchObject({
      labels: ['Jan', 'Feb'],
      series: [{ name: 'v', values: [1, 2] }],
    });
    expect(
      parseChartData('{"labels":["a","b"],"datasets":[{"label":"Sales","data":[3,4]}]}').series,
    ).toEqual([{ name: 'Sales', values: [3, 4] }]);
    expect(
      parseChartData('{"labels":["a"],"series":[{"name":"S","data":[5]}]}').series[0].name,
    ).toBe('S');
    expect(parseChartData('[4, 8, 15]')).toMatchObject({
      labels: ['1', '2', '3'],
      series: [{ values: [4, 8, 15] }],
    });
  });

  it('reports data it cannot plot', () => {
    expect(() => parseChartData('name\nAda')).toThrow(ChartDataError);
    expect(() => parseChartData('{"a": 1}')).toThrow(ChartDataError);
    expect(() => parseChartData('{oops')).toThrow(ChartDataError);
  });

  it('limits points and series', () => {
    const data = parseChartData(JSON.stringify(Array.from({ length: 6000 }, (_, i) => i)));
    expect(data.series[0].values).toHaveLength(5000);
    expect(data.truncated).toBe(true);
  });
});

describe('scales', () => {
  it('produces round ticks', () => {
    expect(niceScale(0, 305).ticks).toEqual([0, 100, 200, 300, 400]);
    expect(niceScale(0.1, 0.3, 4).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
    expect(niceScale(5, 5).ticks.length).toBeGreaterThan(1);
  });

  it('includes zero for bars, and stacks totals', () => {
    const series = [
      { name: 'a', values: [10, -5] },
      { name: 'b', values: [20, -5] },
    ];
    expect(valueRange(series, { stacked: true, zero: true })).toEqual({ min: -10, max: 30 });
    expect(valueRange([{ name: 'a', values: [50, 60] }], { stacked: false, zero: false })).toEqual({
      min: 50,
      max: 60,
    });
  });

  it('writes the data back as CSV', () => {
    expect(toCsvText(parseChartData('m,"a,b"\nJan,1\nFeb,'))).toBe('label,"a,b"\nJan,1\nFeb,');
  });
});
