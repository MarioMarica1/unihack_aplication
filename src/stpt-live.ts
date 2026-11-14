import { useEffect, useState } from 'react';
import { z } from 'zod';

export const stptVehiclesPath = '/api/stpt-vehicles';

export const stptLines = {
  tram: { label: 'Tramvaie', lines: ['1', '2', '4', '5', '6', '7', '8', '9'] },
  bus: {
    label: 'Autobuze și Expres',
    lines: ['E1', 'E2', 'E3', 'E4', 'E4B', 'E6', 'E7', 'E8', '5B', '5C', '13', '21', '23', '24', '28', '32', '33', '33B', '40', '46'],
  },
  trolleybus: { label: 'Troleibuze și metropolitane', lines: ['11', '14', '15', '16', '17', '18', 'M11', 'M14', 'M22', 'M30', 'M35', 'M36', 'M41', 'M43', 'M44'] },
} as const;

export const stptHome = 'https://live.stpt.ro/';
export function stptLink(line: string) {
  const url = new URL(stptHome);
  if (line) url.searchParams.set('linie', line);
  return url.href;
}

const vehicleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['tram', 'bus', 'trolleybus']),
  line: z.string().trim().regex(/^[a-z0-9]{1,12}$/i).transform(value => value.toUpperCase()),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  recordedAt: z.iso.datetime({ offset: true }),
  bearing: z.number().optional(),
  speed: z.number().optional(),
  headsign: z.string().optional(),
  stop: z.string().optional(),
  isAccessible: z.boolean().optional(),
  tripId: z.string().optional(),
  directionId: z.enum(['0', '1']).optional(),
  shapeId: z.string().optional(),
});

const alertSchema = z.object({
  id: z.string(),
  header: z.string(),
  description: z.string(),
});

const feedSchema = z.object({
  vehicles: z.array(z.unknown()),
  alerts: z.array(z.unknown()).optional(),
  fetchedAt: z.string().optional(),
});

export type LiveVehicle = z.infer<typeof vehicleSchema>;
export type LiveVehicleType = LiveVehicle['type'];
export type LiveAlert = z.infer<typeof alertSchema>;

export type FeedState = {
  status: 'loading' | 'ready' | 'unavailable';
  vehicles: LiveVehicle[];
  alerts: LiveAlert[];
  fetchedAt?: string;
};

const endpoint = import.meta.env?.VITE_STPT_VEHICLES_URL?.trim() || stptVehiclesPath;
const unavailable: FeedState = { status: 'unavailable', vehicles: [], alerts: [] };

export function useStptVehicles(enabled: boolean): FeedState {
  const [state, setState] = useState<FeedState>(unavailable);

  useEffect(() => {
    if (!enabled || !endpoint) { setState(unavailable); return; }
    const url = endpoint;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setState(current => current.vehicles.length ? current : { status: 'loading', vehicles: [], alerts: [] });

    async function refresh() {
      const started = Date.now();
      try {
        const response = await fetch(url, {
          cache: 'no-store', credentials: 'omit',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error('Feed STPT indisponibil');
        const parsed = feedSchema.parse(await response.json());
        const now = Date.now();
        const fresh = new Map<string, LiveVehicle>();
        for (const item of parsed.vehicles) {
          const result = vehicleSchema.safeParse(item);
          if (!result.success) continue;
          const vehicle = result.data;
          const age = now - Date.parse(vehicle.recordedAt);
          const previous = fresh.get(vehicle.id);
          if (age >= -60_000 && age <= 15 * 60_000 && (!previous || Date.parse(previous.recordedAt) < Date.parse(vehicle.recordedAt))) {
            fresh.set(vehicle.id, vehicle);
          }
        }
        const alerts: LiveAlert[] = [];
        for (const rawAlert of parsed.alerts ?? []) {
          const res = alertSchema.safeParse(rawAlert);
          if (res.success) alerts.push(res.data);
        }
        if (!controller.signal.aborted) {
          setState(parsed.vehicles.length && !fresh.size
            ? unavailable
            : { status: 'ready', vehicles: [...fresh.values()], alerts, fetchedAt: parsed.fetchedAt ?? new Date().toISOString() });
        }
      } catch {
        if (!controller.signal.aborted) setState(unavailable);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), Math.max(2000, 10000 - (Date.now() - started)));
      }
    }

    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled]);

  return enabled ? state : unavailable;
}
