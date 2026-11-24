// @ts-check
/**
 * What <vt-map> draws with, bundled on its own (dist/vendor/geo.js) and loaded only when a
 * page shows a map: the d3-geo projections and path generator, and the countries of
 * Natural Earth at 1:110m from world-atlas, decoded from TopoJSON.
 *
 * @module vendor/geo
 */
import {
  geoArea,
  geoAzimuthalEqualArea,
  geoAzimuthalEquidistant,
  geoCentroid,
  geoConicConformal,
  geoConicEqualArea,
  geoContains,
  geoDistance,
  geoEqualEarth,
  geoEquirectangular,
  geoGnomonic,
  geoGraticule10,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  geoStereographic,
  geoTransverseMercator,
} from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';

const topology = /** @type {any} */ (world);

/** Each country as a GeoJSON Feature (`id` is the ISO 3166-1 numeric code). */
export const countries = /** @type {any} */ (feature(topology, topology.objects.countries)).features; // prettier-ignore
/** Borders between countries, drawn once rather than twice. */
export const borders = mesh(
  topology,
  topology.objects.countries,
  (/** @type {any} */ a, /** @type {any} */ b) => a !== b,
);

export const projections = {
  'natural-earth': geoNaturalEarth1,
  'equal-earth': geoEqualEarth,
  mercator: geoMercator,
  equirectangular: geoEquirectangular,
  'transverse-mercator': geoTransverseMercator,
  globe: geoOrthographic,
  'azimuthal-equal-area': geoAzimuthalEqualArea,
  'azimuthal-equidistant': geoAzimuthalEquidistant,
  stereographic: geoStereographic,
  gnomonic: geoGnomonic,
  'conic-equal-area': geoConicEqualArea,
  'conic-conformal': geoConicConformal,
};

export { geoArea, geoCentroid, geoContains, geoDistance, geoGraticule10, geoPath };
