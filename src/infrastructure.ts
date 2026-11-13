import { useEffect, useState } from 'react';
import type { FeatureCollection, LineString, Point as GeoPoint } from 'geojson';

export const layerDefinitions = {
  cycleways: { label: 'Piste și benzi de biciclete', short: 'Bicicletă', color: '#127caf', description: 'Trasee dedicate și benzi etichetate în OSM.' },
  tramways: { label: 'Linii de tramvai', short: 'Tramvai', color: '#a7529a', description: 'Geometria șinelor, fără orare sau trafic live.' },
  sidewalks: { label: 'Trotuare cartografiate', short: 'Trotuare', color: '#bd7832', description: 'Traseu separat sau informație asociată străzii.' },
  places: { label: 'Locuri și servicii', short: 'Locuri OSM', color: '#467859', description: 'Magazine, cafenele, școli, instituții, parcuri și clădiri denumite.' },
};
export type LayerKey = keyof typeof layerDefinitions;
export type LayerVisibility = Record<LayerKey, boolean>;
export type CommunityVisibility = Record<'report' | 'activity' | 'discussion', boolean>;
export type InfrastructureMetadata = { exportedAt: string; osmTimestamp?: string; counts: Record<LayerKey, number>; bbox: number[]; source: string };
export type Infrastructure = { cycleways: FeatureCollection<LineString>; tramways: FeatureCollection<LineString>; sidewalks: FeatureCollection<LineString>; places: FeatureCollection<GeoPoint>; metadata: InfrastructureMetadata };
export type MapPlace = { id: string; title: string; location: { lon: number; lat: number }; kind?: string };
export const placeKindLabel: Record<string, string> = { park: 'Parc', sport: 'Sport', museum: 'Muzeu', tram_stop: 'Stație de tramvai', food: 'Restaurant / cafenea', shop: 'Magazin', health: 'Sănătate', education: 'Educație', culture: 'Cultură / turism', transport: 'Transport', services: 'Servicii', building: 'Clădire denumită' };
export function toMapPlace(feature: Infrastructure['places']['features'][number]): MapPlace {
  return { id: `osm:${feature.properties?.osmId}`, title: feature.properties?.name || 'Loc OpenStreetMap', location: { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }, kind: feature.properties?.kind };
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
