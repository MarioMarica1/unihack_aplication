import { mkdir, writeFile } from 'node:fs/promises';

// One bounded extraction, kept as static GeoJSON. Never called on map movement.
const bbox = '45.72,21.18,45.79,21.28';
const query = `[out:json][timeout:60];(
  way[railway=tram](${bbox});
  way[highway=cycleway](${bbox});
  way[~"^cycleway(:left|:right|:both)?$"~"^(lane|track|shared_lane|opposite_lane|opposite_track|yes|designated)$"](${bbox});
  way[highway=footway][footway=sidewalk](${bbox});
  way[sidewalk~"^(both|left|right|yes|separate)$"](${bbox});
  nwr[leisure~"^(park|sports_centre|pitch)$"][name](${bbox});
  nwr[tourism=museum][name](${bbox});
  node[railway=tram_stop](${bbox});
);out tags center geom;`;
const response = await fetch(`https://overpass-api.de/api/interpreter?${new URLSearchParams({ data: query })}`, { signal: AbortSignal.timeout(75000), headers: { 'User-Agent': 'Vecin-UniHack-demo/0.2 (single static OSM export)' } });
if (!response.ok) throw new Error(`Overpass ${response.status}: ${await response.text()}`);
const data = await response.json(); if (data.remark) throw new Error(data.remark);
if (!Array.isArray(data.elements)) throw new Error('Invalid Overpass response');
const positiveCycle = /^(lane|track|shared_lane|opposite_lane|opposite_track|yes|designated)$/;
const layers = { cycleways: [], tramways: [], sidewalks: [], places: [] };
for (const element of data.elements) {
  const tags = element.tags || {};
  const properties = { osmId: `${element.type}/${element.id}`, name: tags.name || '', ...Object.fromEntries(Object.entries(tags).filter(([key]) => ['highway','railway','sidewalk','footway','cycleway','cycleway:left','cycleway:right','cycleway:both','leisure','tourism','surface','access','bicycle'].includes(key))) };
  if (element.type === 'way' && element.geometry?.length >= 2) {
    const geometry = { type: 'LineString', coordinates: element.geometry.map(p => [p.lon, p.lat]) };
    const feature = detail => ({ type: 'Feature', properties: { ...properties, ...detail }, geometry });
    const cycleValues = ['cycleway','cycleway:left','cycleway:right','cycleway:both'].map(key => tags[key]).filter(Boolean);
    if (tags.highway === 'cycleway' || cycleValues.some(v => positiveCycle.test(v))) layers.cycleways.push(feature({ kind: tags.highway === 'cycleway' ? 'dedicated' : 'road-tag' }));
    if (tags.railway === 'tram') layers.tramways.push(feature({ kind: 'track' }));
    if (tags.highway === 'footway' && tags.footway === 'sidewalk') layers.sidewalks.push(feature({ kind: 'dedicated' }));
    else if (/^(both|left|right|yes|separate)$/.test(tags.sidewalk || '')) layers.sidewalks.push(feature({ kind: 'road-tag' }));
  }
  const poiKind = tags.railway === 'tram_stop' ? 'tram_stop' : tags.tourism === 'museum' ? 'museum' : tags.leisure === 'park' ? 'park' : ['pitch','sports_centre'].includes(tags.leisure) ? 'sport' : undefined;
  if (poiKind) {
    const point = element.center || (element.type === 'node' ? element : undefined);
    if (point && Number.isFinite(point.lon) && Number.isFinite(point.lat)) layers.places.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lon, point.lat] }, properties: { ...properties, kind: poiKind, name: tags.name || 'Stație de tramvai' } });
  }
}
const directory = new URL('../public/data/', import.meta.url); await mkdir(directory, { recursive: true });
for (const [name, features] of Object.entries(layers)) await writeFile(new URL(`${name}.geojson`, directory), JSON.stringify({ type: 'FeatureCollection', features }));
const metadata = { source: 'OpenStreetMap contributors / Overpass API', license: 'ODbL 1.0', attributionUrl: 'https://www.openstreetmap.org/copyright', exportedAt: new Date().toISOString(), osmTimestamp: data.osm3s?.timestamp_osm_base, bbox: bbox.split(',').map(Number), counts: Object.fromEntries(Object.entries(layers).map(([key, features]) => [key, features.length])), notes: 'Road-tag cycleways and sidewalks use street centerlines, not surveyed separate paths. Coverage is incomplete. Parks/sport/museum points may be polygon centers; not entrance coordinates.' };
await writeFile(new URL('metadata.json', directory), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));
