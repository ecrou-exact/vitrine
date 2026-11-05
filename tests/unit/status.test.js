import { describe, expect, it } from 'vitest';
import {
  componentDays,
  isOpen,
  maintenancePhase,
  normalizeState,
  overallState,
  parseStatus,
  uptimePercent,
  worstState,
} from '../../src/components/status/model.js';
import { VtStatus } from '../../src/components/status/vt-status.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');

/** @param {unknown} value */
function page(value) {
  const result = parseStatus(JSON.stringify(value));
  if (!result.ok) throw new Error('not a page');
  return result.page;
}

describe('parseStatus', () => {
  it('reads the native format', () => {
    const { components, incidents, message } = page({
      message: 'All good',
      components: [
        { name: 'API', status: 'up', group: 'Core', uptime: 99.5 },
        { name: 'Web', status: 'partial outage' },
      ],
      incidents: [{ title: 'Slow API', status: 'resolved', impact: 'degraded' }],
    });
    expect(message).toBe('All good');
    expect(components[0]).toMatchObject({ name: 'API', state: 'operational', group: 'Core' });
    expect(components[0].uptime).toBe(99.5);
    expect(components[1].state).toBe('partial');
    expect(incidents[0].impact).toBe('degraded');
  });

  it('reads an Atlassian Statuspage summary', () => {
    const { title, url, state, components, incidents, maintenances } = page({
      page: { name: 'Acme', url: 'https://status.acme.test', updated_at: '2026-11-05T10:00:00Z' },
      status: { indicator: 'critical', description: 'Major outage' },
      components: [
        { id: 'g', name: 'Backend', group: true, components: ['a'] },
        { id: 'a', name: 'API', status: 'degraded_performance', group_id: 'g' },
      ],
      incidents: [
        {
          name: 'Database down',
          status: 'investigating',
          impact: 'critical',
          created_at: '2026-11-05T09:00:00Z',
          shortlink: 'https://stspg.io/1',
          incident_updates: [
            { status: 'investigating', body: 'Looking', display_at: '2026-11-05T09:00:00Z' },
            { status: 'identified', body: 'Found', display_at: '2026-11-05T09:30:00Z' },
          ],
          components: [{ name: 'API' }],
        },
      ],
      scheduled_maintenances: [
        {
          name: 'Upgrade',
          status: 'scheduled',
          impact: 'maintenance',
          scheduled_for: '2026-11-06T00:00:00Z',
          scheduled_until: '2026-11-06T01:00:00Z',
        },
      ],
    });
    expect(title).toBe('Acme');
    expect(url).toBe('https://status.acme.test');
    expect(state).toBe('major');
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: 'API', state: 'degraded', group: 'Backend' });
    expect(incidents[0].impact).toBe('major');
    expect(incidents[0].components).toEqual(['API']);
    expect(incidents[0].updates[0].text).toBe('Found');
    expect(maintenances[0].title).toBe('Upgrade');
  });

  it('rejects text that is not a status page', () => {
    expect(parseStatus('{nope')).toMatchObject({ ok: false, error: 'json' });
    expect(parseStatus('{"a":1}')).toMatchObject({ ok: false, error: 'shape' });
    expect(parseStatus('null')).toMatchObject({ ok: false, error: 'shape' });
  });

  it('accepts a plain list of components', () => {
    expect(page([{ name: 'API', status: 'ok' }]).components).toHaveLength(1);
  });

  it('drops links with unsafe schemes', () => {
    const { components, incidents } = page({
      components: [{ name: 'A', url: 'javascript:alert(1)' }],
      incidents: [{ title: 'I', url: 'data:text/html,x' }],
    });
    expect(components[0].url).toBeNull();
    expect(incidents[0].url).toBeNull();
  });

  it('ignores __proto__ in the history', () => {
    const source = '{"components":[{"name":"A","history":{"__proto__":"major"}}]}';
    const result = parseStatus(source);
    expect(result.ok).toBe(true);
    expect(/** @type {any} */ ({}).state).toBeUndefined();
  });

  it('does not read inherited state names', () => {
    expect(normalizeState('constructor')).toBe('unknown');
    expect(normalizeState('__proto__')).toBe('unknown');
  });
});

describe('overall state', () => {
  it('takes the worst of the components and open incidents', () => {
    expect(worstState(['operational', 'major', 'degraded'])).toBe('major');
    const value = page({
      components: [{ name: 'A', status: 'operational' }],
      incidents: [{ title: 'I', status: 'identified', impact: 'minor' }],
    });
    expect(overallState(value, NOW)).toBe('degraded');
  });

  it('ignores resolved incidents', () => {
    const value = page({
      components: [{ name: 'A', status: 'operational' }],
      incidents: [{ title: 'I', status: 'resolved', impact: 'critical' }],
    });
    expect(isOpen(value.incidents[0])).toBe(false);
    expect(overallState(value, NOW)).toBe('operational');
  });

  it('prefers the state given by the source', () => {
    expect(overallState(page({ status: 'degraded', components: [] }), NOW)).toBe('degraded');
  });

  it('counts maintenance only while it runs', () => {
    const at = (/** @type {string} */ start, /** @type {string} */ end) =>
      page({
        components: [{ name: 'A', status: 'operational' }],
        maintenances: [{ title: 'M', start, end }],
      });
    const running = at('2026-11-05T11:00:00Z', '2026-11-05T13:00:00Z');
    const later = at('2026-11-06T11:00:00Z', '2026-11-06T13:00:00Z');
    const past = at('2026-11-04T11:00:00Z', '2026-11-04T13:00:00Z');
    expect(maintenancePhase(running.maintenances[0], NOW)).toBe('active');
    expect(maintenancePhase(later.maintenances[0], NOW)).toBe('upcoming');
    expect(maintenancePhase(past.maintenances[0], NOW)).toBe('past');
    expect(overallState(running, NOW)).toBe('maintenance');
    expect(overallState(later, NOW)).toBe('operational');
  });
});

describe('days and uptime', () => {
  /** @param {Record<string, unknown>} fields */
  const component = (fields) => page({ components: [{ name: 'A', ...fields }] }).components[0];

  it('lists the last days, oldest first, unknown when nothing is said', () => {
    const days = componentDays(component({ status: 'ok' }), 3, NOW);
    expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(days.every((d) => d.state === 'none')).toBe(true);
  });

  it('counts unlisted days as fine after "since", and today as the current state', () => {
    const days = componentDays(
      component({
        status: 'degraded',
        since: '2026-11-03',
        history: { '2026-11-04': { status: 'major', minutes: 144 } },
      }),
      4,
      NOW,
    );
    expect(days.map((d) => d.state)).toEqual(['none', 'operational', 'major', 'degraded']);
    expect(days[2].minutes).toBe(144);
  });

  it('works out the uptime, leaving out maintenance and unknown days', () => {
    const value = component({
      history: [
        { date: '2026-11-02', status: 'operational' },
        { date: '2026-11-03', status: 'maintenance' },
        { date: '2026-11-04', status: 'major', minutes: 144 },
      ],
    });
    const days = componentDays(value, 5, NOW);
    expect(uptimePercent(value, days)).toBeCloseTo(95, 5);
  });

  it('prefers the uptime of the source and has none without data', () => {
    const given = component({ uptime: 99.1 });
    expect(uptimePercent(given, componentDays(given, 3, NOW))).toBe(99.1);
    const none = component({});
    expect(uptimePercent(none, componentDays(none, 3, NOW))).toBeNull();
  });
});

describe('<vt-status>', () => {
  it('is a documented element', () => {
    expect(VtStatus.observedAttributes).toEqual(
      expect.arrayContaining(['days', 'refresh', 'max-incidents', 'bars', 'incidents', 'now']),
    );
  });
});
