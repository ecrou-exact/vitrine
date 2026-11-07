# `<vt-gallery>`

`<vt-gallery>` shows images as a grid, with a viewer that opens on top of the page.

```html
<vt-gallery json='["/photos/1.jpg", "/photos/2.jpg"]' aspect="square"></vt-gallery>
```

## Format

A list of addresses, a list of images, or an object with `images` (also `items`, `photos`).

```json
[
  {
    "src": "/photos/lake.jpg",
    "thumb": "/photos/lake-small.jpg",
    "alt": "A lake at dawn",
    "caption": "Lake Geneva, 6 a.m.",
    "href": "https://example.com/lake",
    "width": 1600,
    "height": 1200
  }
]
```

`url` and `image` are read as `src`, `thumbnail` as `thumb`. `width` and `height` reserve the space of an image before it loads.

## Viewer

Pressing an image opens a modal dialog with the full image, its caption and its link. Left and Right move between images, Home and End go to the ends, and Escape or a press outside the image closes it. The focus then goes back to the image that was opened.

## Attributes

| Attribute  | Type    | Default | Description                                                                  |
| ---------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `columns`  | number  | auto    | Fixed number of columns; by default, as many as fit                          |
| `aspect`   | string  | `photo` | Shape of the thumbnails: `square`, `photo` (4:3), `wide` (16:9) or `natural` |
| `viewer`   | boolean | on      | Opens the viewer when an image is pressed                                    |
| `captions` | boolean | on      | Captions under the thumbnails                                                |
| `images`   | string  | `allow` | `same-origin` keeps only images of the page's own origin                     |

Shared attributes are in [Common attributes](../common-attributes.md).

## Events

| Event       | When                                     | Detail                |
| ----------- | ---------------------------------------- | --------------------- |
| `vt-select` | An image was opened, or the viewer moved | `{ index, src, alt }` |
| `vt-toggle` | The viewer was opened or closed          | `{ expanded }`        |

## CSS parts

`grid`, `item`, `thumbnail`, `caption`, `viewer` and `image`, plus the [shared parts](../theming.md).

## Security

Addresses keep `http:`, `https:` and relative URLs, and raster `data:` images; SVG `data:` images and other schemes are left out. Images load lazily, without a referrer. Captions are text.
