import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { meta } from './domain';
import type { Pin, Point } from './domain';
import { applyBaseStyle, isBasePlaceLayer } from './map-style';
import type { RouteResult } from './routing';
import { layerDefinitions, placeKindLabel } from './infrastructure';
import type { Infrastructure, LayerKey, LayerVisibility, MapPlace } from './infrastructure';
import type { Theme } from './theme';
import { placeIcon } from './PlacesPanel';

type Props = {
  theme: Theme;
  pins: Pin[]; selected?: Pin; onSelect: (id: string) => void;
  picking: boolean; onPick: (point: Point) => void; picked?: Point; userLocation?: Point;
  route?: RouteResult; focus: number; infrastructure: Partial<Infrastructure>; visibility: LayerVisibility;
  labels: boolean; mapFit: number; buildings: boolean; focusedPlace?: MapPlace;
  onInspectPlace: (place: MapPlace) => void; onInspectLine: (info: { title: string; description: string }) => void;
};
const icons = {
  report: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  activity: '<path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/><path d="m8 15 2 2 5-5"/>',
  discussion: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1-7a8 8 0 1 1 17-4Z"/><path d="M8 10h8m-8 4h5"/>',
};
maplibregl.setWorkerUrl(workerUrl);


const basemap = (theme: Theme) => `https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'liberty'}`;
function baseLayers(map: maplibregl.Map, props: Props) { applyBaseStyle(map, { buildings: props.buildings, places: props.visibility.places, dark: props.theme === 'dark' }); }

export default function MapCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef(props); latest.current = props;
  const styleReady = useRef(false);
  const appliedTheme = useRef(props.theme);
  const styleDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFittedRoute = useRef<{ instance: maplibregl.Map; route: RouteResult } | undefined>(undefined);
  const hitLayers = useRef<string[]>([]);
  const [ready, setReady] = useState(0); const [settled, setSettled] = useState(false); const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!container.current) return;
    styleReady.current = false; setSettled(false);
    let instance: maplibregl.Map;
    appliedTheme.current = latest.current.theme;
    try { instance = new maplibregl.Map({ container: container.current, style: basemap(appliedTheme.current), center: [21.227, 45.7525], zoom: innerWidth <= 760 ? 13.6 : 14.5, locale: { 'NavigationControl.ZoomIn': 'Mărește harta', 'NavigationControl.ZoomOut': 'Micșorează harta' }, maxZoom: 20, attributionControl: false }); }
    catch { setError(true); return; }
    map.current = instance;
    instance.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', () => { setReady(value => value + 1); setError(false); });
    instance.on('style.load', () => { styleReady.current = true; baseLayers(instance, latest.current); setReady(value => value + 1); });
    styleDeadline.current = setTimeout(() => setError(true), 20000);
    instance.on('idle', () => { clearTimeout(styleDeadline.current); setError(false); setSettled(true); });
    instance.on('error', event => { if (!instance.isStyleLoaded() && /style|fetch|network|worker/i.test(event.error.message)) setError(true); });
    const interactiveLayers = () => hitLayers.current.filter(id => instance.getLayer(id));
    instance.on('click', event => {
      if (latest.current.picking) { latest.current.onPick({ lon: +event.lngLat.lng.toFixed(6), lat: +event.lngLat.lat.toFixed(6) }); return; }
      const layers = interactiveLayers(); if (!layers.length) return;
      const features = instance.queryRenderedFeatures([[event.point.x - 5, event.point.y - 5], [event.point.x + 5, event.point.y + 5]], { layers });
      const feature = features.find(f => f.geometry.type === 'Point') || features[0]; if (!feature) return;
      const p = feature.properties || {};
      if (feature.geometry.type === 'Point') {
        const [lon, lat] = feature.geometry.coordinates;
        const title = String(p.name || p['name:latin'] || p.name_en || p.class || 'Loc pe hartă');
        latest.current.onInspectPlace({ id: p.osmId ? `osm:${p.osmId}` : `tile:${feature.layer.id}:${feature.id || title}:${lon.toFixed(5)},${lat.toFixed(5)}`, title, location: { lon, lat }, kind: p.kind || (p.class === 'food_and_drink' ? 'food' : p.class === 'shop' ? 'shop' : 'services') });
      } else {
        const key = (feature.layer.id.split('-')[1] || 'cycleways') as LayerKey;
        const description = p.kind === 'road-tag'
          ? key === 'sidewalks' && p.sidewalk === 'separate'
            ? 'Strada este etichetată în OSM cu trotuare cartografiate separat. Linia întreruptă marchează axul străzii. Trotuarul poate apărea în apropiere ca linie continuă.'
            : 'Informație OSM asociată străzii. Linia întreruptă indică axul străzii. Poziția benzii sau a trotuarului se verifică în teren.'
          : `${layerDefinitions[key]?.description || 'Geometrie OpenStreetMap.'} Datele pot fi incomplete; verifică accesibilitatea în teren.`;
        latest.current.onInspectLine({
          title: String(p.name || layerDefinitions[key]?.label || 'Infrastructură OSM'),
          description: p.highway === 'construction' ? `${description} Segmentul este etichetat în construcție.` : description,
        });
      }
    });
    instance.on('mousemove', event => {
      if (event.originalEvent.buttons) return;
      if (latest.current.picking) { instance.getCanvas().style.cursor = 'crosshair'; return; }
      const layers = interactiveLayers(); instance.getCanvas().style.cursor = layers.length && instance.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
    });
    const observer = new ResizeObserver(() => instance.resize()); observer.observe(container.current);
    return () => { clearTimeout(styleDeadline.current); observer.disconnect(); instance.remove(); map.current = null; };
  }, [attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || appliedTheme.current === props.theme) return;
    appliedTheme.current = props.theme;
    styleReady.current = false;
    hitLayers.current = [];
    setError(false);
    setSettled(false);
    clearTimeout(styleDeadline.current);
    styleDeadline.current = setTimeout(() => setError(true), 20000);
    instance.setStyle(basemap(props.theme), { diff: false });
  }, [props.theme]);

  useEffect(() => {
    const instance = map.current; if (!instance) return;
    const markers = props.pins.map(pin => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `map-label-pin ${pin.type} ${props.labels ? 'show-label' : ''} ${props.selected?.id === pin.id ? 'selected' : ''}`;
      button.style.setProperty('--pin-color', meta[pin.type].color); button.setAttribute('aria-label', `${meta[pin.type].label}: ${pin.title}`); button.title = `${meta[pin.type].label}: ${pin.title}`;
      const badge = document.createElement('span'); badge.className = 'map-pin-badge'; badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[pin.type]}</svg>`;
      const label = document.createElement('span'); label.className = 'map-pin-label';
      const category = document.createElement('small'); category.textContent = `${meta[pin.type].label}${pin.demo ? ' · DEMO' : ''}`;
      const title = document.createElement('strong'); title.textContent = pin.title; label.append(category, title); button.append(badge, label);
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (latest.current.picking) latest.current.onPick(pin.location);
        else latest.current.onSelect(pin.id);
      });
      return new maplibregl.Marker({ element: button, anchor: 'center' }).setLngLat([pin.location.lon, pin.location.lat]).addTo(instance);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.pins, props.selected?.id, props.labels, attempt]);

  useEffect(() => {
    const instance = map.current; if (!instance || !styleReady.current) return;
    baseLayers(instance, props);
    hitLayers.current = instance.getStyle().layers.filter(isBasePlaceLayer).map(layer => layer.id);
    const dark = appliedTheme.current === 'dark';
    if (!instance.getLayer('building-addresses') && !instance.getStyle().layers.some(layer => 'source-layer' in layer && layer['source-layer'] === 'housenumber')) {
      const buildingLayer = instance.getStyle().layers.find(layer => layer.type === 'fill' && layer['source-layer'] === 'building');
      if (buildingLayer && 'source' in buildingLayer) instance.addLayer({ id: 'building-addresses', type: 'symbol', source: buildingLayer.source, 'source-layer': 'housenumber', minzoom: 17, layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, visibility: props.buildings ? 'visible' : 'none' }, paint: { 'text-color': dark ? '#c4cde0' : '#827767', 'text-halo-color': dark ? '#151c27' : '#ffffff', 'text-halo-width': 1 } });
    }
    const before = instance.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    for (const key of ['cycleways', 'tramways', 'sidewalks'] as const) {
      const data = props.infrastructure[key];
      if (!data) continue;
      if (!instance.getSource(`osm-${key}`)) instance.addSource(`osm-${key}`, { type: 'geojson', data });
      const color = layerDefinitions[key].color;
      if (!instance.getLayer(`osm-${key}-solid`)) instance.addLayer({ id: `osm-${key}-solid`, source: `osm-${key}`, type: 'line', filter: ['!=', ['get', 'kind'], 'road-tag'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 5], 'line-opacity': .9 } }, before);
      if (!instance.getLayer(`osm-${key}-tag`)) instance.addLayer({ id: `osm-${key}-tag`, source: `osm-${key}`, type: 'line', filter: ['==', ['get', 'kind'], 'road-tag'], paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.6, 17, 4], 'line-dasharray': [2, 2], 'line-opacity': .8 } }, before);
      for (const suffix of ['solid','tag']) instance.setLayoutProperty(`osm-${key}-${suffix}`, 'visibility', props.visibility[key] ? 'visible' : 'none');
    }
    hitLayers.current.push('osm-cycleways-solid', 'osm-cycleways-tag', 'osm-tramways-solid', 'osm-tramways-tag', 'osm-sidewalks-solid', 'osm-sidewalks-tag');
    if (!props.infrastructure.places) return;
    if (!instance.getSource('osm-places')) instance.addSource('osm-places', { type: 'geojson', data: props.infrastructure.places });
    if (!instance.getLayer('osm-places-points')) instance.addLayer({ id: 'osm-places-points', type: 'circle', source: 'osm-places', minzoom: 16.5, paint: { 'circle-radius': 3, 'circle-color': ['match', ['get','kind'], 'food','#ad763a','shop','#547eac','health','#b9656e','education','#7b6fac','park','#54834e','tram_stop','#a5659e','#727d8a'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
    if (!instance.getLayer('osm-places-names')) instance.addLayer({ id: 'osm-places-names', type: 'symbol', source: 'osm-places', minzoom: 14.5, layout: { 'text-field': ['get','name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12], 'text-anchor': 'top', 'text-offset': [0,.7], 'text-max-width': 12, 'text-padding': 3 }, paint: { 'text-color': dark ? '#d1deed' : '#3f4e60', 'text-halo-color': dark ? '#151c27' : '#ffffff', 'text-halo-width': 1.5 } });
    for (const suffix of ['points','names']) instance.setLayoutProperty(`osm-places-${suffix}`, 'visibility', props.visibility.places ? 'visible' : 'none');
    hitLayers.current.push('osm-places-points', 'osm-places-names');
  }, [props.infrastructure, props.visibility, props.buildings, ready]);

  useEffect(() => {
    const instance = map.current; if (!instance || !props.mapFit) return;
    const bounds = new maplibregl.LngLatBounds(); props.pins.forEach(pin => bounds.extend([pin.location.lon, pin.location.lat]));
    if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: { top: 40, left: 40, right: 50, bottom: 40 }, maxZoom: 15.6, duration: 500 });
  }, [props.mapFit]);
  useEffect(() => {
    if (!props.selected || !map.current) return;
    map.current.easeTo({ center: [props.selected.location.lon, props.selected.location.lat], zoom: Math.max(map.current.getZoom(), 15), duration: 550, padding: 0 });
  }, [props.selected?.id, props.selected?.location.lon, props.selected?.location.lat, attempt]);
  useEffect(() => {
    if (!props.focusedPlace || !map.current) return;
    const point = props.focusedPlace.location; const element = document.createElement('div'); element.className = 'focused-place-marker'; element.setAttribute('aria-label', `Loc selectat: ${props.focusedPlace.title}`);
    const Icon = placeIcon(props.focusedPlace.kind);
    const iconRoot = createRoot(element);
    iconRoot.render(<Icon size={19} aria-hidden="true" />);
    const marker = new maplibregl.Marker({ element }).setLngLat([point.lon, point.lat]).addTo(map.current);
    map.current.easeTo({ center: [point.lon, point.lat], zoom: 17, duration: 650, padding: 0 });
    return () => { iconRoot.unmount(); marker.remove(); };
  }, [props.focusedPlace, attempt]);
  useEffect(() => {
    if (!props.picked || !map.current) return;
    const element = document.createElement('div'); element.className = 'picked-marker';
    const marker = new maplibregl.Marker({ element }).setLngLat([props.picked.lon, props.picked.lat]).addTo(map.current);
    return () => { marker.remove(); };
  }, [props.picked, attempt]);
  useEffect(() => {
    if (!props.userLocation || !map.current) return;
    const element = document.createElement('div'); element.className = 'location-marker';
    const marker = new maplibregl.Marker({ element }).setLngLat([props.userLocation.lon, props.userLocation.lat]).addTo(map.current);
    map.current.easeTo({ center: [props.userLocation.lon, props.userLocation.lat], zoom: 16 });
    return () => { marker.remove(); };
  }, [props.userLocation, props.focus, attempt]);
  useEffect(() => {
    const instance = map.current; if (!instance || !styleReady.current) return;
    for (const id of ['route-line','route-halo']) if (instance.getLayer(id)) instance.removeLayer(id);
    if (instance.getSource('route')) instance.removeSource('route');
    const markers: maplibregl.Marker[] = [];
    if (props.route) {
      instance.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: props.route.geometry } });
      instance.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 10 } });
      instance.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#087f8c', 'line-width': 5 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      props.route.order.forEach((index, visit) => { const point = props.route!.waypoints[index]; const element = document.createElement('div'); element.className = `route-number ${visit === 0 ? 'route-origin' : ''}`; element.style.background = '#087f8c'; element.textContent = visit === 0 ? 'S' : String(visit); element.title = visit === 0 ? 'Start și sosire' : `Oprirea ${visit}`; markers.push(new maplibregl.Marker({ element }).setLngLat([point.lon,point.lat]).addTo(instance)); });
      if (lastFittedRoute.current?.route !== props.route || lastFittedRoute.current.instance !== instance) {
        const bounds = new maplibregl.LngLatBounds(); props.route.geometry.coordinates.forEach(point => bounds.extend([point[0],point[1]]));
        instance.fitBounds(bounds, { padding: { top: 45, left: 45, right: 50, bottom: 40 }, maxZoom: 16 });
        lastFittedRoute.current = { instance, route: props.route };
      }
    } else lastFittedRoute.current = undefined;
    return () => markers.forEach(marker => marker.remove());
  }, [props.route, ready]);
  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = props.picking ? 'crosshair' : ''; }, [props.picking]);
  return <div className="map-surface"><div className="map-canvas" ref={container} aria-label="Hartă interactivă Timișoara" />{!settled && !error && <div className="map-loading" role="status"><span className="spinner" />Se încarcă harta…</div>}{error && <div className="map-error"><AlertTriangle size={22} /><strong>Harta nu s-a putut încărca</strong><span>Verifică accesul la internet. Datele tale rămân disponibile.</span><button onClick={() => { setError(false); setAttempt(value => value + 1); }}><RefreshCw size={16} />Reîncearcă</button></div>}</div>;
}
