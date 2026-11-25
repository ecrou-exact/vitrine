// @ts-nocheck
// Migrated Flowtime engine. The public contract is typed in flowtime.d.ts;
// behavior is covered by tests/flowtime and the vt-flowtime integration tests.
export const DEFAULT_GROUPS = [
  { id: 'events', label: 'Events', color: '#6575d7', icon: '•' },
  { id: 'notes', label: 'Notes', color: '#249790', icon: '✎' },
  { id: 'milestones', label: 'Milestones', color: '#d49635', icon: '◇' },
  { id: 'attachments', label: 'Attachments', color: '#bb7395', icon: '▤' },
];

// ISO timestamps without an offset are interpreted as UTC, consistently on every client.
export function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  let text = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00Z';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) text += 'Z';
  // Reject calendar overflow (Date.parse would silently move February 30 into March).
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return NaN;
  const [, y, m, d] = parts.map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(y, m - 1, d);
  if (
    calendar.getUTCFullYear() !== y ||
    calendar.getUTCMonth() !== m - 1 ||
    calendar.getUTCDate() !== d
  )
    return NaN;
  return Date.parse(text);
}

export function normalizeEvents(input) {
  if (!Array.isArray(input)) throw new TypeError('Flowtime events must be an array.');
  const ids = new Set();
  return input
    .map((event, index) => {
      const id = String(event.id ?? index);
      if (ids.has(id)) throw new TypeError(`Duplicate event id: ${id}`);
      ids.add(id);
      const start = timestamp(event.start);
      const end = event.end == null ? null : timestamp(event.end);
      if (!Number.isFinite(start))
        throw new TypeError(`Invalid start date for event ${id}. Use ISO 8601.`);
      if (end !== null && (!Number.isFinite(end) || end < start))
        throw new TypeError(`Invalid end date for event ${id}.`);
      return {
        ...event,
        id,
        start,
        end,
        title: String(event.title ?? 'Untitled event'),
        description: String(event.description ?? ''),
        group: String(event.group ?? 'events'),
      };
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function normalizeDateRange({ start = null, end = null } = {}) {
  const parse = (value, label) => {
    if (value === null || value === '') return null;
    const time = timestamp(value);
    if (!Number.isFinite(time))
      throw new TypeError(`${label} must be a valid ISO date or timestamp.`);
    return time;
  };
  start = parse(start, 'Range start');
  // Date-only end bounds include the entire UTC day.
  const dayEnd = typeof end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end);
  end = parse(end, 'Range end');
  if (dayEnd) end += 86400000 - 1;
  if (start !== null && end !== null && start > end)
    throw new RangeError('The end must be on or after the start.');
  return { start, end };
}

export function filterEvents(events, query = '', groups = null, dateRange = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return events.filter(
    (event) =>
      (!groups || groups.has(event.group)) &&
      (!needle ||
        `${event.title}\n${event.description}\n${event.group}`
          .toLocaleLowerCase()
          .includes(needle)) &&
      (dateRange.start == null || (event.end ?? event.start) >= dateRange.start) &&
      (dateRange.end == null || event.start <= dateRange.end),
  );
}

export function extent(events) {
  if (!events.length) return [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)];
  let min = Infinity,
    max = -Infinity;
  for (const event of events) {
    min = Math.min(min, event.start);
    max = Math.max(max, event.end ?? event.start);
  }
  const padding = Math.max((max - min) * 0.09, 60_000);
  return [min - padding, max + padding];
}

export function timeTicks(from, to, width) {
  const target = (to - from) / Math.max(2, Math.floor(width / 110));
  const steps = [
    1000, 5000, 15000, 30000, 60000, 300000, 900000, 1800000, 3600000, 7200000, 21600000, 43200000,
    86400000, 604800000, 2592000000, 31536000000,
  ];
  const step =
    steps.find((value) => value >= target) ?? Math.ceil(target / 31536000000) * 31536000000;
  const ticks = [];
  for (let time = Math.ceil(from / step) * step; time < to; time += step) ticks.push(time);
  return ticks;
}

// Greedy packing keeps even events at the exact same time reachable.
export function packEvents(events, from, to, width, cardWidth = 172, clamp = true) {
  const rows = [];
  return events.map((event) => {
    const markerX = ((event.start - from) / (to - from)) * width;
    const x = clamp ? Math.max(8, Math.min(width - cardWidth - 8, markerX)) : markerX;
    const right = Math.max(
      x + cardWidth,
      event.end == null ? x : ((event.end - from) / (to - from)) * width,
    );
    let row = rows.findIndex((last) => last + 12 < x);
    if (row < 0) row = rows.length;
    rows[row] = right;
    return { event, x, markerX, row, right };
  });
}

// Keep the overview's domain independent of its active date filter. Buckets are
// aligned in UTC and bounded in number, even for a very long investigation.
export function activityHistogram(events, domainEvents = events, maxBuckets = 56) {
  if (!domainEvents.length) return null;
  let first = Infinity,
    last = -Infinity;
  for (const event of domainEvents) {
    first = Math.min(first, event.start);
    last = Math.max(last, event.end ?? event.start);
  }
  const target = Math.max(
    last - first >= 86400000 ? 86400000 : 0,
    (last - first) / (maxBuckets - 1),
  );
  const steps = [
    60000, 300000, 900000, 1800000, 3600000, 10800000, 21600000, 43200000, 86400000, 604800000,
    2592000000, 31536000000,
  ];
  const step =
    steps.find((value) => value >= target) ?? Math.ceil(target / 31536000000) * 31536000000;
  let start = Math.floor(first / step) * step;
  let count = Math.floor((last - start) / step) + 1;
  const minimum = Math.min(12, maxBuckets);
  if (count < minimum) {
    start -= Math.floor((minimum - count) / 2) * step;
    count = minimum;
  }
  const buckets = Array.from({ length: count }, (_, index) => ({
    start: start + index * step,
    end: start + (index + 1) * step,
    count: 0,
    groups: new Map(),
  }));
  for (const event of events) {
    const bucket = buckets[Math.floor((event.start - start) / step)];
    if (!bucket) continue;
    bucket.count++;
    bucket.groups.set(event.group, (bucket.groups.get(event.group) ?? 0) + 1);
  }
  return { start, end: start + count * step, step, buckets };
}
