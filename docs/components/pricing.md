# `<vt-pricing>`

`<vt-pricing>` shows pricing plans as cards, with a billing period switch, several currencies, what a longer period saves, and a table comparing the plans.

```html
<vt-pricing src="/pricing.json" period="yearly" currency="EUR"></vt-pricing>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `download`   | off                | on     |
| `fullscreen` | off                | on     |

The simple variant has no frame chrome, so it fits a marketing page. The comparison table is shown in both variants when the source has one; `compare="false"` hides it.

## Format

The content is JSON: an object with a `plans` list, or the list alone.

```json
{
  "currencies": ["EUR", "USD"],
  "periods": [{ "id": "monthly" }, { "id": "yearly", "note": "2 months free" }],
  "plans": [
    {
      "id": "pro",
      "name": "Pro",
      "description": "For growing teams.",
      "badge": "Most popular",
      "highlight": true,
      "unit": "per seat",
      "price": {
        "monthly": { "EUR": 12, "USD": 14 },
        "yearly": { "EUR": 120, "USD": 140 }
      },
      "cta": { "label": "Try Pro", "url": "/signup?plan=pro" },
      "features": ["Unlimited projects", { "text": "Phone support", "included": false }]
    }
  ],
  "compare": [
    { "group": "Usage", "name": "Projects", "values": { "pro": "Unlimited" } },
    { "name": "Custom domain", "description": "Your own address", "values": { "pro": true } }
  ],
  "note": "Prices exclude VAT."
}
```

### Prices

| `price` is                            | Example                                   |
| ------------------------------------- | ----------------------------------------- |
| A number (`0` shows "Free")           | `12`                                      |
| A text                                | `"Contact us"`                            |
| An object by period                   | `{ "monthly": 12, "yearly": 120 }`        |
| An object by currency                 | `{ "EUR": 12, "USD": 14 }`                |
| An object by period, then by currency | `{ "monthly": { "EUR": 12, "USD": 14 } }` |

A plan with no price for the period and currency shown says so.

### Periods and currencies

`periods` lists the billing periods, each with an `id` and optional `label`, `months` and `note`. Without `periods`, they are read from the keys of the prices. `monthly`, `quarterly` and `yearly` (and `month`, `quarter`, `year`, `annual`, `annually`) have known lengths and translated names; give other periods their `months`.

`currencies` (or `currency`) lists ISO 4217 codes. Without it, they are read from the prices. A list of currencies shows a selector. Amounts are written for the language of the interface with `Intl.NumberFormat`, with cents only for amounts that have some. Amounts are displayed exactly as you give them: no exchange rate is ever applied.

### What is worked out

- **Per month.** With `display="monthly"`, the default, a yearly price of 120 reads "€10 / month" and "€120 billed yearly". `display="total"` shows "€120 / year".
- **Savings.** "Save 17%" compares a period with the shortest one of the same plan, per month, and only appears when there is something to save.

### Buttons

`cta` is a text or `{ label, url }`, and `url` may sit on the plan. The button is a link when there is a URL, otherwise a button. `vt-plan-select` fires on every press with the plan, period, currency and amount; calling `preventDefault()` stops the link, to open your own checkout instead.

```js
document.querySelector('vt-pricing').addEventListener('vt-plan-select', (event) => {
  event.preventDefault();
  openCheckout(event.detail.plan, event.detail.period, event.detail.currency);
});
```

The prices are for display. Always compute the amount to charge on your server.

## Attributes

These are specific to `<vt-pricing>`. Shared attributes are in [Common attributes](../common-attributes.md).

| Attribute     | Type    | Default   | Description                                    |
| ------------- | ------- | --------- | ---------------------------------------------- |
| `period`      | string  | first     | Id of the first billing period                 |
| `currency`    | string  | first     | First currency                                 |
| `display`     | string  | `monthly` | Prices per month, or as billed: `total`        |
| `compare`     | boolean | on        | The table comparing the plans                  |
| `link-target` | string  | `_self`   | Where the plan buttons open: `_self`, `_blank` |

## JavaScript

| Member             | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| `content`          | The JSON text                                                   |
| `pricing`          | The parsed plans (read-only), `null` when they are not readable |
| `selectedPeriod`   | Id of the billing period shown; can be set                      |
| `selectedCurrency` | The currency shown; can be set                                  |

## Events

| Event               | When                                   | Detail                                          |
| ------------------- | -------------------------------------- | ----------------------------------------------- |
| `vt-ready`          | Plans rendered                         | `{ type: "pricing" }`                           |
| `vt-copy`           | JSON copied                            | `{ text }`                                      |
| `vt-pricing-change` | The period or currency changed         | `{ period, currency }`                          |
| `vt-plan-select`    | A plan button was pressed (cancelable) | `{ plan, name, period, currency, amount, url }` |
| `vt-error`          | Too large or not loaded                | `{ message, cause }`                            |

## CSS parts

`controls`, `period`, `currency`, `plans`, `plan`, `plan-highlight`, `price`, `saving`, `cta`, `feature` and `compare`, plus the [shared parts](../theming.md).

## Accessibility

- The periods are real radio buttons and the currency a real select, so they work as readers expect.
- Included and not included are read out, not only drawn. The comparison table has row and column headers, and scrolls on its own with the keyboard on a narrow element.

## Security

Every value is rendered as text. Button links keep `http:`, `https:`, `mailto:`, `tel:` and relative URLs only; with any other link the plan gets a plain button. Plans, features and rows are limited in number. See [Security](../security.md).
