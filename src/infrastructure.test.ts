import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson';

describe('Date statice OSM și GTFS SMTT', () => {
  it.each(['cycleways', 'tramways', 'busways', 'sidewalks', 'places'])('%s are geometrie validă, sursă identificabilă și numărătoare corectă', key => {
    const data: FeatureCollection<LineString | MultiLineString | Point> = JSON.parse(readFileSync(`public/data/${key}.geojson`, 'utf8'));
    const metadata = JSON.parse(readFileSync('public/data/metadata.json', 'utf8'));
    expect(data.type).toBe('FeatureCollection'); expect(data.features.length).toBe(metadata.counts[key]); expect(data.features.length).toBeGreaterThan(0);
    for (const feature of data.features) {
      const properties = feature.properties;
      if (properties?.source === 'GTFS SMTT') {
        expect(properties.routeRefs).toMatch(/\S/);
        if (key === 'places') {
          expect(properties.osmId).toMatch(/^gtfs-stop\/.+$/);
          expect(['tram_stop', 'bus_stop']).toContain(properties.kind);
        } else {
          expect(properties.kind).toBe('gtfs');
          expect(key === 'tramways' ? ['tram'] : ['bus', 'trolleybus']).toContain(properties.routeType);
        }
      } else expect(properties?.osmId).toMatch(/^(node|way|relation)\/\d+$/);
      const geometry = feature.geometry;
      expect(key === 'places' ? ['Point'] : ['LineString', 'MultiLineString']).toContain(geometry.type);
      const parts = geometry.type === 'Point' ? [[geometry.coordinates]] : geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
      expect(parts.length).toBeGreaterThan(0);
      if (key !== 'places') expect(parts.every(line => line.length >= 2)).toBe(true);
      const positions = parts.flat();
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
