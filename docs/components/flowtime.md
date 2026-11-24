# Flowtime investigation workspace

`<vt-flowtime>` provides source lanes, a combined timeline, a chronological feed, search, activity range selection and an event inspector. It is separate from the simpler vertical `<vt-timeline>`. Pass your own events as JavaScript data or JSON; the viewer runs entirely in the browser and requires no backend or application-specific adapter.

## HTML component

Load the Vitrine bundle, loader, or the `vitrine/flowtime-element` component entry (`dist/esm/vt-flowtime.js`):

```html
<script type="module" src="/vitrine/esm/vt-flowtime.js"></script>
<vt-flowtime label="Investigation" view="combined" src="/events.json"></vt-flowtime>
```

With a bundler, `import 'vitrine/flowtime-element'` registers the component.

Use an event array or `{ "events": [...], "groups": [...] }` as JSON in `src`, `content`, `data`, or an inline `<script type="application/json">`. Dates, labels and notes are plain text. Shared Vitrine loading, size limits, theme and `lang-ui` settings apply. `simple` shows the workspace; `full` adds the Vitrine header and fullscreen button.

```js
const element = document.querySelector('vt-flowtime');
element.data = { events, groups };
element.options = {
  actions: [{ id: 'add', label: 'Add event', onClick: () => openMyEventForm() }],
  onEdit: event => editMyRecord(event.source),
  customViews: [{ id: 'graph', label: 'Graph', mount: mountMyGraph }],
};
// The live engine is available after vt-ready:
element.addEventListener('vt-ready', () => element.viewer.fit());
```

`options` accepts the standalone configuration below and preserves callbacks as functions. Assigning structural options rebuilds the viewer; replacing JSON events retains selection when possible. Removing the element destroys observers and custom views; reconnecting mounts a fresh viewer.

| Attribute           | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `view`              | Initial `timeline`, `combined` or `feed` (default `timeline`). |
| `time-zone`         | Display zone (default `UTC`).                                  |
| `text-scale`        | Timeline text factor from `0.5` to `1.5` (default `1`).        |
| `text-size-control` | Timeline size selector, `false` to hide.                       |

Native events are bubbling and composed: `vt-ready`, `vt-select`, `vt-deselect`, `vt-tab-change`, `vt-filter-change`, `vt-text-scale-change`, and `vt-error`. Selection details contain `{ event }`; views contain `{ view }`; text size contains `{ textScale }`. CSS parts: `workspace`, `timeline`, `inspector`, `toolbar`, `controls`, plus Vitrine's shared shell parts. Vitrine theme tokens control the colors and UI font.

## Standalone JavaScript API

For integrations that own their DOM or mount framework components, use the same engine without a shadow root. Add `<div id="history"></div>` to your page, then pass an event array and optional source groups:

```js
import { Flowtime, timestamp } from 'vitrine/flowtime';
import 'vitrine/flowtime.css';
const viewer = new Flowtime(document.querySelector('#history'), {
  events: [
    {
      id: 'release',
      start: '2026-11-24T08:00:00Z',
      title: 'Release deployed',
      group: 'deployments',
    },
    {
      id: 'alert',
      start: '2026-11-24T08:30:00Z',
      title: 'Error rate increased',
      description: 'The service crossed its alert threshold.',
      group: 'incidents',
    },
  ],
  groups: [
    { id: 'deployments', label: 'Deployments', color: '#249790' },
    { id: 'incidents', label: 'Incidents', color: '#bb7395' },
  ],
  timeZone: 'UTC',
});
```

With static files, import `/vitrine/flowtime.js` and link `/vitrine/flowtime.css`. No other Vitrine modules or runtime dependencies are needed. The example above needs no API requests, credentials or callbacks. Replace its data with `viewer.setEvents(nextEvents)`; custom actions and views are optional. `timestamp(value)` parses ISO dates as described below and returns `NaN` for invalid values.

## Event format

| Field         | Meaning                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `id`          | Unique string or number. When omitted, the array index is used; explicit IDs are recommended for updates. |
| `start`       | Required ISO 8601 string, `Date`, or Unix timestamp in **milliseconds**.                                  |
| `end`         | Optional interval end, using the same format. Must be at or after `start`.                                |
| `title`       | Short event label. Defaults to “Untitled event”.                                                          |
| `description` | Optional plain text notes. Line breaks are preserved.                                                     |
| `group`       | Source lane ID. Defaults to `events`.                                                                     |
| `metadata`    | Optional object displayed in the event inspector.                                                         |
| `source`      | Optional original record, passed through for integration callbacks.                                       |

Explicit timezone offsets are respected. Timestamps without an offset, including `YYYY-MM-DD HH:mm:ss`, are interpreted as **UTC**. Non-ISO human date strings are intentionally rejected; convert them to an accepted date format before passing them to the viewer. The `timeZone` option controls display only. Duplicate IDs and invalid dates throw before replacing existing data. Event text is rendered with `textContent`; HTML is displayed literally.

## Inspector actions and date ranges

The viewer starts with no selected event and the inspector hidden, leaving the full width for the timeline or feed. Click an event to open its inspector. Use **Close event inspector** (×), press Escape while focus is in the viewer, or call `clearSelection()` to dismiss it and clear the highlight. Selecting another event reopens it. Filters and data refreshes keep an empty selection empty; if a selected event disappears or no longer matches, the inspector closes. A still-visible explicit selection survives updates.

Optional `onEdit(event)` and `onDelete(event)` callbacks add **Edit event** and **Delete event** buttons to the shared inspector. Both callbacks receive the selected normalized event, including its original `source` record. The host supplies its editor, confirmation, permissions and persistence; the library never sends write requests. Call `setEvents()` after a successful write. Actions are omitted when no callback is supplied, and duplicate clicks are blocked while a callback is pending. Callback failures show an inline error and emit `flowtime:actionerror`.

```js
const viewer = new Flowtime(element, {
  events,
  onEdit: (event) => openEditor(event.source),
  onDelete: async (event) => {
    if (await confirmDelete(event)) {
      await deleteEvent(event.id);
      viewer.setEvents(await loadEvents());
    }
  },
});
viewer.setDateRange({
  start: "2026-11-19T08:00:00Z",
  end: "2026-11-19T10:00:00Z",
});
viewer.setDateRange(); // Clear the range; preserve search and source filters.
```

The activity histogram replaces the date fields. It counts event starts, stacked by source color. Click a bar to select that period, click it again to clear it, drag across bars in either direction, or Shift-click to extend a selection. **Show all dates** clears only the date filter. Arrow keys move between bars; Shift+Arrow extends the selection, Home/End jump to either end, and Escape clears the date filter while focus is in the overview. Touch scrolling stays vertical until a horizontal drag starts; cancelling a drag restores the active selection.

Time labels across the histogram adapt to its width, with dates at the ends and across day boundaries. The overview keeps the full dataset's time span while a period is selected. Search and source filters update its counts without changing that span. Short investigations use minute or hour buckets; longer ones use days or larger periods, with at most 56 bars. Counts describe events starting in each period; duration events are still included in the results when they overlap the selected range. Selections survive view switches and data refreshes.

`setFilter({ query, groups, dateRange })` can update all filters together. Its `flowtime:filterchange` event includes `dateRange: { start, end }` using milliseconds or `null` for an open bound. `setDateRange()` still accepts precise or open-ended bounds, independently of the histogram's bucket size. Bounds are inclusive; a date-only `end` includes that entire UTC day. Invalid or reversed API ranges throw without changing the active filter. Bucket boundaries are aligned in UTC; labels use the display `timeZone` option.

## Custom buttons and actions

Each project can supply any number of toolbar `actions` and inspector `eventActions`. Flowtime renders the buttons; your callbacks own the forms, modals, imports, exports, API calls and permissions. There is no built-in event editor or required UI framework. Existing buttons outside the viewer can also call your application code as before.

```js
const viewer = new Flowtime(container, {
  events,
  actions: [
    {
      id: "add",
      label: "Add event",
      icon: "+",
      variant: "primary",
      onClick: () => addDialog.showModal(),
    },
    {
      id: "import",
      label: "Import data",
      visible: () => currentUser.canImport,
      onClick: () => importDialog.showModal(),
    },
    {
      id: "export",
      label: "Export shown events",
      disabled: ({ visibleEvents }) => !visibleEvents.length,
      onClick: ({ visibleEvents }) => exportEvents(visibleEvents),
    },
  ],
  eventActions: [
    {
      id: "annotate",
      label: "Annotate",
      onClick: ({ event }) => openAnnotationDialog(event.source),
    },
    {
      id: "archive",
      label: "Archive",
      variant: "danger",
      visible: ({ event }) => !event.metadata?.archived,
      onClick: async ({ event, viewer }) => {
        await archiveEvent(event.source);
        viewer.setEvents(await loadEvents());
      },
    },
  ],
});
```

An action has a unique, nonempty string `id` within its list, a text `label`, and an `onClick(context)` callback. Optional `icon` and `title` are plain text. `variant` is `default`, `primary` or `danger`. `visible` and `disabled` accept booleans or predicates; they are checked again when activating an action. They help the UI follow permissions; your server must enforce permissions when saving.

The callback and predicates receive `{ viewer, event, events, visibleEvents, view, filter }`. `event` is the currently selected normalized event, or `null` for toolbar actions with no selection; it is always present for inspector actions. Records include their original `source`. Arrays, normalized records and filter state are shallow snapshots; nested source/metadata objects retain their original references. The current filter includes `query`, `groups`, and `dateRange`.

Callbacks may return a Promise. A pending toolbar action disables its own button; pending inspector actions share a lock for that event with `onEdit`/`onDelete`. Duplicate submissions are suppressed, failures show an inline error, and controls become usable again. `flowtime:action` fires when a custom action starts with `{ action: id, location: "toolbar" | "event", context }`. Failures emit `flowtime:actionerror` with the action ID, location, event and error.

`viewer.setActions({ actions, eventActions })` replaces either list without changing data, filters, selection or view; omit a list to retain it. Call `viewer.setActions()` to refresh predicates when external state changes. Empty lists hide their buttons. Inspector actions supplement the optional `onEdit`/`onDelete` shortcuts; omit those shortcuts if you provide your own edit/delete actions. The demo uses this API for Add event, Import JSON, exporting filtered events and exporting a selected event.

## Custom views

Register project-owned views beside Timeline, Combined timeline and Chronological feed. Flowtime manages the switcher, shared state and lifecycle; your project supplies the renderer and any data or framework it needs.

```js
const viewer = new Flowtime(container, {
  events,
  customViews: [
    {
      id: "graph",
      label: "Graph",
      icon: "⌘",
      filters: false,
      inspector: false,
      mount(container, context) {
        // createGraph belongs to your project, not Flowtime.
        const graph = createGraph(container, context.events);
        return {
          update: ({ events }) => graph.setEvents(events),
          destroy: () => graph.destroy(),
        };
      },
    },
  ],
});
viewer.setView("graph");
```

Custom IDs must be unique and cannot use the built-in IDs `timeline`, `combined` or `feed`. Labels and optional icons are plain text. `filters: false` hides the search, activity histogram and source buttons; `inspector: false` hides the inspector and gives the view the full width. Both default to `true`. Hidden controls keep their state for when you switch back. The timeline footer is hidden in custom views, which can supply their own controls. Keyboard events inside a custom view are left to its renderer.

`mount(container, context)` receives a dedicated DOM container and the same state as action callbacks, plus `container` and an `AbortSignal` in `context.signal`. It may render static DOM, mount a framework component, or return a Promise. Return `{ update(context), destroy() }`, a cleanup function, or nothing. `update` receives the latest selection, filters and dataset state without remounting on ordinary renders or resizes. Async updates are serialized, with intermediate updates coalesced to the latest context. An async mount also receives any state changes made while it was loading.

Switching away, replacing the dataset with `setEvents()`, or destroying the viewer aborts the signal and calls cleanup. A late async mount is cleaned up without replacing the current view. Hosts should pass the signal to their fetches or cancel requests in cleanup. Mount and update failures show a Retry control and emit `flowtime:viewerror` with `{ view, phase, error }`; cleanup failures also emit this event. Other views remain available.

A custom view is mounted even when the event list is empty, so it can supply its own empty state or independent data. Use this API to embed a graph, map, table or framework component; the renderer and any additional dependencies belong to your project.

## Custom sources and appearance

Default sources are `events` (Events), `notes` (Notes), `milestones` (Milestones), and `attachments` (Attachments). Events without a `group` use `events`. Supply `groups` to replace these defaults with your own category IDs, labels, colors and icons:

```js
const viewer = new Flowtime(element, {
  events,
  groups: [
    { id: "deployments", label: "Deployments", color: "#249790", icon: "◇" },
    { id: "incidents", label: "Incidents", color: "#bb7395", icon: "!" },
  ],
  locale: "en-GB",
  timeZone: "Europe/Paris",
  theme: "dark", // default: 'light'
  label: "Service history", // accessible region name
});
```

Groups missing from the configuration are added automatically. CSS is scoped under `.ft`. Customize `--ft-bg`, `--ft-soft`, `--ft-ink`, `--ft-muted`, `--ft-border`, and `--ft-accent` on the viewer root. Each viewer has independent state and listeners.

### Text size

The **Text size** selector beside **Fit events** and the time zoom buttons adjusts Timeline and Combined timeline content from 50% to 150%. Cards, row spacing, source lanes and timeline time-label spacing adjust with it. Chronological feed uses its normal text size and hides the selector; switching back restores the chosen timeline size. Search, view buttons, actions, filters, the activity histogram, footer controls and the inspector keep their normal size. It preserves selection, filters and the current time viewport; time zoom remains independent.

```js
const viewer = new Flowtime(element, {
  events,
  textScale: 1.25, // 125%; default: 1. Valid range: 0.5–1.5.
  showTextScaleControl: true, // default; false hides the selector
});
viewer.setTextScale(1.1); // update at runtime
console.log(viewer.textScale); // 1.1
element.addEventListener("flowtime:textscalechange", ({ detail }) => {
  console.log(detail.textScale); // host may save the preference
});
```

The library does not write to browser storage. Scaling is applied to `.ft-content` only in timeline views. `viewer.textScale` retains the timeline preference in every view. Custom views receive `context.textScale` on mount/update and may opt in through their own renderer; their content is not scaled automatically. The built-in footer controls are hidden in custom views.

## API

| Method                                        | Behavior                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `setView('timeline' \| 'combined' \| 'feed')` | Switch to a built-in or registered custom view while preserving shared state.                                                      |
| `setActions({ actions, eventActions })`       | Replace custom toolbar/inspector buttons, preserving the current viewer state.                                                     |
| `setTextScale(scale)`                         | Set text size from 0.5 to 1.5 without changing selection, filters or time bounds.                                                  |
| `setEvents(events)`                           | Validate and replace data; fit the range and reset group filters. Preserve query, view, and selection when possible.               |
| `setFilter({ query, groups })`                | Set a text query, enabled group IDs, and/or `dateRange`. An empty group array hides all events.                                    |
| `setDateRange({ start, end })`                | Filter all views by date; omit the argument to clear.                                                                              |
| `clearSelection()`                            | Deselect the current event and close the inspector.                                                                                |
| `select(id, { reveal: true })`                | Select a visible event and optionally bring it into the time range.                                                                |
| `fit()`                                       | Fit the timeline to the filtered dataset.                                                                                          |
| `zoom(factor)`                                | Zoom around the viewport center. Values above 1 zoom in; below 1 zoom out.                                                         |
| `pan(fraction)`                               | Move by a fraction of the current time range. Positive values move later.                                                          |
| `getEvents()`                                 | Return chronologically sorted, normalized records (timestamps are milliseconds). Treat nested metadata/source values as read-only. |
| `destroy()`                                   | Remove the viewer and disconnect its observer and listeners.                                                                       |

Listen on the host container for bubbling DOM events:

```js
element.addEventListener("flowtime:select", ({ detail }) =>
  console.log(detail.event),
);
element.addEventListener("flowtime:viewchange", ({ detail }) =>
  console.log(detail.view),
);
element.addEventListener("flowtime:filterchange", ({ detail }) => {
  console.log(detail.query, detail.groups, detail.count);
});
```

The optional `onSelect(event)` callback receives the same selected record. Dismissing the inspector emits `flowtime:deselect` with the previous event in `detail.event`. Left/right arrow keys navigate while focus is in the viewer, excluding text inputs. Drag a lane or an event card to pan continuously, use the zoom buttons, or hold Ctrl/Command while scrolling over a lane. Panning keeps event rows and DOM nodes stable. Arrow controls, zoom, Fit events and offscreen event navigation use short interruptible animations; repeated arrow clicks accumulate. Small clicks still select events, and touch scrolling remains vertical until a horizontal drag starts. The system’s reduced-motion preference disables navigation animations. Set `animationDuration: 0` to disable them explicitly, or supply a duration in milliseconds (default: 220). Dense events stack into rows. On smaller screens the inspector moves below the timeline and the chart scrolls horizontally.

## Limits

The viewer renders DOM nodes and is intended for small to medium datasets; it is not virtualized. Custom view rendering and persistence belong to the host. Event HTML is never executed.
