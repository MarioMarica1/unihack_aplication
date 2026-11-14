import type { Map, GeoJSONSource } from 'maplibre-gl';
import type { ExpressionSpecification, FilterSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Infrastructure, LayerVisibility } from './infrastructure';
import { PlaceIcon, placeAppearance, placeIcons } from './place-icons';

type PlaceFeature = Infrastructure['places']['features'][number];
type PlaceFeed = {
  visible: boolean; places: PlaceFeature[]; localPlaces: PlaceFeature[];
  layers: LayerVisibility; focusedId?: string; dark: boolean;
};
const source = 'osm-local-places';
const stations = 'osm-mobility-stations';
export const placeLayerIds = ['osm-place-icons', 'osm-station-icons'];
const iconPrefix = 'urban-poi-';

const stationIcons: Record<string, string> = { bus_stop: 'icon-bus-stop', tram_stop: 'icon-tram-stop', bike_rental: 'icon-bike-station' };

async function createCategoryPin(kind: string) {
  const [, color] = placeAppearance(kind);
  const combined = kind === 'transit_stop';
  const icon = combined
    ? `<g transform="translate(7 14)">${renderToStaticMarkup(<PlaceIcon kind="tram_stop" size={14} />)}</g><g transform="translate(20 14)">${renderToStaticMarkup(<PlaceIcon kind="bus_stop" size={14} />)}</g>`
    : `<g transform="translate(10 10)">${renderToStaticMarkup(<PlaceIcon kind={kind} size={22} />)}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="132" viewBox="0 0 42 44" color="white"><ellipse cx="21" cy="39" rx="10" ry="2.5" fill="#0f172a" opacity=".26"/><circle cx="21" cy="21" r="17" fill="${color}" stroke="white" stroke-width="2"/> ${icon}</svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

let images: Promise<[string, HTMLImageElement][]> | undefined;
export async function registerPlacePins(map: Map, isCurrent: () => boolean) {
  images ??= Promise.all(Object.keys(placeIcons).map(async kind => [stationIcons[kind] ?? iconPrefix + kind, await createCategoryPin(kind)]));
  const pins = await images;
  if (!isCurrent()) return false;
  for (const [id, image] of pins) if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 3 });
  return true;
}

const iconSize: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 13, 0.65, 16, 1];
const textColors: Record<string, [string, string]> = {
  health: ['#991b1b', '#fda4af'], culture: ['#6b21a8', '#d8b4fe'], museum: ['#6b21a8', '#d8b4fe'],
  park: ['#166534', '#86efac'], food: ['#9a3412', '#fdba74'], lodging: ['#9d174d', '#f9a8d4'],
};

function addSymbol(map: Map, id: string, sourceId: string, dark: boolean, isStation: boolean) {
  const [[first, firstColor], ...rest] = Object.entries(textColors);
  const colors = rest.flatMap(([key, pair]) => [key, pair[dark ? 1 : 0]]);
  const layer: SymbolLayerSpecification = {
    id, source: sourceId, type: 'symbol', ...(isStation ? { minzoom: 13 } : {}),
    layout: {
      'symbol-sort-key': ['get', 'priorityRank'], 'icon-image': ['image', ['get', 'iconId']],
      'icon-size': iconSize, 'icon-allow-overlap': false, 'icon-padding': 6,
      'text-field': ['get', 'name'], 'text-allow-overlap': false, 'text-optional': true, 'text-font': ['Noto Sans Bold'],
      'text-variable-anchor': ['left', 'right', 'bottom'], 'text-radial-offset': 1.1, 'text-size': 11.5,
    },
    paint: { 'text-color': ['match', ['get', 'kind'], first, firstColor[dark ? 1 : 0], ...colors, dark ? '#d6e6fa' : '#334155'],
      'text-halo-color': dark ? '#0f172a' : '#ffffff', 'text-halo-width': 1.8 },
  };
  map.addLayer(layer);
}

function featureWithIcon(feature: PlaceFeature, kind = feature.properties?.kind): PlaceFeature {
  const name = typeof kind === 'string' && Object.hasOwn(placeIcons, kind) ? kind : 'place';
  const iconId = stationIcons[name] ?? iconPrefix + name;
  return { ...feature, properties: { ...feature.properties, iconId } };
}

export function placesInViewport(map: Pick<Map, 'getZoom' | 'getBounds' | 'project'>, features: PlaceFeature[], focusedId?: string) {
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const allowed = zoom < 13 ? 1 : zoom < 14.5 ? 2 : 3;
  const visible = features.filter(({ properties: p, geometry }) => p && p.priorityRank <= allowed &&
    `osm:${p.osmId}` !== focusedId && bounds.contains([geometry.coordinates[0], geometry.coordinates[1]]))
    .sort((a, b) => a.properties?.priorityRank - b.properties?.priorityRank);
  if (zoom > 16) return visible;
  const spacing = zoom < 13 ? 28 : zoom < 14.5 ? 45 : 31;
  const used = new Set<string>();
  return visible.filter(({ geometry }) => {
    const screen = map.project([geometry.coordinates[0], geometry.coordinates[1]]);
    const key = `${Math.floor(screen.x / spacing)},${Math.floor(screen.y / spacing)}`;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  }).slice(0, zoom < 13 ? 25 : zoom < 14.5 ? 80 : 220);
}

export function syncPlaceLayers(map: Map, feed: PlaceFeed) {
  if (!map.getSource(source)) {
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    addSymbol(map, placeLayerIds[0], source, feed.dark, false);
  }
  if (!map.getSource(stations)) {
    map.addSource(stations, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    addSymbol(map, placeLayerIds[1], stations, feed.dark, true);
  }
  const stopFeatures = feed.localPlaces.flatMap(feature => {
    const p = feature.properties;
    if (!p || `osm:${p.osmId}` === feed.focusedId) return [];
    if (p.kind === 'bike_rental') return feed.layers.cycleways ? [featureWithIcon(feature)] : [];
    const tram = (p.stationModes & 1) && feed.layers.tramways;
    const bus = (p.stationModes & 2) && feed.layers.busways;
    return tram || bus ? [featureWithIcon(feature, tram && bus ? 'transit_stop' : tram ? 'tram_stop' : 'bus_stop')] : [];
  });
  const stationIds = new Set(stopFeatures.map(feature => feature.properties?.osmId));
  const browsable = feed.visible ? feed.places.filter(feature => !stationIds.has(feature.properties?.osmId)) : [];
  const updateViewport = () => {
    const visiblePlaces = placesInViewport(map, browsable, feed.focusedId);
    map.getSource<GeoJSONSource>(source)?.setData({ type: 'FeatureCollection', features: visiblePlaces.map(feature => featureWithIcon(feature)) });
  };
  updateViewport();
  map.getSource<GeoJSONSource>(stations)?.setData({ type: 'FeatureCollection', features: stopFeatures });
  const shown = (condition: boolean) => condition ? 'visible' : 'none';
  map.setLayoutProperty(placeLayerIds[0], 'visibility', shown(feed.visible));
  map.setLayoutProperty(placeLayerIds[1], 'visibility', shown(stopFeatures.length > 0));
  return updateViewport;
}
