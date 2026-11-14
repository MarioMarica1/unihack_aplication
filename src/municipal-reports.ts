export const municipalReportsPortal = 'https://sesizari.primariatm.ro';
export const municipalReportsPath = '/api/municipal-reports';
export const municipalReportsPollMs = 60_000;
export const municipalReportsWindowMs = 30 * 24 * 60 * 60 * 1000;

export const municipalStatuses = {
  Inregistrata: { label: 'Depusă', color: '#2467c3' },
  'In lucru': { label: 'În lucru', color: '#a75c00' },
} as const;

export type MunicipalStatus = keyof typeof municipalStatuses;
export type MunicipalReport = {
  number: string;
  status: MunicipalStatus;
  category: string;
  title: string;
  createdAt: string;
  coordinates?: [number, number];
};

export function municipalReportUrl(number: string) {
  return `${municipalReportsPortal}/sesizari/${encodeURIComponent(number)}`;
}

export const municipalReportId = (number: string) => `pmt:${number}`;
