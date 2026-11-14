import type { DataDrivenPropertyValueSpecification, FilterSpecification, GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point, Position } from 'geojson';
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
export const liveVehiclesLayerId = 'stpt-live-vehicles';
export const liveVehiclesArrowLayerId = 'stpt-live-vehicles-arrow';
const activeLineSourceId = 'active-transport-line-source';
const activeLineStopsSourceId = 'active-transport-stops-source';
const activeLineLayerIds = [
  'active-transport-line-casing',
  'active-transport-line',
  'active-transport-line-arrows',
  'active-transport-stops-circle',
  'active-transport-stops-label',
] as const;
const busLabels = 'mobility-bus-labels';
const casing = '#0f172a';

export type ActiveLineRoute = {
  line: string;
  color: string;
  direction: 'tur' | 'retur';
  directionLabel: string;
  shape: Position[];
  stops: { name: string; lon: number; lat: number }[];
};

export function orderMobilityLayers(map: Map) {
  const lines = lineGroups.flatMap(([, id]) => [`${id}-casing`, `${id}-tag-casing`, id, `${id}-tag`]);
  for (const id of [
    ...lines,
    ...activeLineLayerIds,
    'route-halo',
    'route-line',
    ...transitLayerIds,
    busLabels,
    tramLabels,
    ...placeLayerIds,
    liveVehiclesLayerId,
    liveVehiclesArrowLayerId,
  ]) {
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

function ensureDirectionIcons(map: Map) {
  if (!map.hasImage('stpt-heading-arrow')) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    // Draw a directional chevron/arrow at top (North = 0 deg) outside the vehicle icon
    ctx.fillStyle = '#0F52BA';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(32, 1);
    ctx.lineTo(43, 15);
    ctx.lineTo(35, 13);
    ctx.lineTo(29, 13);
    ctx.lineTo(21, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    map.addImage('stpt-heading-arrow', ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
  }

  if (!map.hasImage('stpt-route-arrow')) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0A192F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 16);
    ctx.lineTo(8, 7);
    ctx.lineTo(13, 16);
    ctx.lineTo(8, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    map.addImage('stpt-route-arrow', ctx.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
  }
}

export function updateActiveTransportLine(map: Map, activeRoute: ActiveLineRoute | null) {
  ensureDirectionIcons(map);

  if (!activeRoute || activeRoute.shape.length < 2) {
    for (const id of activeLineLayerIds) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(activeLineSourceId)) map.removeSource(activeLineSourceId);
    if (map.getSource(activeLineStopsSourceId)) map.removeSource(activeLineStopsSourceId);
    return;
  }

  const lineGeoJson: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          line: activeRoute.line,
          color: activeRoute.color,
          direction: activeRoute.direction,
        },
        geometry: {
          type: 'LineString',
          coordinates: activeRoute.shape,
        },
      },
    ],
  };

  const stopsGeoJson: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: activeRoute.stops.map((st, idx) => ({
      type: 'Feature',
      properties: {
        name: st.name,
        index: idx + 1,
        isTerminal: idx === 0 || idx === activeRoute.stops.length - 1,
      },
      geometry: {
        type: 'Point',
        coordinates: [st.lon, st.lat],
      },
    })),
  };

  const lineSource = map.getSource<GeoJSONSource>(activeLineSourceId);
  if (lineSource) {
    lineSource.setData(lineGeoJson);
  } else {
    map.addSource(activeLineSourceId, { type: 'geojson', data: lineGeoJson });
  }

  const stopsSource = map.getSource<GeoJSONSource>(activeLineStopsSourceId);
  if (stopsSource) {
    stopsSource.setData(stopsGeoJson);
  } else {
    map.addSource(activeLineStopsSourceId, { type: 'geojson', data: stopsGeoJson });
  }

  if (!map.getLayer('active-transport-line-casing')) {
    map.addLayer({
      id: 'active-transport-line-casing',
      source: activeLineSourceId,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0A192F', 'line-width': 9, 'line-opacity': 0.95 },
    });
  }

  if (!map.getLayer('active-transport-line')) {
    map.addLayer({
      id: 'active-transport-line',
      source: activeLineSourceId,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 5.5, 'line-opacity': 1 },
    });
  } else {
    map.setPaintProperty('active-transport-line', 'line-color', activeRoute.color);
  }

  if (!map.getLayer('active-transport-line-arrows')) {
    map.addLayer({
      id: 'active-transport-line-arrows',
      source: activeLineSourceId,
      type: 'symbol',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 85,
        'icon-image': 'stpt-route-arrow',
        'icon-size': 0.9,
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
        'icon-keep-upright': false,
      },
    });
  }

  if (!map.getLayer('active-transport-stops-circle')) {
    map.addLayer({
      id: 'active-transport-stops-circle',
      source: activeLineStopsSourceId,
      type: 'circle',
      paint: {
        'circle-radius': ['case', ['get', 'isTerminal'], 6.5, 4.5],
        'circle-color': '#ffffff',
        'circle-stroke-color': activeRoute.color,
        'circle-stroke-width': 2.5,
      },
    });
  } else {
    map.setPaintProperty('active-transport-stops-circle', 'circle-stroke-color', activeRoute.color);
  }

  if (!map.getLayer('active-transport-stops-label')) {
    map.addLayer({
      id: 'active-transport-stops-label',
      source: activeLineStopsSourceId,
      type: 'symbol',
      minzoom: 13.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-anchor': 'left',
        'text-offset': [0.8, 0],
        'text-optional': true,
      },
      paint: {
        'text-color': '#0F172A',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    });
  }

  orderMobilityLayers(map);
}

export function updateLiveVehicleLayer(map: Map, data: FeatureCollection<Point>) {
  ensureDirectionIcons(map);
  const source = map.getSource<GeoJSONSource>(liveVehiclesLayerId);
  if (source) {
    source.setData(data);
    return;
  }
  const colors: Record<LiveVehicleType, string> = { tram: '#7c3aed', bus: '#0F52BA', trolleybus: '#0e7490' };
  for (const [type, color] of Object.entries(colors)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.strokeStyle = 'white';
    context.lineWidth = 2.5;
    context.beginPath();
    context.roundRect(2, 2, 44, 44, 12);
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
    if (!map.hasImage(`stpt-${type}`)) {
      map.addImage(`stpt-${type}`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
    }
  }
  map.addSource(liveVehiclesLayerId, { type: 'geojson', data });
  map.addLayer({
    id: liveVehiclesLayerId, source: liveVehiclesLayerId, type: 'symbol',
    layout: {
      'icon-image': ['concat', 'stpt-', ['get', 'type']],
      'icon-allow-overlap': true, 'text-optional': true,
      'text-field': ['get', 'line'], 'text-anchor': 'top', 'text-offset': [0, 1],
      'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-padding': 3,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': casing, 'text-halo-width': 2 },
  });
  map.addLayer({
    id: liveVehiclesArrowLayerId,
    source: liveVehiclesLayerId,
    type: 'symbol',
    filter: ['==', ['get', 'hasBearing'], true],
    layout: {
      'icon-image': 'stpt-heading-arrow',
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  orderMobilityLayers(map);
}
