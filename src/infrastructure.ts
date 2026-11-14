import { useEffect, useState } from 'react';
import type { FeatureCollection, LineString, MultiLineString, Point as GeoPoint } from 'geojson';

export const layerDefinitions = {
  cycleways: { label: 'Piste și benzi de biciclete', short: 'Bicicletă', color: '#10b981', description: 'Rețea velo OSM, malurile Begăi și benzi dedicate.' },
  tramways: { label: 'Linii de tramvai', short: 'Tramvai', color: '#a855f7', description: 'Trasee STPT complete și stații de tramvai.' },
  busways: { label: 'Linii de autobuz și troleibuz', short: 'Autobuz / troleibuz', color: '#3b82f6', trolleyColor: '#06b6d4', description: 'Rute STPT de autobuz, Expres, troleibuz și stații.' },
  sidewalks: { label: 'Trotuare cartografiate', short: 'Trotuare', color: '#f59e0b', description: 'Trotuare, zone pietonale și rute pietonale continue.' },
  places: { label: 'Locuri și servicii', short: 'Locuri PMT / OSM', color: '#467859', description: 'Instituții, educație, sănătate, cultură, magazine și servicii.' },
};
export type LayerKey = keyof typeof layerDefinitions;
export type LayerVisibility = Record<LayerKey, boolean>;
export type InfrastructureMetadata = { exportedAt: string; osmTimestamp?: string; counts: Record<LayerKey, number>; bbox: number[]; source: string };
export type Infrastructure = Record<Exclude<LayerKey, 'places'>, FeatureCollection<LineString | MultiLineString>> & { places: FeatureCollection<GeoPoint>; metadata: InfrastructureMetadata };
export type MapPlace = { id: string; title: string; location: { lon: number; lat: number }; kind?: string; description?: string };
export const placeKindLabel: Record<string, string> = { park: 'Parc', sport: 'Sport', museum: 'Muzeu', tram_stop: 'Stație de tramvai', bus_stop: 'Stație de autobuz / troleibuz', bike_rental: 'Stație de biciclete', food: 'Restaurant / cafenea', shop: 'Magazin', health: 'Sănătate', education: 'Educație', culture: 'Cultură / turism', transport: 'Transport', services: 'Servicii', building: 'Clădire denumită' };
placeKindLabel.lodging = 'Cazare';
placeKindLabel.transit_stop = 'Stație de tramvai și autobuz';

export function toMapPlace(feature: Infrastructure['places']['features'][number]): MapPlace {
  const properties = feature.properties;
  return {
    id: `osm:${properties?.osmId}`, title: properties?.name || 'Loc pe hartă',
    location: { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] },
    kind: properties?.kind,
    description: properties?.source === 'GTFS SMTT' && properties.routeRefs ? `Linii STPT: ${properties.routeRefs}` : undefined,
  };
}
export function useMapData<K extends LayerKey>(key: K, enabled: boolean) {
  const [data, setData] = useState<Infrastructure[K]>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || data) return;
    const controller = new AbortController();
    setError('');
    async function load() {
      try {
        const response = await fetch(`/data/${key}.geojson`, { signal: controller.signal });
        if (!response.ok) throw new Error('Răspuns invalid');
        const result = await response.json();
        if (result.type !== 'FeatureCollection' || !Array.isArray(result.features)) throw new Error('Date invalide');
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) setError(`Nu am putut încărca stratul „${layerDefinitions[key].label}”.`);
      }
    }
    void load();
    return () => controller.abort();
  }, [key, enabled, data, attempt]);

  return { data, error, loading: enabled && !data && !error, retry: () => setAttempt(value => value + 1) };
}
