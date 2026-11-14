import { mkdir, writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const bbox = [45.68, 21.14, 45.82, 21.32];
const bboxText = bbox.join(',');
const query = `[out:json][timeout:120];(
  way[highway=cycleway](${bboxText});
  way[cycleway~"lane|track|shared_lane|shared_busway|opposite_lane|opposite_track"](${bboxText});
  way["cycleway:right"~"lane|track|shared_lane"](${bboxText});
  way["cycleway:left"~"lane|track|shared_lane"](${bboxText});
  way[bicycle=designated](${bboxText});
  relation[route=bicycle](${bboxText});
  node[amenity=bicycle_rental](${bboxText});
  relation[route=tram](${bboxText}); way[railway=tram](${bboxText}); node[railway=tram_stop](${bboxText});
  relation[route=bus](${bboxText}); relation[route=trolleybus](${bboxText});
  node[highway=bus_stop](${bboxText});
  node[public_transport=platform][bus=yes](${bboxText});
  node[public_transport=platform][trolleybus=yes](${bboxText});
  way[highway=footway](${bboxText}); way[highway=pedestrian](${bboxText});
  way[highway=path][foot!=no](${bboxText});
  way[sidewalk~"both|left|right|yes|separate"](${bboxText});
  way[footway~"sidewalk|crossing"](${bboxText});
  nwr[~"^(amenity|shop|tourism|office|building|leisure|healthcare|craft|historic)$"~"."][name](${bboxText});
);out body geom center;`;
const overpass = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(150000), headers: { 'User-Agent': 'UrbanConnect-UniHack/1.0 (static civic GIS export)', 'Content-Type': 'application/x-www-form-urlencoded' } });
if (!overpass.ok) throw new Error(`Overpass ${overpass.status}: ${await overpass.text()}`);
const osm = await overpass.json();
if (osm.remark || !Array.isArray(osm.elements)) throw new Error(osm.remark || 'Invalid Overpass response');

const collection = () => [];
const layers = { cycleways: collection(), tramways: collection(), busways: collection(), sidewalks: collection(), places: collection() };
const line = (coords, properties) => coords.length >= 2 ? { type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coords.map(p => [p.lon, p.lat]) } } : null;
const lines = (parts, properties) => {
  const coordinates = parts.map(part => part.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => [p.lon, p.lat])).filter(part => part.length >= 2);
  if (!coordinates.length) return null;
  return { type: 'Feature', properties, geometry: coordinates.length === 1 ? { type: 'LineString', coordinates: coordinates[0] } : { type: 'MultiLineString', coordinates } };
};
function classifyPlace(tags = {}) {
  if (tags.railway === 'tram_stop' || tags.public_transport === 'tram') return 'tram_stop';
  if (tags.highway === 'bus_stop' || tags.bus === 'yes' || tags.trolleybus === 'yes') return 'bus_stop';
  if (tags.amenity === 'bicycle_rental') return 'bike_rental';
  if (tags.leisure === 'park') return 'park';
  if (/^(sports_centre|pitch|stadium)$/i.test(tags.leisure || '')) return 'sport';
  if (/^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$/i.test(tags.amenity || '')) return 'food';
  if (/^(hospital|clinic|doctors|dentist|pharmacy)$/i.test(tags.amenity || '') || tags.healthcare) return 'health';
  if (/^(school|kindergarten|university|college|library|music_school|language_school)$/i.test(tags.amenity || '')) return 'education';
  if (tags.shop && !/^(vacant|no)$/.test(tags.shop)) return 'shop';
  if (tags.tourism === 'museum') return 'museum';
  if (tags.tourism || /^(theatre|cinema|arts_centre|community_centre)$/i.test(tags.amenity || '') || tags.historic) return 'culture';
  if (/^(bus_station|ferry_terminal|car_rental|fuel|charging_station)$/i.test(tags.amenity || '')) return 'transport';
  if (/^(townhall|courthouse|police|post_office|bank|place_of_worship|social_facility)$/i.test(tags.amenity || '') || tags.office) return 'services';
  if (tags.building) return 'building';
  return 'services';
}
const osmFeatures = new Map(osm.elements.map(element => [`${element.type}/${element.id}`, element]));
const poiIds = new Set();
for (const element of osm.elements) {
  const tags = element.tags || {};
  if (element.type === 'way' && Array.isArray(element.geometry)) {
    const properties = { osmId: `way/${element.id}`, name: tags.name || '', highway: tags.highway || '', railway: tags.railway || '', cycleway: tags.cycleway || '', sidewalk: tags.sidewalk || '', access: tags.access || '', foot: tags.foot || '' };
    const cycleTags = ['cycleway','cycleway:left','cycleway:right','cycleway:both'].map(key => tags[key]).filter(Boolean);
    if (tags.highway === 'cycleway' || cycleTags.some(value => /^(lane|track|shared_lane|shared_busway|opposite_lane|opposite_track|yes|designated)$/.test(value)) || tags.bicycle === 'designated') {
      const feature = line(element.geometry, { ...properties, kind: tags.highway === 'cycleway' ? 'dedicated' : /shared|lane/.test(cycleTags.join(' ')) ? 'road-tag' : 'dedicated' });
      if (feature) layers.cycleways.push(feature);
    }
    if (tags.railway === 'tram') { const feature = line(element.geometry, { ...properties, kind: 'track', ref: tags.ref || '', colour: tags.colour || '', routeRefs: tags.ref || '', from: tags.from || '', to: tags.to || '' }); if (feature) layers.tramways.push(feature); }
    const footAllowed = tags.access !== 'private' && tags.foot !== 'no';
    const footway = tags.highway === 'footway' || tags.highway === 'pedestrian' || tags.highway === 'path' || /^(sidewalk|crossing)$/.test(tags.footway || '') || /^(both|left|right|yes|separate)$/.test(tags.sidewalk || '');
    if (footAllowed && footway) { const feature = line(element.geometry, { ...properties, kind: tags.sidewalk ? 'road-tag' : 'dedicated' }); if (feature) layers.sidewalks.push(feature); }
  }
  if (element.type === 'relation' && Array.isArray(element.members)) {
    const routeType = tags.route === 'trolleybus' ? 'trolleybus' : tags.route === 'bus' ? 'bus' : tags.route === 'tram' ? 'tram' : tags.route === 'bicycle' ? 'bicycle' : '';
    if (routeType) {
      const parts = element.members.filter(member => member.type === 'way' && member.geometry).map(member => member.geometry);
      const properties = { osmId: `relation/${element.id}`, name: tags.name || '', ref: tags.ref || '', colour: tags.colour || '', routeRefs: tags.ref || '', routeName: tags.name || '', routeType, from: tags.from || '', to: tags.to || '', kind: 'relation' };
      const feature = lines(parts, properties);
      if (feature) (routeType === 'tram' ? layers.tramways : routeType === 'bicycle' ? layers.cycleways : layers.busways).push(feature);
    }
  }
  const kind = classifyPlace(tags);
  const isPlace = !!(tags.name || kind === 'tram_stop' || kind === 'bus_stop' || kind === 'bike_rental');
  const point = element.center || (element.type === 'node' ? element : undefined);
  const id = `${element.type}/${element.id}`;
  if (isPlace && point && Number.isFinite(point.lon) && Number.isFinite(point.lat) && !poiIds.has(id)) {
    poiIds.add(id);
    const name = tags.name || (kind === 'tram_stop' ? 'Stație de tramvai' : kind === 'bus_stop' ? 'Stație STPT' : kind === 'bike_rental' ? 'Stație VeloTM' : 'Loc');
    layers.places.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lon, point.lat] }, properties: { osmId: id, name, kind, routeRefs: tags.ref || '', amenity: tags.amenity || '', shop: tags.shop || '', tourism: tags.tourism || '', office: tags.office || '', healthcare: tags.healthcare || '', leisure: tags.leisure || '', historic: tags.historic || '' } });
  }
}
if (!layers.cycleways.length || !layers.sidewalks.length) {
  const fallbackQuery = `[out:json][timeout:60];(
    way[highway=cycleway](${bboxText}); way[cycleway~"lane|track|shared_lane|shared_busway|opposite_lane|opposite_track"](${bboxText});
    way["cycleway:right"~"lane|track|shared_lane"](${bboxText}); way["cycleway:left"~"lane|track|shared_lane"](${bboxText}); way[bicycle=designated](${bboxText});
    way[highway=footway](${bboxText}); way[highway=pedestrian](${bboxText}); way[highway=path][foot!=no](${bboxText});
    way[sidewalk~"both|left|right|yes|separate"](${bboxText}); way[footway~"sidewalk|crossing"](${bboxText});
  );out body geom;`;
  const fallbackResponse = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: fallbackQuery }), signal: AbortSignal.timeout(100000), headers: { 'User-Agent': 'UrbanConnect-UniHack/1.0 (static civic GIS export)', 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!fallbackResponse.ok) throw new Error(`Overpass fallback ${fallbackResponse.status}: ${await fallbackResponse.text()}`);
  const fallback = await fallbackResponse.json(); if (fallback.remark || !Array.isArray(fallback.elements)) throw new Error(fallback.remark || 'Invalid Overpass way response');
  const known = key => new Set(layers[key].map(feature => feature.properties.osmId));
  const cycleIds = known('cycleways'), footIds = known('sidewalks');
  for (const element of fallback.elements) {
    if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
    const tags = element.tags || {}, osmId = `way/${element.id}`;
    const cycleValues = ['cycleway','cycleway:left','cycleway:right','cycleway:both'].map(key => tags[key]).filter(Boolean);
    const isCycle = tags.highway === 'cycleway' || cycleValues.some(value => /^(lane|track|shared_lane|shared_busway|opposite_lane|opposite_track|yes|designated)$/.test(value)) || tags.bicycle === 'designated';
    if (isCycle && !cycleIds.has(osmId)) {
      const feature = line(element.geometry, { osmId, name: tags.name || '', highway: tags.highway || '', cycleway: tags.cycleway || '', access: tags.access || '', kind: tags.highway === 'cycleway' ? 'dedicated' : /shared|lane/.test(cycleValues.join(' ')) ? 'road-tag' : 'dedicated' });
      if (feature) layers.cycleways.push(feature);
    }
    const pedestrian = tags.access !== 'private' && tags.foot !== 'no' && (['footway','pedestrian','path'].includes(tags.highway) || /^(sidewalk|crossing)$/.test(tags.footway || '') || /^(both|left|right|yes|separate)$/.test(tags.sidewalk || ''));
    if (pedestrian && !footIds.has(osmId)) {
      const feature = line(element.geometry, { osmId, name: tags.name || '', highway: tags.highway || '', footway: tags.footway || '', sidewalk: tags.sidewalk || '', access: tags.access || '', foot: tags.foot || '', kind: tags.sidewalk ? 'road-tag' : 'dedicated' });
      if (feature) layers.sidewalks.push(feature);
    }
  }
}

function readZipEntries(buffer) {
  const entries = new Map();
  for (let offset = 0; offset < buffer.length - 46;) {
    const index = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset);
    if (index < 0) break;
    const method = buffer.readUInt16LE(index + 10), size = buffer.readUInt32LE(index + 20);
    const nameLength = buffer.readUInt16LE(index + 28), extraLength = buffer.readUInt16LE(index + 30), commentLength = buffer.readUInt16LE(index + 32), localOffset = buffer.readUInt32LE(index + 42);
    const name = buffer.toString('utf8', index + 46, index + 46 + nameLength);
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const compressed = buffer.subarray(dataStart, dataStart + size);
    if (name.endsWith('.txt')) entries.set(name, method === 8 ? inflateRawSync(compressed).toString('utf8') : compressed.toString('utf8'));
    offset = index + 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some(cell => cell !== '')) rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...data] = rows; return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), values[index] ?? ''])));
}
function clipShape(points) {
  const parts = []; let part = [];
  for (const point of points) {
    const lat = Number(point.shape_pt_lat), lon = Number(point.shape_pt_lon);
    const inside = lat >= bbox[0] && lon >= bbox[1] && lat <= bbox[2] && lon <= bbox[3];
    if (inside) part.push({ lat, lon }); else if (part.length) { if (part.length >= 2) parts.push(part); part = []; }
  }
  if (part.length >= 2) parts.push(part);
  return parts;
}
const feedUrl = 'https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip';
const gtfsResponse = await fetch(feedUrl, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'UrbanConnect-UniHack/1.0 (public GTFS static-map import)' } });
if (!gtfsResponse.ok) throw new Error(`GTFS SMTT ${gtfsResponse.status}`);
const gtfs = readZipEntries(Buffer.from(await gtfsResponse.arrayBuffer()));
for (const required of ['routes.txt','trips.txt','shapes.txt','stops.txt','stop_times.txt']) if (!gtfs.has(required)) throw new Error(`GTFS lipsește fișierul ${required}`);
const routes = new Map(parseCsv(gtfs.get('routes.txt')).map(row => [row.route_id, row]));
const trips = parseCsv(gtfs.get('trips.txt'));
const shapeRoutes = new Map(), tripRoutes = new Map(), stopRoutes = new Map(), stopRouteTypes = new Map();
for (const trip of trips) {
  const routeIds = shapeRoutes.get(trip.shape_id) || new Set(); routeIds.add(trip.route_id); shapeRoutes.set(trip.shape_id, routeIds); tripRoutes.set(trip.trip_id, trip.route_id);
}
for (const stopTime of parseCsv(gtfs.get('stop_times.txt'))) {
  const route = routes.get(tripRoutes.get(stopTime.trip_id)); if (!route) continue;
  const refs = stopRoutes.get(stopTime.stop_id) || new Set(); refs.add(route.route_short_name || route.route_long_name); stopRoutes.set(stopTime.stop_id, refs);
  const types = stopRouteTypes.get(stopTime.stop_id) || new Set(); types.add(route.route_type); stopRouteTypes.set(stopTime.stop_id, types);
}
const shapes = new Map();
for (const point of parseCsv(gtfs.get('shapes.txt'))) { const list = shapes.get(point.shape_id) || []; list.push(point); shapes.set(point.shape_id, list); }
for (const [shapeId, points] of shapes) {
  const routeVariants = new Map();
  for (const routeId of shapeRoutes.get(shapeId) || []) {
    const route = routes.get(routeId); if (!route) continue;
    const type = Number(route.route_type); const routeType = type === 0 ? 'tram' : type === 11 ? 'trolleybus' : type === 3 ? 'bus' : '';
    if (!routeType) continue;
    const group = routeVariants.get(routeType) || []; group.push(route); routeVariants.set(routeType, group);
  }
  if (!routeVariants.size) continue;
  const parts = clipShape(points.sort((a,b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence)));
  for (const [routeType, variants] of routeVariants) {
    const routeRefs = variants.map(route => route.route_short_name).filter(Boolean).join(', ');
    const routeName = variants.map(route => route.route_long_name).filter(Boolean).join(' / ');
    const feature = lines(parts, { name: routeName || routeRefs, routeName, ref: routeRefs, routeRefs, routeType, source: 'GTFS SMTT', kind: 'gtfs', routeColor: variants[0]?.route_color || '' });
    if (feature) (routeType === 'tram' ? layers.tramways : layers.busways).push(feature);
  }
}
for (const stop of parseCsv(gtfs.get('stops.txt'))) {
  const lat = Number(stop.stop_lat), lon = Number(stop.stop_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < bbox[0] || lat > bbox[2] || lon < bbox[1] || lon > bbox[3]) continue;
  const routeRefs = [...(stopRoutes.get(stop.stop_id) || [])].filter(Boolean).join(', ');
  const routeTypes = stopRouteTypes.get(stop.stop_id) || new Set();
  const kind = routeTypes.has('0') ? 'tram_stop' : 'bus_stop';
  const stationModes = Number(routeTypes.has('0')) + 2 * Number(routeTypes.has('3') || routeTypes.has('11'));
  const osmId = `gtfs-stop/${stop.stop_id}`;
  layers.places.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { osmId, name: stop.stop_name || 'Stație STPT', kind, stationModes, routeRefs, source: 'GTFS SMTT' } });
}

const directory = new URL('../public/data/', import.meta.url); await mkdir(directory, { recursive: true });
for (const [name, features] of Object.entries(layers)) await writeFile(new URL(`${name}.geojson`, directory), JSON.stringify({ type: 'FeatureCollection', features }));
const metadata = { source: 'OpenStreetMap / Overpass API, GTFS SMTT (producer feed), Primăria Municipiului Timișoara Open Data', license: 'OSM: ODbL 1.0; GTFS SMTT and PMT resources: terms/attribution per source', attributionUrl: 'https://www.openstreetmap.org/copyright', exportedAt: new Date().toISOString(), osmTimestamp: osm.osm3s?.timestamp_osm_base, gtfsUrl: feedUrl, bbox, counts: Object.fromEntries(Object.entries(layers).map(([key, features]) => [key, features.length])), notes: 'OSM route relations are exported with their complete member geometries. GTFS shapes and stops are clipped to the city bounding box. Separate sidewalk mapping and road-sidewalk tags are distinct; access=private and foot=no segments are omitted. The PMT bike/trotinete portal resource is statistical CSV, not a geospatial cycle-network layer; cycleways here reflect OSM coverage.' };
await writeFile(new URL('metadata.json', directory), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));
