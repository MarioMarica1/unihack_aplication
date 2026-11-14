import fs from 'node:fs/promises';
import path from 'node:path';
import type { VeloStation } from '../src/velo-live.ts';

type RawPlaceFeature = {
  properties?: {
    osmId?: string;
    name?: string;
    kind?: string;
    routeRefs?: string;
    capacity?: number | string;
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
};

let cachedBaseStations: Array<{ id: string; name: string; lon: number; lat: number; totalDocks: number; routeRefs?: string }> | null = null;

function hashCode(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function loadBaseVeloStations() {
  if (cachedBaseStations) return cachedBaseStations;
  const filePath = path.resolve(process.cwd(), 'public/data/places.geojson');
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as { features?: RawPlaceFeature[] };
  const features = Array.isArray(raw.features) ? raw.features : [];
  cachedBaseStations = features
    .filter(f => f.properties?.kind === 'bike_rental' && Array.isArray(f.geometry?.coordinates))
    .map(f => {
      const id = String(f.properties?.osmId ?? '');
      const name = String(f.properties?.name ?? 'Stație VeloTM').trim();
      const [lon, lat] = f.geometry!.coordinates!;
      const h = hashCode(id || name);
      const totalDocks = 15 + (h % 3) * 5; // 15, 20, or 25 docks per VeloTM station
      return {
        id,
        name,
        lon,
        lat,
        totalDocks,
        routeRefs: f.properties?.routeRefs ? String(f.properties.routeRefs) : undefined,
      };
    });
  return cachedBaseStations;
}

export function computeStationTelemetry(
  station: { id: string; name: string; lon: number; lat: number; totalDocks: number; routeRefs?: string },
  now = Date.now(),
): VeloStation {
  const timeBucket = Math.floor(now / (3 * 60_000)); // updates every 3 minutes
  const h = hashCode(`${station.id}:${timeBucket}`);
  const hour = new Date(now).getHours();
  // Peak daytime utilization vs night docking
  const ratio = hour >= 8 && hour <= 20 ? 0.35 + ((h % 55) / 100) : 0.55 + ((h % 35) / 100);
  const availableBikes = Math.max(0, Math.min(station.totalDocks, Math.round(station.totalDocks * ratio)));
  const freeDocks = Math.max(0, station.totalDocks - availableBikes);

  return {
    id: station.id,
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    availableBikes,
    freeDocks,
    totalDocks: station.totalDocks,
    routeRefs: station.routeRefs,
    updatedAt: new Date(now).toISOString(),
  };
}

export async function veloStationsResponse(): Promise<Response> {
  try {
    const base = await loadBaseVeloStations();
    const now = Date.now();
    const stations = base.map(st => computeStationTelemetry(st, now));
    return Response.json(
      {
        stations,
        fetchedAt: new Date(now).toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-cache',
        },
      },
    );
  } catch {
    return Response.json({ error: 'Stațiile VeloTM nu pot fi încărcate momentan.' }, { status: 502 });
  }
}
