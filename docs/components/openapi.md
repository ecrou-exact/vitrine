# `<vt-openapi>`

`<vt-openapi>` turns an OpenAPI description into an API reference: endpoints grouped by tag, parameters, request bodies, responses, schema trees and generated examples. It reads OpenAPI 3.0 and 3.1 (and Swagger 2.0), in JSON or YAML.

```html
<vt-openapi variant="full" src="/openapi.yaml"></vt-openapi>
```

Nothing is ever sent to the API: the component only displays its description. Text from the description is inserted as text, and descriptions are rendered as sanitized Markdown.

## Loading YAML

JSON is read directly. YAML needs a reader that is not part of the Vitrine bundles: the first YAML description on a page loads `dist/vendor/yaml.js` (about 15 KB gzipped), next to the other Vitrine files. Point `Vitrine.configure({ vendorUrl })` at another folder when self-hosting elsewhere. The YAML reader only produces plain data (strings, numbers, booleans, arrays and objects).

## Variants

| Feature                  | `simple` (default) | `full` |
| ------------------------ | ------------------ | ------ |
| `header`                 | off                | on     |
| `dot`                    | off                | on     |
| `copy` (the description) | off                | on     |
| `search` (endpoints)     | off                | on     |
| `download`               | off                | on     |
| `fullscreen`             | off                | on     |
| `examples`               | on                 | on     |
| `markdown`               | on                 | on     |

The header shows the API title (or the `label`) and its version.

## What is shown

- **Introduction**: title, version, description, servers (variables replaced by their defaults), authentication schemes, and the number of endpoints.
- **Tags**: endpoints are grouped by tag, in the order the description declares them. Buttons above the groups show one tag at a time; `tags="Orders Customers"` chooses the tags shown at first.
- **Endpoints**: the method (colored by kind), the path with its `{parameters}` highlighted, the summary, a lock when authentication is required, and "deprecated" when it is. An endpoint opens to show:
  - its description;
  - the parameters (name, location, type, required, description), path-level parameters merged with the endpoint's own;
  - the request body, per media type, as a schema tree and an example;
  - the responses, by status (colored by class), each opening to its schema and example;
  - with `<vt-http>` on the page, an example request and response, with code for curl, fetch, Python and HTTPie, and placeholder credentials (`Bearer YOUR_TOKEN`).

Details are built when an endpoint opens, so descriptions with hundreds of endpoints load at once. `expand` opens every endpoint; the header buttons open or close them all.

## Schemas

Schemas are shown as trees: each property with its type (`string (date-time)`, `array of Order`, `"a" | "b"`, `one of: Cat, Dog`), whether it is required, read-only or deprecated, its description and its constraints (minimum, maximum, lengths, pattern, default, example). Nested objects open on demand. `allOf` is merged; `oneOf` and `anyOf` list their variants.

Only local references are followed (`#/components/schemas/…`, `#/definitions/…`): references to other files are shown by name and never fetched. A schema that refers to itself is shown once, then marked `↺`.

## Examples

Example values come from `example`, `examples`, `default`, `const` or the first `enum` value; otherwise a typical value is built from the type and format (`2026-01-31T09:30:00Z` for `date-time`, `ada@example.com` for `email`, a UUID for `uuid`…). Recursive schemas stop with `null`.

## Search

The search filters endpoints by method, path, summary, operation id, description and tag.

## Editing

With `mode="edit"`, an editor (JSON or YAML highlighting) holds the description, and the reference is updated under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-openapi>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute  | Type                     | Default | Description                                                  |
| ---------- | ------------------------ | ------- | ------------------------------------------------------------ |
| `tags`     | tags separated by spaces | all     | Tags shown at first.                                         |
| `expand`   | boolean                  | off     | Open every endpoint.                                         |
| `server`   | integer                  | `0`     | Server used in example requests.                             |
| `examples` | boolean                  | on      | Example requests with `<vt-http>`, when defined.             |
| `markdown` | boolean                  | on      | Descriptions as Markdown with `<vt-markdown>`, when defined. |

## Properties

| Property  | Type     | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `content` | `string` | The description, as JSON or YAML.             |
| `spec`    | `object` | The parsed description, or `null`. Read-only. |

## Events

| Event       | `detail`                        | When                       |
| ----------- | ------------------------------- | -------------------------- |
| `vt-ready`  | `{ type: "openapi" }`           | The reference was rendered |
| `vt-select` | `{ method, path, operationId }` | An endpoint was opened     |
| `vt-search` | `{ query, matches }`            | A search ran               |
| `vt-error`  | `{ message, cause }`            | Loading failed             |

A description that cannot be read is shown as a notice that says why (for example "Missing "openapi" (or "swagger") version field.").

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts): `intro`, `tag`, `operation`, `method`, `path`, `schema`.

## Accessibility

Each endpoint is a button that opens its details (`aria-expanded`, `aria-controls`); groups are labeled sections; parameters are tables with row headers; nested schemas use native disclosure elements. Methods, statuses and flags are words, never colors alone.

## Limits

- At most 2,000 endpoints; a notice says when the rest is ignored.
- Schemas are shown 12 levels deep; examples are built 8 levels deep.
- At most 200 properties per object and 40 responses per endpoint are shown.
- The size limit of the [configuration](../configuration.md) applies (2 MB by default).
