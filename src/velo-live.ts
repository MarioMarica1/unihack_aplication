import { useEffect, useState } from 'react';
import { z } from 'zod';

export const veloStationsPath = '/api/velo-stations';

const stationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  availableBikes: z.number().int().min(0),
  freeDocks: z.number().int().min(0),
  totalDocks: z.number().int().min(1),
  routeRefs: z.string().optional(),
  updatedAt: z.string(),
});

const feedSchema = z.object({
  stations: z.array(stationSchema),
  fetchedAt: z.string(),
});

export type VeloStation = z.infer<typeof stationSchema>;

export type VeloFeedState = {
  status: 'loading' | 'ready' | 'unavailable';
  stations: VeloStation[];
  fetchedAt?: string;
};

const unavailable: VeloFeedState = { status: 'unavailable', stations: [] };

export function useVeloStations(enabled: boolean): VeloFeedState {
  const [state, setState] = useState<VeloFeedState>(unavailable);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setState(current => current.stations.length ? current : { status: 'loading', stations: [] });

    async function refresh() {
      const started = Date.now();
      try {
        const response = await fetch(veloStationsPath, {
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error('Serviciul VeloTM este indisponibil');
        const parsed = feedSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            stations: parsed.stations,
            fetchedAt: parsed.fetchedAt,
          });
        }
      } catch {
        if (!controller.signal.aborted) setState(unavailable);
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(() => void refresh(), Math.max(5000, 15000 - (Date.now() - started)));
        }
      }
    }

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled]);

  return enabled ? state : unavailable;
}
