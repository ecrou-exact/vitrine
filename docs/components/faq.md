# `<vt-faq>`

`<vt-faq>` shows questions and answers as an accordion, with a search, categories, and links that open a question.

```html
<vt-faq json-src="/faq.json"></vt-faq>
```

## Format

A list of questions, or an object with `items` (also `faq`, `faqs`, `questions`).

```json
[
  { "question": "Is there a free plan?", "answer": "Yes, **forever**.", "category": "Billing" },
  { "question": "Where is my data?", "answer": "In the EU.", "category": "Security", "id": "data" }
]
```

`q` and `title` are read as `question`, `a`, `text` and `content` as `answer`, `group` and `topic` as `category`.

Answers are Markdown, shown by `<vt-markdown>` when it is defined, with images blocked. Otherwise they are shown as plain text.

## Links to a question

Each question has an id: its `id`, else its words (`Is there a free plan?` becomes `is-there-a-free-plan`). With `links` (on by default), the question named by the address opens: `faq.html#data`. A change of the address while the page is open works too.

## Search engines

`structuredData` gives schema.org `FAQPage` data. Put it in the page yourself, as a `<script type="application/ld+json">`:

```js
const faq = document.querySelector('vt-faq');
faq.addEventListener('vt-ready', () => {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(faq.structuredData);
  document.head.append(script);
});
```

## Attributes

| Attribute    | Type    | Default          | Description                                      |
| ------------ | ------- | ---------------- | ------------------------------------------------ |
| `filter`     | boolean | from 6 questions | The search field                                 |
| `categories` | boolean | on               | Category buttons, when questions have categories |
| `single`     | boolean | off              | Opening a question closes the others             |
| `open`       | string  | none             | Questions open at first: `first`, `all`, or ids  |
| `markdown`   | boolean | on               | Answers as Markdown                              |
| `links`      | boolean | on               | Opens the question named by the address          |

Shared attributes are in [Common attributes](../common-attributes.md).

## Events

| Event       | When                            | Detail               |
| ----------- | ------------------------------- | -------------------- |
| `vt-ready`  | Questions rendered              | `{ type: "faq" }`    |
| `vt-toggle` | A question was opened or closed | `{ id, expanded }`   |
| `vt-search` | The search changed              | `{ query, matches }` |
| `vt-error`  | Too large or not loaded         | `{ message, cause }` |

## CSS parts

`item`, `question`, `answer`, `filter` and `category`, plus the [shared parts](../theming.md).

## Accessibility

Each question is a button inside a heading, with `aria-expanded` and `aria-controls`, as the WAI accordion pattern describes. The number of matches is announced when the search changes.
