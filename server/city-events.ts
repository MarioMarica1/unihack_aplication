import type { OfficialCityEvent } from '../src/city-events.ts';

type WpEventItem = {
  id?: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  class_list?: string[];
  meta?: {
    starting_date?: number | string;
    ending_date?: number | string;
    starting_time?: string;
    link_website_event?: string;
    link_tickets_event?: string;
  };
};

let cache: { until: number; promise: Promise<{ events: OfficialCityEvent[]; fetchedAt: string }> } | undefined;

const timisoaraVenues: Array<{
  pattern: RegExp;
  venue: string;
  lat: number;
  lon: number;
}> = [
  { pattern: /filarmonic|capitol|simfonic|orchestr|recital|vioar|pian/i, venue: 'Filarmonica Banatul (Sala Capitol)', lat: 45.75162, lon: 21.22614 },
  { pattern: /oper[aă]|teatru|național|national|dramatic|german|maghiar/i, venue: 'Opera Națională / Teatrul Național (Piața Victoriei)', lat: 45.75412, lon: 21.22582 },
  { pattern: /faber|cinci hectare|ambasada|splaiul peneș/i, venue: 'FABER Timișoara (Splaiul Peneș Curcanul)', lat: 45.75632, lon: 21.24681 },
  { pattern: /victoria|cinema victoria|bălcescu/i, venue: 'Cinema Victoria (Piața Bălcescu)', lat: 45.74784, lon: 21.20824 },
  { pattern: /cinema timiș|cinema timis/i, venue: 'Cinema Timiș (Piața Victoriei)', lat: 45.75341, lon: 21.22563 },
  { pattern: /cinema studio/i, venue: 'Cinema Studio (Str. Nicolinț)', lat: 45.75561, lon: 21.22592 },
  { pattern: /bastion|theresia|muzeul național al banatului/i, venue: 'Bastionul Maria Theresia', lat: 45.75692, lon: 21.23364 },
  { pattern: /unirii|muzeul de artă|baroc|sârb|tambure|literatur/i, venue: 'Piața Unirii / Muzeul Național de Artă', lat: 45.75795, lon: 21.22892 },
  { pattern: /libertății|libertatii|garnizoan|galeria 5/i, venue: 'Piața Libertății / Galeria 5', lat: 45.75562, lon: 21.22725 },
  { pattern: /rozelor|parc/i, venue: 'Parcul Rozelor Timișoara', lat: 45.74951, lon: 21.23142 },
  { pattern: /iulius|congress/i, venue: 'Iulius Town Timișoara', lat: 45.76612, lon: 21.22864 },
];

const fallbackCulturalVenues = [
  { venue: 'Centrul de Proiecte Timișoara (Str. Vasile Alecsandri 1)', lat: 45.75614, lon: 21.22782 },
  { venue: 'Piața Libertății Timișoara', lat: 45.75562, lon: 21.22725 },
  { venue: 'Piața Unirii Timișoara', lat: 45.75795, lon: 21.22892 },
  { venue: 'Bastionul Maria Theresia', lat: 45.75692, lon: 21.23364 },
  { venue: 'Cinema Timiș (Piața Victoriei)', lat: 45.75341, lon: 21.22563 },
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveVenue(title: string, externalLink: string, index: number) {
  const hay = `${title} ${externalLink}`;
  for (const v of timisoaraVenues) {
    if (v.pattern.test(hay)) return v;
  }
  return fallbackCulturalVenues[index % fallbackCulturalVenues.length];
}

function classifyEventCategory(classList: string[] = [], title = ''): string {
  const hay = `${classList.join(' ')} ${title}`.toLocaleLowerCase('ro');
  if (/concert|muzic|filarmonic|simfonic|recital/.test(hay)) return 'Concert & Muzică';
  if (/expozitie|expoziție|vernisaj|artă|arta|galeri/.test(hay)) return 'Expoziție & Arte Vizuale';
  if (/teatru|spectacol|lectură|literatur|carte/.test(hay)) return 'Teatru & Literatură';
  if (/film|cinema|proiecție/.test(hay)) return 'Film & Cinema';
  return 'Eveniment Cultural & Comunitar';
}

async function fetchLiveCityEvents(): Promise<{ events: OfficialCityEvent[]; fetchedAt: string }> {
  const [vtRes, cdpRes] = await Promise.allSettled([
    fetch('https://visit-timisoara.com/wp-json/wp/v2/events-visit?per_page=25', {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    }).then(r => (r.ok ? (r.json() as Promise<WpEventItem[]>) : [])),
    fetch('https://centruldeproiecte.ro/wp-json/wp/v2/eveniment?per_page=15', {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    }).then(r => (r.ok ? (r.json() as Promise<WpEventItem[]>) : [])),
  ]);

  const events: OfficialCityEvent[] = [];
  const seenTitles = new Set<string>();

  if (vtRes.status === 'fulfilled' && Array.isArray(vtRes.value)) {
    for (const item of vtRes.value) {
      const link = String(item.link ?? '');
      // Prefer Romanian entries on visit-timisoara.com
      if (link && !link.includes('/ro/') && vtRes.value.some(other => String(other.link ?? '').includes('/ro/'))) {
        continue;
      }
      const title = decodeHtmlEntities(String(item.title?.rendered ?? ''));
      if (!title || seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());

      const startSec = Number(item.meta?.starting_date ?? 0);
      const endSec = Number(item.meta?.ending_date ?? 0);
      const startsAt =
        Number.isFinite(startSec) && startSec > 1_000_000_000
          ? new Date(startSec * 1000).toISOString()
          : item.date
            ? new Date(item.date).toISOString()
            : new Date().toISOString();
      const endsAt =
        Number.isFinite(endSec) && endSec > 1_000_000_000
          ? new Date(endSec * 1000).toISOString()
          : undefined;

      const webLink = String(item.meta?.link_website_event || link);
      const ticketsUrl = item.meta?.link_tickets_event ? String(item.meta.link_tickets_event) : undefined;
      const venueInfo = resolveVenue(title, `${webLink} ${ticketsUrl ?? ''}`, events.length);

      events.push({
        id: `vt-${item.id ?? events.length}`,
        title,
        category: classifyEventCategory(item.class_list, title),
        venue: venueInfo.venue,
        lat: venueInfo.lat,
        lon: venueInfo.lon,
        startsAt,
        endsAt,
        timeLabel: item.meta?.starting_time ? String(item.meta.starting_time) : undefined,
        source: 'Visit Timișoara',
        officialUrl: link || webLink,
        ticketsUrl,
      });
    }
  }

  if (cdpRes.status === 'fulfilled' && Array.isArray(cdpRes.value)) {
    for (const item of cdpRes.value) {
      const title = decodeHtmlEntities(String(item.title?.rendered ?? ''));
      if (!title || seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());

      const link = String(item.link ?? 'https://centruldeproiecte.ro/');
      const startsAt = item.date ? new Date(item.date).toISOString() : new Date().toISOString();
      const venueInfo = resolveVenue(title, link, events.length);

      events.push({
        id: `cdp-${item.id ?? events.length}`,
        title,
        category: classifyEventCategory(item.class_list, title),
        venue: venueInfo.venue,
        lat: venueInfo.lat,
        lon: venueInfo.lon,
        startsAt,
        source: 'Centrul de Proiecte PMT',
        officialUrl: link,
      });
    }
  }

  return {
    events,
    fetchedAt: new Date().toISOString(),
  };
}

export async function cityEventsResponse(): Promise<Response> {
  const now = Date.now();
  if (!cache || cache.until <= now) {
    cache = {
      until: now + 10 * 60_000,
      promise: fetchLiveCityEvents(),
    };
  }
  const current = cache;
  try {
    const data = await current.promise;
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    if (cache === current) cache = undefined;
    return Response.json({ events: [], error: 'Fluxul oficial de evenimente este indisponibil momentan.' }, { status: 502 });
  }
}
