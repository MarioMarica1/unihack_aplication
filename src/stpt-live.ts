import { useEffect, useState } from 'react';
import { z } from 'zod';

export const stptLines = {
  tram: { label: 'Tramvaie', lines: ['1', '2', '4', '5', '6', '7', '8', '9'] },
  bus: { label: 'Autobuze și Expres', lines: ['E1', 'E2', 'E3', 'E4', 'E4B', 'E6', 'E7', 'E8', '33', '40', '21', '32', '46'] },
  trolleybus: { label: 'Troleibuze și metropolitane', lines: ['11', '14', '15', '16', '17', '18', 'M11', 'M14'] },
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
});
const feedSchema = z.object({ vehicles: z.array(z.unknown()) });
export type LiveVehicle = z.infer<typeof vehicleSchema>;
export type LiveVehicleType = LiveVehicle['type'];
type FeedState = { status: 'loading' | 'ready' | 'unavailable'; vehicles: LiveVehicle[] };

const endpoint = import.meta.env.VITE_STPT_VEHICLES_URL?.trim();
const unavailable: FeedState = { status: 'unavailable', vehicles: [] };

export function useStptVehicles(enabled: boolean): FeedState {
  const [state, setState] = useState<FeedState>(unavailable);

  useEffect(() => {
    if (!enabled || !endpoint) { setState(unavailable); return; }
    const url = endpoint;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setState({ status: 'loading', vehicles: [] });

    async function refresh() {
      const started = Date.now();
      try {
        const response = await fetch(url, {
          cache: 'no-store', credentials: 'omit',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error('Feed STPT indisponibil');
        const { vehicles } = feedSchema.parse(await response.json());
        const now = Date.now();
        const fresh = new Map<string, LiveVehicle>();
        for (const item of vehicles) {
          const result = vehicleSchema.safeParse(item);
          if (!result.success) continue;
          const vehicle = result.data;
          const age = now - Date.parse(vehicle.recordedAt);
          const previous = fresh.get(vehicle.id);
          if (age >= -10000 && age <= 90000 && (!previous || Date.parse(previous.recordedAt) < Date.parse(vehicle.recordedAt))) {
            fresh.set(vehicle.id, vehicle);
          }
        }
        if (!controller.signal.aborted) setState(vehicles.length && !fresh.size
          ? unavailable : { status: 'ready', vehicles: [...fresh.values()] });
      } catch {
        if (!controller.signal.aborted) setState(unavailable);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), Math.max(0, 10000 - (Date.now() - started)));
      }
    }

    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled]);

  return enabled ? state : unavailable;
}
