import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPlaces, normalizeSearch } from './PlacesPanel';
import type { Infrastructure } from './infrastructure';
const data = { places: JSON.parse(readFileSync('public/data/places.geojson','utf8')) } as Infrastructure;
describe('Căutarea locurilor reale', () => {
  it('găsește locul și fără diacritice, păstrând identitatea OSM și coordonatele', () => {
    const matches = findPlaces(data, 'carturesti', 'all');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(feature => normalizeSearch(feature.properties?.name || '').includes('carturesti'))).toBe(true);
    expect(matches[0].properties?.osmId).toMatch(/^(node|way|relation)\//);
  });
  it('filtrează local categoriile, inclusiv parcurile reprezentate prin suprafețe', () => {
    for (const category of ['food','shop','education','health','park','building']) {
      const matches = findPlaces(data, '', category);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(feature => feature.properties?.kind === category)).toBe(true);
    }
  });
  it('tratează coerent spațiile, literele mari și rezultate inexistente', () => {
    expect(findPlaces(data, '   MUZEUL UPT  ', 'all').length).toBeGreaterThan(0);
    expect(findPlaces(data, 'loc-inexistent-12345', 'all')).toEqual([]);
  });
});
