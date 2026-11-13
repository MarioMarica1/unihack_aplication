import { readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../public/data/', import.meta.url);
const bbox = '45.72,21.18,45.79,21.28';
const query = `[out:json][timeout:60];(nwr[~"^(amenity|shop|tourism|office|building)$"~"."][name](${bbox});nwr[leisure~"^(park|sports_centre|pitch)$"][name](${bbox}););out tags center;`;
const response = await fetch(`https://overpass-api.de/api/interpreter?${new URLSearchParams({ data: query })}`, { signal: AbortSignal.timeout(75000), headers: { 'User-Agent': 'Vecin-UniHack/0.3 (bounded static place export)' } });
if (!response.ok) throw new Error(`OSM export failed: ${response.status}`);
const result = await response.json(); if (!Array.isArray(result.elements) || result.remark) throw new Error(result.remark || 'Invalid OSM response');
const existing = JSON.parse(await readFile(new URL('places.geojson', directory), 'utf8'));
const byId = new Map(existing.features.map(feature => [feature.properties.osmId, feature]));
function classify(tags) {
  if (tags.leisure === 'park') return 'park';
  if (/^(sports_centre|pitch)$/.test(tags.leisure || '')) return 'sport';
  if (/^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$/.test(tags.amenity || '')) return 'food';
  if (/^(hospital|clinic|doctors|dentist|pharmacy)$/.test(tags.amenity || '')) return 'health';
  if (/^(school|kindergarten|university|college|library|music_school|language_school)$/.test(tags.amenity || '')) return 'education';
  if (tags.shop && !/^(vacant|no)$/.test(tags.shop)) return 'shop';
  if (tags.tourism === 'museum') return 'museum';
  if (tags.tourism || /^(theatre|cinema|arts_centre|community_centre)$/.test(tags.amenity || '')) return 'culture';
  if (/^(bus_station|ferry_terminal|bicycle_rental|car_rental|fuel|charging_station)$/.test(tags.amenity || '')) return 'transport';
  if (/^(townhall|courthouse|police|post_office|bank|place_of_worship|social_facility)$/.test(tags.amenity || '') || tags.office) return 'services';
  if (tags.building) return 'building';
  return 'services';
}
for (const element of result.elements) {
  const tags = element.tags || {}; const point = element.center || element;
  if (!tags.name || !Number.isFinite(point.lon) || !Number.isFinite(point.lat)) continue;
  const osmId = `${element.type}/${element.id}`;
  if (byId.has(osmId)) continue;
  const properties = { osmId, name: tags.name, kind: classify(tags), amenity: tags.amenity || '', shop: tags.shop || '', building: tags.building || '', tourism: tags.tourism || '', street: tags['addr:street'] || '', number: tags['addr:housenumber'] || '' };
  byId.set(osmId, { type: 'Feature', geometry: { type: 'Point', coordinates: [point.lon, point.lat] }, properties });
}
const features = [...byId.values()];
await writeFile(new URL('places.geojson', directory), JSON.stringify({ type: 'FeatureCollection', features }));
const metadata = JSON.parse(await readFile(new URL('metadata.json', directory), 'utf8'));
metadata.counts.places = features.length; metadata.placesExportedAt = new Date().toISOString(); metadata.placesOsmTimestamp = result.osm3s?.timestamp_osm_base;
metadata.placeCategories = Object.fromEntries([...new Set(features.map(f => f.properties.kind))].map(kind => [kind, features.filter(f => f.properties.kind === kind).length]));
await writeFile(new URL('metadata.json', directory), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify({ total: features.length, categories: metadata.placeCategories }, null, 2));
