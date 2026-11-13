// @ts-check
/**
 * Reads distributed traces for <vt-trace>: OpenTelemetry (OTLP JSON, as written by the
 * collector's file exporter and `otel-cli`), Jaeger (UI download and API), Zipkin v2, or a
 * plain list of spans. Times become microseconds from the start of the trace; nanosecond
 * timestamps are read with BigInt so no precision is lost.
 *
 * @module components/trace/trace
 */

/** Spans kept per file. */
export const MAX_SPANS = 20_000;
/** Attributes and events kept per span. */
const MAX_ITEMS = 200;

/**
 * @typedef {object} Attribute
 * @property {string} key
 * @property {string} value - Shown as text: strings as they are, other values as JSON.
 */

/**
 * @typedef {object} SpanEvent
 * @property {string} name
 * @property {number} time - Microseconds from the start of the trace.
 * @property {Attribute[]} attributes
 */

/**
 * @typedef {object} Span
 * @property {string} id
 * @property {string} parentId - `""` for a root.
 * @property {string} traceId
 * @property {string} name
 * @property {string} service
 * @property {string} kind - `server`, `client`, `producer`, `consumer`, `internal` or `""`.
 * @property {number} start - Microseconds from the start of the trace.
 * @property {number} duration - Microseconds.
 * @property {"ok" | "error" | "unset"} status
 * @property {string} statusMessage
 * @property {Attribute[]} attributes
 * @property {SpanEvent[]} events
 * @property {number} links
 * @property {number} depth - Set by {@link buildTree}.
 * @property {string[]} children - Ids of the child spans, by start time. Set by {@link buildTree}.
 * @property {boolean} orphan - Its parent is not in the file.
 */

/**
 * @typedef {object} Trace
 * @property {string} id
 * @property {Span[]} spans - In tree order: each span before its children.
 * @property {string[]} roots - Ids of the top spans.
 * @property {number} duration - Microseconds from the first start to the last end.
 * @property {number | null} startedAt - Start of the trace, in milliseconds since 1970, when known.
 * @property {string[]} services - In order of appearance.
 */

export class TraceError extends Error {}

/**
 * @typedef {object} RawSpan
 * @property {Omit<Span, "start" | "duration" | "depth" | "children" | "orphan" | "events">} span
 * @property {bigint} start - Nanoseconds since 1970 (or since an unknown origin).
 * @property {bigint} end
 * @property {{ name: string, time: bigint, attributes: Attribute[] }[]} events
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 */
const str = (value, max = 2000) =>
  typeof value === 'string'
    ? value.slice(0, max)
    : value == null
      ? ''
      : String(value).slice(0, max);

/**
 * Reads a whole number of some unit as nanoseconds. Accepts numbers, numeric strings and
 * (for plain lists) ISO dates.
 *
 * @param {unknown} value
 * @param {bigint} scale - Nanoseconds per unit.
 * @returns {bigint | null}
 */
function nanos(value, scale) {
  if (typeof value === 'bigint') return value * scale;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Whole numbers are multiplied as BigInt: microseconds since 1970 times 1000 no longer
    // fit in a double. Fractions (milliseconds with decimals) are kept to the nanosecond.
    if (Number.isSafeInteger(value)) return BigInt(value) * scale;
    return BigInt(Math.round(value * Number(scale)));
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{1,30}$/.test(text)) return BigInt(text) * scale;
    if (/^\d+\.\d+$/.test(text)) return BigInt(Math.round(Number(text) * Number(scale)));
    const date = Date.parse(text);
    if (/^\d{4}-\d\d-\d\d/.test(text) && Number.isFinite(date)) return BigInt(date) * 1_000_000n;
  }
  return null;
}

/**
 * Reads traces from JSON text.
 *
 * @param {string} text
 * @returns {Trace[]}
 */
export function parseTraces(text) {
  const source = text.trim();
  if (!source) throw new TraceError('empty');
  /** @type {unknown} */
  let value;
  // OTLP files written by the collector hold one JSON document per line.
  if (/^\{/.test(source) && /\}\s*\n\s*\{/.test(source)) {
    const documents = source.split(/\n(?=\s*\{)/).map((line) => JSON.parse(line));
    value = { resourceSpans: documents.flatMap((d) => (isObject(d) && Array.isArray(d.resourceSpans) ? d.resourceSpans : [])) }; // prettier-ignore
  } else value = JSON.parse(source);
  return readTraces(value);
}

/**
 * @param {unknown} value
 * @returns {Trace[]}
 */
export function readTraces(value) {
  /** @type {RawSpan[]} */
  let raw;
  if (isObject(value) && (Array.isArray(value.resourceSpans) || Array.isArray(value.batches)))
    raw = fromOtlp(/** @type {unknown[]} */ (value.resourceSpans ?? value.batches));
  else if (
    isObject(value) &&
    Array.isArray(value.data) &&
    value.data.some((t) => isObject(t) && Array.isArray(t.spans))
  )
    raw = value.data.flatMap((t) => (isObject(t) ? fromJaeger(t) : []));
  else if (
    isObject(value) &&
    Array.isArray(value.spans) &&
    (isObject(value.processes) ||
      /** @type {unknown[]} */ (value.spans).some((s) => isObject(s) && 'spanID' in s))
  )
    raw = fromJaeger(value);
  else if (isObject(value) && Array.isArray(value.spans)) raw = fromList(value.spans);
  else if (Array.isArray(value) && value.length && value.every(Array.isArray))
    raw = value.flat().length && isZipkin(value.flat()[0]) ? fromZipkin(value.flat()) : fromList(value.flat()); // prettier-ignore
  else if (Array.isArray(value))
    raw = value.length && isZipkin(value[0]) ? fromZipkin(value) : fromList(value); // prettier-ignore
  else throw new TraceError('format');
  if (!raw.length) throw new TraceError('noSpans');
  return group(raw);
}

/**
 * @param {unknown} span
 */
const isZipkin = (span) => isObject(span) && 'traceId' in span && 'id' in span && ('timestamp' in span || 'localEndpoint' in span); // prettier-ignore

// ------------------------------------------------------------------ OTLP

/**
 * An OTLP `AnyValue` as text.
 *
 * @param {unknown} value
 * @returns {string}
 */
function anyValue(value) {
  if (!isObject(value)) return str(value);
  if ('stringValue' in value) return str(value.stringValue);
  if ('intValue' in value) return str(value.intValue);
  if ('doubleValue' in value) return str(value.doubleValue);
  if ('boolValue' in value) return str(value.boolValue);
  if ('bytesValue' in value) return str(value.bytesValue);
  if (isObject(value.arrayValue) && Array.isArray(value.arrayValue.values))
    return JSON.stringify(value.arrayValue.values.map(anyValue)).slice(0, 2000);
  if (isObject(value.kvlistValue) && Array.isArray(value.kvlistValue.values))
    return JSON.stringify(Object.fromEntries(otlpAttributes(value.kvlistValue.values).map((a) => [a.key, a.value]))).slice(0, 2000); // prettier-ignore
  return '';
}

/**
 * @param {unknown} list
 * @returns {Attribute[]}
 */
function otlpAttributes(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_ITEMS)
    .filter(isObject)
    .map((a) => ({ key: str(a.key, 200), value: anyValue(a.value) }));
}

/** OTLP span kinds, by number and by name. */
const OTLP_KINDS = ['', 'internal', 'server', 'client', 'producer', 'consumer'];

/**
 * @param {unknown} kind
 * @returns {string}
 */
function kindOf(kind) {
  if (typeof kind === 'number') return OTLP_KINDS[kind] ?? '';
  const name = str(kind, 40)
    .toLowerCase()
    .replace(/^span_kind_/, '');
  return ['internal', 'server', 'client', 'producer', 'consumer'].includes(name) ? name : '';
}

/**
 * OTLP ids are hex in JSON; some exporters write base64 (the protobuf JSON mapping).
 *
 * @param {unknown} value
 * @returns {string}
 */
function otlpId(value) {
  const text = str(value, 100);
  if (!text || /^[\da-f]+$/i.test(text)) return text.toLowerCase();
  try {
    return Array.from(atob(text), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  } catch {
    return text;
  }
}

/**
 * @param {unknown[]} resourceSpans
 * @returns {RawSpan[]}
 */
function fromOtlp(resourceSpans) {
  /** @type {RawSpan[]} */
  const spans = [];
  for (const resource of resourceSpans) {
    if (!isObject(resource)) continue;
    const resAttrs = otlpAttributes(
      isObject(resource.resource) ? resource.resource.attributes : [],
    );
    const service = resAttrs.find((a) => a.key === 'service.name')?.value ?? '';
    const scopes = resource.scopeSpans ?? resource.instrumentationLibrarySpans ?? [];
    for (const scope of Array.isArray(scopes) ? scopes : []) {
      if (!isObject(scope) || !Array.isArray(scope.spans)) continue;
      for (const s of scope.spans) {
        if (!isObject(s) || spans.length >= MAX_SPANS) continue;
        const start = nanos(s.startTimeUnixNano, 1n);
        const end = nanos(s.endTimeUnixNano, 1n);
        if (start === null) continue;
        const status = isObject(s.status) ? s.status : {};
        const code = str(status.code).toLowerCase();
        spans.push({
          span: {
            id: otlpId(s.spanId),
            parentId: otlpId(s.parentSpanId),
            traceId: otlpId(s.traceId),
            name: str(s.name, 500),
            service,
            kind: kindOf(s.kind),
            status: code === '2' || code.endsWith('error') ? 'error' : code === '1' || code.endsWith('ok') ? 'ok' : 'unset', // prettier-ignore
            statusMessage: str(status.message),
            attributes: [...otlpAttributes(s.attributes), ...resAttrs.filter((a) => a.key !== 'service.name').map((a) => ({ ...a, key: `resource.${a.key}` }))].slice(0, MAX_ITEMS), // prettier-ignore
            links: Array.isArray(s.links) ? s.links.length : 0,
          },
          start,
          end: end !== null && end >= start ? end : start,
          events: (Array.isArray(s.events) ? s.events : []).slice(0, MAX_ITEMS).filter(isObject).map((e) => ({
            name: str(e.name, 500),
            time: nanos(e.timeUnixNano, 1n) ?? start,
            attributes: otlpAttributes(e.attributes),
          })), // prettier-ignore
        });
      }
    }
  }
  return spans;
}

// ------------------------------------------------------------------ Jaeger

/**
 * @param {unknown} list
 * @returns {Attribute[]}
 */
function tags(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_ITEMS)
    .filter(isObject)
    .map((tag) => ({ key: str(tag.key, 200), value: typeof tag.value === 'string' ? tag.value.slice(0, 2000) : (JSON.stringify(tag.value) ?? '').slice(0, 2000) })); // prettier-ignore
}

/**
 * @param {Record<string, unknown>} trace
 * @returns {RawSpan[]}
 */
function fromJaeger(trace) {
  const processes = isObject(trace.processes) ? trace.processes : {};
  /** @type {RawSpan[]} */
  const spans = [];
  for (const s of /** @type {unknown[]} */ (trace.spans).slice(0, MAX_SPANS)) {
    if (!isObject(s)) continue;
    const start = nanos(s.startTime, 1000n);
    if (start === null) continue;
    const duration = nanos(s.duration, 1000n) ?? 0n;
    const refs = Array.isArray(s.references) ? s.references.filter(isObject) : [];
    const parent = refs.find((r) => str(r.refType).toUpperCase() === 'CHILD_OF') ?? refs[0];
    const process = isObject(s.process) ? s.process : processes[str(s.processID)];
    const spanTags = tags(s.tags);
    const kind = spanTags.find((t) => t.key === 'span.kind')?.value ?? '';
    const error = spanTags.some((t) => t.key === 'error' && t.value === 'true') || spanTags.some((t) => t.key === 'otel.status_code' && t.value === 'ERROR'); // prettier-ignore
    spans.push({
      span: {
        id: str(s.spanID, 100),
        parentId: parent ? str(parent.spanID, 100) : str(s.parentSpanID, 100),
        traceId: str(s.traceID, 100),
        name: str(s.operationName, 500),
        service: isObject(process) ? str(process.serviceName, 200) : '',
        kind: kindOf(kind),
        status: error ? 'error' : 'unset',
        statusMessage: spanTags.find((t) => t.key === 'otel.status_description' || t.key === 'error.message')?.value ?? '', // prettier-ignore
        attributes: [...spanTags, ...tags(isObject(process) ? process.tags : []).map((t) => ({ ...t, key: `process.${t.key}` }))].slice(0, MAX_ITEMS), // prettier-ignore
        links: Math.max(0, refs.length - 1),
      },
      start,
      end: start + duration,
      events: (Array.isArray(s.logs) ? s.logs : []).slice(0, MAX_ITEMS).filter(isObject).map((log) => {
        const fields = tags(log.fields);
        const name = fields.find((f) => f.key === 'event' || f.key === 'message')?.value ?? 'log';
        return { name, time: nanos(log.timestamp, 1000n) ?? start, attributes: fields.filter((f) => f.key !== 'event') };
      }), // prettier-ignore
    });
  }
  return spans;
}

// ------------------------------------------------------------------ Zipkin

/**
 * @param {unknown[]} list
 * @returns {RawSpan[]}
 */
function fromZipkin(list) {
  /** @type {RawSpan[]} */
  const spans = [];
  for (const s of list.slice(0, MAX_SPANS)) {
    if (!isObject(s)) continue;
    const start = nanos(s.timestamp, 1000n);
    if (start === null) continue;
    const spanTags = isObject(s.tags) ? Object.entries(s.tags).slice(0, MAX_ITEMS).map(([key, value]) => ({ key: key.slice(0, 200), value: str(value) })) : []; // prettier-ignore
    const local = isObject(s.localEndpoint) ? s.localEndpoint : {};
    const remote = isObject(s.remoteEndpoint) ? s.remoteEndpoint : null;
    if (remote?.serviceName)
      spanTags.push({ key: 'remote.service', value: str(remote.serviceName, 200) });
    spans.push({
      span: {
        id: str(s.id, 100),
        parentId: str(s.parentId, 100),
        traceId: str(s.traceId, 100),
        name: str(s.name, 500),
        service: str(local.serviceName, 200),
        kind: kindOf(s.kind),
        status: spanTags.some((t) => t.key === 'error') ? 'error' : 'unset',
        statusMessage: spanTags.find((t) => t.key === 'error')?.value ?? '',
        attributes: spanTags,
        links: 0,
      },
      start,
      end: start + (nanos(s.duration, 1000n) ?? 0n),
      events: (Array.isArray(s.annotations) ? s.annotations : []).slice(0, MAX_ITEMS).filter(isObject).map((a) => ({
        name: str(a.value, 500),
        time: nanos(a.timestamp, 1000n) ?? start,
        attributes: [],
      })), // prettier-ignore
    });
  }
  return spans;
}

// ------------------------------------------------------------------ plain list

/**
 * `[{ id, parent, name, service, start, end | duration, attributes, error }]`, times in
 * milliseconds (numbers) or ISO dates.
 *
 * @param {unknown[]} list
 * @returns {RawSpan[]}
 */
function fromList(list) {
  /** @type {RawSpan[]} */
  const spans = [];
  list.slice(0, MAX_SPANS).forEach((s, index) => {
    if (!isObject(s)) return;
    const start = nanos(s.start ?? s.startTime ?? s.timestamp, 1_000_000n);
    if (start === null) return;
    const durationNs = nanos(s.duration, 1_000_000n);
    const endNs = nanos(s.end ?? s.endTime, 1_000_000n);
    const end = endNs ?? (durationNs !== null ? start + durationNs : start);
    const attrs = isObject(s.attributes ?? s.tags) ? Object.entries(/** @type {Record<string, unknown>} */ (s.attributes ?? s.tags)).slice(0, MAX_ITEMS).map(([key, value]) => ({ key: key.slice(0, 200), value: typeof value === 'string' ? value.slice(0, 2000) : (JSON.stringify(value) ?? '') })) : []; // prettier-ignore
    const status = str(s.status).toLowerCase();
    const error = s.error === true || typeof s.error === 'string' || status === 'error';
    spans.push({
      span: {
        id: str(s.id ?? s.spanId ?? index + 1, 100),
        parentId: str(s.parent ?? s.parentId ?? s.parentSpanId ?? '', 100),
        traceId: str(s.traceId ?? s.trace ?? '', 100),
        name: str(s.name ?? s.operation, 500),
        service: str(s.service ?? s.serviceName, 200),
        kind: kindOf(s.kind),
        status: error ? 'error' : status === 'ok' ? 'ok' : 'unset',
        statusMessage: typeof s.error === 'string' ? s.error.slice(0, 2000) : str(s.message),
        attributes: attrs,
        links: 0,
      },
      start,
      end: end >= start ? end : start,
      events: (Array.isArray(s.events) ? s.events : []).slice(0, MAX_ITEMS).filter(isObject).map((e) => ({
        name: str(e.name, 500),
        time: nanos(e.time ?? e.timestamp, 1_000_000n) ?? start,
        attributes: [],
      })), // prettier-ignore
    });
  });
  return spans;
}

// ------------------------------------------------------------------ trees

/**
 * Groups spans by trace and makes times relative to the start of each trace.
 *
 * @param {RawSpan[]} raw
 * @returns {Trace[]}
 */
function group(raw) {
  /** @type {Map<string, RawSpan[]>} */
  const byTrace = new Map();
  for (const item of raw) {
    const list = byTrace.get(item.span.traceId);
    if (list) list.push(item);
    else byTrace.set(item.span.traceId, [item]);
  }
  return [...byTrace].map(([id, items]) => {
    let min = items[0].start;
    let max = items[0].end;
    for (const item of items) {
      if (item.start < min) min = item.start;
      if (item.end > max) max = item.end;
    }
    const micros = (/** @type {bigint} */ ns) => Number(ns - min) / 1000;
    /** @type {Span[]} */
    const spans = items.map((item) => ({
      ...item.span,
      start: micros(item.start),
      duration: Number(item.end - item.start) / 1000,
      events: item.events.map((e) => ({
        name: e.name,
        time: micros(e.time),
        attributes: e.attributes,
      })),
      depth: 0,
      children: [],
      orphan: false,
    }));
    // Timestamps after 2001 are real dates; smaller ones count from an unknown origin.
    const startedAt = min > 978_307_200_000_000_000n ? Number(min / 1_000_000n) : null;
    return buildTree({
      id,
      spans,
      roots: [],
      duration: Number(max - min) / 1000,
      startedAt,
      services: [],
    });
  });
}

/**
 * Links spans to their parents and orders them: each span before its children, children
 * by start time. Spans whose parent is missing become roots, marked as orphans; a cycle
 * of parents is broken the same way.
 *
 * @param {Trace} trace
 * @returns {Trace}
 */
export function buildTree(trace) {
  /** @type {Map<string, Span>} */
  const byId = new Map();
  // Duplicate ids (a retried span written twice) get a suffix so both stay visible.
  for (const span of trace.spans) {
    let id = span.id || '?';
    for (let n = 2; byId.has(id); n += 1) id = `${span.id}#${n}`;
    span.id = id;
    byId.set(id, span);
  }
  /** @type {string[]} */
  const roots = [];
  for (const span of trace.spans) {
    const parent = span.parentId ? byId.get(span.parentId) : undefined;
    if (parent && parent !== span) parent.children.push(span.id);
    else {
      span.orphan = Boolean(span.parentId);
      roots.push(span.id);
    }
  }
  const byStart = (/** @type {string} */ a, /** @type {string} */ b) =>
    /** @type {Span} */ (byId.get(a)).start - /** @type {Span} */ (byId.get(b)).start;
  for (const span of trace.spans) span.children.sort(byStart);
  roots.sort(byStart);

  /** @type {Span[]} */
  const ordered = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {[string, number][]} */
  const stack = roots.map((id) => /** @type {[string, number]} */ ([id, 0])).reverse();
  while (stack.length) {
    const [id, depth] = /** @type {[string, number]} */ (stack.pop());
    if (seen.has(id)) continue;
    seen.add(id);
    const span = /** @type {Span} */ (byId.get(id));
    span.depth = depth;
    ordered.push(span);
    for (let i = span.children.length - 1; i >= 0; i -= 1)
      stack.push([span.children[i], depth + 1]);
  }
  // Spans only reachable through a cycle: shown as roots.
  for (const span of trace.spans) {
    if (seen.has(span.id)) continue;
    span.orphan = true;
    span.depth = 0;
    roots.push(span.id);
    ordered.push(span);
  }
  /** @type {string[]} */
  const services = [];
  for (const span of ordered)
    if (span.service && !services.includes(span.service)) services.push(span.service);
  return { ...trace, spans: ordered, roots, services };
}

/**
 * Time between ticks of the ruler, so that about `count` ticks fit: 1, 2 or 5 times a power of ten.
 *
 * @param {number} total - Microseconds.
 * @param {number} [count]
 * @returns {number}
 */
export function tickStep(total, count = 5) {
  if (!(total > 0)) return 1;
  const rough = total / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].find((m) => m * power >= rough) ?? 10;
  return unit * power;
}

/**
 * A duration in microseconds as text: `850 µs`, `12.4 ms`, `3.21 s`, `2 min 5 s`.
 *
 * @param {number} us
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMicros(us, locale) {
  const format = (/** @type {number} */ value, /** @type {number} */ digits) => {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
    } catch {
      return value.toFixed(digits);
    }
  };
  if (us < 1000) return `${format(us, us < 10 ? 2 : 0)} µs`;
  if (us < 1_000_000) return `${format(us / 1000, us < 10_000 ? 2 : 1)} ms`;
  if (us < 60_000_000) return `${format(us / 1_000_000, 2)} s`;
  return `${Math.floor(us / 60_000_000)} min ${format((us % 60_000_000) / 1_000_000, 0)} s`;
}

/**
 * A tick of the ruler, in a unit that fits the whole ruler: `0 ms`, `50 ms`, `1.5 ms`.
 *
 * @param {number} at - Microseconds.
 * @param {number} step - Microseconds between ticks.
 * @param {string} [locale]
 * @returns {string}
 */
export function tickLabel(at, step, locale) {
  // The unit fits the whole ruler (about five steps); decimals only as fine as the step.
  const span = step * 5;
  const [unit, size] =
    span >= 1_000_000 ? ['s', 1_000_000] : span >= 1000 ? ['ms', 1000] : ['µs', 1];
  const digits = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step / size) - 1e-9)));
  const value = at / size;
  try {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${unit}`;
  } catch {
    return `${value.toFixed(digits)} ${unit}`;
  }
}
