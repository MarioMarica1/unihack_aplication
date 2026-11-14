import { veloStationsResponse } from '../../server/velo-live.ts';
import { veloStationsPath } from '../../src/velo-live.ts';

export default async () => veloStationsResponse();

export const config = {
  path: veloStationsPath,
};
