import { municipalReportsPollMs, municipalReportsPortal, municipalReportsWindowMs } from '../src/municipal-reports.ts';
import type { MunicipalReport } from '../src/municipal-reports.ts';

type Snapshot = { reports: MunicipalReport[]; fetchedAt: string };
let cache: { until: number; snapshot: Promise<Snapshot> } | undefined;

export function normalizeMunicipalReports(data: unknown, now = Date.now()): MunicipalReport[] {
  if (!Array.isArray(data)) throw new Error('Invalid municipal feed');
  const reports = new Map<string, MunicipalReport>();
  for (const item of data) {
    if (!item || (item.status !== 'Inregistrata' && item.status !== 'In lucru')) continue;
    const published = typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : NaN;
    if (typeof item.webconInstanceNr !== 'string' || !/^SZN[0-9]+-[0-9]+$/.test(item.webconInstanceNr)
      || !Number.isFinite(published) || published < now - municipalReportsWindowMs || published > now) continue;
    const coordinates = item.locatie?.type === 'Point' ? item.locatie.coordinates : undefined;
    const location = Array.isArray(coordinates) && coordinates.length === 2
      && coordinates.every(value => typeof value === 'number' && Number.isFinite(value))
      && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
      ? [coordinates[0], coordinates[1]] as [number, number] : undefined;
    const category = typeof item.categorii?.nume === 'string' ? item.categorii.nume : '';
    reports.set(item.webconInstanceNr, {
      number: item.webconInstanceNr,
      status: item.status,
      category,
      title: typeof item.subcategorii?.nume === 'string' ? item.subcategorii.nume : category || 'Sesizare Primărie',
      createdAt: item.createdAt,
      coordinates: location,
    });
  }
  return [...reports.values()];
}

async function fetchSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  const upstream = new URL('/api/sesizari', municipalReportsPortal);
  upstream.search = new URLSearchParams({
    startDate: new Date(now - municipalReportsWindowMs).toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }).toString();
  const response = await fetch(upstream, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Municipal feed returned ${response.status}`);
  return { reports: normalizeMunicipalReports(await response.json()), fetchedAt: new Date().toISOString() };
}

export async function municipalReportsResponse(): Promise<Response> {
  const now = Date.now();
  if (!cache || cache.until <= now) cache = { until: now + municipalReportsPollMs - 5_000, snapshot: fetchSnapshot() };
  const { snapshot, until } = cache;
  try {
    const data = await snapshot;
    const secondsLeft = Math.max(0, Math.floor((until - Date.now()) / 1000));
    return Response.json(data, { headers: {
      'Cache-Control': 'no-cache',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${secondsLeft}`,
    } });
  } catch {
    if (cache?.snapshot === snapshot) cache = undefined;
    return Response.json({ error: 'Sursa Primăriei este indisponibilă' }, { status: 502 });
  }
}
