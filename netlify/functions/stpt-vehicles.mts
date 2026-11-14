import { stptVehiclesResponse } from '../../server/stpt-live.ts';

export default async function stptVehicles() {
  return stptVehiclesResponse();
}
