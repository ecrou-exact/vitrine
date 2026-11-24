# `<vt-map>`

`<vt-map>` draws a world map with:

- places as pins, from coordinates, built-in cities or addresses;
- countries highlighted with a color, or shaded by a value with a legend;
- routes along great circles, with their distance;
- GeoJSON points, lines and polygons.

Twelve projections, from flat maps to a 3D globe that turns, and eight styles.

```html
<vt-map projection="globe" center="Paris" highlight="FR DE IT">
  Paris
  Tokyo office: 35.6762, 139.6503
  Paris -> New York
</vt-map>
```

The projections and the country shapes (Natural Earth 1:110m) are in `dist/vendor/geo.js`, loaded the first time a map is drawn.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `download`   | off                | on     |
| `fullscreen` | off                | on     |
| `controls`   | off                | on     |
| `list`       | off                | on     |

## Input

One item per line. `// comment` lines and empty lines are skipped.

| Line                               | Shows                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `48.8566, 2.3522`                  | A pin. Also `48.8566 2.3522`, `48.8566;2.3522`.                        |
| `48°51′24″N 2°21′08″E`             | A pin. Also `N 48.85 E 2.35`, `2.35W 48.85N` (`O` = W).                |
| `geo:48.85,2.35`, a map link       | A pin from `geo:`, `@lat,lon`, `?q=`, `mlat`/`mlon`, `#map=z/lat/lon`. |
| `Paris`, `Pékin`, `São Paulo`      | A pin on a built-in city (about 170, English and French names).        |
| `10 Downing Street, London`        | A pin once the `geocoder` has found the address.                       |
| `France`, `FR`, `FRA`, `Allemagne` | The country highlighted.                                               |
| `India 1430`, `JP = 125`           | The country shaded by its value on a scale.                            |
| `Paris -> Tokyo -> New York`       | A route (`->`, `→` or `=>`) along great circles.                       |

- **Label**: `Office: 48.85, 2.35`, or text after coordinates, `48.85, 2.35 Eiffel Tower`.
- **Color**: a `#hex` color at the end of any line, `Paris -> Tokyo #e11d48`.

**JSON**: `{ "markers": [{ "lat", "lon" | "lng", "label", "color" } | "Paris"], "countries": { "FR": "#e11d48", "JP": 125 }, "routes": [["Paris", "Tokyo"]], "center": "Paris", "zoom": 3 }`, or an array of markers.

**GeoJSON**: a FeatureCollection, a Feature or a geometry. Points are pins, lines and polygons are drawn over the map; `name`, `title` and `color` (or `marker-color`, `stroke`, `fill`) are read from the properties.

## Projections

`natural-earth` (default), `equal-earth`, `mercator`, `equirectangular`, `globe` (orthographic, the 3D globe), `azimuthal-equal-area`, `azimuthal-equidistant`, `stereographic`, `gnomonic`, `transverse-mercator`, `conic-equal-area`, `conic-conformal`. Aliases: `orthographic` and `3d` for `globe`.

Flat maps scroll around the world from east to west; the globe and the azimuthal projections turn in every direction.

## Styles

| `basemap`   | Look                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `light`     | Default: follows the theme of the element.                                                                                                             |
| `dark`      | Dark sea and land.                                                                                                                                     |
| `political` | Each country in its own color.                                                                                                                         |
| `satellite` | Seen from the sky: land colored by climate (ice, tundra, forest, steppe, desert, tropics), deep sea, stars and atmosphere around a globe. Alias `sky`. |
| `night`     | Black, with glowing borders. Alias `space`.                                                                                                            |
| `blueprint` | Blue plan.                                                                                                                                             |
| `vintage`   | Old paper.                                                                                                                                             |
| `mono`      | Monochrome.                                                                                                                                            |

## Interaction

- **Move**: drag, or the arrow keys when the map has focus.
- **Zoom**: the wheel, a pinch, a double click, `+` and `-`, or the buttons. `0` or the reset button goes back to the start.
- **Hover**: the country with its flag and value, and the coordinates under the pointer.
- **Click** a country: it is selected (`vt-select`). With `pick`, a click drops a pin instead and gives its coordinates.
- **Search** (`controls`): coordinates, a city, a country, or an address with a geocoder. The map flies there (instantly with reduced motion).
- **List** (`list`): every place, country, route and shape in words, with coordinates, values and distances; each one moves the map to it.

## Film mode

With `movie`, a crosshair button tracks a target as in the movies: the globe turns toward it, zooms in by stages under a surveillance screen (reticle, scan lines, a log, coordinates settling on the target), and **TARGET LOCATED** shows in red. A flat map switches to the globe first. Escape or the Stop button ends it; with reduced motion the map goes straight to the target.

```html
<vt-map projection="globe" basemap="satellite" movie="Eiffel Tower: 48.8584, 2.2945"></vt-map>
```

The value of `movie` is the target (coordinates, a city, a country, an address with a geocoder, `Label: place` for a name); empty, it is the first place of the content. The sequence is also started from script with `map.track('Tokyo')` (it resolves to whether the target was found), and from the search field by typing `track` or `locate` before a place, on any map.

## Attributes

| Attribute       | Values                                         | Default         | Description                                            |
| --------------- | ---------------------------------------------- | --------------- | ------------------------------------------------------ |
| `projection`    | see above                                      | `natural-earth` | Projection.                                            |
| `basemap`       | see above                                      | `light`         | Style.                                                 |
| `center`        | coordinates, city or country                   | world           | Where the map is centred.                              |
| `zoom`          | 1 to 60                                        | `1`             | Zoom level.                                            |
| `highlight`     | codes or names                                 |                 | Countries to highlight, separated by spaces or commas. |
| `geocoder`      | `nominatim`, `photon`, `ban` or URL with `{q}` | off             | Finds addresses. They are sent to that service.        |
| `graticule`     | boolean                                        | on              | Lines of latitude and longitude.                       |
| `labels`        | boolean                                        | on              | Names next to pins and on highlighted countries.       |
| `controls`      | boolean                                        | preset          | Search field, projection and style menus.              |
| `list`          | boolean                                        | preset          | The list of items under the map.                       |
| `pick`          | boolean                                        | off             | A click drops a pin.                                   |
| `scroll-zoom`   | boolean                                        | on              | The wheel zooms.                                       |
| `coords-format` | `decimal`, `dms`                               | `decimal`       | How coordinates are written.                           |
| `height`        | CSS length                                     | 16:9            | Height of the map.                                     |
| `movie`         | target, or empty                               | off             | The film mode button and its target.                   |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Geocoding

Nothing leaves the page by default. With `geocoder`, addresses of the content (at most 25, one a second, as public services ask) and searches are sent to that service without cookies, and each answer is kept for the page. `nominatim` is OpenStreetMap's service (mind its usage policy), `photon` Komoot's, `ban` the French national address base; a template such as `https://geocode.example/search?q={q}` may answer like Nominatim, in GeoJSON or as `{ results: [{ geometry: { location } }] }`.

## Copy and download

| Button          | Output                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| Copy the places | One line per item, with decimal coordinates.                                                  |
| Download        | A GeoJSON FeatureCollection: pins, routes, shapes and highlighted countries with their shape. |

## Properties

| Property  | Type       | Description                                                       |
| --------- | ---------- | ----------------------------------------------------------------- |
| `content` | `string`   | Items, one per line, or JSON / GeoJSON.                           |
| `items`   | `object[]` | Read-only: `{ kind, label, lat?, lon?, code?, value? }` per item. |
| `view`    | `object`   | Read-only: `{ lat, lon, zoom, projection, basemap }`.             |

## Methods

| Method         | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `track(place)` | Runs the film sequence to a place. Resolves to `true` if found. |

## Events

| Event       | Detail                                                           | When                                  |
| ----------- | ---------------------------------------------------------------- | ------------------------------------- |
| `vt-ready`  | `{ type: "map" }`                                                | Rendered.                             |
| `vt-select` | `{ type: "country" \| "point", label, lat, lon, code?, value? }` | A country, a pin or a picked point.   |
| `vt-select` | `{ type: "target", label, lat, lon }`                            | The film sequence located its target. |
| `vt-change` | `{ lat, lon, zoom, projection, basemap }`                        | The view changed.                     |
| `vt-copy`   | `{ text }`                                                       | Places copied.                        |

## Accessibility

The map is one focusable element, moved and zoomed from the keyboard, with a summary of what it shows and its keys. The list under the map gives every item in words; colors only repeat it. Selections and searches are announced.
