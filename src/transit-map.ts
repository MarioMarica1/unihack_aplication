import { Marker } from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import type { TransitOption, TransitStop } from './transitRouter';

export const transitLayerIds = ['route-transit-walk', 'route-transit-casing', 'route-transit-ride'];
const source = 'route-transit';

export function clearTransitRoute(map: MapLibreMap) {
  for (const id of transitLayerIds) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(source)) map.removeSource(source);
}

export function drawTransitRoute(map: MapLibreMap, option: TransitOption, dark: boolean) {
  const data: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: option.steps.filter(step => step.distance >= 1).map(step => ({
      type: 'Feature', properties: { kind: step.kind, color: step.kind === 'ride' ? step.color : null },
      geometry: step.geometry,
    })),
  };
  map.addSource(source, { type: 'geojson', data });
  map.addLayer({ id: transitLayerIds[0], type: 'line', source, filter: ['==', ['get', 'kind'], 'walk'],
    paint: { 'line-color': dark ? '#93c5fd' : '#2563eb', 'line-width': 4, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: transitLayerIds[1], type: 'line', source, filter: ['==', ['get', 'kind'], 'ride'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0f172a', 'line-width': 8 } });
  map.addLayer({ id: transitLayerIds[2], type: 'line', source, filter: ['==', ['get', 'kind'], 'ride'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });

  const stops = new Map<string, { stop: TransitStop; labels: string[]; badge: string; color: string }>();
  function mark(stop: TransitStop, label: string, badge: string, color: string) {
    const key = `${stop.lon},${stop.lat}`;
    const existing = stops.get(key);
    if (existing) {
      existing.labels.push(label);
      existing.badge = '↔';
    } else stops.set(key, { stop, labels: [label], badge, color });
  }
  option.steps.forEach((step, index) => {
    if (step.kind !== 'ride') return;
    const previous = option.steps[index - 1];
    const next = option.steps[index + 1];
    const first = step.stops[0], last = step.stops.at(-1)!;
    const transferIn = previous?.kind === 'walk' && previous.transfer;
    const transferOut = next?.kind === 'walk' && next.transfer;
    mark(first, `${transferIn ? 'Schimbă la' : 'Urcă la'} ${first.name} · Linia ${step.line}`, step.line, step.color);
    mark(last, `${transferOut ? 'Coboară pentru schimb la' : 'Coboară la'} ${last.name}`, transferOut ? '↔' : '↓', step.color);
  });
  return [...stops.values()].map(({ stop, labels, badge, color }) => {
    const element = document.createElement('div');
    element.className = 'transit-stop-marker';
    element.style.setProperty('--line-color', color);
    element.title = labels.join(' / ');
    element.setAttribute('aria-label', element.title);
    const icon = document.createElement('b');
    icon.textContent = badge;
    const text = document.createElement('span');
    text.textContent = element.title;
    element.append(icon, text);
    return new Marker({ element }).setLngLat([stop.lon, stop.lat]).addTo(map);
  });
}
