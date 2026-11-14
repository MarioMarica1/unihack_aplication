import type { FeatureCollection, LineString } from 'geojson';
import { expect, it } from 'vitest';
import { withTramLabels } from './tram-lines';

it('identifică tronsonul comun în sensuri opuse, fără a atribui linia vecină segmentelor separate', () => {
  const start = [21.2, 45.75];
  const junction = [21.21, 45.75];
  const east = [21.22, 45.75];
  const west = [21.19, 45.75];
  const data: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { ref: '1' }, geometry: { type: 'LineString', coordinates: [start, junction, east] } },
      { type: 'Feature', properties: { routeRefs: '2' }, geometry: { type: 'LineString', coordinates: [junction, start, west] } },
    ],
  };
  const result = withTramLabels(data);
  const shared = result.features.filter(feature => feature.properties?.lines_label === 'Tramvai 1 • 2');
  expect(shared.map(feature => feature.geometry.coordinates)).toEqual([[start, junction]]);
  expect(result.features.filter(feature => feature.properties?.labelOnly).map(feature => feature.properties?.lines_label).sort())
    .toEqual(['Tramvai 1', 'Tramvai 1 • 2', 'Tramvai 2']);
  expect(result.features.slice(0, 2).map(feature => feature.properties?.ref)).toEqual(['1', '2']);
});
