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
  { pattern: /filarmonic|capitol|simfonic|orchestr|recital|vioar|pian|cvartet/i, venue: 'Filarmonica Banatul (Sala Capitol)', lat: 45.75056, lon: 21.22622 },
  { pattern: /oper[aă]|teatru|național|national|dramatic|german|maghiar/i, venue: 'Opera Națională / Teatrul Național (Piața Victoriei)', lat: 45.75439, lon: 21.22606 },
  { pattern: /faber|cinci hectare|splaiul peneș|ambasada/i, venue: 'FABER Timișoara (Splaiul Peneș Curcanul 4-5)', lat: 45.76139, lon: 21.25158 },
  { pattern: /karl\s*kunz|palatul\s*kunz|3\s*august/i, venue: 'Palatul Karl Kunz (Bd. 3 August 1919 nr. 2)', lat: 45.75629, lon: 21.24465 },
  { pattern: /victoria|cinema victoria|bălcescu/i, venue: 'Cinema Victoria (Piața Bălcescu)', lat: 45.74131, lon: 21.22453 },
  { pattern: /cinema timiș|cinema timis/i, venue: 'Cinema Timiș (Piața Victoriei 7)', lat: 45.75152, lon: 21.22551 },
  { pattern: /cinema studio|nikolaus lenau/i, venue: 'Cinema Studio (Str. Nikolaus Lenau 2)', lat: 45.75243, lon: 21.22604 },
  { pattern: /galeria\s*helios/i, venue: 'Galeria Helios (Piața Victoriei 6)', lat: 45.75201, lon: 21.22445 },
  { pattern: /bastion|theresia|therezia|muzeul național al banatului/i, venue: 'Bastionul Maria Theresia (Str. Martin Luther 4)', lat: 45.75693, lon: 21.23461 },
  { pattern: /unirii|muzeul de artă|baroc|sârb|tambure/i, venue: 'Piața Unirii / Muzeul Național de Artă', lat: 45.75723, lon: 21.22908 },
  { pattern: /libertății|libertatii|garnizoan|galeria 5/i, venue: 'Piața Libertății / Galeria 5', lat: 45.75568, lon: 21.22730 },
  { pattern: /sinagog/i, venue: 'Sinagoga din Cetate (Str. Mărășești 6)', lat: 45.75647, lon: 21.22613 },
  { pattern: /rozelor|parcul rozelor/i, venue: 'Parcul Rozelor Timișoara', lat: 45.74999, lon: 21.23239 },
  { pattern: /iulius|congress/i, venue: 'Iulius Town Timișoara', lat: 45.76638, lon: 21.22839 },
];

const defaultSourceVenues = {
  visitTimisoara: {
    venue: 'Centrul de Informare Turistică / Piața Victoriei (Str. Alba Iulia 2)',
    lat: 45.75444,
    lon: 21.22652,
  },
  centrulDeProiecte: {
    venue: 'Centrul de Proiecte Timișoara (Str. Vasile Alecsandri 1)',
    lat: 45.75627,
    lon: 21.22777,
  },
} as const;

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

function resolveVenue(
  title: string,
  externalLink: string,
  sourceKind: keyof typeof defaultSourceVenues,
) {
  const hay = `${title} ${externalLink}`;
  for (const v of timisoaraVenues) {
    if (v.pattern.test(hay)) return v;
  }
  return defaultSourceVenues[sourceKind];
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
      const venueInfo = resolveVenue(title, `${webLink} ${ticketsUrl ?? ''}`, 'visitTimisoara');

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
      const venueInfo = resolveVenue(title, link, 'centrulDeProiecte');

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
