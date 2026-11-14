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
export async function calculateRoute(start: Point, destination: Point, waypoints: Point[] = [], signal?: AbortSignal, mode: TravelMode = 'driving'): Promise<RouteResult> {
  pointSchema.parse(start); pointSchema.parse(destination); waypoints.forEach(p => pointSchema.parse(p));
  if (waypoints.length > 6) throw new Error('Alege cel mult 6 opriri intermediare.');
  if (!travelModes[mode]) throw new Error('Modul de transport nu este disponibil.');
  const points = [start, ...waypoints, destination];
  const coordinates = points.map(p => `${p.lon},${p.lat}`).join(';');
  await rateLimit(signal);
  const response = await fetch(`${travelModes[mode].endpoint}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: signal || AbortSignal.timeout(20000) }).catch(error => {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    throw new Error('Serviciul de rutare nu poate fi contactat. Punctele sunt păstrate; reîncearcă.');
  });
  if (!response.ok) throw new Error('Serviciul de rutare nu răspunde. Punctele tale au fost păstrate.');
  const result = await response.json();
  if (result.code !== 'Ok' || !result.routes?.length || result.waypoints?.length !== points.length) throw new Error('Nu există un traseu între toate punctele selectate.');
  const route = result.routes[0];
  if (route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw new Error('Serviciul a returnat un traseu invalid. Reîncearcă.');
  const order = points.map((_, index) => index);
  const warnings = result.waypoints.some((p: { distance: number }) => p.distance > 50) ? [`Unele puncte au fost ajustate la rețeaua disponibilă pentru modul „${travelModes[mode].label}”.`] : [];
  if (mode === 'cycling') warnings.push('Profilul pentru bicicletă poate folosi și străzi comune cu mașinile; nu garantează un traseu exclusiv pe piste.');
  const snappedWaypoints = result.waypoints.map((p: { location?: number[] }, index: number) => p.location?.length === 2 ? { lon: p.location[0], lat: p.location[1] } : points[index]);
  return { geometry: route.geometry, distance: route.distance, duration: route.duration, order, warnings, mode, waypoints: snappedWaypoints };
}
