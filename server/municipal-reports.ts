import { municipalReportsArchiveMs, municipalReportsPollMs, municipalReportsPortal, municipalReportRanges } from '../src/municipal-reports.ts';
import type { MunicipalReport } from '../src/municipal-reports.ts';

type Snapshot = { reports: MunicipalReport[]; fetchedAt: string };
const cache = new Map<string, { until: number; snapshot: Promise<Snapshot> }>();

export function normalizeMunicipalReports(data: unknown): MunicipalReport[] {
  if (!Array.isArray(data)) throw new Error('Invalid municipal feed');
  const reports: MunicipalReport[] = [];
  for (const item of data) {
    if (!item || (item.status !== 'Inregistrata' && item.status !== 'In lucru')) continue;
    if (typeof item.webconInstanceNr !== 'string' || !/^SZN[0-9]+-[0-9]+$/.test(item.webconInstanceNr)
      || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) continue;
    const coordinates = item.locatie?.type === 'Point' ? item.locatie.coordinates : undefined;
    const location = Array.isArray(coordinates) && coordinates.length === 2
      && coordinates.every(value => typeof value === 'number' && Number.isFinite(value))
      && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
      ? [coordinates[0], coordinates[1]] as [number, number] : undefined;
    reports.push({
      number: item.webconInstanceNr,
      status: item.status,
      category: typeof item.categorii?.nume === 'string' ? item.categorii.nume : '',
      createdAt: item.createdAt,
      coordinates: location,
    });
  }
  return reports;
}

async function fetchSnapshot(range: { start: string; end: string }): Promise<Snapshot> {
  const upstream = new URL('/api/sesizari', municipalReportsPortal);
  upstream.search = new URLSearchParams({ startDate: range.start, endDate: range.end }).toString();
  const response = await fetch(upstream, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Municipal feed returned ${response.status}`);
  return { reports: normalizeMunicipalReports(await response.json()), fetchedAt: new Date().toISOString() };
}

export async function municipalReportsResponse(request: URL): Promise<Response> {
  const { recent, archive } = municipalReportRanges();
  const start = request.searchParams.get('start');
  const end = request.searchParams.get('end');
  const isRecent = start === recent.start && end === recent.end;
  const range = isRecent ? recent : archive.find(date => date.start === start && date.end === end);
  if (!range) return Response.json({ error: 'Interval invalid' }, { status: 400 });

  const now = Date.now();
  const ttl = isRecent ? municipalReportsPollMs - 5_000 : municipalReportsArchiveMs - 15_000;
  for (const [key, entry] of cache) if (entry.until <= now) cache.delete(key);
  const key = `${range.start}/${range.end}`;
  const existing = cache.get(key);
  const snapshot = existing?.snapshot ?? fetchSnapshot(range);
  if (!existing) cache.set(key, { until: now + ttl, snapshot });
  try {
    const data = await snapshot;
    const secondsLeft = Math.max(0, Math.floor(((cache.get(key)?.until ?? now) - Date.now()) / 1000));
    return Response.json(data, { headers: {
      'Cache-Control': 'no-cache',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${secondsLeft}`,
      'Netlify-Vary': 'query=start|end',
    } });
  } catch {
    if (cache.get(key)?.snapshot === snapshot) cache.delete(key);
    return Response.json({ error: 'Sursa Primăriei este indisponibilă' }, { status: 502 });
  }
}
