import { municipalReportDetailResponse } from '../../server/municipal-reports.ts';

export default async function municipalReportDetail(request: Request) {
  const url = new URL(request.url);
  const number = url.searchParams.get('number') ?? '';
  return municipalReportDetailResponse(number);
}
