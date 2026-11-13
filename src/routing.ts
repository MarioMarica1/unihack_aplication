import { pointSchema } from './domain';
import type { Point } from './domain';
import type { LineString } from 'geojson';
export type TravelMode = 'walking' | 'cycling' | 'driving';
export const travelModes: Record<TravelMode, { label: string; endpoint: string; color: string }> = {
  walking: { label: 'Pe jos', endpoint: 'https://routing.openstreetmap.de/routed-foot', color: '#b97a33' },
  cycling: { label: 'Bicicletă', endpoint: 'https://routing.openstreetmap.de/routed-bike', color: '#127caf' },
  driving: { label: 'Auto', endpoint: 'https://routing.openstreetmap.de/routed-car', color: '#26765c' },
};
export type RouteResult = { geometry: LineString; distance: number; duration: number; order: number[]; warnings: string[]; mode: TravelMode; waypoints: Point[] };
let nextRequestAt = 0;
async function rateLimit(signal?: AbortSignal) {
  const wait = Math.max(0, nextRequestAt - Date.now()); nextRequestAt = Date.now() + wait + 1100;
  if (!wait) { signal?.throwIfAborted(); return; }
  await new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new DOMException('Rutare anulată', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, wait);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}
export async function calculateRoute(start: Point, stops: Point[], signal?: AbortSignal, mode: TravelMode = 'driving'): Promise<RouteResult> {
  pointSchema.parse(start); stops.forEach(p => pointSchema.parse(p));
  if (stops.length < 2 || stops.length > 7) throw new Error('Alege între 2 și 7 opriri.');
  if (!travelModes[mode]) throw new Error('Modul de transport nu este disponibil.');
  const points = [start, ...stops];
  const coordinates = points.map(p => `${p.lon},${p.lat}`).join(';');
  await rateLimit(signal);
  const response = await fetch(`${travelModes[mode].endpoint}/trip/v1/driving/${coordinates}?roundtrip=true&source=first&geometries=geojson&overview=full`, { signal: signal || AbortSignal.timeout(20000) }).catch(error => {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    throw new Error('Serviciul de rutare nu poate fi contactat. Punctele sunt păstrate; reîncearcă.');
  });
  if (!response.ok) throw new Error('Serviciul de rutare nu răspunde. Punctele tale au fost păstrate.');
  const result = await response.json();
  if (result.code !== 'Ok' || !result.trips?.length || result.trips.length !== 1 || result.waypoints?.length !== points.length) throw new Error('Nu există un circuit rutier între toate punctele selectate.');
  const trip = result.trips[0];
  if (trip.geometry?.type !== 'LineString' || !Array.isArray(trip.geometry.coordinates) || trip.geometry.coordinates.length < 2 || !Number.isFinite(trip.distance) || !Number.isFinite(trip.duration)) throw new Error('Serviciul a returnat un traseu invalid. Reîncearcă.');
  const indices = result.waypoints.map((p: { waypoint_index: number }) => p.waypoint_index);
  if (new Set(indices).size !== points.length || indices.some((i: number) => !Number.isInteger(i) || i < 0 || i >= points.length)) throw new Error('Ordinea opririlor primită de la furnizor este invalidă.');
  const order = result.waypoints.map((p: { waypoint_index: number }, index: number) => ({ index, position: p.waypoint_index })).sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((p: { index: number }) => p.index);
  const warnings = result.waypoints.some((p: { distance: number }) => p.distance > 50) ? [`Unele puncte au fost ajustate la rețeaua disponibilă pentru modul „${travelModes[mode].label}”.`] : [];
  if (mode === 'cycling') warnings.push('Profilul pentru bicicletă poate folosi și străzi comune cu mașinile; nu garantează un circuit exclusiv pe piste.');
  const waypoints = result.waypoints.map((p: { location?: number[] }, index: number) => p.location?.length === 2 ? { lon: p.location[0], lat: p.location[1] } : points[index]);
  return { geometry: trip.geometry, distance: trip.distance, duration: trip.duration, order, warnings, mode, waypoints };
}
