# `<vt-testimonials>`

`<vt-testimonials>` shows testimonials and reviews as a grid, a list or a carousel, with their ratings and the average.

```html
<vt-testimonials json-src="/reviews.json" layout="carousel"></vt-testimonials>
```

## Format

A list, or an object with `items` (also `testimonials`, `reviews`, `quotes`).

```json
[
  {
    "quote": "We replaced three tools with this one.",
    "author": "Ada Lovelace",
    "role": "CTO",
    "company": "Analytical Engines",
    "avatar": "/people/ada.jpg",
    "rating": 5,
    "url": "https://example.com/review/1",
    "date": "2026-10-02"
  }
]
```

`text`, `review` and `content` are read as `quote`, `name` as `author`, `stars` as `rating` (0 to 5, halves allowed). Without an avatar, or when it cannot load, the initials of the author are shown.

From two ratings on, their average is shown above, "4.5 out of 5, from 12 reviews".

## Carousel

`layout="carousel"` shows one testimonial at a time with previous and next buttons. It only moves by itself with `interval` (at least 5 seconds); it then stops while the pointer or the focus is on it, has a Pause button, and never moves when the reader prefers reduced motion.

## Attributes

| Attribute  | Type    | Default | Description                                                 |
| ---------- | ------- | ------- | ----------------------------------------------------------- |
| `layout`   | string  | `grid`  | `grid`, `list` or `carousel`                                |
| `interval` | number  | off     | Seconds between two testimonials in a carousel (at least 5) |
| `summary`  | boolean | on      | The average of the ratings                                  |

Shared attributes are in [Common attributes](../common-attributes.md).

## CSS parts

`summary`, `item`, `quote`, `author`, `avatar`, `rating` and `controls`, plus the [shared parts](../theming.md).
