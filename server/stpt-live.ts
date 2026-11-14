import type { LiveAlert, LiveVehicle, LiveVehicleType } from '../src/stpt-live.ts';

const stptOrigin = 'https://live.stpt.ro';
const pollCacheMs = 8_000;

type StptSnapshot = {
  vehicles: LiveVehicle[];
  alerts: LiveAlert[];
  fetchedAt: string;
};

let cache: { until: number; snapshot: Promise<StptSnapshot> } | undefined;

function detectVehicleType(routeId: unknown, line: string): LiveVehicleType {
  const id = typeof routeId === 'string' ? routeId.toUpperCase() : '';
  if (id.startsWith('R_TV_')) return 'tram';
  if (id.startsWith('R_TB_')) return 'trolleybus';
  if (id.startsWith('R_AB_')) return 'bus';
  if (/^[12456789]$/.test(line)) return 'tram';
  if (/^(11|14|15|16|17|18|M11|M14)$/i.test(line)) return 'trolleybus';
  return 'bus';
}

export function normalizeStptVehicles(payload: unknown, now = Date.now()): LiveVehicle[] {
  const list = Array.isArray((payload as { data?: { vehicles?: unknown } })?.data?.vehicles)
    ? (payload as { data: { vehicles: unknown[] } }).data.vehicles
    : Array.isArray((payload as { vehicles?: unknown })?.vehicles)
      ? (payload as { vehicles: unknown[] }).vehicles
      : [];

  const result = new Map<string, LiveVehicle>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const line = String(item.route ?? item.line ?? '').trim().toUpperCase();
    const lat = typeof item.lat === 'number' ? item.lat : Number(item.lat);
    const lon = typeof item.lng === 'number' ? item.lng : typeof item.lon === 'number' ? item.lon : Number(item.lng ?? item.lon);
    if (!id || !line || !/^[A-Z0-9]{1,12}$/i.test(line)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    let timestampMs = now;
    if (typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)) {
      timestampMs = item.timestamp > 1e11 ? item.timestamp : item.timestamp * 1000;
    } else if (typeof item.recordedAt === 'string' && Number.isFinite(Date.parse(item.recordedAt))) {
      timestampMs = Date.parse(item.recordedAt);
    }

    const age = now - timestampMs;
    if (age < -60_000 || age > 15 * 60_000) continue;

    const type: LiveVehicleType = item.type === 'tram' || item.type === 'bus' || item.type === 'trolleybus'
      ? item.type
      : detectVehicleType(item.routeId, line);

    const vehicle: LiveVehicle = {
      id,
      type,
      line,
      lat,
      lon,
      recordedAt: new Date(timestampMs).toISOString(),
    };
    if (typeof item.bearing === 'number' && Number.isFinite(item.bearing)) vehicle.bearing = Math.round(item.bearing);
    if (typeof item.speed === 'number' && Number.isFinite(item.speed) && item.speed >= 0) vehicle.speed = Math.round(item.speed);
    if (typeof item.headsign === 'string' && item.headsign.trim()) vehicle.headsign = item.headsign.trim();
    if (typeof item.stop === 'string' && item.stop.trim()) vehicle.stop = item.stop.trim();
    if (typeof item.isAccessible === 'boolean') vehicle.isAccessible = item.isAccessible;
    if (typeof item.tripId === 'string' && item.tripId.trim()) vehicle.tripId = item.tripId.trim();
    if (typeof item.shapeId === 'string' && item.shapeId.trim()) vehicle.shapeId = item.shapeId.trim();

    const dirRaw = String(item.directionId ?? '').trim();
    const shapeRaw = String(item.shapeId ?? '').trim().toUpperCase();
    if (dirRaw === '0' || shapeRaw.endsWith('_T')) {
      vehicle.directionId = '0';
    } else if (dirRaw === '1' || shapeRaw.endsWith('_R')) {
      vehicle.directionId = '1';
    }

    result.set(id, vehicle);
  }
  return [...result.values()];
}

export function normalizeStptAlerts(payload: unknown): LiveAlert[] {
  const rawAlerts = Array.isArray((payload as { alerts?: unknown })?.alerts)
    ? (payload as { alerts: unknown[] }).alerts
    : Array.isArray((payload as { data?: { alerts?: unknown } })?.data?.alerts)
      ? (payload as { data: { alerts: unknown[] } }).data.alerts
      : [];
  const alerts: LiveAlert[] = [];
  for (const item of rawAlerts) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? alerts.length + 1);
    const header = String(record.headerText ?? record.header ?? record.title ?? '').trim();
    const description = String(record.descriptionText ?? record.description ?? '').trim();
    if (header || description) {
      alerts.push({ id, header: header || 'Anunț STPT', description });
    }
  }
  return alerts;
}

async function fetchStptSnapshot(): Promise<StptSnapshot> {
  const vehiclesUrl = new URL('/gtfs-vehicles.php', stptOrigin);
  const alertsUrl = new URL('/proxy-alerts.php', stptOrigin);

  const [vehiclesResponse, alertsResponse] = await Promise.all([
    fetch(vehiclesUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(alertsUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined),
  ]);

  if (!vehiclesResponse.ok) {
    throw new Error(`STPT feed returned ${vehiclesResponse.status}`);
  }
  const vehiclesPayload = await vehiclesResponse.json();
  const alertsPayload = alertsResponse?.ok ? await alertsResponse.json().catch(() => ({})) : {};

  return {
    vehicles: normalizeStptVehicles(vehiclesPayload),
    alerts: normalizeStptAlerts(alertsPayload),
    fetchedAt: new Date().toISOString(),
  };
}

export async function stptVehiclesResponse(): Promise<Response> {
  const now = Date.now();
  if (!cache || cache.until <= now) {
    cache = { until: now + pollCacheMs, snapshot: fetchStptSnapshot() };
  }
  const { snapshot, until } = cache;
  try {
    const data = await snapshot;
    const secondsLeft = Math.max(1, Math.floor((until - Date.now()) / 1000));
    return Response.json(data, {
      headers: {
        'Cache-Control': 'no-cache',
        'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${secondsLeft}`,
      },
    });
  } catch {
    if (cache?.snapshot === snapshot) cache = undefined;
    return Response.json({ error: 'Serviciul STPT Live este indisponibil momentan.' }, { status: 502 });
  }
}
