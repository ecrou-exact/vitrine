// @ts-check
import { describe, expect, it } from 'vitest';
import {
  TraceError,
  buildTree,
  formatMicros,
  parseTraces,
  tickStep,
} from '../../src/components/trace/trace.js';
import { VtTrace } from '../../src/components/trace/vt-trace.js';

if (!customElements.get('vt-trace')) customElements.define('vt-trace', VtTrace);

const OTLP = {
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'api' } },
          { key: 'host.name', value: { stringValue: 'h1' } },
        ],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: '5B8EFFF798038103D269B633813FC60C',
              spanId: 'EEE19B7EC3C1B174',
              name: 'GET /users',
              kind: 2,
              startTimeUnixNano: '1767225600000000000',
              endTimeUnixNano: '1767225600250000000',
              attributes: [{ key: 'http.status_code', value: { intValue: '500' } }],
              status: { code: 2, message: 'boom' },
              events: [{ name: 'exception', timeUnixNano: '1767225600200000000' }],
            },
            {
              traceId: '5B8EFFF798038103D269B633813FC60C',
              spanId: 'EEE19B7EC3C1B173',
              parentSpanId: 'EEE19B7EC3C1B174',
              name: 'SELECT users',
              kind: 'SPAN_KIND_CLIENT',
              startTimeUnixNano: '1767225600010000000',
              endTimeUnixNano: '1767225600090000001',
            },
          ],
        },
      ],
    },
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'db' } }] },
      scopeSpans: [
        {
          spans: [
            {
              traceId: '5B8EFFF798038103D269B633813FC60C',
              spanId: 'AAAA',
              parentSpanId: 'EEE19B7EC3C1B173',
              name: 'query',
              startTimeUnixNano: '1767225600020000000',
              endTimeUnixNano: '1767225600080000000',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} value
 * @returns {Promise<VtTrace>}
 */
async function mount(attributes, value) {
  const el = /** @type {VtTrace} */ (document.createElement('vt-trace'));
  for (const [name, v] of Object.entries(attributes)) el.setAttribute(name, v);
  el.content = typeof value === 'string' ? value : JSON.stringify(value);
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('parseTraces', () => {
  it('reads OTLP JSON: services, kinds, status, events, nanosecond times', () => {
    const [trace] = parseTraces(JSON.stringify(OTLP));
    expect(trace.id).toBe('5b8efff798038103d269b633813fc60c');
    expect(trace.duration).toBe(250000);
    expect(trace.startedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(trace.services).toEqual(['api', 'db']);
    expect(trace.spans.map((s) => [s.name, s.depth, s.start, s.kind])).toEqual([
      ['GET /users', 0, 0, 'server'],
      ['SELECT users', 1, 10000, 'client'],
      ['query', 2, 20000, ''],
    ]);
    const [root, select] = trace.spans;
    expect(root.status).toBe('error');
    expect(root.statusMessage).toBe('boom');
    expect(root.events).toEqual([{ name: 'exception', time: 200000, attributes: [] }]);
    expect(root.attributes).toContainEqual({ key: 'resource.host.name', value: 'h1' });
    // One nanosecond is not lost on a 2026 timestamp.
    expect(select.duration).toBe(80000.001);
  });

  it('reads the files of the collector, one document per line', () => {
    const line = JSON.stringify(OTLP);
    const traces = parseTraces(`${line}\n${line.replace(/5B8EFFF7/g, '00000000')}\n`);
    expect(traces).toHaveLength(2);
  });

  it('reads Jaeger, with processes, references, tags and logs', () => {
    const [trace] = parseTraces(
      JSON.stringify({
        data: [
          {
            traceID: 'abc',
            spans: [
              {
                traceID: 'abc',
                spanID: 'a',
                operationName: 'root',
                references: [],
                startTime: 1000,
                duration: 500,
                tags: [{ key: 'span.kind', type: 'string', value: 'server' }],
                processID: 'p1',
                logs: [{ timestamp: 1200, fields: [{ key: 'event', value: 'retry' }] }],
              },
              {
                traceID: 'abc',
                spanID: 'b',
                operationName: 'child',
                references: [{ refType: 'CHILD_OF', traceID: 'abc', spanID: 'a' }],
                startTime: 1100,
                duration: 100,
                tags: [{ key: 'error', type: 'bool', value: true }],
                processID: 'p2',
              },
            ],
            processes: { p1: { serviceName: 'front' }, p2: { serviceName: 'db' } },
          },
        ],
      }),
    );
    expect(trace.spans.map((s) => [s.name, s.service, s.depth, s.start, s.duration, s.status])).toEqual([
      ['root', 'front', 0, 0, 500, 'unset'],
      ['child', 'db', 1, 100, 100, 'error'],
    ]); // prettier-ignore
    expect(trace.spans[0].kind).toBe('server');
    expect(trace.spans[0].events[0]).toMatchObject({ name: 'retry', time: 200 });
  });

  it('reads Zipkin v2 without losing microseconds', () => {
    const [trace] = parseTraces(
      JSON.stringify([
        { traceId: 'z', id: '1', name: 'get', timestamp: 1767225600000000, duration: 3000, kind: 'SERVER', localEndpoint: { serviceName: 'web' } },
        { traceId: 'z', id: '2', parentId: '1', name: 'query', timestamp: 1767225600001000, duration: 1000, localEndpoint: { serviceName: 'pg' }, tags: { error: 'timeout' } },
      ]),
    ); // prettier-ignore
    expect(trace.spans.map((s) => [s.name, s.service, s.start, s.duration, s.status])).toEqual([
      ['get', 'web', 0, 3000, 'unset'],
      ['query', 'pg', 1000, 1000, 'error'],
    ]);
    expect(trace.spans[1].statusMessage).toBe('timeout');
  });

  it('reads a plain list in milliseconds or ISO dates', () => {
    const [trace] = parseTraces(
      JSON.stringify([
        { id: 'a', name: 'checkout', service: 'shop', start: 0, duration: 120 },
        {
          id: 'b',
          parent: 'a',
          name: 'pay',
          service: 'bank',
          start: 20,
          end: 100,
          error: 'declined',
        },
      ]),
    );
    expect(trace.spans.map((s) => [s.name, s.depth, s.start, s.duration])).toEqual([
      ['checkout', 0, 0, 120000],
      ['pay', 1, 20000, 80000],
    ]);
    expect(trace.spans[1]).toMatchObject({ status: 'error', statusMessage: 'declined' });
    expect(trace.startedAt).toBeNull();
  });

  it('refuses what is not a trace', () => {
    expect(() => parseTraces('')).toThrow(TraceError);
    expect(() => parseTraces('{"a":1}')).toThrow('format');
    expect(() => parseTraces('[{"name":"x"}]')).toThrow('noSpans');
  });
});

describe('buildTree', () => {
  /** @param {Partial<import('../../src/components/trace/trace.js').Span>} values */
  const span = (values) => ({
    id: '', parentId: '', traceId: 't', name: '', service: '', kind: '', start: 0, duration: 1,
    status: /** @type {const} */ ('unset'), statusMessage: '', attributes: [], events: [], links: 0,
    depth: 0, children: [], orphan: false, ...values,
  }); // prettier-ignore

  it('orders children by start, marks orphans and breaks cycles', () => {
    const tree = buildTree({
      id: 't',
      spans: [
        span({ id: 'r', start: 0 }),
        span({ id: 'late', parentId: 'r', start: 50 }),
        span({ id: 'early', parentId: 'r', start: 10 }),
        span({ id: 'lost', parentId: 'gone', start: 5 }),
        span({ id: 'x', parentId: 'y', start: 1 }),
        span({ id: 'y', parentId: 'x', start: 2 }),
      ],
      roots: [],
      duration: 60,
      startedAt: null,
      services: [],
    });
    expect(tree.spans.map((s) => [s.id, s.depth])).toEqual([
      ['r', 0],
      ['early', 1],
      ['late', 1],
      ['lost', 0],
      ['x', 0],
      ['y', 0],
    ]);
    expect(tree.spans.find((s) => s.id === 'lost')?.orphan).toBe(true);
    expect(tree.spans.find((s) => s.id === 'x')?.orphan).toBe(true);
  });

  it('keeps spans with the same id apart', () => {
    const tree = buildTree({ id: 't', spans: [span({ id: 'a' }), span({ id: 'a', start: 1 })], roots: [], duration: 2, startedAt: null, services: [] }); // prettier-ignore
    expect(tree.spans.map((s) => s.id)).toEqual(['a', 'a#2']);
  });
});

describe('helpers', () => {
  it('chooses round steps for the ruler', () => {
    expect(tickStep(250000)).toBe(50000);
    expect(tickStep(3200)).toBe(1000);
    expect(tickStep(0)).toBe(1);
  });

  it('writes durations with the right unit', () => {
    expect(formatMicros(850, 'en')).toBe('850 µs');
    expect(formatMicros(12400, 'en')).toBe('12.4 ms');
    expect(formatMicros(3210000, 'en')).toBe('3.21 s');
    expect(formatMicros(125000000, 'en')).toBe('2 min 5 s');
  });
});

describe('<vt-trace>', () => {
  it('draws a row per span, bars placed in time, names as text', async () => {
    const el = await mount({ 'lang-ui': 'en' }, [
      { id: 'a', name: '<img src=x onerror=alert(1)>', service: 'shop', start: 0, duration: 100 },
      { id: 'b', parent: 'a', name: 'pay', service: 'bank', start: 50, duration: 50 },
    ]);
    const rows = el.root.querySelectorAll('.tc-row');
    expect(rows).toHaveLength(2);
    expect(el.root.querySelector('img')).toBeNull();
    expect(rows[1].getAttribute('aria-level')).toBe('2');
    const bar = /** @type {HTMLElement} */ (rows[1].querySelector('.tc-bar'));
    expect(bar.style.insetInlineStart).toBe('50%');
    expect(bar.style.width).toBe('50%');
    expect(el.root.querySelector('.tc-legend')?.textContent).toBe('shopbank');
  });

  it('selects a span, shows its details and reports it', async () => {
    const el = await mount({}, OTLP);
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-select', (event) =>
      events.push(/** @type {CustomEvent} */ (event).detail),
    );
    /** @type {HTMLElement} */ (el.root.querySelector('.tc-row')).click();
    expect(el.root.querySelector('.tc-details-title')?.textContent).toBe('GET /users');
    expect(el.root.querySelector('.tc-attrs')?.textContent).toContain('http.status_code500');
    expect(events[0]).toMatchObject({
      name: 'GET /users',
      service: 'api',
      start: 0,
      duration: 250,
      status: 'error',
    });
  });

  it('moves and opens spans with the keyboard', async () => {
    const el = await mount({}, OTLP);
    const tree = /** @type {HTMLElement} */ (el.root.querySelector('[role="tree"]'));
    const key = (/** @type {string} */ name) => tree.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })); // prettier-ignore
    key('ArrowLeft');
    expect(el.root.querySelectorAll('.tc-row')).toHaveLength(1);
    key('ArrowRight');
    expect(el.root.querySelectorAll('.tc-row')).toHaveLength(3);
    key('ArrowDown');
    key('Enter');
    expect(el.selected).toBe('eee19b7ec3c1b173');
  });

  it('opens the parents of spans found by the search', async () => {
    const el = await mount({ depth: '1', variant: 'full' }, OTLP);
    expect(el.root.querySelectorAll('.tc-row')).toHaveLength(1);
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-focus-key="search"]')).click();
    const input = /** @type {HTMLInputElement} */ (el.root.querySelector('.search-input'));
    input.value = 'query';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(el.root.querySelectorAll('.tc-row')).toHaveLength(3);
    expect(el.root.querySelectorAll('.tc-row.match')).toHaveLength(1);
  });
});
