# `<vt-lighthouse>`

`<vt-lighthouse>` shows a Lighthouse report: category scores as gauges, the Core Web Vitals of real visits, lab metrics, opportunities with their estimated savings, and the audits of each category. It reads the JSON of the Lighthouse CLI (`--output=json`), of Chrome DevTools (saved as JSON), or of the PageSpeed Insights API.

```html
<vt-lighthouse variant="full" src="report.json"></vt-lighthouse>
```

Nothing is fetched besides `src`.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

- A Lighthouse result (`{ categories, audits, … }`), from Lighthouse 6 to 12.
- A PageSpeed Insights answer (`{ lighthouseResult, loadingExperience, originLoadingExperience }`), which adds field data. An answer with only field data shows the field data alone.

## The report

- **Header**: the URL, mobile or desktop, the date in UTC, and the Lighthouse version. A `runtimeError` and the run warnings are shown too.
- **Gauges**: one per category, with the score out of 100. Each gauge is green from 90, orange from 50 and red below, as Lighthouse colors them, and says its rating in words to screen readers.
- **Real users** (PageSpeed Insights only): the 75th percentile of LCP, INP, CLS, FCP and TTFB over 28 days, for the page and for the whole site. Each metric is rated good, needs improvement or poor with the Core Web Vitals thresholds, and has a bar for the share of good, average and poor visits. Whether the Core Web Vitals pass is shown too.
- **Lab measurements** (Performance tab): FCP, LCP, TBT, CLS, Speed Index, TTI and INP when present, each with its rating. The ratings use shapes as well as colors: a circle for good, a square for needs improvement, a triangle for poor.
- **Opportunities** (Performance tab): the failed audits that save time or bytes, the largest saving first, with a bar.
- **Audits**: each category tab lists the failed audits first. Each one opens on:
  - its description, with links turned into text;
  - a "Learn more" link;
  - the first rows of its table: URLs, sizes, durations and element snippets, as text.

  Informative audits follow. Audits to check by hand, passed audits and not applicable ones are folded.

Without tabs, every category is shown one under the other.

## Attributes

| Attribute  | Values                                                  | Default        | Description               |
| ---------- | ------------------------------------------------------- | -------------- | ------------------------- |
| `category` | `performance`, `accessibility`, `best-practices`, `seo` | first category | Category tab shown first. |
| `tabs`     | boolean                                                 | on             | One tab per category.     |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md). Reports with screenshots can be large: raise the limit with `Vitrine.configure({ maxSize })` (see [configuration](../configuration.md)).

## Copy

| Button           | Output                                                   |
| ---------------- | -------------------------------------------------------- |
| Copy the summary | The URL, the score of each category and the lab metrics. |

## Properties

| Property  | Type             | Description                                                                                                                                                                                                                                                                                                                                  |
| --------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`         | The report (JSON).                                                                                                                                                                                                                                                                                                                           |
| `report`  | `object \| null` | Read-only. It has the form `{ url, fetchTime, version, formFactor, userAgent, categories, metrics, opportunities, field, warnings, error }`. Each category is `{ id, title, score, audits }`. Each audit is `{ id, title, description, learnMore, score, mode, display, numeric, savingsMs, savingsBytes, items, headings, group, weight }`. |

## Events

| Event           | Detail                   | When                                 |
| --------------- | ------------------------ | ------------------------------------ |
| `vt-ready`      | `{ type: "lighthouse" }` | The report is rendered.              |
| `vt-tab-change` | `{ tab }`                | The category changed.                |
| `vt-copy`       | `{ text }`               | The summary copied.                  |
| `vt-error`      | `{ message, cause }`     | Loading failed or content too large. |

## CSS parts

| Part            | Element                       |
| --------------- | ----------------------------- |
| `scores`        | The gauges of the categories. |
| `gauge`         | A gauge.                      |
| `field`         | The field data.               |
| `metrics`       | The lab metrics.              |
| `opportunities` | The opportunities.            |
| `audit`         | An audit.                     |

## Accessibility

Each gauge has a text alternative with its score and rating. Ratings are given in words to screen readers and with shapes, not only colors. Audits are native disclosures. The distribution bars repeat a sentence given to screen readers.

## Security

Descriptions are inserted as text: Markdown links become their label, and only the first one is kept, as a "Learn more" link. Links are made only for absolute `http(s)` URLs, with `rel="noopener noreferrer"`. Table cells, including element snippets, are text, and gauges and bars are drawn with SVG attributes and CSSOM.
