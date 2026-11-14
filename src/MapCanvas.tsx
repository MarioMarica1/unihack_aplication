import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { meta } from './domain';
import type { Pin, Point } from './domain';
import { applyBaseStyle } from './map-style';
import type { BaseMapStyle } from './map-style';
import type { RouteResult } from './routing';
import { layerDefinitions } from './infrastructure';
import type { Infrastructure, LayerKey, LayerVisibility, MapPlace } from './infrastructure';
import type { Theme } from './theme';
import { PlaceIcon, placeAppearance } from './place-icons';
import { placeLayerIds, registerPlacePins, syncPlaceLayers } from './place-map';
import {
  addMobilityLines,
  liveVehiclesLayerId,
  orderMobilityLayers,
  updateActiveTransportLine,
  updateLiveVehicleLayer,
} from './mobility-map';
import type { ActiveLineRoute, NetworkSubFilters } from './mobility-map';
import type { LiveVehicle } from './stpt-live';
import type { MapViewportState } from './AiUrbanAssistant';
import { clearTransitRoute, drawTransitRoute } from './transit-map';
import type { TransitOption } from './transitRouter';
import { municipalFeatureAt, openMunicipalFeature, showMunicipalReports } from './municipal-reports-map';
import type { MunicipalReport } from './municipal-reports';
import type { VeloStation } from './velo-live';
import type { OfficialCityEvent } from './city-events';

type Props = {
  theme: Theme;
  tab: string;
  browsePlaces: Infrastructure['places']['features'];
  placeCatalog: Infrastructure['places']['features'];
  routePoints: { location: Point; title: string; destination?: boolean }[];
  pins: Pin[];
  selected?: Pin;
  onSelect: (id: string) => void;
  picking: boolean;
  onPick: (point: Point) => void;
  picked?: Point;
  userLocation?: Point;
  route?: RouteResult;
  focus: number;
  infrastructure: Partial<Infrastructure>;
  visibility: LayerVisibility;
  networkSubFilters?: NetworkSubFilters;
  transit?: TransitOption;
  mobilePanelOpen: boolean;
  liveVehicles: LiveVehicle[];
  selectedVehicle?: LiveVehicle;
  onSelectVehicle?: (id: string) => void;
  activeLineRoute?: ActiveLineRoute | null;
  veloStations?: VeloStation[];
  selectedVeloStation?: VeloStation | null;
  onSelectVeloStation?: (station: VeloStation) => void;
  cityEvents?: OfficialCityEvent[];
  selectedCityEvent?: OfficialCityEvent | null;
  onSelectCityEvent?: (event: OfficialCityEvent) => void;
  municipalReports?: MunicipalReport[];
  selectedMunicipal?: MunicipalReport;
  onSelectMunicipal: (number: string) => void;
  labels: boolean;
  mapFit: number;
  buildings: boolean;
  baseMapStyle?: BaseMapStyle;
  focusedPlace?: MapPlace;
  onInspectPlace: (place: MapPlace) => void;
  onInspectLine: (info: { title: string; description: string }) => void;
  onViewportChange?: (viewport: MapViewportState) => void;
};

const icons = {
  report: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  activity: '<path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/><path d="m8 15 2 2 5-5"/>',
  discussion: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1-7a8 8 0 1 1 17-4Z"/><path d="M8 10h8m-8 4h5"/>',
};
maplibregl.setWorkerUrl(workerUrl);

const satelliteSourceId = 'satellite-imagery-source';
const satelliteLayerId = 'satellite-imagery-layer';

const basemap = (theme: Theme) => `https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'liberty'}`;

function syncSatelliteLayer(map: maplibregl.Map, enabled: boolean) {
  if (!map.getSource(satelliteSourceId)) {
    map.addSource(satelliteSourceId, {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&hl=ro&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=s&hl=ro&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=s&hl=ro&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=s&hl=ro&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'Imagistică Satelit © Google Earth / CNES / Airbus',
    });
  }
  if (!map.getLayer(satelliteLayerId)) {
    const firstRoadOrLabel = map.getStyle().layers.find(
      l => l.type === 'symbol' || l.id.startsWith('highway_') || l.id.startsWith('road_'),
    )?.id;
    map.addLayer(
      {
        id: satelliteLayerId,
        type: 'raster',
        source: satelliteSourceId,
        layout: { visibility: enabled ? 'visible' : 'none' },
        paint: {
          'raster-opacity': enabled ? 0.98 : 0,
          'raster-fade-duration': 320,
          'raster-opacity-transition': { duration: 320, delay: 0 },
        },
      },
      firstRoadOrLabel,
    );
  } else {
    map.setLayoutProperty(satelliteLayerId, 'visibility', enabled ? 'visible' : 'none');
    map.setPaintProperty(satelliteLayerId, 'raster-opacity', enabled ? 0.98 : 0);
  }
}

function baseLayers(map: maplibregl.Map, props: Props) {
  const mode = props.baseMapStyle ?? (props.buildings ? 'buildings3d' : 'minimal');
  const showBuildings = mode === 'buildings3d' || (props.buildings && mode !== 'minimal' && mode !== 'satellite');
  const show3dExtrusions = mode === 'buildings3d';

  if (!map.getLayer('building-3d')) {
    const styleLayers = map.getStyle().layers;
    const buildingFill = styleLayers.find(
      l => l.id === 'building' || (l.type === 'fill' && 'source-layer' in l && l['source-layer'] === 'building'),
    );
    const firstSymbolId = styleLayers.find(l => l.type === 'symbol')?.id;
    if (buildingFill && 'source' in buildingFill) {
      map.addLayer(
        {
          id: 'building-3d',
          type: 'fill-extrusion',
          source: buildingFill.source,
          'source-layer': 'building',
          minzoom: 13,
          filter: ['!', ['has', 'hide_3d']],
          layout: {
            visibility: showBuildings && show3dExtrusions ? 'visible' : 'none',
          },
          paint: {
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
            'fill-extrusion-color': props.theme === 'dark' ? '#3b4c63' : 'hsl(35,8%,85%)',
            'fill-extrusion-opacity': props.theme === 'dark' ? 0.88 : 0.82,
          },
        },
        firstSymbolId,
      );
    }
  }

  applyBaseStyle(map, {
    buildings: showBuildings,
    buildings3d: show3dExtrusions,
    places: false,
    dark: props.theme === 'dark',
  });
  syncSatelliteLayer(map, mode === 'satellite');
}

export default function MapCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const styleReady = useRef(false);
  const appliedTheme = useRef(props.theme);
  const lastBaseStyle = useRef<BaseMapStyle | undefined>(props.baseMapStyle);
  const styleDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFittedRoute = useRef<{ instance: maplibregl.Map; route: RouteResult | TransitOption; panelOpen: boolean } | undefined>(undefined);
  const lastFittedLineKey = useRef<string>('');
  const hitLayers = useRef<string[]>([]);
  const [ready, setReady] = useState(0);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    styleReady.current = false;
    setSettled(false);
    let instance: maplibregl.Map;
    appliedTheme.current = latest.current.theme;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: basemap(appliedTheme.current),
        center: [21.227, 45.7525],
        zoom: innerWidth <= 760 ? 13.6 : 14.5,
        locale: { 'NavigationControl.ZoomIn': 'Mărește harta', 'NavigationControl.ZoomOut': 'Micșorează harta' },
        maxZoom: 20,
        attributionControl: false,
      });
    } catch {
      setError(true);
      return;
    }
    map.current = instance;
    instance.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
    instance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    const emitViewport = () => {
      if (!latest.current.onViewportChange) return;
      const c = instance.getCenter();
      const b = instance.getBounds();
      latest.current.onViewportChange({
        center: { lon: c.lng, lat: c.lat },
        bounds: {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        },
        zoom: instance.getZoom(),
      });
    };
    instance.on('load', () => {
      setReady(value => value + 1);
      setError(false);
      emitViewport();
    });
    instance.on('moveend', emitViewport);
    instance.on('style.load', () => {
      styleReady.current = true;
      baseLayers(instance, latest.current);
      setReady(value => value + 1);
    });
    styleDeadline.current = setTimeout(() => setError(true), 20000);
    instance.on('idle', () => {
      clearTimeout(styleDeadline.current);
      setError(false);
      setSettled(true);
    });
    instance.on('error', event => {
      if (!instance.isStyleLoaded() && /style|fetch|network|worker/i.test(event.error.message)) setError(true);
    });
    const interactiveLayers = () => {
      const candidates = [...hitLayers.current, liveVehiclesLayerId];
      return candidates.filter(id => instance.getLayer(id) && instance.getLayoutProperty(id, 'visibility') !== 'none');
    };
    instance.on('click', event => {
      if (latest.current.picking) {
        latest.current.onPick({ lon: +event.lngLat.lng.toFixed(6), lat: +event.lngLat.lat.toFixed(6) });
        return;
      }
      if (instance.getLayer(liveVehiclesLayerId) && latest.current.liveVehicles.length && latest.current.onSelectVehicle) {
        const vFeatures = instance.queryRenderedFeatures(
          [[event.point.x - 6, event.point.y - 6], [event.point.x + 6, event.point.y + 6]],
          { layers: [liveVehiclesLayerId] },
        );
        const vHit = vFeatures[0];
        if (vHit?.properties?.vehicleId) {
          latest.current.onSelectVehicle(String(vHit.properties.vehicleId));
          return;
        }
      }
      if (latest.current.municipalReports?.length) {
        const feature = municipalFeatureAt(instance, event.point);
        if (feature) {
          openMunicipalFeature(instance, feature, latest.current.onSelectMunicipal);
          return;
        }
      }
      const layers = interactiveLayers();
      if (!layers.length) return;
      const features = instance.queryRenderedFeatures(
        [[event.point.x - 5, event.point.y - 5], [event.point.x + 5, event.point.y + 5]],
        { layers },
      );
      const feature = features.find(f => f.geometry.type === 'Point') || features[0];
      if (!feature) return;
      const p = feature.properties || {};
      if (feature.geometry.type === 'Point') {
        const [lon, lat] = feature.geometry.coordinates;
        const title = String(p.name || p['name:latin'] || p.name_en || p.class || 'Loc pe hartă');
        const routeRefs = String(p.routeRefs || p.ref || '').trim();
        latest.current.onInspectPlace({
          id: p.osmId ? `osm:${p.osmId}` : `tile:${feature.layer.id}:${feature.id || title}:${lon.toFixed(5)},${lat.toFixed(5)}`,
          title,
          location: { lon, lat },
          kind: p.kind || (p.class === 'food_and_drink' ? 'food' : p.class === 'shop' ? 'shop' : 'services'),
          description: routeRefs ? `Linii STPT: ${routeRefs}` : undefined,
        });
      } else {
        const key: LayerKey = feature.layer.id.startsWith('mobility-bus') ? 'busways'
          : feature.layer.id.startsWith('mobility-tram') ? 'tramways'
          : feature.layer.id.startsWith('mobility-bike') ? 'cycleways' : 'sidewalks';
        const lineRefs = String(p.routeRefs || p.ref || '').trim();
        const segment = p.from && p.to ? `Segment: ${p.from} → ${p.to}. ` : '';
        const description = lineRefs && (key === 'tramways' || key === 'busways')
          ? `Linii STPT: ${lineRefs}. ${segment}${p.routeName ? String(p.routeName) : ''}`
          : p.kind === 'road-tag'
          ? key === 'sidewalks' && p.sidewalk === 'separate'
            ? 'Strada este etichetată în OSM cu trotuare cartografiate separat. Linia întreruptă marchează axul străzii.'
            : 'Informație OSM asociată străzii. Linia întreruptă indică axul străzii.'
          : `${layerDefinitions[key]?.description || 'Geometrie OpenStreetMap.'} Verifică accesibilitatea în teren.`;
        latest.current.onInspectLine({
          title: String(p.name || layerDefinitions[key]?.label || 'Infrastructură OSM'),
          description: p.highway === 'construction' ? `${description} Segmentul este etichetat în construcție.` : description,
        });
      }
    });
    instance.on('mousemove', event => {
      if (event.originalEvent.buttons) return;
      if (latest.current.picking) {
        instance.getCanvas().style.cursor = 'crosshair';
        return;
      }
      if (latest.current.municipalReports?.length && municipalFeatureAt(instance, event.point)) {
        instance.getCanvas().style.cursor = 'pointer';
        return;
      }
      const layers = interactiveLayers();
      instance.getCanvas().style.cursor = layers.length && instance.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      clearTimeout(styleDeadline.current);
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
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
    const instance = map.current;
    if (!instance) return;
    const markers = props.pins.map(pin => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-label-pin ${pin.type} ${props.labels ? 'show-label' : ''} ${props.selected?.id === pin.id ? 'selected' : ''}`;
      button.style.setProperty('--pin-color', meta[pin.type].color);
      button.setAttribute('aria-label', `${meta[pin.type].label}: ${pin.title}`);
      button.title = `${meta[pin.type].label}: ${pin.title}`;
      const badge = document.createElement('span');
      badge.className = 'map-pin-badge';
      badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[pin.type]}</svg>`;
      const label = document.createElement('span');
      label.className = 'map-pin-label';
      const category = document.createElement('small');
      category.textContent = pin.subcategory ? `${meta[pin.type].label} · ${pin.subcategory}` : meta[pin.type].label;
      const title = document.createElement('strong');
      title.textContent = pin.title;
      label.append(category, title);
      button.append(badge, label);
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (latest.current.picking) latest.current.onPick(pin.location);
        else latest.current.onSelect(pin.id);
      });
      return new maplibregl.Marker({ element: button, anchor: 'center' })
        .setLngLat([pin.location.lon, pin.location.lat])
        .addTo(instance);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.pins, props.selected?.id, props.labels, attempt]);

  // Dynamic VeloTM Station Markers showing availableBikes & freeDocks
  useEffect(() => {
    const instance = map.current;
    if (!instance || !props.veloStations?.length) return;
    const markers = props.veloStations.map(station => {
      const button = document.createElement('button');
      button.type = 'button';
      const isSelected = props.selectedVeloStation?.id === station.id;
      button.className = `velo-map-marker ${isSelected ? 'selected' : ''}`;
      button.title = `${station.name}: ${station.availableBikes} biciclete disponibile, ${station.freeDocks} dock-uri libere`;
      button.setAttribute('aria-label', button.title);

      const bikesSpan = document.createElement('span');
      bikesSpan.className = 'velo-marker-bikes';
      bikesSpan.textContent = `🚲 ${station.availableBikes}`;

      const docksSpan = document.createElement('span');
      docksSpan.className = 'velo-marker-docks';
      docksSpan.textContent = `🅿️ ${station.freeDocks}`;

      button.append(bikesSpan, docksSpan);
      button.addEventListener('click', event => {
        event.stopPropagation();
        latest.current.onSelectVeloStation?.(station);
      });

      return new maplibregl.Marker({ element: button, anchor: 'center' })
        .setLngLat([station.lon, station.lat])
        .addTo(instance);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.veloStations, props.selectedVeloStation?.id, attempt]);

  useEffect(() => {
    if (!props.selectedVeloStation || !map.current) return;
    map.current.easeTo({
      center: [props.selectedVeloStation.lon, props.selectedVeloStation.lat],
      zoom: Math.max(map.current.getZoom(), 15.8),
      duration: 480,
    });
  }, [props.selectedVeloStation?.id, attempt]);

  // Official Municipal & Cultural Event Markers grouped & anchored cleanly on exact venue buildings
  useEffect(() => {
    const instance = map.current;
    if (!instance || !props.cityEvents?.length) return;

    const venueGroups = new Map<string, OfficialCityEvent[]>();
    for (const ev of props.cityEvents) {
      const key = `${ev.lon.toFixed(5)},${ev.lat.toFixed(5)}`;
      const list = venueGroups.get(key) ?? [];
      list.push(ev);
      venueGroups.set(key, list);
    }

    const formatEventDate = (iso: string) => iso.slice(5, 10).split('-').reverse().join('.');

    const markers = [...venueGroups.values()].map(siblings => {
      const selectedInVenue = siblings.find(ev => ev.id === props.selectedCityEvent?.id);
      const primaryEv = selectedInVenue ?? siblings[0];

      const button = document.createElement('button');
      button.type = 'button';
      const isSelected = Boolean(selectedInVenue);
      button.className = `city-event-map-marker ${isSelected ? 'selected' : ''} ${siblings.length > 1 ? 'multi-event' : ''}`;
      const dateStr = formatEventDate(primaryEv.startsAt);
      button.title =
        siblings.length > 1
          ? `${primaryEv.venue}: ${siblings.length} evenimente (${primaryEv.title})`
          : `${primaryEv.title} (${dateStr}${primaryEv.timeLabel ? ` · ${primaryEv.timeLabel}` : ''}) — ${primaryEv.venue}`;
      button.setAttribute('aria-label', button.title);

      const badge = document.createElement('span');
      badge.className = 'city-event-marker-badge';
      badge.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/><path d="m8 15 2 2 5-5"/></svg>';

      const dateChip = document.createElement('span');
      dateChip.className = 'city-event-marker-date';
      dateChip.textContent =
        siblings.length > 1 ? `${dateStr} · +${siblings.length - 1}` : dateStr;

      const copy = document.createElement('span');
      copy.className = 'city-event-marker-copy';
      const dateTag = document.createElement('small');
      dateTag.textContent =
        siblings.length > 1
          ? `${siblings.length} evenimente · ${primaryEv.venue}`
          : `${dateStr}${primaryEv.timeLabel ? ` · ${primaryEv.timeLabel}` : ''} · ${primaryEv.venue}`;
      const titleTag = document.createElement('strong');
      titleTag.textContent = primaryEv.title.length > 48 ? `${primaryEv.title.slice(0, 46)}…` : primaryEv.title;
      copy.append(dateTag, titleTag);

      if (siblings.length > 1) {
        const extraList = document.createElement('span');
        extraList.className = 'city-event-marker-extra';
        const others = siblings.filter(ev => ev.id !== primaryEv.id).slice(0, 2);
        extraList.textContent =
          others.map(ev => `• ${formatEventDate(ev.startsAt)}: ${ev.title.slice(0, 32)}${ev.title.length > 32 ? '…' : ''}`).join('\n') +
          (siblings.length > 3 ? `\n+ încă ${siblings.length - 3} la această locație` : '');
        copy.append(extraList);
      }

      button.append(badge, dateChip, copy);
      button.addEventListener('click', clickEv => {
        clickEv.stopPropagation();
        if (siblings.length === 1) {
          latest.current.onSelectCityEvent?.(siblings[0]);
          return;
        }
        const currentIdx = selectedInVenue ? siblings.findIndex(ev => ev.id === selectedInVenue.id) : -1;
        const nextEv = siblings[(currentIdx + 1) % siblings.length];
        latest.current.onSelectCityEvent?.(nextEv);
      });

      return new maplibregl.Marker({ element: button, anchor: 'bottom', offset: [0, -7] })
        .setLngLat([primaryEv.lon, primaryEv.lat])
        .addTo(instance);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.cityEvents, props.selectedCityEvent?.id, attempt]);

  useEffect(() => {
    if (!props.selectedCityEvent || !map.current) return;
    map.current.easeTo({
      center: [props.selectedCityEvent.lon, props.selectedCityEvent.lat],
      zoom: Math.max(map.current.getZoom(), 16.2),
      duration: 480,
    });
  }, [props.selectedCityEvent?.id, attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current) return;
    baseLayers(instance, props);
    if (lastBaseStyle.current !== props.baseMapStyle || (props.tab === 'places' && props.baseMapStyle === 'buildings3d' && instance.getPitch() < 25)) {
      lastBaseStyle.current = props.baseMapStyle;
      if (props.baseMapStyle === 'buildings3d') {
        instance.easeTo({
          pitch: 45,
          zoom: Math.max(instance.getZoom(), 15.2),
          duration: 520,
        });
      } else if (props.baseMapStyle === 'minimal' || props.baseMapStyle === 'satellite') {
        if (instance.getPitch() > 0) {
          instance.easeTo({ pitch: 0, duration: 420 });
        }
      }
    }
    hitLayers.current = [...placeLayerIds];
    const dark = appliedTheme.current === 'dark';
    const showBuildings = props.baseMapStyle ? props.baseMapStyle === 'buildings3d' : props.buildings;
    if (!instance.getLayer('building-addresses') && !instance.getStyle().layers.some(layer => 'source-layer' in layer && layer['source-layer'] === 'housenumber')) {
      const buildingLayer = instance.getStyle().layers.find(layer => layer.type === 'fill' && layer['source-layer'] === 'building');
      if (buildingLayer && 'source' in buildingLayer) {
        instance.addLayer({
          id: 'building-addresses',
          type: 'symbol',
          source: buildingLayer.source,
          'source-layer': 'housenumber',
          minzoom: 17,
          layout: {
            'text-field': ['get', 'housenumber'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 10,
            visibility: showBuildings ? 'visible' : 'none',
          },
          paint: {
            'text-color': dark ? '#c4cde0' : '#827767',
            'text-halo-color': dark ? '#151c27' : '#ffffff',
            'text-halo-width': 1,
          },
        });
      }
    }
    hitLayers.current.push(
      ...addMobilityLines(instance, props.infrastructure, props.visibility, props.networkSubFilters),
    );
    orderMobilityLayers(instance);
  }, [props.infrastructure, props.visibility, props.networkSubFilters, props.buildings, props.baseMapStyle, ready]);

  // Exclusive Active Transport Line rendering + camera fit
  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current) return;
    updateActiveTransportLine(instance, props.activeLineRoute ?? null);
    if (props.activeLineRoute && props.activeLineRoute.shape.length >= 2) {
      const key = `${props.activeLineRoute.line}:${props.activeLineRoute.direction}`;
      if (lastFittedLineKey.current !== key && !props.selectedVehicle) {
        lastFittedLineKey.current = key;
        const bounds = new maplibregl.LngLatBounds();
        for (const [lon, lat] of props.activeLineRoute.shape) bounds.extend([lon, lat]);
        if (!bounds.isEmpty()) {
          instance.fitBounds(bounds, {
            padding: { top: 56, left: 48, right: 56, bottom: 56 },
            maxZoom: 15.2,
            duration: 520,
          });
        }
      }
    } else {
      lastFittedLineKey.current = '';
    }
  }, [props.activeLineRoute, props.selectedVehicle?.id, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current) return;
    let active = true;
    let updateViewport: (() => void) | undefined;
    const visible = !props.picking && (props.tab === 'places' || props.visibility.places);
    const onMove = () => {
      if (styleReady.current) updateViewport?.();
    };
    void registerPlacePins(instance, () => active && styleReady.current)
      .then(ok => {
        if (!ok || !active || !styleReady.current) return;
        updateViewport = syncPlaceLayers(instance, {
          visible,
          places: props.browsePlaces,
          localPlaces: props.placeCatalog,
          layers: props.visibility,
          focusedId: props.focusedPlace?.id,
          dark: appliedTheme.current === 'dark',
        });
        orderMobilityLayers(instance);
      })
      .catch(error => console.error('Pictogramele locurilor nu s-au putut încărca.', error));
    if (visible) {
      instance.on('moveend', onMove);
      instance.on('resize', onMove);
    }
    return () => {
      active = false;
      instance.off('moveend', onMove);
      instance.off('resize', onMove);
      for (const id of placeLayerIds) {
        if (styleReady.current && instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', 'none');
      }
    };
  }, [props.tab, props.picking, props.browsePlaces, props.placeCatalog, props.visibility, props.focusedPlace?.id, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current || (!props.liveVehicles.length && !instance.getSource(liveVehiclesLayerId))) return;
    updateLiveVehicleLayer(instance, {
      type: 'FeatureCollection',
      features: props.liveVehicles.map(vehicle => ({
        type: 'Feature',
        id: vehicle.id,
        geometry: { type: 'Point', coordinates: [vehicle.lon, vehicle.lat] },
        properties: {
          vehicleId: vehicle.id,
          line: vehicle.line,
          type: vehicle.type,
          bearing: vehicle.bearing ?? 0,
          hasBearing: typeof vehicle.bearing === 'number' && (vehicle.speed === undefined || vehicle.speed >= 0),
        },
      })),
    });
  }, [props.liveVehicles, ready]);

  useEffect(() => {
    if (!props.selectedVehicle || !map.current) return;
    const element = document.createElement('div');
    element.className = 'selected-vehicle-ring';
    const marker = new maplibregl.Marker({ element })
      .setLngLat([props.selectedVehicle.lon, props.selectedVehicle.lat])
      .addTo(map.current);
    return () => {
      marker.remove();
    };
  }, [props.selectedVehicle?.id, props.selectedVehicle?.lon, props.selectedVehicle?.lat, attempt]);

  useEffect(() => {
    if (!props.selectedVehicle || !map.current) return;
    map.current.easeTo({
      center: [props.selectedVehicle.lon, props.selectedVehicle.lat],
      zoom: Math.max(map.current.getZoom(), 15.2),
      duration: 480,
    });
  }, [props.selectedVehicle?.id, attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current) return;
    showMunicipalReports(instance, props.municipalReports ?? []);
  }, [props.municipalReports, ready]);

  const municipalCoordinates = props.selectedMunicipal?.coordinates;
  useEffect(() => {
    if (!municipalCoordinates || !map.current) return;
    map.current.easeTo({ center: municipalCoordinates, zoom: Math.max(map.current.getZoom(), 16) });
  }, [municipalCoordinates?.[0], municipalCoordinates?.[1], attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !props.mapFit) return;
    const bounds = new maplibregl.LngLatBounds();
    props.pins.forEach(pin => bounds.extend([pin.location.lon, pin.location.lat]));
    props.cityEvents?.forEach(ev => bounds.extend([ev.lon, ev.lat]));
    props.municipalReports?.forEach(report => {
      if (report.coordinates) bounds.extend(report.coordinates);
    });
    props.liveVehicles?.forEach(v => bounds.extend([v.lon, v.lat]));
    props.veloStations?.forEach(s => bounds.extend([s.lon, s.lat]));
    if (props.tab === 'places' && props.browsePlaces.length) {
      props.browsePlaces.slice(0, 60).forEach(f => {
        if (f.geometry?.type === 'Point') {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
      });
    }
    if (!bounds.isEmpty()) {
      instance.fitBounds(bounds, {
        padding: { top: 48, left: 48, right: 56, bottom: 48 },
        maxZoom: 15.6,
        duration: 500,
      });
    }
  }, [props.mapFit]);

  useEffect(() => {
    if (!props.selected || !map.current) return;
    map.current.easeTo({
      center: [props.selected.location.lon, props.selected.location.lat],
      zoom: Math.max(map.current.getZoom(), 15.5),
      duration: 550,
      padding: 0,
    });
  }, [props.selected?.id, props.selected?.location.lon, props.selected?.location.lat, attempt]);

  useEffect(() => {
    if (!props.focusedPlace || !map.current) return;
    const point = props.focusedPlace.location;
    const element = document.createElement('div');
    element.className = 'focused-place-marker';
    element.setAttribute('aria-label', `Loc selectat: ${props.focusedPlace.title}`);
    element.style.setProperty('--place-pin-color', placeAppearance(props.focusedPlace.kind)[1]);
    const iconRoot = createRoot(element);
    iconRoot.render(<PlaceIcon kind={props.focusedPlace.kind} size={21} />);
    const marker = new maplibregl.Marker({ element }).setLngLat([point.lon, point.lat]).addTo(map.current);
    map.current.flyTo({ center: [point.lon, point.lat], zoom: 17, duration: 650, padding: 0 });
    return () => {
      iconRoot.unmount();
      marker.remove();
    };
  }, [props.focusedPlace, attempt]);

  useEffect(() => {
    if (!props.picked || !map.current) return;
    const element = document.createElement('div');
    element.className = 'picked-marker';
    const marker = new maplibregl.Marker({ element }).setLngLat([props.picked.lon, props.picked.lat]).addTo(map.current);
    return () => {
      marker.remove();
    };
  }, [props.picked, attempt]);

  useEffect(() => {
    if (!props.userLocation || !map.current) return;
    const element = document.createElement('div');
    element.className = 'location-marker';
    const marker = new maplibregl.Marker({ element })
      .setLngLat([props.userLocation.lon, props.userLocation.lat])
      .addTo(map.current);
    map.current.easeTo({ center: [props.userLocation.lon, props.userLocation.lat], zoom: 16 });
    return () => {
      marker.remove();
    };
  }, [props.userLocation, props.focus, attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !props.routePoints.length || props.picking || props.route) return;
    const total = props.routePoints.length;
    const markers = props.routePoints.map(({ location, title, destination }, index) => {
      const isStart = index === 0;
      const isEnd = Boolean(destination) || (total > 1 && index === total - 1);
      const label = isStart ? 'A' : isEnd ? 'B' : String(index);
      const element = document.createElement('div');
      element.className = `route-number route-planned-point ${isStart ? 'point-a' : isEnd ? 'point-b' : 'point-waypoint'}`;
      element.textContent = label;
      element.title = isStart ? `Punctul A: ${title}` : isEnd ? `Punctul B: ${title}` : `Oprire intermediară ${index}: ${title}`;
      element.setAttribute('aria-label', element.title);
      return new maplibregl.Marker({ element }).setLngLat([location.lon, location.lat]).addTo(instance);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.routePoints, props.route, props.tab, props.picking, attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleReady.current) return;
    for (const id of ['route-line', 'route-halo']) if (instance.getLayer(id)) instance.removeLayer(id);
    if (instance.getSource('route')) instance.removeSource('route');
    clearTransitRoute(instance);
    const markers: maplibregl.Marker[] = [];
    if (props.route) {
      instance.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: props.route.geometry },
      });
      instance.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 10 } });
      instance.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#0F52BA', 'line-width': 5 },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });
      const totalWp = props.route.order.length;
      props.route.order.forEach((index, visit) => {
        const point = props.route!.waypoints[index];
        const isStart = visit === 0;
        const isEnd = visit === totalWp - 1;
        const label = isStart ? 'A' : isEnd ? 'B' : String(visit);
        const element = document.createElement('div');
        element.className = `route-number ${isStart ? 'route-origin point-a' : isEnd ? 'point-b' : 'point-waypoint'}`;
        element.style.background = isStart ? '#059669' : isEnd ? '#0F52BA' : '#d97706';
        element.textContent = label;
        element.title = isStart ? 'Punctul A (Plecare)' : isEnd ? 'Punctul B (Destinație)' : `Oprire intermediară ${visit}`;
        markers.push(new maplibregl.Marker({ element }).setLngLat([point.lon, point.lat]).addTo(instance));
      });
    } else if (props.transit) {
      markers.push(...drawTransitRoute(instance, props.transit, appliedTheme.current === 'dark'));
    }
    orderMobilityLayers(instance);
    return () => markers.forEach(marker => marker.remove());
  }, [props.route, props.transit, ready]);

  useEffect(() => {
    const activeRoute = props.route ?? props.transit;
    if (!activeRoute) {
      lastFittedRoute.current = undefined;
      return;
    }
    const instance = map.current;
    if (!instance || !styleReady.current || !container.current) return;
    const mobile = innerWidth <= 760;
    const panelOpen = mobile && props.mobilePanelOpen;
    const previous = lastFittedRoute.current;
    if (previous?.route === activeRoute && previous.instance === instance && previous.panelOpen === panelOpen) return;

    instance.resize();
    const bounds = new maplibregl.LngLatBounds();
    const lines = 'geometry' in activeRoute ? [activeRoute.geometry] : activeRoute.steps.map(step => step.geometry);
    for (const line of lines) for (const [lon, lat] of line.coordinates) bounds.extend([lon, lat]);
    const verticalPadding = Math.floor(container.current.clientHeight / 5);
    instance.fitBounds(bounds, {
      padding: { top: Math.min(60, verticalPadding), left: 36, right: 48, bottom: Math.min(mobile ? 76 : 48, verticalPadding) },
      maxZoom: props.transit ? 15.5 : 16,
    });
    lastFittedRoute.current = { instance, route: activeRoute, panelOpen };
  }, [props.route, props.transit, props.mobilePanelOpen, ready]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = props.picking ? 'crosshair' : '';
  }, [props.picking]);

  return (
    <div className="map-surface">
      <div className="map-canvas" ref={container} aria-label="Hartă interactivă Timișoara" />
      {!settled && !error && (
        <div className="map-loading" role="status">
          <span className="spinner" />
          Se încarcă harta…
        </div>
      )}
      {error && (
        <div className="map-error">
          <AlertTriangle size={22} />
          <strong>Harta nu s-a putut încărca</strong>
          <span>Verifică accesul la internet. Datele tale rămân disponibile.</span>
          <button
            onClick={() => {
              setError(false);
              setAttempt(value => value + 1);
            }}
          >
            <RefreshCw size={16} />
            Reîncearcă
          </button>
        </div>
      )}
    </div>
  );
}
