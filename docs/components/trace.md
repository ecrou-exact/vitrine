# `<vt-trace>`

`<vt-trace>` shows a distributed trace as a waterfall: each span on its own row, indented under its parent, with a bar for when it ran, its service and its duration. Choosing a span shows its attributes, events and ids. Errors are marked with an icon and an outline, never with color alone, and each service keeps its color next to its name.

```html
<vt-trace variant="full" src="/traces/checkout.json"></vt-trace>
```

## What it reads

| Format                    | Example                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenTelemetry (OTLP JSON) | `{ "resourceSpans": [...] }`, also one document per line as the collector's file exporter writes them |
| Jaeger                    | The JSON downloaded from the Jaeger UI, or returned by its API (`{ "data": [...] }`)                  |
| Zipkin v2                 | `[{ "traceId", "id", "parentId", "name", "timestamp", "duration", "localEndpoint" }]`                 |
| A plain list              | `[{ id, parent, name, service, start, duration }]`, times in milliseconds or ISO dates                |

Nanosecond timestamps of OpenTelemetry are read without losing precision. The service of a span is the `service.name` of its resource (OTLP), its process (Jaeger) or its local endpoint (Zipkin). A span whose parent is not in the file becomes a root, with a note; a file with several traces shows one at a time, with a list to choose another.

A plain list:

```js
document.querySelector('vt-trace').data = [
  { id: 'a', name: 'GET /checkout', service: 'web', start: 0, duration: 240 },
  { id: 'b', parent: 'a', name: 'SELECT items', service: 'postgres', start: 50, duration: 60 },
  { id: 'c', parent: 'a', name: 'payment.charge', service: 'payments', start: 125, duration: 110, error: 'card declined' },
];
```

Each span may also have `end`, `kind`, `status` (`ok` or `error`), `attributes` (an object) and `events` (`[{ name, time }]`).

## Keyboard

The rows follow the tree view pattern of WAI-ARIA:

| Key          | Action                                    |
| ------------ | ----------------------------------------- |
| ↓ ↑          | Next or previous span                     |
| →            | Opens a span, or moves to its first child |
| ←            | Closes a span, or moves to its parent     |
| Home, End    | First or last span                        |
| Enter, Space | Shows the details of the span             |

The search finds spans by name, service, id or attribute value, and opens their parents.

## Attributes

| Attribute        | Type    | Default                 | Description                                      |
| ---------------- | ------- | ----------------------- | ------------------------------------------------ |
| `trace`          | string  | the first               | Id of the trace shown, when the file has several |
| `selected`       | string  | none                    | Id of the span selected at first                 |
| `depth`          | number  | all (3 above 500 spans) | Levels open at first                             |
| `details`        | boolean | on                      | The details of the selected span                 |
| `legend`         | boolean | on                      | The services, with their colors                  |
| `expand-buttons` | boolean | preset                  | Buttons that open or close every span            |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, search, copy (the spans as JSON, times in milliseconds), download, full screen and the open and close buttons.

## Properties

`traces` is the list of traces read (read-only copies): `{ id, spans, roots, duration, startedAt, services }`. Span times are in microseconds from the start of the trace. `selected` is the id of the selected span; setting it selects a span.

## Events

| Event       | When                        | Detail                                                                           |
| ----------- | --------------------------- | -------------------------------------------------------------------------------- |
| `vt-select` | A span was selected         | `{ id, traceId, name, service, start, duration, status }`, times in milliseconds |
| `vt-toggle` | A span was opened or closed | `{ id, expanded }`                                                               |

## CSS parts

`summary`, `legend`, `waterfall`, `ruler`, `span` (also `span-error`, `span-selected`), `bar` and `details`.
