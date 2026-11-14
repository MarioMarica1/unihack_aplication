export const municipalReportsPortal = 'https://sesizari.primariatm.ro';
export const municipalReportsPath = '/api/municipal-reports';
export const municipalReportsStart = '2022-01-01';
export const municipalReportsPollMs = 60_000;
export const municipalReportsArchiveMs = 60 * municipalReportsPollMs;

export const municipalStatuses = {
  Inregistrata: { label: 'Depusă', color: '#2467c3' },
  'In lucru': { label: 'În lucru', color: '#a75c00' },
} as const;

export type MunicipalStatus = keyof typeof municipalStatuses;
export type MunicipalReport = {
  number: string;
  status: MunicipalStatus;
  category: string;
  createdAt: string;
  coordinates?: [number, number];
};

export function municipalReportUrl(number: string) {
  return `${municipalReportsPortal}/sesizari/${encodeURIComponent(number)}`;
}

function dateString(date: Date) { return date.toISOString().slice(0, 10); }

export function municipalReportRanges(now = new Date()) {
  const end = new Date(dateString(now));
  end.setUTCDate(end.getUTCDate() + 1);
  const cutoff = new Date(end);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const archive: { start: string; end: string }[] = [];
  let start = new Date(municipalReportsStart);
  while (start < cutoff) {
    const quarterEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1));
    const next = quarterEnd < cutoff ? quarterEnd : cutoff;
    archive.unshift({ start: dateString(start), end: dateString(next) });
    start = next;
  }
  return { recent: { start: dateString(cutoff), end: dateString(end) }, archive };
}
