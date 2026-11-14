export type PlacePhotoSource = 'osm' | 'wikimedia' | 'wikipedia' | 'satellite';

export type PlacePhoto = {
  url: string;
  thumbUrl: string;
  title: string;
  source: PlacePhotoSource;
  attribution?: string;
  pageUrl?: string;
};

export type SatelliteTilePreview = {
  tileUrl: string;
  zoom: number;
  x: number;
  y: number;
  fracX: number;
  fracY: number;
};

type CacheEntry = PlacePhoto[] | Promise<PlacePhoto[]>;
const placePhotosCache = new Map<string, CacheEntry>();

const STOPWORDS = new Set([
  'timisoara',
  'timis',
  'romania',
  'din',
  'sau',
  'pentru',
  'care',
  'cel',
  'cea',
  'sub',
  'langa',
  'la',
  'the',
  'and',
  'for',
  'with',
  'nr',
  'str',
  'foto',
  'photo',
  'image',
  'img',
  'dsc',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'wikipedia',
  'commons',
]);

const GENERIC_PENALTY_WORDS = [
  'map',
  'harta',
  'diagram',
  'logo',
  'stema',
  'coat_of_arms',
  'flag',
  'steag',
  'plan',
  'sigla',
  'svg',
  'icon',
];

export function getSatelliteTilePreview(lat: number, lon: number, zoom = 18): SatelliteTilePreview {
  const safeZoom = Math.max(1, Math.min(19, Math.round(zoom)));
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const clampedLon = Math.max(-180, Math.min(180, lon));
  const n = 2 ** safeZoom;
  const xFloat = ((clampedLon + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const maxIdx = n - 1;
  const x = Math.max(0, Math.min(maxIdx, Math.floor(xFloat)));
  const y = Math.max(0, Math.min(maxIdx, Math.floor(yFloat)));
  const fracX = Math.max(4, Math.min(96, (xFloat - Math.floor(xFloat)) * 100));
  const fracY = Math.max(4, Math.min(96, (yFloat - Math.floor(yFloat)) * 100));

  return {
    // Esri ArcGIS World Imagery tiles use /tile/{z}/{y}/{x} order.
    tileUrl: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${safeZoom}/${y}/${x}`,
    zoom: safeZoom,
    x,
    y,
    fracX,
    fracY,
  };
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(file|fisier):/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

export function scoreWikimediaCandidate(fileTitle: string, placeName: string): number {
  const normCandidate = normalizeText(fileTitle);
  const normPlace = normalizeText(placeName);
  if (!normCandidate || !normPlace) return 0;

  let score = 0;
  const placeTokens = meaningfulTokens(placeName);
  const candidateTokens = new Set(meaningfulTokens(fileTitle));

  if (normPlace.length >= 5 && normCandidate.includes(normPlace)) {
    score += 6;
  }

  for (const token of placeTokens) {
    if (candidateTokens.has(token)) {
      score += 2;
    } else if (normCandidate.includes(token)) {
      score += 1;
    }
  }

  for (const bad of GENERIC_PENALTY_WORDS) {
    if (normCandidate.includes(bad)) {
      score -= 4;
    }
  }

  if (/^(img|dsc|dscn|pxl|p\d{6,})/.test(normCandidate)) {
    score -= 1;
  }

  return score;
}

function cleanCommonsTitle(title: string): string {
  return title
    .replace(/^(File|Fișier|Fisier):/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function stripHtmlTags(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('json')) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type CommonsQueryResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          mime?: string;
          descriptionurl?: string;
          extmetadata?: {
            Artist?: { value?: string };
            LicenseShortName?: { value?: string };
          };
        }>;
      }
    >;
  };
};

function commonsPagesToPhotos(
  pages: NonNullable<NonNullable<CommonsQueryResponse['query']>['pages']>,
  placeName: string,
  minScore: number
): Array<{ photo: PlacePhoto; score: number }> {
  const results: Array<{ photo: PlacePhoto; score: number }> = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const mime = (info.mime || '').toLowerCase();
    if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      continue;
    }
    const rawTitle = page.title || 'Fotografie Wikimedia Commons';
    const score = scoreWikimediaCandidate(rawTitle, placeName);
    if (score < minScore) continue;
    const artist = stripHtmlTags(info.extmetadata?.Artist?.value);
    const license = stripHtmlTags(info.extmetadata?.LicenseShortName?.value);
    const attribution = [artist, license].filter(Boolean).join(' · ') || 'Wikimedia Commons';
    results.push({
      score,
      photo: {
        url: info.thumburl || info.url,
        thumbUrl: info.thumburl || info.url,
        title: cleanCommonsTitle(rawTitle),
        source: 'wikimedia',
        attribution,
        pageUrl: info.descriptionurl,
      },
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

async function fetchCommonsByTitle(title: string, placeName: string): Promise<PlacePhoto[]> {
  const normalized = title.startsWith('File:') || title.startsWith('Category:') ? title : `File:${title}`;
  const isCategory = normalized.startsWith('Category:');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '900',
  });
  if (isCategory) {
    params.set('generator', 'categorymembers');
    params.set('gcmtitle', normalized);
    params.set('gcmtype', 'file');
    params.set('gcmlimit', '5');
  } else {
    params.set('titles', normalized);
  }
  const data = await fetchJson<CommonsQueryResponse>(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  const pages = data?.query?.pages;
  if (!pages) return [];
  return commonsPagesToPhotos(pages, placeName, -10).map(item => item.photo);
}

async function fetchWikipediaSummary(lang: string, pageTitle: string): Promise<PlacePhoto | null> {
  const safeLang = /^[a-z-]{2,12}$/i.test(lang) ? lang.toLowerCase() : 'ro';
  const url = `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
  const data = await fetchJson<{
    title?: string;
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  }>(url);
  const imageUrl = data?.thumbnail?.source || data?.originalimage?.source;
  if (!imageUrl) return null;
  return {
    url: data.originalimage?.source || imageUrl,
    thumbUrl: imageUrl,
    title: data.title || pageTitle,
    source: 'wikipedia',
    attribution: `Wikipedia (${safeLang.toUpperCase()})`,
    pageUrl: data.content_urls?.desktop?.page,
  };
}

async function fetchOsmTagPhotos(placeId: string, placeName: string): Promise<PlacePhoto[]> {
  const cleanOsmId = placeId.replace(/^osm:/, '');
  if (!/^(node|way|relation)\/\d+$/.test(cleanOsmId)) return [];
  const data = await fetchJson<{ elements?: Array<{ tags?: Record<string, string> }> }>(
    `https://api.openstreetmap.org/api/0.6/${cleanOsmId}.json`
  );
  const tags = data?.elements?.[0]?.tags;
  if (!tags) return [];

  const photos: PlacePhoto[] = [];

  if (tags.image) {
    const rawImg = tags.image.trim();
    const commonsMatch = rawImg.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i);
    if (commonsMatch) {
      photos.push(...(await fetchCommonsByTitle(decodeURIComponent(commonsMatch[1]), placeName)));
    } else if (/^File:/i.test(rawImg)) {
      photos.push(...(await fetchCommonsByTitle(rawImg, placeName)));
    } else if (/^https?:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(rawImg)) {
      photos.push({
        url: rawImg,
        thumbUrl: rawImg,
        title: placeName,
        source: 'osm',
        attribution: 'OpenStreetMap (tag image)',
      });
    }
  }

  if (tags.wikimedia_commons && photos.length < 3) {
    photos.push(...(await fetchCommonsByTitle(tags.wikimedia_commons.trim(), placeName)));
  }

  if (tags.wikipedia && photos.length === 0) {
    const [maybeLang, ...rest] = tags.wikipedia.split(':');
    const lang = rest.length > 0 ? maybeLang : 'ro';
    const title = (rest.length > 0 ? rest.join(':') : tags.wikipedia).trim();
    if (title) {
      const wpPhoto = await fetchWikipediaSummary(lang, title);
      if (wpPhoto) photos.push(wpPhoto);
    }
  }

  return photos;
}

async function fetchCommonsGeosearchPhotos(lat: number, lon: number, placeName: string): Promise<PlacePhoto[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'geosearch',
    ggsprimary: 'all',
    ggsnamespace: '6',
    ggsradius: '250',
    ggscoord: `${lat}|${lon}`,
    ggslimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '900',
  });
  const data = await fetchJson<CommonsQueryResponse>(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  const pages = data?.query?.pages;
  if (!pages) return [];
  // Require at least one matching token in filename so we don't mislabel unrelated nearby buildings.
  return commonsPagesToPhotos(pages, placeName, 1)
    .slice(0, 4)
    .map(item => item.photo);
}

async function fetchWikipediaGeosearchPhotos(lat: number, lon: number, placeName: string): Promise<PlacePhoto[]> {
  for (const lang of ['ro', 'en'] as const) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'geosearch',
      ggsradius: '250',
      ggscoord: `${lat}|${lon}`,
      ggslimit: '6',
      prop: 'pageimages|info',
      piprop: 'thumbnail|original',
      pithumbsize: '900',
      inprop: 'url',
    });
    const data = await fetchJson<{
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            fullurl?: string;
            thumbnail?: { source?: string };
            original?: { source?: string };
          }
        >;
      };
    }>(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`);
    const pages = data?.query?.pages;
    if (!pages) continue;

    const matched: Array<{ photo: PlacePhoto; score: number }> = [];
    for (const page of Object.values(pages)) {
      const thumb = page.thumbnail?.source;
      const orig = page.original?.source;
      const title = page.title || '';
      if (!thumb && !orig) continue;
      const score = scoreWikimediaCandidate(title, placeName);
      if (score < 2) continue;
      matched.push({
        score,
        photo: {
          url: orig || thumb || '',
          thumbUrl: thumb || orig || '',
          title,
          source: 'wikipedia',
          attribution: `Wikipedia (${lang.toUpperCase()})`,
          pageUrl: page.fullurl,
        },
      });
    }
    if (matched.length > 0) {
      matched.sort((a, b) => b.score - a.score);
      return matched.slice(0, 3).map(m => m.photo);
    }
  }
  return [];
}

function dedupePhotos(photos: PlacePhoto[]): PlacePhoto[] {
  const seen = new Set<string>();
  const unique: PlacePhoto[] = [];
  for (const photo of photos) {
    if (!photo.url || seen.has(photo.url)) continue;
    seen.add(photo.url);
    unique.push(photo);
  }
  return unique;
}

export function getCachedPlacePhotos(placeId: string): PlacePhoto[] | undefined {
  const entry = placePhotosCache.get(placeId);
  return Array.isArray(entry) ? entry : undefined;
}

export async function fetchPlacePhotos(place: {
  id: string;
  title: string;
  location: { lat: number; lon: number };
}): Promise<PlacePhoto[]> {
  const existing = placePhotosCache.get(place.id);
  if (Array.isArray(existing)) return existing;
  if (existing) return existing;

  const task = (async () => {
    const collected: PlacePhoto[] = [];

    const osmPhotos = await fetchOsmTagPhotos(place.id, place.title);
    collected.push(...osmPhotos);

    if (collected.length < 3) {
      const commonsPhotos = await fetchCommonsGeosearchPhotos(place.location.lat, place.location.lon, place.title);
      collected.push(...commonsPhotos);
    }

    if (collected.length === 0) {
      const wikiPhotos = await fetchWikipediaGeosearchPhotos(place.location.lat, place.location.lon, place.title);
      collected.push(...wikiPhotos);
    }

    const unique = dedupePhotos(collected).slice(0, 4);
    placePhotosCache.set(place.id, unique);
    return unique;
  })().catch(() => {
    placePhotosCache.delete(place.id);
    return [] as PlacePhoto[];
  });

  placePhotosCache.set(place.id, task);
  return task;
}
