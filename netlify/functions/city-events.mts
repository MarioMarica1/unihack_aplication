import { cityEventsResponse } from '../../server/city-events.ts';
import { cityEventsPath } from '../../src/city-events.ts';

export const config = {
  path: cityEventsPath,
};

export default async () => cityEventsResponse();
