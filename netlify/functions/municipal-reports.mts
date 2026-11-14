import { municipalReportsResponse } from '../../server/municipal-reports.ts';

export default (request: Request) => municipalReportsResponse(new URL(request.url));
