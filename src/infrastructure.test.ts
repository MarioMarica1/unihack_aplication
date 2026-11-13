import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection, LineString, Point } from 'geojson';

describe('Extragere OSM statică', () => {
  it.each(['cycleways', 'tramways', 'sidewalks', 'places'])('%s are geometrie validă, sursă identificabilă și numărătoare corectă', key => {
    const data: FeatureCollection<LineString | Point> = JSON.parse(readFileSync(`public/data/${key}.geojson`, 'utf8'));
    const metadata = JSON.parse(readFileSync('public/data/metadata.json', 'utf8'));
    expect(data.type).toBe('FeatureCollection'); expect(data.features.length).toBe(metadata.counts[key]); expect(data.features.length).toBeGreaterThan(0);
    for (const feature of data.features) {
      expect(feature.properties?.osmId).toMatch(/^(node|way|relation)\/\d+$/);
      expect(feature.geometry.type).toBe(key === 'places' ? 'Point' : 'LineString');
      const positions = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const [lon, lat] of positions) { expect(Number.isFinite(lon) && lon > -180 && lon < 180).toBe(true); expect(Number.isFinite(lat) && lat > -90 && lat < 90).toBe(true); }
    }
  });
  it('disting geometria dedicată de informația proiectată pe stradă', () => {
    const sidewalks: FeatureCollection<LineString> = JSON.parse(readFileSync('public/data/sidewalks.geojson', 'utf8'));
    expect(sidewalks.features.some(f => f.properties?.kind === 'dedicated')).toBe(true);
    expect(sidewalks.features.some(f => f.properties?.kind === 'road-tag')).toBe(true);
    const cycles: FeatureCollection<LineString> = JSON.parse(readFileSync('public/data/cycleways.geojson', 'utf8'));
    for (const feature of cycles.features) {
      const tags = feature.properties!;
      expect(tags.highway === 'cycleway' || ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'].some(key => /^(lane|track|shared_lane|opposite_lane|opposite_track|yes|designated)$/.test(tags[key] || ''))).toBe(true);
    }
  });
});
