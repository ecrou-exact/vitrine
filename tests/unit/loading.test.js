import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDuration } from '../../src/components/loading/indicator.js';
import {
  overallStatus,
  parseStepDuration,
  parseSteps,
} from '../../src/components/loading-steps/steps.js';
import { VtLoadingButton } from '../../src/components/loading-button/vt-loading-button.js';
import { VtLoadingMessage } from '../../src/components/loading-message/vt-loading-message.js';
import { VtLoadingOverlay } from '../../src/components/loading-overlay/vt-loading-overlay.js';
import { VtLoadingSteps } from '../../src/components/loading-steps/vt-loading-steps.js';
import { VtPageProgress } from '../../src/components/page-progress/vt-page-progress.js';
import { VtProgress } from '../../src/components/progress/vt-progress.js';
import { VtProgressRing } from '../../src/components/progress-ring/vt-progress-ring.js';
import { VtSkeleton } from '../../src/components/skeleton/vt-skeleton.js';
import { VtSpinner } from '../../src/components/spinner/vt-spinner.js';
import { VtTyping } from '../../src/components/typing/vt-typing.js';

for (const [tag, ctor] of /** @type {[string, CustomElementConstructor][]} */ ([
  ['vt-spinner', VtSpinner], ['vt-progress', VtProgress], ['vt-progress-ring', VtProgressRing],
  ['vt-skeleton', VtSkeleton], ['vt-loading-overlay', VtLoadingOverlay], ['vt-page-progress', VtPageProgress],
  ['vt-loading-steps', VtLoadingSteps], ['vt-typing', VtTyping], ['vt-loading-button', VtLoadingButton],
  ['vt-loading-message', VtLoadingMessage],
])) if (!customElements.get(tag)) customElements.define(tag, ctor); // prettier-ignore

/**
 * @param {string} html
 * @returns {any}
 */
function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('parseDuration', () => {
  it('reads milliseconds and seconds, with a fallback and a cap', () => {
    expect(parseDuration('300', 0)).toBe(300);
    expect(parseDuration('300ms', 0)).toBe(300);
    expect(parseDuration('1.5s', 0)).toBe(1500);
    expect(parseDuration('soon', 42)).toBe(42);
    expect(parseDuration(null, 7)).toBe(7);
    expect(parseDuration('9999s', 0, 60000)).toBe(60000);
  });
});

describe('parseSteps', () => {
  it('reads status words, check boxes, details and durations', () => {
    expect(
      parseSteps(
        'done Build image (42s)\n- [x] Run tests — 214 passed (1m 3s)\nrunning: Push | layer 3\n[ ] Roll out\nfailed Smoke tests -- 2 failures\nSomething else',
      ),
    ).toEqual([
      { label: 'Build image', status: 'done', detail: '', duration: 42000 },
      { label: 'Run tests', status: 'done', detail: '214 passed', duration: 63000 },
      { label: 'Push', status: 'running', detail: 'layer 3', duration: null },
      { label: 'Roll out', status: 'pending', detail: '', duration: null },
      { label: 'Smoke tests', status: 'error', detail: '2 failures', duration: null },
      { label: 'Something else', status: 'pending', detail: '', duration: null },
    ]);
  });

  it('reads JSON, and keeps parentheses that are not durations', () => {
    expect(
      parseSteps(
        '[{"label":"A","status":"ok","duration":"850ms"},"B",{"name":"C","state":"skip"},{"status":"done"}]',
      ),
    ).toEqual([
      { label: 'A', status: 'done', detail: '', duration: 850 },
      { label: 'B', status: 'pending', detail: '', duration: null },
      { label: 'C', status: 'skipped', detail: '', duration: null },
    ]);
    expect(parseSteps('done Install (optional)')[0].label).toBe('Install (optional)');
    expect(parseStepDuration('1:20')).toBe(80000);
  });

  it('gives the overall status', () => {
    const steps = (/** @type {string} */ s) => parseSteps(s);
    expect(overallStatus(steps('pending A\npending B'))).toBe('pending');
    expect(overallStatus(steps('done A\npending B'))).toBe('running');
    expect(overallStatus(steps('done A\nskipped B'))).toBe('done');
    expect(overallStatus(steps('done A\nwarning B'))).toBe('warning');
    expect(overallStatus(steps('done A\nerror B\npending C'))).toBe('error');
  });
});

describe('<vt-spinner>', () => {
  it('is a labelled status, and its text names it', () => {
    const el = mount('<vt-spinner type="dots" text="Loading results…"></vt-spinner>');
    const frame = el.shadowRoot.querySelector('.indicator');
    expect(frame.getAttribute('role')).toBe('status');
    expect(frame.getAttribute('aria-label')).toBe('Loading results…');
    expect(el.shadowRoot.querySelectorAll('.spinner.dots .spinner-part')).toHaveLength(3);
  });

  it('waits for its delay, and stays its minimum duration', async () => {
    vi.useFakeTimers();
    const events = [];
    const el = mount('<vt-spinner delay="200" min-duration="500" active="false"></vt-spinner>');
    el.addEventListener('vt-loading-start', () => events.push('start'));
    el.addEventListener('vt-loading-end', () => events.push('end'));
    el.start();
    vi.advanceTimersByTime(150);
    expect(el.shown).toBe(false);
    vi.advanceTimersByTime(100);
    expect(el.shown).toBe(true);
    el.stop();
    vi.advanceTimersByTime(300);
    expect(el.shown).toBe(true);
    vi.advanceTimersByTime(300);
    expect(el.shown).toBe(false);
    expect(events).toEqual(['start', 'end']);
  });

  it('never shows when stopped before its delay', () => {
    vi.useFakeTimers();
    const el = mount('<vt-spinner delay="300ms"></vt-spinner>');
    vi.advanceTimersByTime(100);
    el.stop();
    vi.advanceTimersByTime(1000);
    expect(el.shown).toBe(false);
    expect(el.shadowRoot.querySelector('.spinner')).toBeNull();
  });
});

describe('<vt-progress>', () => {
  it('exposes a progress bar with its value, and fires progress and complete', async () => {
    const el = mount('<vt-progress value="40" text="Upload" show-value="percent"></vt-progress>');
    const track = el.shadowRoot.querySelector('[role="progressbar"]');
    expect(track.getAttribute('aria-label')).toBe('Upload');
    expect(track.getAttribute('aria-valuenow')).toBe('40');
    expect(track.getAttribute('aria-valuetext')).toBe('40%');
    expect(el.shadowRoot.querySelector('.value').textContent).toBe('40%');
    const events = [];
    el.addEventListener('vt-progress', (e) => events.push(['progress', e.detail.value]));
    el.addEventListener('vt-complete', () => events.push(['complete']));
    el.value = 100;
    el.value = 120;
    await flush();
    expect(events).toEqual([['progress', 100], ['complete']]);
    expect(el.value).toBe(100);
  });

  it('is indeterminate without a value, and formats fractions with a unit', async () => {
    const el = mount('<vt-progress></vt-progress>');
    const track = el.shadowRoot.querySelector('[role="progressbar"]');
    expect(track.hasAttribute('aria-valuenow')).toBe(false);
    expect(track.classList.contains('indeterminate')).toBe(true);
    const other = mount(
      '<vt-progress value="1.5" max="4" show-value="fraction" unit="GB" decimals="1"></vt-progress>',
    );
    expect(other.shadowRoot.querySelector('.value').textContent).toBe('1.5 of 4.0 GB');
  });

  it('colors by status unless a tone is set', () => {
    const el = mount('<vt-progress value="10" status="error"></vt-progress>');
    expect(el.shadowRoot.querySelector('.indicator').dataset.tone).toBe('danger');
    const toned = mount('<vt-progress value="10" status="error" tone="info"></vt-progress>');
    expect(toned.shadowRoot.querySelector('.indicator').dataset.tone).toBe('info');
  });
});

describe('<vt-progress-ring>', () => {
  it('draws the arc for the value and shows the percentage', () => {
    const el = mount('<vt-progress-ring value="25"></vt-progress-ring>');
    const arc = el.shadowRoot.querySelector('.ring-arc');
    const [length] = arc.getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(length * 0.75);
    expect(el.shadowRoot.querySelector('.ring-value').textContent).toBe('25%');
    expect(el.shadowRoot.querySelector('svg').getAttribute('role')).toBe('progressbar');
  });
});

describe('<vt-skeleton>', () => {
  it('hides the real content and marks it busy, then shows it', () => {
    const el = mount('<vt-skeleton shape="list" rows="2" avatar><p>Real</p></vt-skeleton>');
    expect(el.getAttribute('aria-busy')).toBe('');
    expect(el.shadowRoot.querySelectorAll('.list-row')).toHaveLength(2);
    expect(el.shadowRoot.querySelector('.content').hidden).toBe(true);
    el.active = false;
    expect(el.hasAttribute('aria-busy')).toBe(false);
    expect(el.shadowRoot.querySelector('.skeleton')).toBeNull();
    expect(el.shadowRoot.querySelector('.content').hidden).toBe(false);
  });

  it('draws tables with the columns asked', () => {
    const el = mount('<vt-skeleton shape="table" rows="3" columns="5"></vt-skeleton>');
    const rows = el.shadowRoot.querySelectorAll('.table-row');
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelectorAll('.bone')).toHaveLength(5);
  });
});

describe('<vt-loading-overlay>', () => {
  it('makes the content inert while shown, and restores it', async () => {
    const el = mount(
      '<vt-loading-overlay text="Saving…"><form><button>Go</button></form><p inert>kept</p></vt-loading-overlay>',
    );
    await flush();
    const [form, p] = el.children;
    expect(form.hasAttribute('inert')).toBe(true);
    expect(el.getAttribute('aria-busy')).toBe('');
    expect(el.shadowRoot.querySelector('.panel').getAttribute('aria-label')).toBe('Saving…');
    el.stop();
    expect(form.hasAttribute('inert')).toBe(false);
    expect(p.hasAttribute('inert')).toBe(true);
    expect(el.shadowRoot.querySelector('.overlay')).toBeNull();
  });

  it('fires vt-cancel from its button', () => {
    const el = mount(
      '<vt-loading-overlay cancelable cancel-text="Stop"><p>x</p></vt-loading-overlay>',
    );
    const cancel = vi.fn();
    el.addEventListener('vt-cancel', cancel);
    const button = el.shadowRoot.querySelector('.overlay-cancel');
    expect(button.textContent).toBe('Stop');
    button.click();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('<vt-page-progress>', () => {
  it('starts, trickles forward, and finishes', () => {
    vi.useFakeTimers();
    const el = mount('<vt-page-progress trickle-speed="100"></vt-page-progress>');
    expect(el.shown).toBe(false);
    el.start();
    expect(el.value).toBeCloseTo(0.08);
    vi.advanceTimersByTime(500);
    expect(el.value).toBeGreaterThan(0.08);
    expect(el.value).toBeLessThan(1);
    const complete = vi.fn();
    el.addEventListener('vt-complete', complete);
    el.done();
    expect(el.value).toBe(1);
    expect(complete).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(400);
    expect(el.shown).toBe(false);
  });

  it('never trickles past the end, and inc moves by the amount given', () => {
    const el = mount('<vt-page-progress trickle="false"></vt-page-progress>');
    el.start();
    el.inc(0.5);
    expect(el.value).toBeCloseTo(0.58);
    for (let i = 0; i < 500; i += 1) el.inc();
    expect(el.value).toBeLessThan(1);
  });
});

describe('<vt-loading-steps>', () => {
  it('lists the steps with their status, and a summary', async () => {
    const el = mount(
      '<vt-loading-steps text="Deploy"><template>done Build (42s)\nrunning Push — layer 3\npending Roll out</template></vt-loading-steps>',
    );
    await flush();
    const steps = el.shadowRoot.querySelectorAll('.step');
    expect([...steps].map((s) => s.className)).toEqual([
      'step done',
      'step running',
      'step pending',
    ]);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(el.shadowRoot.querySelector('.steps-summary').textContent).toContain('Step 2 of 3');
    expect(el.shadowRoot.querySelector('.step-duration').textContent).toBe('42 s');
  });

  it('updates a step and fires progress and complete', async () => {
    const el = mount(
      '<vt-loading-steps><template>running A\npending B</template></vt-loading-steps>',
    );
    await flush();
    const events = [];
    el.addEventListener('vt-progress', (e) =>
      events.push(`progress ${e.detail.value}/${e.detail.max}`),
    );
    el.addEventListener('vt-complete', (e) => events.push(`complete ${e.detail.status}`));
    el.setStep(0, { status: 'done' });
    await flush();
    el.setStep('B', { status: 'done' });
    await flush();
    expect(events).toEqual(['progress 1/2', 'progress 2/2', 'complete done']);
  });
});

describe('<vt-typing>', () => {
  it('says who is typing', () => {
    const name = (/** @type {string} */ value) =>
      mount(`<vt-typing name="${value}"></vt-typing>`)
        .shadowRoot.querySelector('.indicator')
        .getAttribute('aria-label');
    expect(name('Ada')).toBe('Ada is typing…');
    expect(name('Ada, Linus')).toBe('Ada and Linus are typing…');
    expect(name('A, B, C')).toBe('3 people are typing…');
    expect(
      mount('<vt-typing></vt-typing>')
        .shadowRoot.querySelector('.indicator')
        .getAttribute('aria-label'),
    ).toBe('Someone is typing…');
  });
});

describe('<vt-loading-button>', () => {
  it('ignores clicks while loading, and keeps focus with aria-disabled', () => {
    const el = mount('<vt-loading-button loading loading-text="Saving…">Save</vt-loading-button>');
    const clicks = vi.fn();
    el.addEventListener('click', clicks);
    const button = el.shadowRoot.querySelector('button');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Saving…');
    button.click();
    expect(clicks).not.toHaveBeenCalled();
  });

  it('tracks a promise, then shows the outcome for a while', async () => {
    vi.useFakeTimers();
    const el = mount(
      '<vt-loading-button success-text="Saved" reset-after="1s">Save</vt-loading-button>',
    );
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    el.track(promise);
    expect(el.loading).toBe(true);
    resolve();
    await vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.loading).toBe(false);
    expect(el.shadowRoot.querySelector('button').textContent).toContain('Saved');
    vi.advanceTimersByTime(1100);
    expect(el.shadowRoot.querySelector('button').textContent).not.toContain('Saved');
  });

  it('submits its form', () => {
    document.body.innerHTML =
      '<form><vt-loading-button type="submit">Send</vt-loading-button></form>';
    const form = document.querySelector('form');
    const submit = vi.fn((e) => e.preventDefault());
    form.addEventListener('submit', submit);
    form.querySelector('vt-loading-button').shadowRoot.querySelector('button').click();
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe('<vt-loading-message>', () => {
  it('moves through its messages and says when it is slow', () => {
    vi.useFakeTimers();
    const el = mount(
      '<vt-loading-message interval="1s" slow-after="3s" messages="One|Two|Three"></vt-loading-message>',
    );
    const text = () => el.shadowRoot.querySelector('.message').textContent;
    expect(text()).toBe('One');
    vi.advanceTimersByTime(1100);
    expect(text()).toBe('Two');
    vi.advanceTimersByTime(2100);
    expect(text()).toBe('Three');
    expect(el.shadowRoot.querySelector('.slow').textContent).toBe(
      'This is taking longer than usual…',
    );
    vi.advanceTimersByTime(5000);
    expect(text()).toBe('Three');
  });

  it('reads its messages from its lines', () => {
    const el = mount('<vt-loading-message>\n  Connecting…\n  Fetching…\n</vt-loading-message>');
    expect(el.messages).toEqual(['Connecting…', 'Fetching…']);
  });
});
