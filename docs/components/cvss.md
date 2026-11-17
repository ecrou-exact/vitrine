# `<vt-cvss>`

`<vt-cvss>` shows a CVSS vector as a score, a severity in words and each metric explained. CVSS 3.0 and 3.1 scores are computed (base, temporal and environmental). With `editable`, each metric is a list and the element works as a calculator.

```html
<vt-cvss variant="full">
  <template>CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N</template>
</vt-cvss>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

The metrics table is shown in both variants; `metrics="false"` hides it.

## Versions

| Version  | Read | Score                                                                                                                                           |
| -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CVSS 3.0 | yes  | Base, temporal and environmental, with the rounding of CVSS 3.0.                                                                                |
| CVSS 3.1 | yes  | Base, temporal and environmental, with the rounding of Appendix A.                                                                              |
| CVSS 4.0 | yes  | Not computed: the score comes from the lookup tables of the specification. Set `score` to show it (from NVD, a vendor or the FIRST calculator). |

A vector without the `CVSS:3.x/` prefix is read as CVSS 3.1. Metric names and values are case-sensitive, as in the specification. A vector that cannot be read gets a notice that names the metric at fault (missing base metric, unknown metric, value not allowed, metric given twice).

## Score

The score box shows the score that best describes the vector (environmental, then temporal, then base), its severity in words (None, Low, Medium, High, Critical, as in the specification) and a bar. Under it, the base score, the impact and exploitability sub-scores, and the temporal and environmental scores when their metrics are set.

## Metrics

The metrics are grouped as in the specification: Base, Temporal (3.x), Threat (4.0), Environmental and Supplemental (4.0). Each row gives the metric code and name, the value code and name, and what the metric means. Optional metrics that are not defined are left out; `all` lists them too.

The vector is shown in the order of the specification, each metric with its name as a tooltip, and copied in that order.

## Calculator

With `editable`, each value is a `<select>`, and every optional metric is listed with "Not defined". Changing a value updates the vector, the score and `content`, and dispatches `vt-change` with the new vector. Metrics set to "Not defined" are left out of the vector.

```html
<vt-cvss editable>
  <template>CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N</template>
</vt-cvss>
```

## Attributes

| Attribute  | Values  | Default              | Description                                                              |
| ---------- | ------- | -------------------- | ------------------------------------------------------------------------ |
| `score`    | 0 to 10 | computed             | Score shown instead of the computed one (CVSS 4.0, or a database score). |
| `editable` | boolean | off                  | Each metric is a select.                                                 |
| `metrics`  | boolean | on                   | Metrics table.                                                           |
| `all`      | boolean | off (on if editable) | List optional metrics that are not defined.                              |

The shared attributes (`variant`, `theme`, `src`, `json`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## JSON

`json` or `data` accept a string, `{ vector, score }`, or NVD and OSV objects: `vectorString` and `baseScore`, also inside `cvssData`.

## Properties

| Property  | Type             | Description                                                               |
| --------- | ---------------- | ------------------------------------------------------------------------- |
| `content` | `string`         | The vector.                                                               |
| `vector`  | `object \| null` | Read-only: `{ version, metrics, vector }`, `null` when it cannot be read. |
| `score`   | `number \| null` | Read-only: the score shown, `null` for a CVSS 4.0 vector without `score`. |

## Events

| Event       | Detail               | When                                 |
| ----------- | -------------------- | ------------------------------------ |
| `vt-ready`  | `{ type: "cvss" }`   | The vector is rendered.              |
| `vt-change` | `{ value }`          | A metric was changed (`editable`).   |
| `vt-copy`   | `{ text }`           | The vector is copied.                |
| `vt-error`  | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part       | Element                     |
| ---------- | --------------------------- |
| `score`    | The score box.              |
| `severity` | The severity label.         |
| `gauge`    | The bar under the score.    |
| `vector`   | The vector.                 |
| `metrics`  | The metrics tables.         |
| `select`   | A metric select (editable). |

The severity colors come from the theme: `--vt-info` for Low, `--vt-warning` for Medium, a mix of warning and danger for High, `--vt-danger` for Critical.

## Accessibility

The severity is always written in words; colors only repeat it. The bar is a `meter` with its value and severity as text. Each group is a labelled section with a table with row and column headers. In the calculator, each select is labelled with the metric name, and focus stays on it after a change.

## Security

Every value is inserted as text. Vectors are read up to 1,024 characters, with a strict pattern for each metric, and the bar width is set through the CSSOM, so a strict `style-src` is enough. Nothing is fetched.
