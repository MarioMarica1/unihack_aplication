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
  { pattern: /bastion|theresia|therezia|martin luther|hector|muzeul național al banatului/i, venue: 'Bastionul Maria Theresia (Str. Hector nr. 1)', lat: 45.75678, lon: 21.23423 },
  { pattern: /corneliu\s*miklo[sș]|take\s*ionescu\s*83|\bmx\b/i, venue: 'MX | Muzeul Corneliu Mikloși (Bd. Take Ionescu 83)', lat: 45.76300, lon: 21.24588 },
  { pattern: /unirii|muzeul de artă|baroc|sârb|tambure/i, venue: 'Piața Unirii / Muzeul Național de Artă', lat: 45.75723, lon: 21.22908 },
  { pattern: /galeria\s*5|vasile alecsandri|centrul de proiecte/i, venue: 'Centrul de Proiecte / Galeria 5 (Str. Vasile Alecsandri nr. 1)', lat: 45.75627, lon: 21.22777 },
  { pattern: /libertății|libertatii|garnizoan/i, venue: 'Piața Libertății Timișoara', lat: 45.75568, lon: 21.22730 },
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

const streetCoordsCache = new Map<string, { lat: number; lon: number } | null>();

const romanianMonths: Record<string, number> = {
  ianuarie: 1,
  februarie: 2,
  martie: 3,
  aprilie: 4,
  mai: 5,
  iunie: 6,
  iulie: 7,
  august: 8,
  septembrie: 9,
  octombrie: 10,
  noiembrie: 11,
  decembrie: 12,
};

function parseRomanianDateIso(snippet: string): { startsAt?: string; endsAt?: string } {
  const m = snippet.match(
    /(\d{1,2})(?:\s*[–-]\s*(\d{1,2})(?:\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie))?)?\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+(\d{4})/i,
  );
  if (!m) return {};
  const dayStart = Number(m[1]);
  const dayEnd = m[2] ? Number(m[2]) : undefined;
  const monthEnd = romanianMonths[(m[4] || '').toLowerCase()];
  const monthStart = m[3] ? romanianMonths[m[3].toLowerCase()] : monthEnd;
  const year = Number(m[5]);
  if (!monthStart || !monthEnd || !year) return {};
  const pad = (n: number) => String(n).padStart(2, '0');
  const startsAt = `${year}-${pad(monthStart)}-${pad(dayStart)}T10:00:00.000Z`;
  const endsAt = dayEnd ? `${year}-${pad(monthEnd)}-${pad(dayEnd)}T20:00:00.000Z` : undefined;
  return { startsAt, endsAt };
}

async function geocodeTimisoaraStreet(address: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (streetCoordsCache.has(key)) return streetCoordsCache.get(key) ?? null;

  const clean = address.replace(/\bSAD\s*\d+\b/gi, '').replace(/,\s*nr\.?/gi, ' ').trim();
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=21.14,45.82,21.32,45.69&bounded=1&q=${encodeURIComponent(`${clean}, Timișoara`)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'UrbanConect/1.0' },
    });
    if (!res.ok) {
      streetCoordsCache.set(key, null);
      return null;
    }
    const items = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const lat = Number(items[0]?.lat);
    const lon = Number(items[0]?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const coords = { lat, lon };
      streetCoordsCache.set(key, coords);
      return coords;
    }
  } catch {
    // fallback safely below
  }
  streetCoordsCache.set(key, null);
  return null;
}

async function fetchCdpEventMetadata(link: string): Promise<{
  venueName?: string;
  streetAddress?: string;
  startsAt?: string;
  endsAt?: string;
}> {
  const pageUrl = link.replace('/eveniment/', '/evenimente/');
  try {
    const res = await fetch(pageUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return {};
    const html = await res.text();
    const spaceMatch = html.match(/https:\/\/centruldeproiecte\.ro\/spatii\/[^"']+["'][^>]*>([^<]+)/i);
    const streetMatch = html.match(/https:\/\/maps\.app\.goo\.gl\/[^"']+["'][^>]*>(?:<span[^>]*>)?([^<]+)/i);
    const hostedIdx = html.indexOf('text_block-238-34608');
    const dateSnippet =
      hostedIdx > 0
        ? html
            .slice(Math.max(0, hostedIdx - 600), hostedIdx)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
        : '';
    const parsedDates = parseRomanianDateIso(dateSnippet);
    return {
      venueName: spaceMatch?.[1] ? decodeHtmlEntities(spaceMatch[1]) : undefined,
      streetAddress: streetMatch?.[1] ? decodeHtmlEntities(streetMatch[1]) : undefined,
      ...parsedDates,
    };
  } catch {
    return {};
  }
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
    const cdpItems = cdpRes.value.filter(item => {
      const title = decodeHtmlEntities(String(item.title?.rendered ?? ''));
      if (!title || seenTitles.has(title.toLowerCase())) return false;
      seenTitles.add(title.toLowerCase());
      return true;
    });

    // Fetch hosted space, street address & real date in small batches of 3 to avoid rate limits
    const cdpMetaList: Array<Awaited<ReturnType<typeof fetchCdpEventMetadata>>> = [];
    for (let i = 0; i < cdpItems.length; i += 3) {
      const batch = cdpItems.slice(i, i + 3);
      const settled = await Promise.all(
        batch.map(item => fetchCdpEventMetadata(String(item.link ?? 'https://centruldeproiecte.ro/'))),
      );
      cdpMetaList.push(...settled);
    }

    for (let i = 0; i < cdpItems.length; i++) {
      const item = cdpItems[i];
      const meta = cdpMetaList[i] ?? {};
      const title = decodeHtmlEntities(String(item.title?.rendered ?? ''));
      const link = String(item.link ?? 'https://centruldeproiecte.ro/').replace('/eveniment/', '/evenimente/');
      const startsAt =
        meta.startsAt ?? (item.date ? new Date(item.date).toISOString() : new Date().toISOString());

      const matchedVenue = resolveVenue(
        `${title} ${meta.venueName ?? ''} ${meta.streetAddress ?? ''}`,
        link,
        'centrulDeProiecte',
      );
      let lat = matchedVenue.lat;
      let lon = matchedVenue.lon;
      let venueLabel = matchedVenue.venue;

      if (meta.venueName || meta.streetAddress) {
        venueLabel = meta.streetAddress
          ? `${meta.venueName ?? 'Centrul de Proiecte Timișoara'} (${meta.streetAddress})`
          : meta.venueName!;
        const isDefaultFallback = matchedVenue === defaultSourceVenues.centrulDeProiecte;
        if (meta.streetAddress && isDefaultFallback) {
          const geocoded = await geocodeTimisoaraStreet(meta.streetAddress);
          if (geocoded) {
            lat = geocoded.lat;
            lon = geocoded.lon;
          }
        }
      }

      events.push({
        id: `cdp-${item.id ?? events.length}`,
        title,
        category: classifyEventCategory(item.class_list, title),
        venue: venueLabel,
        lat,
        lon,
        startsAt,
        endsAt: meta.endsAt,
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
