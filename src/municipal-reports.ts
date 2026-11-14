export const municipalReportsPortal = 'https://sesizari.primariatm.ro';
export const municipalReportsPath = '/api/municipal-reports';
export const municipalReportDetailPath = '/api/municipal-report-detail';
export const municipalReportsPollMs = 60_000;
export const municipalReportsWindowMs = 30 * 24 * 60 * 60 * 1000;

export const municipalStatuses = {
  Inregistrata: { label: 'Depusă', color: '#0F52BA' },
  'In lucru': { label: 'În lucru', color: '#D97706' },
  Finalizata: { label: 'Finalizată', color: '#059669' },
  'Asteapta clarificari': { label: 'Așteaptă clarificări', color: '#7C3AED' },
  'Declinata competenta': { label: 'Declinată competența', color: '#64748B' },
} as const;

export type MunicipalStatus = keyof typeof municipalStatuses;
export type MunicipalReport = {
  number: string;
  status: MunicipalStatus;
  category: string;
  title: string;
  createdAt: string;
  coordinates?: [number, number];
  description?: string;
  photoUrl?: string;
};

export type MunicipalReportDetail = {
  number: string;
  street?: string;
  streetNumber?: string;
  history: { status: string; createdAt: string }[];
};

export function municipalReportUrl(number: string) {
  return `${municipalReportsPortal}/sesizari/${encodeURIComponent(number)}`;
}

export const municipalReportId = (number: string) => `pmt:${number}`;
