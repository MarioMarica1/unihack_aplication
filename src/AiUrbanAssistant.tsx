import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bot,
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  Route,
  Send,
  Sparkles,
  TrainFront,
  Wrench,
  X,
} from 'lucide-react';
import type { Pin, Point } from './domain';
import { distance } from './domain';
import type { MapPlace } from './infrastructure';
import type { MunicipalReport, MunicipalReportDetail } from './municipal-reports';
import { municipalStatuses } from './municipal-reports';
import type { LiveVehicle, StptAlert } from './stpt-live';
import type { LineSummary } from './transitRouter';
import { vehicleLabels } from './transitRouter';
import type { VeloStation } from './velo-live';
import type { OfficialCityEvent } from './city-events';
import type { RouteMode, SidebarTab } from './App';
import { normalizeSearch } from './place-catalog';

export type RouteCandidate = {
  title: string;
  location: Point;
};

export type AiAssistantActionCallbacks = {
  onPlanRoute: (params: {
    origin?: RouteCandidate;
    destination: RouteCandidate;
    waypoints?: RouteCandidate[];
    mode?: RouteMode;
  }) => void;
  onSelectTransportLine: (line: string, direction?: 'tur' | 'retur') => void;
  onInspectPlace: (place: MapPlace) => void;
  onSwitchModule: (tab: SidebarTab) => void;
};

export type AiUrbanAssistantProps = {
  open: boolean;
  onToggleOpen: () => void;
  activeModule: SidebarTab;
  pointA: RouteCandidate;
  pointB: RouteCandidate | null;
  userLocation?: Point;
  routeCandidates: RouteCandidate[];
  lineSummaries: LineSummary[];
  liveVehicles: LiveVehicle[];
  stptAlerts: StptAlert[];
  municipalReports: MunicipalReport[];
  veloStations: VeloStation[];
  cityEvents: OfficialCityEvent[];
  selectedVehicle?: LiveVehicle;
  selectedTransportLine: string;
  selectedTransportDirection: 'tur' | 'retur';
  selectedPlace: MapPlace | null;
  selectedMunicipal?: MunicipalReport;
  municipalDetail?: MunicipalReportDetail;
  selectedPin?: Pin;
  selectedVeloStation: VeloStation | null;
  selectedCityEvent: OfficialCityEvent | null;
  callbacks: AiAssistantActionCallbacks;
};

type ToolExecutionRecord = {
  toolName: 'plan_route' | 'inspect_active_entity' | 'isolate_transit_line' | 'query_osm_wikipedia_rag';
  summary: string;
};

type ChatEntry = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: string;
  toolCall?: ToolExecutionRecord;
  sourceUrl?: string;
  sourceLabel?: string;
  quickRoute?: {
    destination: RouteCandidate;
    mode?: RouteMode;
  };
};

// Curated Timișoara Landmark Gazetteer for instant high-accuracy resolution before Nominatim fallback
const TIMISOARA_LANDMARKS: { keywords: string[]; title: string; location: Point; wikiTitle: string }[] = [
  {
    keywords: ['iulius town', 'iulius mall', 'iulius', 'united business center', 'ubc'],
    title: 'Iulius Town Timișoara',
    location: { lon: 21.2285, lat: 45.7662 },
    wikiTitle: 'Iulius_Town_Timișoara',
  },
  {
    keywords: ['aeroport', 'airport', 'traian vuia', 'aeroportul international', 'zbor'],
    title: 'Aeroportul Internațional Traian Vuia Timișoara',
    location: { lon: 21.3208, lat: 45.8086 },
    wikiTitle: 'Aeroportul_Internațional_Timișoara_-_Traian_Vuia',
  },
  {
    keywords: ['gara de nord', 'gara nord', 'gara timisoara', 'la gara', 'spre gara', 'train station', 'railway station'],
    title: 'Gara Timișoara Nord',
    location: { lon: 21.2067, lat: 45.7511 },
    wikiTitle: 'Gara_Timișoara_Nord',
  },
  {
    keywords: ['domul romano-catolic', 'domul catolic', 'domul din piata unirii', 'catedrala sfantul gheorghe', 'sf. gheorghe', 'domul'],
    title: 'Domul Romano-Catolic Sfântul Gheorghe (Piața Unirii)',
    location: { lon: 21.2298, lat: 45.758 },
    wikiTitle: 'Domul_Romano-Catolic_din_Timișoara',
  },
  {
    keywords: ['catedrala mitropolitana', 'catedrala ortodoxa', 'trei ierarhi', 'catedrala'],
    title: 'Catedrala Mitropolitană din Timișoara',
    location: { lon: 21.2243, lat: 45.7508 },
    wikiTitle: 'Catedrala_Mitropolitană_din_Timișoara',
  },
  {
    keywords: ['piata unirii', 'union square'],
    title: 'Piața Unirii, Timișoara',
    location: { lon: 21.2289, lat: 45.758 },
    wikiTitle: 'Piața_Unirii_din_Timișoara',
  },
  {
    keywords: ['piata victoriei', 'piata operei', 'victory square', 'opera nationala', 'teatrul national'],
    title: 'Piața Victoriei / Opera Națională Română Timișoara',
    location: { lon: 21.2257, lat: 45.7537 },
    wikiTitle: 'Piața_Victoriei_din_Timișoara',
  },
  {
    keywords: ['piata libertatii', 'liberty square', 'primaria veche'],
    title: 'Piața Libertății, Timișoara',
    location: { lon: 21.2273, lat: 45.7556 },
    wikiTitle: 'Piața_Libertății_din_Timișoara',
  },
  {
    keywords: ['bastion', 'bastionul theresia', 'maria theresia'],
    title: 'Bastionul Maria Theresia, Timișoara',
    location: { lon: 21.2333, lat: 45.7568 },
    wikiTitle: 'Bastionul_Theresia',
  },
  {
    keywords: ['castelul huniade', 'muzeul national al banatului', 'huniade'],
    title: 'Castelul Huniade, Timișoara',
    location: { lon: 21.2269, lat: 45.753 },
    wikiTitle: 'Castelul_Huniade',
  },
  {
    keywords: ['uvt', 'universitatea de vest', 'west university'],
    title: 'Universitatea de Vest din Timișoara (UVT)',
    location: { lon: 21.2316, lat: 45.7471 },
    wikiTitle: 'Universitatea_de_Vest_din_Timișoara',
  },
  {
    keywords: ['upt', 'universitatea politehnica', 'politehnica', 'electro', 'automatica'],
    title: 'Universitatea Politehnica Timișoara (UPT)',
    location: { lon: 21.2261, lat: 45.7534 },
    wikiTitle: 'Universitatea_Politehnica_Timișoara',
  },
  {
    keywords: ['spitalul judetean', 'pius brinzeu', 'urgente', 'spitalul clinic judetean'],
    title: 'Spitalul Clinic Județean de Urgență „Pius Brînzeu”',
    location: { lon: 21.2415, lat: 45.7381 },
    wikiTitle: 'Spitalul_Clinic_Județean_de_Urgență_„Pius_Brînzeu”_din_Timișoara',
  },
  {
    keywords: ['shopping city', 'mall sagului', 'calea sagului mall'],
    title: 'Shopping City Timișoara',
    location: { lon: 21.2016, lat: 45.7244 },
    wikiTitle: 'Timișoara',
  },
  {
    keywords: ['parcul rozelor', 'rozelor'],
    title: 'Parcul Rozelor, Timișoara',
    location: { lon: 21.2312, lat: 45.7495 },
    wikiTitle: 'Parcul_Rozelor_din_Timișoara',
  },
];

async function geocodeLocation(
  rawQuery: string,
  candidates: RouteCandidate[],
): Promise<RouteCandidate | null> {
  const cleaned = rawQuery
    .replace(/^(la|spre|catre|către|pana la|până la|to|the|in|în|din|de la|from)\s+/i, '')
    .replace(/\s+(cu|by|using|via)\s+(tramvaiul|autobuzul|troleibuzul|bicicleta|masina|mașina|pe jos|walking|cycling|bus|tram|car).*$/i, '')
    .replace(/[?.!,]+$/g, '')
    .trim();
  if (!cleaned) return null;

  const norm = normalizeSearch(cleaned);

  // 1. Check curated Timișoara landmarks first
  for (const lm of TIMISOARA_LANDMARKS) {
    if (lm.keywords.some(k => norm === k || norm.includes(k))) {
      return { title: lm.title, location: lm.location };
    }
  }

  // 2. Check local OSM places & GTFS stops catalog
  const exactCandidate = candidates.find(c => normalizeSearch(c.title) === norm);
  if (exactCandidate) return exactCandidate;

  const partialCandidate = candidates.find(c => {
    const cn = normalizeSearch(c.title);
    return cn.includes(norm) || (norm.length >= 4 && norm.includes(cn));
  });
  if (partialCandidate) return partialCandidate;

  // 3. Live OpenStreetMap Nominatim Geocoding within Timișoara metropolitan area
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      `${cleaned}, Timișoara, România`,
    )}&limit=1&accept-language=ro`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { display_name?: string; name?: string; lat?: string; lon?: string }[];
      const hit = data[0];
      if (hit && hit.lat && hit.lon) {
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const shortTitle = hit.name || hit.display_name?.split(',').slice(0, 2).join(', ') || cleaned;
          return {
            title: shortTitle,
            location: { lon, lat },
          };
        }
      }
    }
  } catch {
    // ignore network error
  }

  return null;
}

function inferTravelMode(query: string): RouteMode {
  const norm = normalizeSearch(query);
  if (/\b(biciclet|velo|bike|cycling|pista)\b/.test(norm)) return 'cycling';
  if (/\b(pe jos|pietonal|walk|walking|plimbare)\b/.test(norm)) return 'walking';
  if (/\b(masin|auto|driving|car|sofat)\b/.test(norm)) return 'driving';
  return 'transit';
}

function parseNavigationIntent(query: string): {
  isNavigation: boolean;
  originRaw?: string;
  destinationRaw?: string;
  mode: RouteMode;
} {
  const trimmed = query.trim();
  const mode = inferTravelMode(trimmed);

  // Pattern: "de la X la Y" / "from X to Y"
  const fromToMatch = trimmed.match(
    /(?:de la|din|from)\s+(.+?)\s+(?:la|spre|către|catre|până la|pana la|to)\s+(.+?)(?:\s+cu\s+|\s+pe\s+jos|\s+by\s+|[?.!]|$)/i,
  );
  if (fromToMatch) {
    return {
      isNavigation: true,
      originRaw: fromToMatch[1].trim(),
      destinationRaw: fromToMatch[2].trim(),
      mode,
    };
  }

  // Pattern: "Take me to X", "How do I get to X", "Vreau să merg la X", "Cum ajung la X", "Du-mă la X", "Navighează la X", "Rută spre X"
  const navPatterns = [
    /(?:take me to|how do i get to|how to get to|navigate to|route to|directions to|go to)\s+(.+)/i,
    /(?:vreau să merg la|vreau sa merg la|vreau să ajung la|vreau sa ajung la|cum ajung la|cum pot ajunge la|cum merg la|du-mă la|du-ma la|navighează la|navigheaza la|navighează spre|navigheaza spre|rută spre|ruta spre|rută la|ruta la|traseu spre|traseu la|mergi la)\s+(.+)/i,
  ];

  for (const regex of navPatterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return {
        isNavigation: true,
        destinationRaw: match[1].trim(),
        mode,
      };
    }
  }

  return { isNavigation: false, mode };
}

async function fetchWikipediaSummary(
  subject: string,
  lang: 'ro' | 'en' = 'ro',
): Promise<{ title: string; extract: string; url: string } | null> {
  try {
    // Check curated wiki title first
    const norm = normalizeSearch(subject);
    const curated = TIMISOARA_LANDMARKS.find(lm => lm.keywords.some(k => norm.includes(k)));
    if (curated && lang === 'ro') {
      const directRes = await fetch(
        `https://ro.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(curated.wikiTitle)}`,
      );
      if (directRes.ok) {
        const d = (await directRes.json()) as {
          title?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (d.extract) {
          return {
            title: d.title || curated.title,
            extract: d.extract,
            url: d.content_urls?.desktop?.page || `https://ro.wikipedia.org/wiki/${curated.wikiTitle}`,
          };
        }
      }
    }

    // Search Wikipedia API
    const searchQ = subject.toLowerCase().includes('timișoara') || subject.toLowerCase().includes('timisoara')
      ? subject
      : `${subject} Timișoara`;
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchQ,
    )}&srlimit=2&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as {
      query?: { search?: { title: string }[] };
    };
    const firstTitle = searchData.query?.search?.[0]?.title;
    if (!firstTitle) return null;

    const sumRes = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`,
    );
    if (!sumRes.ok) return null;
    const sumData = (await sumRes.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!sumData.extract) return null;

    return {
      title: sumData.title || firstTitle,
      extract: sumData.extract,
      url: sumData.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(firstTitle)}`,
    };
  } catch {
    return null;
  }
}

async function fetchOsmPlaceMetadata(point: Point): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lon}&extratags=1&namedetails=1&accept-language=ro`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name?: string;
      display_name?: string;
      category?: string;
      type?: string;
      address?: { road?: string; house_number?: string; suburb?: string };
      extratags?: Record<string, string>;
    };
    const parts: string[] = [];
    if (data.name) parts.push(`Denumire OSM: **${data.name}**`);
    if (data.address?.road) {
      parts.push(
        `Adresă: ${data.address.road}${data.address.house_number ? ` nr. ${data.address.house_number}` : ''}${data.address.suburb ? `, cartier ${data.address.suburb}` : ''}`,
      );
    }
    const tags = data.extratags || {};
    if (tags.start_date || tags.year_of_construction) {
      parts.push(`An construire / inaugurare (OSM): **${tags.start_date || tags.year_of_construction}**`);
    }
    if (tags.architect) parts.push(`Arhitect: **${tags.architect}**`);
    if (tags['building:architecture'] || tags.architecture) {
      parts.push(`Stil arhitectural: **${tags['building:architecture'] || tags.architecture}**`);
    }
    if (tags.opening_hours) parts.push(`Program: ${tags.opening_hours}`);
    if (tags.website || tags['contact:website']) parts.push(`Website: ${tags.website || tags['contact:website']}`);
    return parts.length ? parts.join(' • ') : null;
  } catch {
    return null;
  }
}

export function AiUrbanAssistant(props: AiUrbanAssistantProps) {
  const {
    open,
    onToggleOpen,
    activeModule,
    pointA,
    userLocation,
    routeCandidates,
    lineSummaries,
    liveVehicles,
    stptAlerts,
    municipalReports,
    veloStations,
    cityEvents,
    selectedVehicle,
    selectedTransportLine,
    selectedTransportDirection,
    selectedPlace,
    selectedMunicipal,
    municipalDetail,
    selectedPin,
    selectedVeloStation,
    selectedCityEvent,
    callbacks,
  } = props;

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Salut! Sunt **Asistentul Urban AI** al platformei Urban Conect Timișoara. Sunt conectat la starea hărții, motorul de rutare A→B, flota STPT live, sesizările PMT, OpenStreetMap și Wikipedia.\n\nÎmi poți cere direct acțiuni (ex. *„Vreau să merg la gară”*, *„Take me to Iulius Town”*, *„Arată-mi tramvaiul 1”*) sau întrebări contextuale (*„Unde merge acest tramvai?”*, *„Când a fost construit Domul Romano-Catolic?”*).',
      timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Summarize current active selection for the live context pill inside the AI panel
  const activeContextLabel = (() => {
    if (selectedVehicle) {
      return `Vehicul selectat: ${vehicleLabels[selectedVehicle.type]} ${selectedVehicle.line} (${selectedVehicle.directionId === '1' ? 'Retur' : 'Tur'})`;
    }
    if (selectedPlace) {
      return `Reper selectat: ${selectedPlace.title}`;
    }
    if (selectedMunicipal) {
      return `Sesizare PMT: ${selectedMunicipal.number}`;
    }
    if (selectedVeloStation) {
      return `Stație VeloTM: ${selectedVeloStation.name}`;
    }
    if (selectedCityEvent) {
      return `Eveniment: ${selectedCityEvent.title}`;
    }
    if (selectedPin) {
      return `Postare selectată: ${selectedPin.title}`;
    }
    if (selectedTransportLine) {
      return `Linia STPT ${selectedTransportLine} (${selectedTransportDirection.toUpperCase()})`;
    }
    return `Modul activ: ${activeModule.toUpperCase()} · ${liveVehicles.length} vehicule live`;
  })();

  async function processUserPrompt(rawPrompt: string) {
    const prompt = rawPrompt.trim();
    if (!prompt || busy) return;

    const nowTime = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatEntry = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: nowTime,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const norm = normalizeSearch(prompt);

      // =========================================================================
      // TOOL 1: ACTIONABLE ROUTING (Function Calling: plan_route)
      // =========================================================================
      const navIntent = parseNavigationIntent(prompt);
      if (navIntent.isNavigation && navIntent.destinationRaw) {
        const destination = await geocodeLocation(navIntent.destinationRaw, routeCandidates);
        const origin = navIntent.originRaw
          ? (await geocodeLocation(navIntent.originRaw, routeCandidates)) ?? undefined
          : userLocation
            ? { title: 'Locația curentă (GPS)', location: userLocation }
            : pointA;

        if (destination) {
          callbacks.onPlanRoute({
            origin,
            destination,
            mode: navIntent.mode,
          });

          const modeName =
            navIntent.mode === 'cycling'
              ? 'Bicicletă (Velo)'
              : navIntent.mode === 'walking'
                ? 'Pietonal'
                : navIntent.mode === 'driving'
                  ? 'Auto'
                  : 'Transport Public STPT';

          const distMeters = Math.round(distance(origin.location, destination.location));
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'plan_route',
                summary: `plan_route(A="${origin.title}", B="${destination.title}", mode="${navIntent.mode}")`,
              },
              text: `Am activat **Planificatorul de călătorie (A → B)** și am desenat ruta direct pe hartă:\n• **Plecare (A):** ${origin.title}\n• **Destinație (B):** ${destination.title} (${(distMeters / 1000).toFixed(1)} km în linie dreaptă)\n• **Mod de deplasare:** ${modeName}`,
            },
          ]);
          return;
        }
      }

      // =========================================================================
      // TOOL 2: TRANSIT LINE ISOLATION (Function Calling: isolate_transit_line)
      // =========================================================================
      const lineMatch = prompt.match(
        /(?:arată-mi|arata-mi|afișează|afiseaza|izolează|izoleaza|unde este|unde e|show|track|find)\s+(?:linia|tramvaiul|troleibuzul|autobuzul|expresul|tram|bus|trolleybus|line)\s+([a-z0-9]+)/i,
      );
      if (lineMatch && lineMatch[1]) {
        const targetLine = lineMatch[1].toUpperCase();
        const dir: 'tur' | 'retur' = /\bretur\b/i.test(prompt) ? 'retur' : 'tur';
        const summary = lineSummaries.find(l => l.line.toUpperCase() === targetLine);
        const activeOnLine = liveVehicles.filter(v => v.line.toUpperCase() === targetLine);

        callbacks.onSelectTransportLine(targetLine, dir);

        const dirInfo = summary?.directions.find(d => d.dirKey === dir) ?? summary?.directions[0];
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'isolate_transit_line',
              summary: `isolate_transit_line(line="${targetLine}", direction="${dir}")`,
            },
            text: summary
              ? `Am izolat pe hartă exclusiv **${vehicleLabels[summary.type]} ${summary.line}** pe sensul **${dir.toUpperCase()}** (${dirInfo?.direction ?? 'Traseu activ'}).\n• **Vehicule GPS live pe această linie:** ${activeOnLine.length}\n• **Stații pe sensul ${dir.toUpperCase()}:** ${dirInfo?.stops.length ?? 0} opriri.`
              : `Am comutat modulul Transport pe linia **${targetLine}** (${activeOnLine.length} vehicule live detectate).`,
          },
        ]);
        return;
      }

      // =========================================================================
      // TOOL 3: STATE-AWARE ENTITY INSPECTION (inspect_active_entity)
      // =========================================================================
      const asksAboutSelectedVehicle =
        selectedVehicle &&
        /\b(where is this|where does this|unde merge|incotro merge|încotro merge|ce linie|ce tramvai|ce autobuz|ce troleibuz|următoarea stație|urmatoarea statie|ce statii|ce stații|cât de repede|cat de repede|viteza|acest vehicul|acest tramvai|acest autobuz|this tram|this bus|this vehicle)\b/i.test(
          norm,
        );

      if (asksAboutSelectedVehicle && selectedVehicle) {
        const summary = lineSummaries.find(l => l.line.toUpperCase() === selectedVehicle.line.toUpperCase());
        const dirKey = selectedVehicle.directionId === '1' ? 'retur' : 'tur';
        const dirSummary = summary?.directions.find(d => d.dirKey === dirKey) ?? summary?.directions[0];
        const stopsList = dirSummary?.stops.map(s => s.name) ?? [];
        const currentStopIdx = selectedVehicle.stop
          ? stopsList.findIndex(s => normalizeSearch(s) === normalizeSearch(selectedVehicle.stop!))
          : -1;
        const upcomingStops =
          currentStopIdx >= 0 ? stopsList.slice(currentStopIdx, currentStopIdx + 5) : stopsList.slice(0, 5);
        const terminalStop = stopsList[stopsList.length - 1] || selectedVehicle.headsign || 'Capăt de linie';

        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'inspect_active_entity',
              summary: `inspect_active_entity(vehicleId="${selectedVehicle.id}", line="${selectedVehicle.line}")`,
            },
            text: `**${vehicleLabels[selectedVehicle.type]}ul ${selectedVehicle.line}** (ID flotă \`${selectedVehicle.id}\`) circulă pe sensul **${dirKey.toUpperCase()}** către **${selectedVehicle.headsign || terminalStop}**.\n• **Stație curentă / următoare:** ${selectedVehicle.stop || 'În deplasare pe traseu'}\n• **Viteză & Azimut:** ${selectedVehicle.speed ?? 0} km/h · ${selectedVehicle.bearing ?? 0}°\n• **Accesibilitate PMR:** ${selectedVehicle.isAccessible ? 'Da (podea coborâtă)' : 'Standard'}\n${upcomingStops.length ? `• **Următoarele opriri pe traseu:** ${upcomingStops.join(' → ')}` : ''}`,
          },
        ]);
        return;
      }

      const asksAboutSelectedContext =
        /\b(what is this|ce este asta|ce este aceasta|ce e asta|ce cladire|ce clădire|this building|despre acest loc|ce am selectat|what is selected|unde merge|where is this going)\b/i.test(
          norm,
        );

      if (asksAboutSelectedContext) {
        if (selectedVehicle) {
          const summary = lineSummaries.find(l => l.line.toUpperCase() === selectedVehicle.line.toUpperCase());
          const dirKey = selectedVehicle.directionId === '1' ? 'retur' : 'tur';
          const dirSummary = summary?.directions.find(d => d.dirKey === dirKey) ?? summary?.directions[0];
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'inspect_active_entity',
                summary: `inspect_active_entity(vehicle="${selectedVehicle.line}#${selectedVehicle.id}")`,
              },
              text: `Ai selectat **${vehicleLabels[selectedVehicle.type]}ul ${selectedVehicle.line}** (ID \`${selectedVehicle.id}\`), care se îndreaptă spre **${selectedVehicle.headsign || dirSummary?.direction || 'capătul de linie'}** (sensul **${dirKey.toUpperCase()}**). Ultima stație raportată: **${selectedVehicle.stop || 'în mișcare'}**.`,
            },
          ]);
          return;
        }

        if (selectedPlace) {
          const [wikiRo, osmMeta] = await Promise.all([
            fetchWikipediaSummary(selectedPlace.title, 'ro'),
            fetchOsmPlaceMetadata(selectedPlace.location),
          ]);
          const wiki = wikiRo ?? (await fetchWikipediaSummary(selectedPlace.title, 'en'));
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'inspect_active_entity',
                summary: `inspect_active_entity(place="${selectedPlace.title}")`,
              },
              text: `Ai selectat pe hartă **${selectedPlace.title}** (${selectedPlace.location.lat.toFixed(5)}, ${selectedPlace.location.lon.toFixed(5)}).\n${osmMeta ? `\n• ${osmMeta}\n` : ''}${wiki ? `\n${wiki.extract}` : selectedPlace.description || 'Reper urban verificat în baza de date OpenStreetMap Timișoara.'}`,
              sourceUrl: wiki?.url,
              sourceLabel: wiki ? `Wikipedia: ${wiki.title}` : undefined,
              quickRoute: { destination: { title: selectedPlace.title, location: selectedPlace.location } },
            },
          ]);
          return;
        }

        if (selectedMunicipal) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'inspect_active_entity',
                summary: `inspect_active_entity(municipalReport="${selectedMunicipal.number}")`,
              },
              text: `Ai selectat sesizarea oficială **${selectedMunicipal.number}** de pe \`sesizari.primariatm.ro\`:\n• **Categorie:** ${selectedMunicipal.category} → ${selectedMunicipal.title}\n• **Stare oficială:** ${municipalStatuses[selectedMunicipal.status].label}\n${municipalDetail?.street ? `• **Adresă:** Str. ${municipalDetail.street} ${municipalDetail.streetNumber ?? ''}\n` : ''}${selectedMunicipal.description ? `• **Descriere:** ${selectedMunicipal.description}` : ''}`,
              quickRoute: selectedMunicipal.coordinates
                ? {
                    destination: {
                      title: `Sesizare ${selectedMunicipal.number}`,
                      location: { lon: selectedMunicipal.coordinates[0], lat: selectedMunicipal.coordinates[1] },
                    },
                  }
                : undefined,
            },
          ]);
          return;
        }

        if (selectedVeloStation) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'inspect_active_entity',
                summary: `inspect_active_entity(veloStation="${selectedVeloStation.name}")`,
              },
              text: `Ai selectat stația **${selectedVeloStation.name}** (${selectedVeloStation.address}):\n• **Biciclete disponibile:** 🚲 ${selectedVeloStation.availableBikes}\n• **Dock-uri libere:** 🅿️ ${selectedVeloStation.freeDocks}\n• **Capacitate totală:** ${selectedVeloStation.capacity} locuri.`,
              quickRoute: {
                destination: {
                  title: selectedVeloStation.name,
                  location: { lon: selectedVeloStation.lon, lat: selectedVeloStation.lat },
                },
                mode: 'cycling',
              },
            },
          ]);
          return;
        }

        if (selectedCityEvent) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
              toolCall: {
                toolName: 'inspect_active_entity',
                summary: `inspect_active_entity(cityEvent="${selectedCityEvent.title}")`,
              },
              text: `Ai selectat evenimentul oficial **„${selectedCityEvent.title}”**:\n• **Locație:** ${selectedCityEvent.venue}\n• **Data:** ${selectedCityEvent.startsAt.slice(0, 10)}${selectedCityEvent.timeLabel ? ` · ora ${selectedCityEvent.timeLabel}` : ''}\n• **Categorie & Organizator:** ${selectedCityEvent.category} (${selectedCityEvent.source})`,
              sourceUrl: selectedCityEvent.officialUrl,
              sourceLabel: selectedCityEvent.source,
              quickRoute: {
                destination: {
                  title: `${selectedCityEvent.title} (${selectedCityEvent.venue})`,
                  location: { lon: selectedCityEvent.lon, lat: selectedCityEvent.lat },
                },
              },
            },
          ]);
          return;
        }
      }

      // =========================================================================
      // TOOL 4: CONTEXTUAL SPATIAL Q&A (Wikipedia REST + OpenStreetMap + Local RAG)
      // =========================================================================
      // 4A. Check if the user asks about VeloTM / bikes
      if (/\b(velo|biciclet|statii velo|stații velo|dock)\b/i.test(norm) && !navIntent.isNavigation) {
        const totalBikes = veloStations.reduce((s, st) => s + st.availableBikes, 0);
        const totalDocks = veloStations.reduce((s, st) => s + st.freeDocks, 0);
        const topStations = [...veloStations]
          .sort((a, b) => b.availableBikes - a.availableBikes)
          .slice(0, 4)
          .map(s => `• **${s.name}**: 🚲 ${s.availableBikes} biciclete / 🅿️ ${s.freeDocks} dock-uri`)
          .join('\n');

        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'query_osm_wikipedia_rag',
              summary: `query_rag(dataset="velo_stations", count=${veloStations.length})`,
            },
            text: `În rețeaua **VeloTM Timișoara** sunt monitorizate **${veloStations.length} stații** (${totalBikes} biciclete disponibile și ${totalDocks} dock-uri libere):\n${topStations}`,
          },
        ]);
        return;
      }

      // 4B. Check if the user asks about Municipal Reports (Sesizări PMT)
      if (/\b(sesizar|sesizări|gropi|groapa|iluminat|salubrizare|primarie|primărie)\b/i.test(norm)) {
        const inProgress = municipalReports.filter(r => r.status === 'In lucru').length;
        const resolved = municipalReports.filter(r => r.status === 'Finalizata').length;
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'query_osm_wikipedia_rag',
              summary: `query_rag(dataset="sesizari_primariatm", total=${municipalReports.length})`,
            },
            text: `În fluxul oficial \`sesizari.primariatm.ro\` sunt sincronizate **${municipalReports.length} sesizări** în ultimele 30 de zile:\n• **În lucru:** ${inProgress}\n• **Finalizate:** ${resolved}\n• **Alerte STPT / devieri active:** ${stptAlerts.length}`,
          },
        ]);
        return;
      }

      // 4C. Check if the user asks about Cultural / City Events
      if (/\b(eveniment|spectacol|concert|teatru|opera|filarmonic|agenda)\b/i.test(norm)) {
        const upcoming = cityEvents
          .slice(0, 4)
          .map(e => `• **${e.title}** — ${e.venue} (${e.startsAt.slice(0, 10)}${e.timeLabel ? `, ora ${e.timeLabel}` : ''})`)
          .join('\n');
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'query_osm_wikipedia_rag',
              summary: `query_rag(dataset="city_events", total=${cityEvents.length})`,
            },
            text: `Agenda Culturală & Municipală Timișoara include **${cityEvents.length} evenimente oficiale** geolocalizate pe hartă:\n${upcoming}`,
          },
        ]);
        return;
      }

      // 4D. Extract subject for Wikipedia + OpenStreetMap Spatial Q&A
      const cleanedSubject = prompt
        .replace(
          /^(cand a fost construit|când a fost construit|cand s-a construit|când s-a construit|ce este|ce știi despre|ce stii despre|spune-mi despre|istoria|what is|when was|who built|tell me about|where is|unde se află|unde se afla)\s+/i,
          '',
        )
        .replace(/[?.!]+$/g, '')
        .trim();

      const [wikiRo, geocoded] = await Promise.all([
        fetchWikipediaSummary(cleanedSubject || prompt, 'ro'),
        geocodeLocation(cleanedSubject || prompt, routeCandidates),
      ]);
      const wiki = wikiRo ?? (await fetchWikipediaSummary(cleanedSubject || prompt, 'en'));
      const osmDetails = geocoded ? await fetchOsmPlaceMetadata(geocoded.location) : null;

      if (wiki || geocoded) {
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
            toolCall: {
              toolName: 'query_osm_wikipedia_rag',
              summary: `query_osm_wikipedia_rag(subject="${cleanedSubject || prompt}")`,
            },
            text: `${wiki ? `**${wiki.title}**\n${wiki.extract}` : `Am localizat **${geocoded!.title}** în Timișoara (${geocoded!.location.lat.toFixed(4)}, ${geocoded!.location.lon.toFixed(4)}).`}${osmDetails ? `\n\n• ${osmDetails}` : ''}`,
            sourceUrl: wiki?.url,
            sourceLabel: wiki ? `Wikipedia: ${wiki.title}` : 'OpenStreetMap Timișoara',
            quickRoute: geocoded ? { destination: geocoded } : undefined,
          },
        ]);
        return;
      }

      // Fallback contextual response with current city telemetry
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
          toolCall: {
            toolName: 'inspect_active_entity',
            summary: `inspect_city_state(module="${activeModule}", vehicles=${liveVehicles.length})`,
          },
          text: `Am analizat starea curentă a platformei **Urban Conect Timișoara**:\n• **Context activ:** ${activeContextLabel}\n• **Transport STPT:** ${liveVehicles.length} vehicule live pe traseu și ${stptAlerts.length} alerte/devieri\n• **Sesizări PMT (30 zile):** ${municipalReports.length} sesizări oficiale\n\nÎmi poți cere o rută directă (ex. *„Du-mă la Iulius Town”*, *„Vreau să merg la gară”*) sau informații despre orice clădire ori linie STPT!`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void processUserPrompt(input);
  }

  const quickPrompts = [
    selectedVehicle
      ? `Unde merge ${vehicleLabels[selectedVehicle.type].toLowerCase()}ul ${selectedVehicle.line}?`
      : 'Vreau să merg la gară',
    'Take me to Iulius Town',
    selectedPlace
      ? `Ce este ${selectedPlace.title}?`
      : 'Când a fost construit Domul Romano-Catolic?',
    'Arată-mi tramvaiul 1',
  ];

  return (
    <>
      {/* Floating AI Assistant Toggle Button — positioned immediately next to .theme-toggle */}
      <button
        type="button"
        className={`ai-assistant-toggle ${open ? 'active' : ''}`}
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Asistent Urban AI Timișoara"
        title="Asistent Urban AI (Rutare inteligentă & Q&A contextual)"
      >
        <Sparkles size={18} />
        <span className="ai-toggle-badge">AI</span>
      </button>

      {/* Glassmorphism Chat Panel (Desktop) / Swipeable Bottom Sheet (Mobile) */}
      {open && (
        <aside
          className="ai-assistant-panel"
          role="dialog"
          aria-label="Asistent Urban AI Timișoara"
        >
          <div className="ai-sheet-handle" onClick={onToggleOpen} aria-hidden="true">
            <span />
          </div>

          <header className="ai-panel-header">
            <div className="ai-panel-brand">
              <span className="ai-brand-icon">
                <Bot size={18} />
              </span>
              <div>
                <strong>Urban Conect AI</strong>
                <small>Function Calling · Rutare A→B · OSM & Wiki RAG</small>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleOpen}
              aria-label="Închide Asistentul AI"
            >
              <X size={16} />
            </button>
          </header>

          {/* Live State Awareness Banner */}
          <div className="ai-context-bar" title="Asistentul citește în timp real obiectul selectat și starea hărții">
            <Compass size={13} />
            <span>{activeContextLabel}</span>
          </div>

          {/* Messages Stream */}
          <div className="ai-messages-list" ref={scrollRef} role="log" aria-live="polite">
            {messages.map(msg => (
              <div key={msg.id} className={`ai-msg-row ${msg.role}`}>
                <div className="ai-msg-bubble">
                  {msg.toolCall && (
                    <div className="ai-tool-badge">
                      <Wrench size={11} />
                      <code>{msg.toolCall.summary}</code>
                    </div>
                  )}
                  <div className="ai-msg-text">
                    {msg.text.split('\n').map((line, i) => (
                      <p key={i}>
                        {line.split(/(\*\*.*?\*\*)/g).map((part, j) =>
                          part.startsWith('**') && part.endsWith('**') ? (
                            <strong key={j}>{part.slice(2, -2)}</strong>
                          ) : (
                            part
                          ),
                        )}
                      </p>
                    ))}
                  </div>

                  {(msg.quickRoute || msg.sourceUrl) && (
                    <div className="ai-msg-actions">
                      {msg.quickRoute && (
                        <button
                          type="button"
                          className="ai-action-chip primary"
                          onClick={() =>
                            callbacks.onPlanRoute({
                              destination: msg.quickRoute!.destination,
                              mode: msg.quickRoute!.mode,
                            })
                          }
                        >
                          <Navigation size={12} />
                          <span>Trasează ruta A → B pe hartă</span>
                        </button>
                      )}
                      {msg.sourceUrl && (
                        <a
                          href={msg.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ai-action-chip"
                        >
                          <ExternalLink size={11} />
                          <span>{msg.sourceLabel || 'Sursă oficială'}</span>
                        </a>
                      )}
                    </div>
                  )}
                  <time className="ai-msg-time">{msg.timestamp}</time>
                </div>
              </div>
            ))}

            {busy && (
              <div className="ai-msg-row assistant">
                <div className="ai-msg-bubble ai-typing">
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  <span>Se interoghează uneltele geospațiale și Wikipedia/OSM…</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actionable Prompts */}
          <div className="ai-quick-prompts" aria-label="Comenzi rapide AI">
            {quickPrompts.map(q => (
              <button
                type="button"
                key={q}
                className="ai-prompt-pill"
                disabled={busy}
                onClick={() => void processUserPrompt(q)}
              >
                {q.includes('merg') || q.includes('Take me') ? (
                  <Route size={11} />
                ) : q.includes('tramvaiul') ? (
                  <TrainFront size={11} />
                ) : (
                  <MapPin size={11} />
                )}
                <span>{q}</span>
              </button>
            ))}
          </div>

          {/* Input Composer */}
          <form className="ai-composer" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ex: „Vreau să merg la gară”, „Unde merge acest tramvai?”…"
              aria-label="Mesaj pentru Asistentul Urban AI"
              disabled={busy}
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!input.trim() || busy}
              aria-label="Trimite"
            >
              <Send size={15} />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
