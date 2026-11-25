import { afterEach, describe, expect, it, vi } from 'vitest';
import { VtFlowtime } from '../../src/components/flowtime/vt-flowtime.js';

if (!customElements.get('vt-flowtime')) customElements.define('vt-flowtime', VtFlowtime);
const events = [
  {
    id: 'one',
    start: '2026-11-24T08:15:00Z',
    title: '<img src=x onerror=alert(1)>',
    group: 'notes',
  },
  { id: 'two', start: '2026-11-24T09:20:00Z', title: 'Logs preserved', group: 'evidence' },
];
const groups = [
  { id: 'notes', label: 'Notes', color: '#6575d7' },
  { id: 'evidence', label: 'Evidence', color: '#249790' },
];

afterEach(() => document.body.replaceChildren());

async function mount(options = {}) {
  const el = new VtFlowtime();
  el.options = { events, groups, ...options };
  document.body.append(el);
  await vi.waitFor(() => expect(el.viewer).not.toBeNull());
  return el;
}

describe('vt-flowtime', () => {
  it('reads JSON data and renders untrusted event text literally in its shadow root', async () => {
    const el = new VtFlowtime();
    el.data = { events, groups };
    document.body.append(el);
    await vi.waitFor(() => expect(el.viewer?.getEvents()).toHaveLength(2));
    expect(el.shadowRoot.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.shadowRoot.querySelector('img')).toBeNull();
    expect(el.shadowRoot.querySelector('.ft-details').hidden).toBe(true);
    expect(el.shadowRoot.querySelector('[part="timeline"]')).not.toBeNull();
  });

  it('keeps actions as host callbacks and forwards selection across the shadow boundary', async () => {
    const onClick = vi.fn();
    const select = vi.fn();
    const el = await mount({ actions: [{ id: 'add', label: 'Add evidence', onClick }] });
    el.addEventListener('vt-select', select);
    el.shadowRoot.querySelector('[data-action-id="add"]').click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick.mock.calls[0][0].viewer).toBe(el.viewer);
    el.viewer.select('one');
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0].composed).toBe(true);
    expect(select.mock.calls[0][0].detail.event.id).toBe('one');
  });

  it('keeps feed text unscaled and restores the timeline preference across views', async () => {
    const el = await mount({ textScale: 0.5, view: 'combined' });
    const content = () => el.shadowRoot.querySelector('.ft-content');
    expect(content().style.getPropertyValue('--ft-text-scale')).toBe('0.5');
    el.viewer.setView('feed');
    expect(content().style.getPropertyValue('--ft-text-scale')).toBe('1');
    expect(el.shadowRoot.querySelector('.ft-footer').dataset.view).toBe('feed');
    el.viewer.setTextScale(1.5);
    expect(content().style.getPropertyValue('--ft-text-scale')).toBe('1');
    el.viewer.setView('timeline');
    expect(content().style.getPropertyValue('--ft-text-scale')).toBe('1.5');
  });

  it('destroys custom views on disconnect and recreates the viewer on reconnect', async () => {
    const destroy = vi.fn();
    const renderer = vi.fn(() => ({ destroy }));
    const el = await mount({
      view: 'graph',
      customViews: [{ id: 'graph', label: 'Graph', mount: renderer }],
    });
    const previous = el.viewer;
    expect(renderer).toHaveBeenCalledOnce();
    el.remove();
    expect(el.viewer).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    document.body.append(el);
    await vi.waitFor(() => expect(el.viewer).not.toBeNull());
    expect(el.viewer).not.toBe(previous);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it('replaces data without resetting selection and reports invalid JSON', async () => {
    const el = new VtFlowtime();
    el.content = JSON.stringify({ events, groups });
    document.body.append(el);
    await vi.waitFor(() => expect(el.viewer).not.toBeNull());
    const viewer = el.viewer;
    viewer.select('two');
    el.content = JSON.stringify({
      events: [
        ...events,
        { id: 'three', start: '2026-11-24T10:00:00Z', title: 'Closed', group: 'notes' },
      ],
      groups,
    });
    await vi.waitFor(() => expect(el.viewer.getEvents()).toHaveLength(3));
    expect(el.viewer).toBe(viewer);
    expect(el.shadowRoot.querySelector('.ft-details h3').textContent).toBe('Logs preserved');
    const error = vi.fn();
    el.addEventListener('vt-error', error);
    el.content = '{broken';
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(el.viewer).toBeNull();
    el.content = JSON.stringify({ events, groups });
    await vi.waitFor(() => expect(el.viewer?.getEvents()).toHaveLength(2));
  });
  it('recovers when invalid options or attributes are corrected', async () => {
    const el = await mount();
    el.options = { events, textScale: 2 };
    await vi.waitFor(() => expect(el.viewer).toBeNull());
    el.options = { events, textScale: 0.5 };
    await vi.waitFor(() => expect(el.viewer?.textScale).toBe(0.5));
    el.setAttribute('text-scale', 'bad');
    await vi.waitFor(() => expect(el.viewer).toBeNull());
    el.setAttribute('text-scale', '1.5');
    await vi.waitFor(() => expect(el.viewer?.textScale).toBe(1.5));
  });
});
