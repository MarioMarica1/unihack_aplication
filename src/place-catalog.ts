import { distance } from './domain';
import { placeKindLabel } from './infrastructure';
import type { Infrastructure } from './infrastructure';

type PlaceFeature = Infrastructure['places']['features'][number];
export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro').trim();
const featured = new Map(['node/13157952377', 'way/4975934', 'relation/1250434', 'way/98090655', 'way/222924327', 'way/97929100'].map((id, index) => [id, index]));
const lodging = /^(hotel|motel|hostel|guest_house|apartment|chalet)$/;
const stopKinds = ['bus_stop', 'tram_stop', 'transit_stop'];

function rank(properties: NonNullable<PlaceFeature['properties']>): number {
  const name = normalizeSearch(properties.name);
  if (featured.has(properties.osmId)) return 1;
  if (stopKinds.includes(properties.kind)) return 3;
  if (properties.amenity === 'university' ||
    /^(facultatea |universitatea |iulius town$|shopping city|spitalul (clinic judetean|clinic municipal|clinic de urgenta pentru copii)|piata (victoriei|libertatii|unirii)$|domul |castelul huniade|bastionul maria theresia|parcul (botanic|rozelor|central|civic)$)/.test(name)) return 1;
  if (['education', 'lodging', 'museum'].includes(properties.kind) ||
    /^(clinic|hospital|theatre|townhall|bank|restaurant)$/.test(properties.amenity ?? '') ||
    /^(lidl|kaufland|carrefour|auchan|selgros|metro)\b/.test(name) || properties.shop === 'supermarket') return 2;
  return 3;
}

export function buildPlaceCatalog(data?: Infrastructure['places']): PlaceFeature[] {
  const features = (data?.features ?? []).flatMap(feature => {
    const properties = feature.properties;
    if (typeof properties?.name !== 'string' || !properties.name.trim()) return [];
    const classified = { ...properties, kind: lodging.test(properties.tourism ?? '') ? 'lodging' : properties.kind };
    return [{ ...feature, properties: { ...classified, priorityRank: rank(classified) } }] as PlaceFeature[];
  });
  // Keep known landmarks, meaningful categories and the richer GTFS stop over duplicate OSM nodes.
  const quality = (p: PlaceFeature['properties']) =>
    (featured.has(p?.osmId) ? 100 : 0) + (p?.source === 'GTFS SMTT' ? 20 : 0) +
    (p?.kind !== 'building' ? 8 : 0) + (p?.street ? 4 : 0) + (/^(way|relation)\//.test(p?.osmId ?? '') ? 2 : 0);
  features.sort((a, b) => quality(b.properties) - quality(a.properties));
  const byName = new Map<string, PlaceFeature[]>();
  const unique: PlaceFeature[] = [];
  for (const feature of features) {
    const p = feature.properties!;
    const name = normalizeSearch(p.name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const key = `${stopKinds.includes(p.kind) ? 'station' : 'place'}:${name}`;
    const group = byName.get(key) ?? [];
    const [lon, lat] = feature.geometry.coordinates;
    const duplicate = group.find(other => {
      const [otherLon, otherLat] = other.geometry.coordinates;
      return distance({ lon, lat }, { lon: otherLon, lat: otherLat }) < 15;
    });
    const modes = p.stationModes ?? (p.kind === 'transit_stop' ? 3 : p.kind === 'tram_stop' ? 1 : p.kind === 'bus_stop' ? 2 : 0);
    if (duplicate?.properties) {
      const d = duplicate.properties;
      d.stationModes |= modes;
      if (d.stationModes === 3) d.kind = 'transit_stop';
      if (modes && p.routeRefs) d.routeRefs = [...new Set(`${d.routeRefs ?? ''},${p.routeRefs}`.split(/\s*,\s*/).filter(Boolean))].join(', ');
      continue;
    }
    p.stationModes = modes;
    if (modes === 3) p.kind = 'transit_stop';
    group.push(feature);
    byName.set(key, group);
    unique.push(feature);
  }
  return unique;
}

export function filterPlaces(catalog: PlaceFeature[], query: string, category: string) {
  const term = normalizeSearch(query);
  return catalog.filter(({ properties: p }) => p &&
    (category === 'all' || p.kind === category ||
      (category === 'transport' && [...stopKinds, 'bike_rental'].includes(p.kind)) ||
      (category === 'culture' && p.kind === 'museum')) &&
    (!term || normalizeSearch(`${p.name} ${p.street ?? ''} ${p.number ?? ''} ${placeKindLabel[p.kind] ?? ''}`).includes(term))
  ).sort((a, b) => {
    const ap = a.properties!, bp = b.properties!;
    if (term) {
      const exact = Number(normalizeSearch(bp.name) === term) - Number(normalizeSearch(ap.name) === term);
      if (exact) return exact;
    }
    return (featured.get(ap.osmId) ?? 100) - (featured.get(bp.osmId) ?? 100) ||
      ap.priorityRank - bp.priorityRank || ap.name.localeCompare(bp.name, 'ro');
  });
}
