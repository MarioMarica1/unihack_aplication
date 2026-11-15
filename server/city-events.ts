import {
  filterAndSortActiveCityEvents,
  getBucharestDateKey,
  isCityEventExpired,
  type OfficialCityEvent,
} from '../src/city-events-utils.ts';

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

type ParsedCdpCard = {
  title: string;
  categoryRaw: string;
  venueRaw: string;
  officialUrl: string;
  startsAt: string;
  endsAt?: string;
  timeLabel?: string;
};

const CDP_CALENDAR_URL = 'https://centruldeproiecte.ro/calendar/';
const VT_EVENTS_URL = 'https://visit-timisoara.com/wp-json/wp/v2/events-visit?per_page=100';

let cache: { until: number; promise: Promise<{ events: OfficialCityEvent[]; fetchedAt: string }> } | undefined;

const timisoaraVenues: Array<{
  pattern: RegExp;
  venue: string;
  lat: number;
  lon: number;
}> = [
  { pattern: /filarmonic|capitol|simfonic|orchestr|recital|vioar|pian|cvartet/i, venue: 'Filarmonica Banatul (Sala Capitol)', lat: 45.75056, lon: 21.22622 },
  { pattern: /oper[aă]|teatru[l]?\s+na[țt]ional|dramatic|german|maghiar/i, venue: 'Opera Națională / Teatrul Național (Piața Victoriei)', lat: 45.75439, lon: 21.22606 },
  { pattern: /faber|cinci hectare|splaiul peneș|ambasada/i, venue: 'FABER Timișoara (Splaiul Peneș Curcanul 4-5)', lat: 45.76139, lon: 21.25158 },
  { pattern: /karl\s*kunz|palatul\s*kunz|3\s*august/i, venue: 'Palatul Karl Kunz (Bd. 3 August 1919 nr. 2)', lat: 45.75629, lon: 21.24465 },
  { pattern: /victoria|cinema victoria|bălcescu/i, venue: 'Cinema Victoria (Piața Bălcescu)', lat: 45.74131, lon: 21.22453 },
  { pattern: /cinema timiș|cinema timis/i, venue: 'Cinema Timiș (Piața Victoriei 7)', lat: 45.75152, lon: 21.22551 },
  { pattern: /cinema studio|nikolaus lenau/i, venue: 'Cinema Studio (Str. Nikolaus Lenau 2)', lat: 45.75243, lon: 21.22604 },
  { pattern: /cinema johnny/i, venue: 'Cinema Johnny Timișoara', lat: 45.73325, lon: 21.19092 },
  { pattern: /galeria\s*helios/i, venue: 'Galeria Helios (Piața Victoriei 6)', lat: 45.75201, lon: 21.22445 },
  { pattern: /bastion|theresia|therezia|martin luther|hector|indecis|habitat\s*b1|muzeul național al banatului/i, venue: 'Bastionul Maria Theresia (Str. Hector nr. 1)', lat: 45.75678, lon: 21.23423 },
  { pattern: /corneliu\s*miklo[sș]|take\s*ionescu\s*83|\bmx\b/i, venue: 'MX | Muzeul Corneliu Mikloși (Bd. Take Ionescu 83)', lat: 45.76300, lon: 21.24588 },
  { pattern: /unirii|muzeul de artă|baroc|sârb|tambure/i, venue: 'Piața Unirii / Muzeul Național de Artă', lat: 45.75723, lon: 21.22908 },
  { pattern: /galeria\s*5|vasile alecsandri|centrul de proiecte/i, venue: 'Centrul de Proiecte / Galeria 5 (Str. Vasile Alecsandri nr. 1)', lat: 45.75627, lon: 21.22777 },
  { pattern: /libertății|libertatii|garnizoan/i, venue: 'Piața Libertății Timișoara', lat: 45.75568, lon: 21.22730 },
  { pattern: /c[ăa]rture[șs]ti\s*mercy|str\.?\s*(?:florimund\s*)?mercy/i, venue: 'Librăria Cărturești Mercy (Str. Florimund Mercy 7)', lat: 45.75672, lon: 21.22884 },
  { pattern: /casa tineretului|arie[șs]\s*19/i, venue: 'Casa Tineretului (Str. Arieș 19)', lat: 45.74166, lon: 21.23926 },
  { pattern: /universitatea de vest|\buvt\b/i, venue: 'Universitatea de Vest din Timișoara', lat: 45.74723, lon: 21.23129 },
  { pattern: /jecza/i, venue: 'Fundația / Galeria Jecza (Calea Martirilor 51/52-54)', lat: 45.72786, lon: 21.23794 },
  { pattern: /c\.?\s*d\.?\s*loga|diaconovici\s*loga/i, venue: 'Colegiul Național C. D. Loga (Bd. C. D. Loga 37)', lat: 45.75302, lon: 21.23425 },
  { pattern: /emanuil\s*ungureanu|miron\s*costin/i, venue: 'Colegiul Tehnic Emanuil Ungureanu (Piața Iancu Huniade 3)', lat: 45.75211, lon: 21.22814 },
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

const namedHtmlEntities: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  acirc: 'â',
  Acirc: 'Â',
  icirc: 'î',
  Icirc: 'Î',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z]+);/gi, (full, name: string) => namedHtmlEntities[name] ?? full)
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

/**
 * Parses single dates ("15 noiembrie 2026 , 18:00"), same-month ranges ("13–16 noiembrie 2026"),
 * multi-month ranges ("24 septembrie – 15 noiembrie 2026"), and cross-year ranges
 * ("6 noiembrie 2026 – 30 ianuarie 2027") into UTC midnight calendar ISO bounds + timeLabel.
 */
export function parseRomanianDateRangeIso(snippet: string): {
  startsAt?: string;
  endsAt?: string;
  timeLabel?: string;
} {
  const clean = decodeHtmlEntities(snippet);
  const m = clean.match(
    /(\d{1,2})(?:\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie))?(?:\s+(\d{4}))?(?:\s*[–-]\s*(\d{1,2})(?:\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie))?\s+(\d{4}))?(?:\s*,?\s*(\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?))?/i,
  );
  if (!m) return {};

  const dayStart = Number(m[1]);
  const monthStartName = (m[2] || m[5] || '').toLowerCase();
  const monthStart = romanianMonths[monthStartName];
  const startYear = Number(m[3] || m[6]);

  if (!monthStart || !startYear || dayStart < 1 || dayStart > 31) return {};

  const pad = (n: number) => String(n).padStart(2, '0');
  const startsAt = `${startYear}-${pad(monthStart)}-${pad(dayStart)}T00:00:00.000Z`;

  let endsAt: string | undefined;
  if (m[4]) {
    const dayEnd = Number(m[4]);
    const monthEndName = (m[5] || m[2] || '').toLowerCase();
    const monthEnd = romanianMonths[monthEndName];
    const endYear = Number(m[6] || m[3]);
    if (monthEnd && endYear && dayEnd >= 1 && dayEnd <= 31) {
      endsAt = `${endYear}-${pad(monthEnd)}-${pad(dayEnd)}T00:00:00.000Z`;
    }
  }

  const timeLabel = m[7] ? m[7].replace(/\s*-\s*/g, ' – ').replace(/\s+/g, ' ').trim() : undefined;
  return { startsAt, endsAt, timeLabel };
}

function buildNominatimQuery(venueRaw: string): string {
  const addressPart = venueRaw.split(',')[0]?.trim() || venueRaw;
  const preferred = /,/.test(venueRaw) && /\b(str|strada|bd|blv|bulevardul|splaiul|calea|piata|piața|nr)\b/i.test(venueRaw)
    ? venueRaw
    : addressPart;
  return preferred
    .replace(/\bSAD\s*\d+\b/gi, '')
    .replace(/,\s*timi[șs]oara/gi, '')
    .replace(/,\s*nr\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocodeTimisoaraStreet(address: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (streetCoordsCache.has(key)) return streetCoordsCache.get(key) ?? null;

  const clean = buildNominatimQuery(address);
  if (clean.length < 4) {
    streetCoordsCache.set(key, null);
    return null;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=21.14,45.82,21.32,45.69&bounded=1&q=${encodeURIComponent(`${clean}, Timișoara`)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(1800),
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

export function parseCdpCalendarHtml(html: string): ParsedCdpCard[] {
  const listStart = html.indexOf('id="_dynamic_list-4-8525"');
  if (listStart < 0) return [];
  const sectionEnd = html.indexOf('</section>', listStart);
  const section = html.slice(listStart, sectionEnd > listStart ? sectionEnd : undefined);
  const rawCards = section.split(/id="div_block-5-8525-\d+"/).slice(1);

  const parsed: ParsedCdpCard[] = [];
  for (const card of rawCards) {
    const titleMatch = card.match(/data-id="span-138-8525"[^>]*>([\s\S]*?)<\/span>/i);
    const title = decodeHtmlEntities(titleMatch?.[1] ?? '');
    if (!title) continue;

    const dateBlockMatch = card.match(/data-id="div_block-129-8525"[^>]*>([\s\S]*?)<\/div>\s*<h1/i);
    const dateParsed = parseRomanianDateRangeIso(dateBlockMatch?.[1] ?? '');
    if (!dateParsed.startsAt) continue;

    const catMatch = card.match(/data-id="code_block-149-8525"[^>]*>([\s\S]*?)<\/div>/i);
    const venueMatch = card.match(/data-id="span-140-8525"[^>]*>([\s\S]*?)<\/span>/i);
    const aTag = card.match(/<a[^>]*data-id="link-141-8525"[^>]*>/i)?.[0] ?? '';
    const hrefMatch = aTag.match(/href="([^"]+)"/i);

    parsed.push({
      title,
      categoryRaw: decodeHtmlEntities(catMatch?.[1] ?? ''),
      venueRaw: decodeHtmlEntities(venueMatch?.[1] ?? ''),
      officialUrl: (hrefMatch?.[1] ?? CDP_CALENDAR_URL).replace(/&amp;/g, '&').trim(),
      startsAt: dateParsed.startsAt,
      endsAt: dateParsed.endsAt,
      timeLabel: dateParsed.timeLabel,
    });
  }
  return parsed;
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

function classifyEventCategory(hints: string[] = [], title = ''): string {
  const hay = `${hints.join(' ')} ${title}`.toLocaleLowerCase('ro');
  if (/concert|muzic|filarmonic|simfonic|recital/.test(hay)) return 'Concert & Muzică';
  if (/expozi[tț]ie|vernisaj|art[aă]|galeri|instala[tț]ie/.test(hay)) return 'Expoziție & Arte Vizuale';
  if (/teatru|spectacol|lectur[aă]|literatur|carte|performance/.test(hay)) return 'Teatru & Literatură';
  if (/film|cinema|proiec[tț]ie/.test(hay)) return 'Film & Cinema';
  return 'Eveniment Cultural & Comunitar';
}

function normalizeTitleTokens(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function primaryTitleSegment(title: string): string {
  const head = title.split(/\s*[|–—]\s*|\s+-\s+/)[0] ?? title;
  return normalizeTitleTokens(head);
}

function findDuplicateEvent<T extends { title: string; startsAt: string }>(
  items: readonly T[],
  title: string,
  startsAt: string,
): T | undefined {
  const dayKey = getBucharestDateKey(startsAt);
  const norm = normalizeTitleTokens(title);
  const head = primaryTitleSegment(title);
  if (!norm) return undefined;

  return items.find(ev => {
    if (getBucharestDateKey(ev.startsAt) !== dayKey) return false;
    const prevNorm = normalizeTitleTokens(ev.title);
    if (prevNorm === norm) return true;
    if (prevNorm.length >= 12 && norm.length >= 12 && (prevNorm.includes(norm) || norm.includes(prevNorm))) {
      return true;
    }
    const prevHead = primaryTitleSegment(ev.title);
    return prevHead.length >= 14 && head.length >= 14 && prevHead === head;
  });
}

function unixSecondsToIsoDate(raw: number | string | undefined): string | undefined {
  const sec = Number(raw ?? 0);
  if (!Number.isFinite(sec) || sec <= 1_000_000_000) return undefined;
  return new Date(sec * 1000).toISOString();
}

async function fetchLiveCityEvents(now = new Date()): Promise<{ events: OfficialCityEvent[]; fetchedAt: string }> {
  const [vtRes, cdpRes] = await Promise.allSettled([
    fetch(VT_EVENTS_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    }).then(r => (r.ok ? (r.json() as Promise<WpEventItem[]>) : [])),
    fetch(CDP_CALENDAR_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'text/html' },
    }).then(r => (r.ok ? r.text() : '')),
  ]);

  const events: OfficialCityEvent[] = [];

  if (vtRes.status === 'fulfilled' && Array.isArray(vtRes.value)) {
    const hasRomanian = vtRes.value.some(other => String(other.link ?? '').includes('/ro/'));
    for (const item of vtRes.value) {
      const link = String(item.link ?? '');
      if (link && hasRomanian && !link.includes('/ro/')) continue;

      const title = decodeHtmlEntities(String(item.title?.rendered ?? ''));
      if (!title) continue;

      const startsAt =
        unixSecondsToIsoDate(item.meta?.starting_date) ??
        (item.date ? new Date(item.date).toISOString() : undefined);
      if (!startsAt) continue;

      const rawEnd = unixSecondsToIsoDate(item.meta?.ending_date);
      const endsAt =
        rawEnd && getBucharestDateKey(rawEnd) >= getBucharestDateKey(startsAt) ? rawEnd : undefined;

      if (isCityEventExpired({ startsAt, endsAt }, now)) continue;
      if (findDuplicateEvent(events, title, startsAt)) continue;

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
        timeLabel: item.meta?.starting_time ? decodeHtmlEntities(String(item.meta.starting_time)) : undefined,
        source: 'Visit Timișoara',
        officialUrl: link || webLink,
        ticketsUrl,
      });
    }
  }

  if (cdpRes.status === 'fulfilled' && typeof cdpRes.value === 'string' && cdpRes.value) {
    const cards = parseCdpCalendarHtml(cdpRes.value).filter(
      card => !isCityEventExpired({ startsAt: card.startsAt, endsAt: card.endsAt }, now),
    );

    const resolveCardCoords = (card: ParsedCdpCard) => {
      const matchedVenue = resolveVenue(
        `${card.title} ${card.venueRaw}`,
        card.officialUrl,
        'centrulDeProiecte',
      );
      let lat = matchedVenue.lat;
      let lon = matchedVenue.lon;
      let venueLabel = matchedVenue.venue;

      if (card.venueRaw) {
        venueLabel = card.venueRaw;
        if (matchedVenue === defaultSourceVenues.centrulDeProiecte) {
          const cachedCoords = streetCoordsCache.get(card.venueRaw.trim().toLowerCase());
          if (cachedCoords) {
            lat = cachedCoords.lat;
            lon = cachedCoords.lon;
          }
        }
      }
      return { venueLabel, lat, lon };
    };

    const unresolvedVenues: string[] = [];
    for (const card of cards) {
      if (!card.venueRaw) continue;
      const matched = resolveVenue(`${card.title} ${card.venueRaw}`, card.officialUrl, 'centrulDeProiecte');
      if (matched === defaultSourceVenues.centrulDeProiecte && !unresolvedVenues.includes(card.venueRaw) && unresolvedVenues.length < 6) {
        unresolvedVenues.push(card.venueRaw);
      }
    }
    await Promise.all(unresolvedVenues.map(addr => geocodeTimisoaraStreet(addr)));

    const cdpAdded: ParsedCdpCard[] = [];
    for (const card of cards) {
      const dupExisting = findDuplicateEvent(events, card.title, card.startsAt);
      if (dupExisting) {
        if (dupExisting.venue === defaultSourceVenues.visitTimisoara.venue && card.venueRaw) {
          const coords = resolveCardCoords(card);
          dupExisting.venue = coords.venueLabel;
          dupExisting.lat = coords.lat;
          dupExisting.lon = coords.lon;
        }
        continue;
      }
      if (findDuplicateEvent(cdpAdded, card.title, card.startsAt)) continue;
      cdpAdded.push(card);

      const { venueLabel, lat, lon } = resolveCardCoords(card);
      events.push({
        id: `cdp-${getBucharestDateKey(card.startsAt)}-${cdpAdded.length - 1}`,
        title: card.title,
        category: classifyEventCategory([card.categoryRaw], card.title),
        venue: venueLabel,
        lat,
        lon,
        startsAt: card.startsAt,
        endsAt: card.endsAt,
        timeLabel: card.timeLabel,
        source: 'Centrul de Proiecte PMT',
        officialUrl: card.officialUrl || CDP_CALENDAR_URL,
      });
    }
  }

  return {
    events: filterAndSortActiveCityEvents(events, now, 'desc'),
    fetchedAt: now.toISOString(),
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
    const freshEvents = filterAndSortActiveCityEvents(data.events, new Date(), 'desc');
    return Response.json(
      {
        events: freshEvents,
        fetchedAt: data.fetchedAt,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch {
    if (cache === current) cache = undefined;
    return Response.json(
      { events: [], error: 'Fluxul oficial de evenimente este indisponibil momentan.' },
      { status: 502 },
    );
  }
}
