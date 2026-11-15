export type OfficialCityEvent = {
  id: string;
  title: string;
  category: string;
  venue: string;
  lat: number;
  lon: number;
  startsAt: string;
  endsAt?: string;
  timeLabel?: string;
  source: 'Visit Timișoara' | 'Centrul de Proiecte PMT';
  officialUrl: string;
  ticketsUrl?: string;
};

export type CityEventSortMode = 'newest' | 'upcoming' | 'near' | 'active';

const TIMISOARA_TIME_ZONE = 'Europe/Bucharest';

const bucharestDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMISOARA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateFormatters = {
  short: new Intl.DateTimeFormat('ro-RO', {
    timeZone: TIMISOARA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
  long: new Intl.DateTimeFormat('ro-RO', {
    timeZone: TIMISOARA_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
};

/**
 * Extracts a YYYY-MM-DD calendar date key in Europe/Bucharest timezone.
 * Pure ISO date strings ("YYYY-MM-DD") are preserved without timezone drift.
 */
export function getBucharestDateKey(value: Date | string = new Date()): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return '';
    return bucharestDayFormatter.format(date);
  }
  if (Number.isNaN(value.getTime())) return '';
  return bucharestDayFormatter.format(value);
}

/**
 * Returns the effective ending calendar day (YYYY-MM-DD) for a single-day or multi-day event.
 */
export function getCityEventEndDateKey(
  event: Pick<OfficialCityEvent, 'startsAt' | 'endsAt'>,
): string {
  if (event.endsAt) {
    const endKey = getBucharestDateKey(event.endsAt);
    if (endKey) return endKey;
  }
  return getBucharestDateKey(event.startsAt);
}

/**
 * Checks whether an official event has completely ended before today (Europe/Bucharest).
 * Events happening today or ongoing multi-day exhibitions whose end date is today or later remain active.
 */
export function isCityEventExpired(
  event: Pick<OfficialCityEvent, 'startsAt' | 'endsAt'>,
  referenceNow: Date | string = new Date(),
): boolean {
  const todayKey = getBucharestDateKey(referenceNow);
  const endKey = getCityEventEndDateKey(event);
  if (!todayKey || !endKey) return false;
  return endKey < todayKey;
}

function parseStartMinutes(timeLabel?: string): number | null {
  if (!timeLabel) return null;
  const match = timeLabel.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Compares official events by start day, start time, end day, and Romanian title.
 * Default direction is descending ('desc' = newest/latest event dates first, down to today).
 */
export function compareCityEventsByDate(
  a: OfficialCityEvent,
  b: OfficialCityEvent,
  direction: 'desc' | 'asc' = 'desc',
): number {
  const sign = direction === 'desc' ? -1 : 1;
  const startA = getBucharestDateKey(a.startsAt);
  const startB = getBucharestDateKey(b.startsAt);
  if (startA !== startB) return startA.localeCompare(startB) * sign;

  const minA = parseStartMinutes(a.timeLabel);
  const minB = parseStartMinutes(b.timeLabel);
  if (minA !== minB) {
    if (minA === null) return 1;
    if (minB === null) return -1;
    return (minA - minB) * sign;
  }

  const endA = getCityEventEndDateKey(a);
  const endB = getCityEventEndDateKey(b);
  if (endA !== endB) return endA.localeCompare(endB) * sign;

  return a.title.localeCompare(b.title, 'ro-RO');
}

/**
 * Filters out past official events (ended before referenceNow's calendar day)
 * and sorts the remaining active/upcoming events in the requested date order.
 */
export function filterAndSortActiveCityEvents(
  events: readonly OfficialCityEvent[],
  referenceNow: Date | string = new Date(),
  direction: 'desc' | 'asc' = 'desc',
): OfficialCityEvent[] {
  return events
    .filter(ev => !isCityEventExpired(ev, referenceNow))
    .sort((a, b) => compareCityEventsByDate(a, b, direction));
}

/**
 * Formats an official event's calendar date without injecting spurious midnight UTC->EET hours.
 */
export function formatCityEventDate(iso: string, month: 'short' | 'long' = 'short'): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim()) ? new Date(`${iso.trim()}T12:00:00.000Z`) : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return dateFormatters[month].format(parsed);
}
