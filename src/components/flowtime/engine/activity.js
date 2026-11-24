// @ts-nocheck
// Migrated Flowtime engine. The public contract is typed in flowtime.d.ts;
// behavior is covered by tests/flowtime and the vt-flowtime integration tests.
import { activityHistogram, filterEvents, timeTicks } from './model.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function periodLabel(step) {
  for (const [size, name] of [
    [86400000, 'day'],
    [3600000, 'hour'],
    [60000, 'minute'],
  ]) {
    if (step >= size) {
      const count = step / size;
      return `${count} ${name}${count === 1 ? '' : 's'}`;
    }
  }
}

/** The activity overview owns only its gesture preview; Flowtime owns the filter. */
export class ActivityFilter {
  constructor({ onChange, formatDate, formatTime, timeZone, colorFor, signal }) {
    Object.assign(this, {
      onChange,
      formatDate,
      formatTime,
      timeZone,
      colorFor,
    });
    this.range = {};
    this.buttons = [];
    this.root = el('section', 'ft-activity');
    this.root.setAttribute('aria-label', 'Filter events by activity');
    const header = el('div', 'ft-activity-header');
    const heading = el('div', 'ft-activity-heading');
    this.title = el('strong', 'ft-activity-title', 'Event activity');
    this.summary = el('span', 'ft-activity-summary', 'All dates');
    heading.append(this.title, this.summary);
    this.reset = el('button', 'ft-activity-reset', 'Show all dates');
    this.reset.type = 'button';
    this.reset.addEventListener('click', () => this.onChange({}), { signal });
    header.append(heading, this.reset);
    this.plot = el('div', 'ft-activity-bars');
    this.plot.setAttribute('role', 'group');
    this.plot.setAttribute('aria-label', 'Event activity periods');
    this.axis = el('div', 'ft-activity-axis');
    this.axis.setAttribute('aria-hidden', 'true');
    const hint = el(
      'p',
      'ft-activity-hint',
      'Click a bar to select a period. Drag or Shift-click to select a range.',
    );
    this.root.append(header, this.plot, this.axis, hint);
    this.plot.addEventListener('pointerdown', (event) => this.pointerDown(event), { signal });
    this.plot.addEventListener('pointermove', (event) => this.pointerMove(event), { signal });
    this.plot.addEventListener('pointerup', (event) => this.pointerUp(event), {
      signal,
    });
    for (const type of ['pointercancel', 'lostpointercapture'])
      this.plot.addEventListener(type, () => this.cancel(), { signal });
    this.root.addEventListener('keydown', (event) => this.keyDown(event), {
      signal,
    });
  }

  render(events, query, groups, range) {
    this.cancel();
    this.range = range;
    const groupKey = JSON.stringify([...groups].sort());
    if (this.events !== events || this.query !== query || this.groupKey !== groupKey) {
      this.events = events;
      this.query = query;
      this.groupKey = groupKey;
      this.anchor = null;
      this.data = activityHistogram(filterEvents(events, query, groups), events);
      this.plot.replaceChildren();
      this.buttons = [];
      if (this.data) {
        const { buckets, step } = this.data;
        const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
        this.title.textContent = `Events per ${periodLabel(step)} · ${this.timeZone}`;
        buckets.forEach((bucket, index) => {
          const label = `${this.label(bucket.start)} — ${this.label(bucket.end - 1)} ${this.timeZone}: ${bucket.count} ${bucket.count === 1 ? 'event' : 'events'}`;
          const bar = el('button', 'ft-activity-bar');
          bar.type = 'button';
          bar.dataset.index = String(index);
          bar.title = label;
          bar.setAttribute('aria-label', label);
          bar.dataset.empty = String(!bucket.count);
          for (const [group, count] of bucket.groups) {
            const part = el('span', 'ft-activity-part');
            part.setAttribute('aria-hidden', 'true');
            part.style.height = `${(count / peak) * 100}%`;
            part.style.setProperty('--ft-group', this.colorFor(group));
            bar.append(part);
          }
          bar.addEventListener('click', (event) => {
            if (this.suppressClick && event.detail > 0) {
              this.suppressClick = false;
              return;
            }
            this.choose(index, event.shiftKey);
          });
          this.buttons.push(bar);
          this.plot.append(bar);
        });
        this.selection = el('div', 'ft-activity-selection');
        this.selection.setAttribute('aria-hidden', 'true');
        this.plot.append(this.selection);
      }
    }
    this.root.hidden = !this.data;
    this.renderAxis();
    this.paint(range);
  }

  renderAxis() {
    this.axis.replaceChildren();
    if (!this.data) return;
    const { start, end, step } = this.data;
    const width = this.plot.clientWidth || 640;
    const daily = step >= 86400000;
    const spansDays = this.formatDate(start) !== this.formatDate(end - 1);
    const gap = daily || spansDays ? 118 : 72;
    const position = (time) => ((time - start) / (end - start)) * width;
    const times = [start];
    for (const time of timeTicks(start, end, width * 1.3)) {
      const x = position(time);
      if (x - position(times.at(-1)) >= gap && width - x >= gap) times.push(time);
    }
    times.push(end - 1);
    times.forEach((time, index) => {
      const tick = el('span', 'ft-activity-tick');
      tick.style.left = `${(position(time) / width) * 100}%`;
      tick.append(el('span', '', daily ? this.formatDate(time) : this.formatTime(time)));
      if (!daily && (spansDays || index === 0 || index === times.length - 1))
        tick.append(el('small', '', this.formatDate(time)));
      this.axis.append(tick);
    });
  }

  label(time) {
    return this.data.step >= 86400000
      ? this.formatDate(time)
      : `${this.formatDate(time)} ${this.formatTime(time)}`;
  }
  bounds(first, last = first) {
    return {
      start: this.data.buckets[Math.min(first, last)].start,
      end: this.data.buckets[Math.max(first, last)].end - 1,
    };
  }
  choose(index, extend = false) {
    const anchor = extend && this.anchor !== null ? this.anchor : index;
    this.anchor = anchor;
    const range = this.bounds(anchor, index);
    this.onChange(
      !extend && range.start === this.range.start && range.end === this.range.end ? {} : range,
    );
  }
  paint(range) {
    if (!this.data) return;
    const active = range.start != null || range.end != null;
    this.reset.disabled = !active;
    this.summary.textContent = active
      ? `${range.start == null ? 'Any date' : this.label(range.start)} — ${range.end == null ? 'Any date' : this.label(range.end)}`
      : 'All dates';
    this.root.dataset.filtered = String(active);
    this.buttons.forEach((bar, index) => {
      const bucket = this.data.buckets[index];
      const selected =
        active &&
        (range.start == null || bucket.end > range.start) &&
        (range.end == null || bucket.start <= range.end);
      bar.dataset.selected = String(selected);
      bar.setAttribute('aria-pressed', String(selected));
    });
    this.selection.hidden = !active;
    if (active) {
      const { start, end } = this.data;
      const left = Math.max(0, Math.min(1, ((range.start ?? start) - start) / (end - start)));
      const right = Math.max(
        left,
        Math.min(1, ((range.end == null ? end : range.end + 1) - start) / (end - start)),
      );
      this.selection.style.left = `${left * 100}%`;
      this.selection.style.width = `${(right - left) * 100}%`;
    }
  }
  indexAt(clientX) {
    const rect = this.plot.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        this.buttons.length - 1,
        Math.floor(((clientX - rect.left) / rect.width) * this.buttons.length),
      ),
    );
  }
  pointerDown(event) {
    this.suppressClick = false;
    if (
      !this.data ||
      event.button !== 0 ||
      event.isPrimary === false ||
      !event.target.closest('.ft-activity-bar')
    )
      return;
    const index = this.indexAt(event.clientX);
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      anchor: event.shiftKey && this.anchor !== null ? this.anchor : index,
      index,
      moved: false,
    };
  }
  pointerMove(event) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - drag.x);
    if (!drag.moved) {
      if (dx < 4 || dx < Math.abs(event.clientY - drag.y)) return;
      drag.moved = true;
      this.plot.setPointerCapture(event.pointerId);
      this.root.dataset.dragging = 'true';
    }
    drag.index = this.indexAt(event.clientX);
    this.paint(this.bounds(drag.anchor, drag.index));
  }
  pointerUp(event) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) this.pointerMove(event);
    this.drag = null;
    this.root.dataset.dragging = 'false';
    if (this.plot.hasPointerCapture(event.pointerId))
      this.plot.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;
    this.suppressClick = true;
    this.anchor = drag.anchor;
    this.onChange(this.bounds(drag.anchor, drag.index));
    this.buttons[drag.index].focus({ preventScroll: true });
  }
  cancel() {
    const drag = this.drag;
    this.drag = null;
    this.root.dataset.dragging = 'false';
    if (drag && this.plot.hasPointerCapture(drag.pointerId))
      this.plot.releasePointerCapture(drag.pointerId);
    if (drag) this.paint(this.range);
  }
  keyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.drag) this.cancel();
      else this.onChange({});
      return;
    }
    const bar = event.target.closest('.ft-activity-bar');
    if (!bar || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(bar.dataset.index);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.buttons.length - 1
          : Math.max(
              0,
              Math.min(this.buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
            );
    this.buttons[next].focus({ preventScroll: true });
    if (event.shiftKey) {
      this.anchor ??= index;
      this.choose(next, true);
    }
  }
  destroy() {
    this.cancel();
  }
}
