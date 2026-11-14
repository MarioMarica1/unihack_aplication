import { municipalReportsPollMs, municipalReportsPortal, municipalReportsWindowMs, municipalStatuses } from '../src/municipal-reports.ts';
import type { MunicipalReport, MunicipalReportDetail, MunicipalStatus } from '../src/municipal-reports.ts';

type Snapshot = { reports: MunicipalReport[]; allReports?: MunicipalReport[]; fetchedAt: string };
let cache: { until: number; snapshot: Promise<Snapshot> } | undefined;
const detailCache = new Map<string, { until: number; detail: Promise<MunicipalReportDetail> }>();

const activeStatuses = new Set<string>(['Inregistrata', 'In lucru']);
const knownStatuses = new Set<string>(Object.keys(municipalStatuses));

export function normalizeMunicipalReports(data: unknown, now = Date.now(), includeAllStatuses = false): MunicipalReport[] {
  if (!Array.isArray(data)) throw new Error('Invalid municipal feed');
  const reports = new Map<string, MunicipalReport>();
  for (const item of data) {
    if (!item || typeof item.status !== 'string') continue;
    if (includeAllStatuses ? !knownStatuses.has(item.status) : !activeStatuses.has(item.status)) continue;
    const published = typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : NaN;
    if (typeof item.webconInstanceNr !== 'string' || !/^SZN[0-9]+-[0-9]+$/.test(item.webconInstanceNr)
      || !Number.isFinite(published) || published < now - municipalReportsWindowMs || published > now) continue;
    const coordinates = item.locatie?.type === 'Point' ? item.locatie.coordinates : undefined;
    const location = Array.isArray(coordinates) && coordinates.length === 2
      && coordinates.every(value => typeof value === 'number' && Number.isFinite(value))
      && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
      ? [coordinates[0], coordinates[1]] as [number, number] : undefined;
    const category = typeof item.categorii?.nume === 'string' ? item.categorii.nume.trim() : '';
    const subcat = typeof item.subcategorii?.nume === 'string' ? item.subcategorii.nume.trim() : '';
    const description = typeof item.descriere === 'string' && item.descriere.trim() ? item.descriere.trim() : undefined;
    const firstFile = Array.isArray(item.files) ? item.files.find((f: { path?: unknown }) => typeof f?.path === 'string' && f.path.trim()) : undefined;
    const photoUrl = firstFile?.path ? `https://d6r4wmx5epyg3.cloudfront.net/${firstFile.path}` : undefined;
    const report: MunicipalReport = {
      number: item.webconInstanceNr,
      status: item.status as MunicipalStatus,
      category,
      title: subcat || category || 'Sesizare Primărie',
      createdAt: item.createdAt,
      coordinates: location,
    };
    if (description) report.description = description;
    if (photoUrl) report.photoUrl = photoUrl;
    reports.set(item.webconInstanceNr, report);
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
  const raw = await response.json();
  return {
    reports: normalizeMunicipalReports(raw, now, false),
    allReports: normalizeMunicipalReports(raw, now, true),
    fetchedAt: new Date().toISOString(),
  };
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

async function fetchReportDetail(number: string): Promise<MunicipalReportDetail> {
  const upstream = new URL(`/api/sesizari/${encodeURIComponent(number)}`, municipalReportsPortal);
  const response = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Municipal detail returned ${response.status}`);
  const item = await response.json();
  const history = Array.isArray(item?.history)
    ? item.history
        .filter((h: { status?: unknown; createdAt?: unknown }) => typeof h?.status === 'string' && typeof h?.createdAt === 'string')
        .map((h: { status: string; createdAt: string }) => ({ status: h.status, createdAt: h.createdAt }))
    : [];
  return {
    number,
    street: typeof item?.strada === 'string' && item.strada.trim() ? item.strada.trim() : undefined,
    streetNumber: typeof item?.nrStrada === 'string' && item.nrStrada.trim() ? item.nrStrada.trim() : undefined,
    history,
  };
}

export async function municipalReportDetailResponse(number: string): Promise<Response> {
  if (!/^SZN[0-9]+-[0-9]+$/.test(number)) {
    return Response.json({ error: 'Număr de sesizare invalid' }, { status: 400 });
  }
  const now = Date.now();
  let entry = detailCache.get(number);
  if (!entry || entry.until <= now) {
    entry = { until: now + 5 * 60_000, detail: fetchReportDetail(number) };
    detailCache.set(number, entry);
  }
  try {
    const detail = await entry.detail;
    return Response.json(detail, { headers: { 'Cache-Control': 'private, max-age=120' } });
  } catch {
    if (detailCache.get(number) === entry) detailCache.delete(number);
    return Response.json({ error: 'Detaliile sesizării nu sunt disponibile' }, { status: 502 });
  }
}
