import { describe, expect, it } from 'vitest';
import { distanceKm, formatCoords, geocoderUrl, parseCoords, readGeocoder, readInput, readLine } from '../../src/components/map/map.js'; // prettier-ignore
import { codeOfShape, findCountry } from '../../src/components/map/countries.js';
import { findCity } from '../../src/components/map/places.js';

describe('map', () => {
  it('reads coordinates in common notations', () => {
    expect(parseCoords('48.8566, 2.3522')).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(parseCoords('-33.86 151.2')).toEqual({ lat: -33.86, lon: 151.2 });
    const dms = parseCoords('48°51′24″N 2°21′08″E');
    expect(dms?.lat).toBeCloseTo(48.8567, 3);
    expect(dms?.lon).toBeCloseTo(2.3522, 3);
    expect(parseCoords('2.35W 48.85N')).toEqual({ lat: 48.85, lon: -2.35 });
    expect(parseCoords('N 48.85 O 2.35')).toEqual({ lat: 48.85, lon: -2.35 });
    expect(parseCoords('geo:1,2')).toEqual({ lat: 1, lon: 2 });
    expect(parseCoords('https://www.google.com/maps/@48.85,2.35,12z')).toEqual({ lat: 48.85, lon: 2.35 }); // prettier-ignore
    expect(parseCoords('https://www.openstreetmap.org/#map=12/48.85/2.35')).toEqual({ lat: 48.85, lon: 2.35 }); // prettier-ignore
    expect(parseCoords('95, 10')).toBeNull();
    expect(parseCoords('Paris')).toBeNull();
  });

  it('finds countries by code and name in several languages', () => {
    expect(findCountry('FR')?.a3).toBe('FRA');
    expect(findCountry('DEU')?.a2).toBe('DE');
    expect(findCountry('Allemagne')?.a2).toBe('DE');
    expect(findCountry('United Kingdom')?.a2).toBe('GB');
    expect(findCountry('USA')?.a2).toBe('US');
    expect(findCountry('Côte d’Ivoire')?.a2).toBe('CI');
    expect(codeOfShape('250').a2).toBe('FR');
    expect(codeOfShape(undefined, 'Kosovo').a2).toBe('XK');
    expect(findCountry('Atlantis')).toBeNull();
  });

  it('finds built-in cities', () => {
    expect(findCity('Pékin')?.name).toBe('Beijing');
    expect(findCity('sao paulo')?.country).toBe('BR');
    expect(findCity('Paris, France')?.name).toBe('Paris');
  });

  it('reads lines', () => {
    expect(readLine('Office: 48.85, 2.35 #e11d48')).toMatchObject({ kind: 'marker', label: 'Office', color: '#e11d48' }); // prettier-ignore
    expect(readLine('48.85, 2.35 Eiffel Tower')).toMatchObject({ kind: 'marker', label: 'Eiffel Tower' }); // prettier-ignore
    expect(readLine('Inde 1400')).toMatchObject({ kind: 'country', value: 1400 });
    expect(readLine('Paris -> Tokyo -> NYC')).toMatchObject({ kind: 'route' });
    expect(readLine('10 Downing Street, London')).toMatchObject({ kind: 'marker', place: { address: '10 Downing Street, London' } }); // prettier-ignore
    const { items, invalid } = readInput('Paris\n// comment\n\n12345');
    expect(items).toHaveLength(1);
    expect(invalid).toEqual(['12345']);
  });

  it('reads JSON and GeoJSON', () => {
    const json = readInput('{"markers":[{"lat":1,"lng":2,"name":"A"}],"countries":{"FR":"#ff0000","JP":3},"routes":[["Paris","Tokyo"]],"zoom":3}'); // prettier-ignore
    expect(json.items.map((i) => i.kind)).toEqual(['marker', 'country', 'country', 'route']);
    expect(json.view.zoom).toBe(3);
    const geo = readInput('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"P"},"geometry":{"type":"Point","coordinates":[2.35,48.85]}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}]}'); // prettier-ignore
    expect(geo.items[0]).toMatchObject({ kind: 'marker', place: { lat: 48.85, lon: 2.35 } });
    expect(geo.items[1].kind).toBe('shape');
  });

  it('formats, measures and geocodes', () => {
    expect(formatCoords(48.8566, 2.3522, 'dms')).toBe('48°51′23.8″N 2°21′07.9″E');
    expect(Math.round(distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 35.6762, lon: 139.6503 }))).toBe(9712); // prettier-ignore
    expect(geocoderUrl('ban', 'a b')).toBe(
      'https://api-adresse.data.gouv.fr/search/?limit=1&q=a%20b',
    );
    expect(geocoderUrl('javascript:{q}', 'x')).toBeNull();
    expect(readGeocoder([{ lat: '1', lon: '2', display_name: 'X' }])).toEqual({ lat: 1, lon: 2, name: 'X' }); // prettier-ignore
    expect(readGeocoder({ features: [{ geometry: { coordinates: [2, 1] }, properties: { label: 'Y' } }] })).toEqual({ lat: 1, lon: 2, name: 'Y' }); // prettier-ignore
  });
});
