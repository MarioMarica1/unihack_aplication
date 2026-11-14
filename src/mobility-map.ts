import type { DataDrivenPropertyValueSpecification, FilterSpecification, GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { layerDefinitions } from './infrastructure';
import type { Infrastructure, LayerVisibility } from './infrastructure';
import { tramColors, withTramLabels } from './tram-lines';
import type { LiveVehicleType } from './stpt-live';
import { transitLayerIds } from './transit-map';
import { placeLayerIds } from './place-map';
import { busLineColor, normalizeLine } from './transport-colors';

const lineGroups = [
  ['sidewalks', 'mobility-sidewalks', 2.5],
  ['busways', 'mobility-bus-trolley', 3],
  ['cycleways', 'mobility-bike-lanes', 3.5],
  ['tramways', 'mobility-tram-lines', 4],
] as const;

const tramLabels = 'mobility-tram-labels';
const liveVehicles = 'stpt-live-vehicles';
const busLabels = 'mobility-bus-labels';
const casing = '#0f172a';

export function orderMobilityLayers(map: Map) {
  const lines = lineGroups.flatMap(([, id]) => [`${id}-casing`, `${id}-tag-casing`, id, `${id}-tag`]);
  for (const id of [...lines, 'route-halo', 'route-line', ...transitLayerIds, busLabels, tramLabels, ...placeLayerIds, liveVehicles]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

const tramColor: DataDrivenPropertyValueSpecification<string> = [
  'match', ['get', 'ref'],
  '1', tramColors['1'], '2', tramColors['2'], '4', tramColors['4'], '5', tramColors['5'],
  '6', tramColors['6'], '7', tramColors['7'], '8', tramColors['8'], '9', tramColors['9'],
  layerDefinitions.tramways.color,
];

export function addMobilityLines(map: Map, infrastructure: Partial<Infrastructure>, visibility: LayerVisibility) {
  const interactive: string[] = [];
  for (const [key, id, width] of lineGroups) {
    const data = infrastructure[key];
    if (!data) continue;
    const isTram = key === 'tramways';
    const isBus = key === 'busways';
    if (!map.getSource(id)) {
      const normalized = isBus ? { ...data, features: data.features.map(feature => {
        const p = feature.properties;
        const refs = String(p?.ref || p?.routeRefs || '').split(/[,;•]/).map(normalizeLine).filter(Boolean);
        const ref = refs[0] ?? '';
        return { ...feature, properties: { ...p, ref, mapLabel: refs.length
          ? `${p?.routeType === 'trolleybus' ? 'Troleibuz' : 'Autobuz'} ${refs.join(' • ')}` : '' } };
      }) } : data;
      map.addSource(id, { type: 'geojson', data: isTram ? withTramLabels(data) : normalized });
    }
    let color: DataDrivenPropertyValueSpecification<string> = isTram ? tramColor : layerDefinitions[key].color;
    if (isBus) {
      const refs = [...new Set(data.features.map(feature => normalizeLine(String(feature.properties?.ref || feature.properties?.routeRefs || '').split(/[,;•]/)[0])).filter(Boolean))];
      const [first, ...rest] = refs;
      if (first) color = ['match', ['get', 'ref'], first, busLineColor(first),
        ...rest.flatMap(ref => [ref, busLineColor(ref)]), layerDefinitions.busways.color];
    }

    const solid: FilterSpecification = isTram ? ['!', ['has', 'labelOnly']] : ['!=', ['get', 'kind'], 'road-tag'];
    const groups = isTram ? [[id, solid, false] as const] : [
      [id, solid, false] as const,
      [`${id}-tag`, ['==', ['get', 'kind'], 'road-tag'] as FilterSpecification, true] as const,
    ];
    for (const [layerId, filter, dashed] of groups) {
      for (const outline of [true, false]) {
        const name = outline ? `${layerId}-casing` : layerId;
        if (!map.getLayer(name)) map.addLayer({
          id: name, source: id, type: 'line', filter,
          layout: { 'line-cap': dashed ? 'butt' : 'round', 'line-join': 'round' },
          paint: {
            'line-color': outline ? casing : color,
            'line-width': width + (outline ? 2 : 0), 'line-opacity': .95,
            ...(dashed ? { 'line-dasharray': outline ? [1.5, 1.5] : [2.5, 2.5] } : {}),
          },
        });
        map.setLayoutProperty(name, 'visibility', visibility[key] ? 'visible' : 'none');
      }
      interactive.push(layerId);
    }

    if (isTram || isBus) {
      const labels = isTram ? tramLabels : busLabels;
      if (!map.getLayer(labels)) map.addLayer({
        id: labels, source: id, type: 'symbol',
        filter: isTram ? ['has', 'labelOnly'] : ['!=', ['get', 'mapLabel'], ''], minzoom: isTram ? 12 : 13,
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': isTram ? 180 : 220,
          'text-field': ['get', isTram ? 'lines_label' : 'mapLabel'],
          'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-keep-upright': true,
          'text-allow-overlap': false, 'text-padding': 5,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': casing, 'text-halo-width': 2 },
      });
      map.setLayoutProperty(labels, 'visibility', visibility[key] ? 'visible' : 'none');
    }
  }
  return interactive;
}

export function updateLiveVehicleLayer(map: Map, data: FeatureCollection<Point>) {
  const source = map.getSource<GeoJSONSource>(liveVehicles);
  if (source) {
    source.setData(data);
    return;
  }
  const colors: Record<LiveVehicleType, string> = { tram: '#7c3aed', bus: '#1d4ed8', trolleybus: '#0e7490' };
  for (const [type, color] of Object.entries(colors)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(2, 2, 44, 44, 10);
    context.fill(); context.stroke();
    context.beginPath();
    context.roundRect(13, 13, 22, 20, 4);
    context.stroke();
    context.beginPath();
    context.moveTo(13, 24); context.lineTo(35, 24);
    context.moveTo(17, 33); context.lineTo(17, 37);
    context.moveTo(31, 33); context.lineTo(31, 37);
    if (type !== 'bus') {
      context.moveTo(18, 13); context.lineTo(25, 7); context.lineTo(31, 13);
    }
    context.stroke();
    map.addImage(`stpt-${type}`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
  }
  map.addSource(liveVehicles, { type: 'geojson', data });
  map.addLayer({
    id: liveVehicles, source: liveVehicles, type: 'symbol',
    layout: {
      'icon-image': ['concat', 'stpt-', ['get', 'type']],
      'icon-allow-overlap': true, 'text-optional': true,
      'text-field': ['get', 'line'], 'text-anchor': 'top', 'text-offset': [0, 1],
      'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-padding': 4,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': casing, 'text-halo-width': 2 },
  });
  orderMobilityLayers(map);
}
