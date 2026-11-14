import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpDown,
  Bike,
  Bookmark,
  Building2,
  Bus,
  Calendar,
  Car,
  CheckCircle2,
  Compass,
  ExternalLink,
  Footprints,
  Layers,
  LocateFixed,
  MapPin,
  MessageSquare,
  Moon,
  Navigation,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  Share2,
  Sparkles,
  Sun,
  ThumbsUp,
  Ticket,
  TrainFront,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  activityState,
  center,
  dateLabel,
  distance,
  formSchema,
  meta,
  people,
  reportSubcategories,
} from './domain';
import type { Action, FormInput, Person, Pin, PinType, Point, State } from './domain';
import { calculateRoute } from './routing';
import type { RouteResult, TravelMode } from './routing';
import { compressPhoto, dispatch as localDispatch, loadState, photoAccept, subscribe } from './storage';
import { layerDefinitions, toMapPlace } from './infrastructure';
import type { Infrastructure, LayerKey, LayerVisibility, MapPlace } from './infrastructure';
import PlacesPanel, { findPlaces, normalizeSearch, placeLink } from './PlacesPanel';
import { PlaceIcon } from './place-icons';
import { applyTheme, readTheme } from './theme';
import type { Theme } from './theme';
import type { BaseMapStyle } from './map-style';
import { useStptVehicles } from './stpt-live';
import type { LiveVehicle } from './stpt-live';
import { getLineSummaries, loadTransitNetwork, planTransit } from './transitRouter';
import type { LineSummary, TransitNetwork, TransitOption, TransitPoint } from './transitRouter';
import TransitResults from './TransitResults';
import RouteChat from './RouteChat';
import { municipalReportsPortal, municipalReportUrl, municipalStatuses } from './municipal-reports';
import type { MunicipalStatus } from './municipal-reports';
import { useMunicipalReportDetail, useMunicipalReports } from './useMunicipalReports';
import VehicleDetailPanel from './VehicleDetailPanel';
import { TransportPanel } from './TransportPanel';
import { VeloPanel } from './VeloPanel';
import { NewsFeedPanel } from './NewsFeedPanel';
import type { TemporalWindow } from './NewsFeedPanel';
import { useVeloStations } from './velo-live';
import type { VeloStation } from './velo-live';
import { useCityEvents } from './city-events';
import type { OfficialCityEvent } from './city-events';
import type { ActiveLineRoute, NetworkSubFilters } from './mobility-map';
import { AiUrbanAssistant } from './AiUrbanAssistant';
import type { MapViewportState } from './AiUrbanAssistant';
import { SkeletonCards } from './SkeletonCards';

const MapCanvas = lazy(() => import('./MapCanvas'));

export type RouteMode = TravelMode | 'transit';

const defaultLayerVisibility: LayerVisibility = {
  cycleways: false,
  tramways: false,
  busways: false,
  sidewalks: false,
  places: false,
};

const municipalCategorii = [
  'Trafic rutier și semne de circulație',
  'Străzi și trotuare',
  'Locuri de joacă și spații verzi',
  'Salubrizare, dezinsecție, deratizare și deszăpezire',
  'Iluminat public',
  'Altele',
  'Protecția mediului (Poliția Locală)',
  'Apă, canalizare și termoficare',
  'Transport în comun',
  'Ordinea și liniștea publică (Poliția Locală)',
  'Urbanism',
  'Garaje, cimitire și toalete publice',
  'Animale',
  'Organizare și funcționare asociații de proprietari',
  'Website si platformă de sesizări',
  'Scoli si Spitale',
  'Probleme de integritate referitoare la angajați',
  'Probleme de integritate',
  'Activitatea comercială (Poliția Locală)',
] as const;

async function loadInfrastructureData<K extends LayerKey>(key: K): Promise<Infrastructure[K]> {
  const response = await fetch(`/data/${key}.geojson`);
  if (!response.ok) throw new Error(`Nu am putut încărca stratul „${layerDefinitions[key].label}”.`);
  const result = await response.json();
  if (result.type !== 'FeatureCollection' || !Array.isArray(result.features)) {
    throw new Error('Date geografice invalide.');
  }
  return result as Infrastructure[K];
}

async function reverseGeocode(point: Point, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lon}&accept-language=ro`,
      { signal },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { name?: string; address?: { road?: string; suburb?: string } };
    const road = data.address?.road || data.name;
    const suburb = data.address?.suburb;
    if (road && suburb) return `${road}, ${suburb}`;
    if (road) return `${road}, Timișoara`;
    return undefined;
  } catch {
    return undefined;
  }
}

export type SidebarTab =
  | 'news'
  | 'transport'
  | 'velo'
  | 'reports'
  | 'community'
  | 'places'
  | 'route'
  | 'layers';

const moduleRoutePaths: Record<SidebarTab, string> = {
  news: '/noutati',
  transport: '/transport',
  velo: '/velo',
  reports: '/sesizari',
  community: '/comunitate',
  places: '/oras',
  route: '/rutare',
  layers: '/straturi',
};

function readInitialModuleFromUrl(): SidebarTab {
  const path = window.location.pathname.toLowerCase();
  for (const [tab, routePath] of Object.entries(moduleRoutePaths) as [SidebarTab, string][]) {
    if (path === routePath) return tab;
  }
  return 'news';
}

const typeIcons = { report: AlertTriangle, activity: Calendar, discussion: MessageSquare };

const emptyForm = (type: PinType = 'report', location: Point = center): FormInput => {
  const defaultCategory = meta[type].categories[0];
  const defaultSubcategory =
    type === 'report' ? reportSubcategories[defaultCategory]?.[0] : undefined;
  return {
    type,
    title: '',
    description: '',
    category: defaultCategory,
    subcategory: defaultSubcategory,
    place: 'Timișoara',
    location,
  };
};

function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export type AppProps = {
  cloud?: {
    store: {
      loadState: () => Promise<State>;
      dispatch: (action: Action) => Promise<State>;
      subscribe: (refresh: () => void) => () => void;
    };
    user: Person | null;
    reopenAccount?: boolean;
    account?: ReactNode;
  };
  externalState?: State;
  externalUser?: Person;
  onAction?: (action: Action) => Promise<unknown>;
  onOpenAccount?: () => void;
  accountStatus?: string;
};

type RouteEndpoint = {
  location: Point;
  title: string;
};

type PickTarget = 'form' | 'pointA' | 'pointB' | `waypoint:${number}` | null;

export default function App({
  cloud,
  externalState,
  externalUser,
  onAction,
  onOpenAccount,
  accountStatus,
}: AppProps = {}) {
  const [state, setState] = useState<State | null>(externalState ?? null);
  const [fatal, setFatal] = useState('');
  const [userId] = useState(() => localStorage.getItem('vecin-user') || 'radu');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => readInitialModuleFromUrl());

  // Decoupled Community Filters (official events, citizen activities & discussions — zero reports!)
  const [communityFilter, setCommunityFilter] = useState<'all' | 'official' | 'activity' | 'discussion' | 'saved'>('all');
  const [communityEventCategory, setCommunityEventCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'active' | 'near'>('newest');
  const [savedEventIds, setSavedEventIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('urban-conect-saved-events');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Decoupled Reports Filters
  const [reportsSourceFilter, setReportsSourceFilter] = useState<'all' | 'municipal' | 'citizen'>('all');
  const [reportsStatusFilter, setReportsStatusFilter] = useState<'all' | MunicipalStatus>('all');
  const [reportsCategoryFilter, setReportsCategoryFilter] = useState<string>('all');
  const [reportsSubcategoryFilter, setReportsSubcategoryFilter] = useState<string>('all');
  const [reportsVisibleLimit, setReportsVisibleLimit] = useState<number>(80);

  // News Feed Temporal Filter (Zilnic, Săptămânal, Lunar)
  const [newsTemporalWindow, setNewsTemporalWindow] = useState<TemporalWindow>('weekly');

  // Transport Module Exclusive Line, Direction & Network Sub-filters State
  const [selectedTransportLine, setSelectedTransportLine] = useState<string>('');
  const [selectedTransportDirection, setSelectedTransportDirection] = useState<'tur' | 'retur'>('tur');
  const [showAllTransportRoutes, setShowAllTransportRoutes] = useState<boolean>(false);
  const [networkSubFilters, setNetworkSubFilters] = useState<NetworkSubFilters>({
    tram: true,
    trolleybus: false,
    bus: false,
  });

  // Velo Module Selected Station
  const [selectedVeloStation, setSelectedVeloStation] = useState<VeloStation | null>(null);

  // Official City Event Selected on Map / Feed
  const [selectedCityEvent, setSelectedCityEvent] = useState<OfficialCityEvent | null>(null);

  // Search & Omni-Search & Floating AI Urban Assistant
  const [search, setSearch] = useState('');
  const [placesSearch, setPlacesSearch] = useState('');
  const [omniSearchOpen, setOmniSearchOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);

  // Selection state (strictly reset on module switch!)
  const [selectedPinId, setSelectedPinId] = useState<string>('');
  const [selectedMunicipalNumber, setSelectedMunicipalNumber] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);

  // Modals & Creation (Decoupled: Report Modal vs Community Modal)
  const [modal, setModal] = useState<'create-report' | 'create-community' | 'edit' | 'profile' | null>(
    () => (cloud?.reopenAccount ? 'profile' : null),
  );
  const [form, setForm] = useState<FormInput>(() => emptyForm());
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);

  // Google Maps Style Routing (Point A + Waypoints + Point B + Central Swap + Live GTFS-RT)
  const [pointA, setPointA] = useState<RouteEndpoint>({
    location: center,
    title: 'Piața Victoriei, Timișoara',
  });
  const [waypoints, setWaypoints] = useState<RouteEndpoint[]>([]);
  const [waypointQueries, setWaypointQueries] = useState<string[]>([]);
  const [pointB, setPointB] = useState<RouteEndpoint | null>(null);
  const [pointAQuery, setPointAQuery] = useState('');
  const [pointBQuery, setPointBQuery] = useState('');
  const [travelMode, setTravelMode] = useState<RouteMode>('transit');
  const [route, setRoute] = useState<RouteResult | undefined>();
  const [transitRoute, setTransitRoute] = useState<{ options: TransitOption[]; selected: number; validFrom: string; validTo: string }>();
  const [routeBusy, setRouteBusy] = useState(false);
  const [userLocation, setUserLocation] = useState<Point | undefined>();

  // Map, Base Map Style Controller & Smart POI Layers
  const [focus, setFocus] = useState(0);
  const [mapFit, setMapFit] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [baseMapStyle, setBaseMapStyle] = useState<BaseMapStyle>('buildings3d');
  const [mapViewport, setMapViewport] = useState<MapViewportState | undefined>();
  const [enabledPoiKinds, setEnabledPoiKinds] = useState<Record<string, boolean>>({
    health: true,
    park: true,
    services: true,
    education: true,
    culture: true,
    food: true,
    transport: true,
    shop: true,
    sport: true,
    lodging: true,
    building: true,
  });
  const [layers, setLayers] = useState<LayerVisibility>(defaultLayerVisibility);
  const [pinLabels] = useState(false);
  const [showBuildings] = useState(true);
  const [infrastructure, setInfrastructure] = useState<Partial<Infrastructure>>({});
  const [layerErrors, setLayerErrors] = useState<Partial<Record<LayerKey, string>>>({});
  const [layerLoading, setLayerLoading] = useState<Partial<Record<LayerKey, boolean>>>({});
  const [placeCategory, setPlaceCategory] = useState('all');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  const sheetDragStartY = useRef<number | null>(null);
  const sheetDragged = useRef(false);
  const [reportFormStep, setReportFormStep] = useState<1 | 2 | 3>(1);
  const [, setInfrastructureInspection] = useState<{ title: string; description: string } | null>(null);

  // Chat state
  const [messageText, setMessageText] = useState('');
  const [chatPinId, setChatPinId] = useState('');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatVisibleCount, setChatVisibleCount] = useState(30);
  const [chatWidth, setChatWidth] = useState<number | null>(null);
  const [sharePlace, setSharePlace] = useState<MapPlace | null>(null);

  // Transit network & Live Feeds
  const [transitNetwork, setTransitNetwork] = useState<TransitNetwork | null>(null);
  const stptFeed = useStptVehicles(
    sidebarTab === 'transport' || sidebarTab === 'news' || sidebarTab === 'route',
  );
  const municipalFeed = useMunicipalReports(
    sidebarTab === 'reports' || sidebarTab === 'news',
  );
  const veloFeed = useVeloStations(sidebarTab === 'velo');
  const cityEventsFeed = useCityEvents(sidebarTab === 'community' || aiAssistantOpen || omniSearchOpen);
  const { detail: municipalDetail } = useMunicipalReportDetail(selectedMunicipalNumber || undefined);

  const detailHeading = useRef<HTMLHeadingElement>(null);
  const chatHeading = useRef<HTMLHeadingElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const routeAbort = useRef<AbortController | null>(null);
  const geocodeAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cloud?.reopenAccount) {
      setModal('profile');
    }
  }, [cloud?.reopenAccount]);

  // Load Transit Network (GTFS patterns & stops)
  useEffect(() => {
    const controller = new AbortController();
    loadTransitNetwork(controller.signal)
      .then(net => setTransitNetwork(net))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const lineSummaries: LineSummary[] = useMemo(
    () => (transitNetwork ? getLineSummaries(transitNetwork) : []),
    [transitNetwork],
  );

  // Strict Map Context Isolation on Module Switch
  function switchModule(nextTab: SidebarTab) {
    setSidebarTab(nextTab);
    setMobilePanelOpen(true);
    setOmniSearchOpen(false);
    setSearch('');
    setPlacesSearch('');
    setCommunityFilter('all');
    setCommunityEventCategory('all');

    // Reset all previous module selections so the map context is completely isolated
    setSelectedPinId('');
    setSelectedMunicipalNumber('');
    setSelectedVehicleId('');
    setSelectedTransportLine('');
    setShowAllTransportRoutes(false);
    setSelectedVeloStation(null);
    setSelectedCityEvent(null);
    setSelectedPlace(null);
    setInfrastructureInspection(null);
    setPickTarget(null);

    if (nextTab !== 'route') {
      setRoute(undefined);
      setTransitRoute(undefined);
    }

    // Sync browser URL route
    const targetPath = moduleRoutePaths[nextTab];
    if (targetPath && window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', `${targetPath}${window.location.search}`);
    }

    // Configure exact layer isolation for the target module
    switch (nextTab) {
      case 'news':
        setLayers({
          tramways: false,
          busways: false,
          cycleways: false,
          sidewalks: false,
          places: false,
        });
        break;
      case 'transport':
        setSelectedTransportLine('');
        setShowAllTransportRoutes(false);
        setLayers({
          tramways: false,
          busways: false,
          cycleways: false,
          sidewalks: false,
          places: false,
        });
        break;
      case 'velo':
        setLayers({
          tramways: false,
          busways: false,
          cycleways: true,
          sidewalks: false,
          places: false,
        });
        break;
      case 'reports':
        setReportsSourceFilter('all');
        setReportsStatusFilter('all');
        setReportsCategoryFilter('all');
        setReportsSubcategoryFilter('all');
        setReportsVisibleLimit(80);
        setLayers({
          tramways: false,
          busways: false,
          cycleways: false,
          sidewalks: false,
          places: false,
        });
        setMapFit(v => v + 1);
        break;
      case 'community':
        setLayers({
          tramways: false,
          busways: false,
          cycleways: false,
          sidewalks: false,
          places: false,
        });
        setMapFit(v => v + 1);
        break;
      case 'places':
        setLayers({
          tramways: false,
          busways: false,
          cycleways: false,
          sidewalks: false,
          places: true,
        });
        setMapFit(v => v + 1);
        break;
      case 'route':
        setLayers({
          tramways: false,
          busways: false,
          cycleways: travelMode === 'cycling',
          sidewalks: travelMode === 'walking',
          places: false,
        });
        break;
      case 'layers':
        break;
    }
  }

  useEffect(() => {
    if (externalState) {
      setState(externalState);
      return;
    }
    const storeLoader = cloud ? cloud.store.loadState : loadState;
    const storeSubscriber = cloud ? cloud.store.subscribe : subscribe;
    storeLoader().then(setState).catch(e => setFatal(e.message));
    return storeSubscriber(() => storeLoader().then(setState).catch(e => setFatal(e.message)));
  }, [externalState, cloud]);

  useEffect(() => {
    void ensureLayerData('places');
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Ensure GeoJSON infrastructure data is loaded when a layer is active
  useEffect(() => {
    (['tramways', 'busways', 'cycleways', 'sidewalks', 'places'] as const).forEach(key => {
      if (layers[key]) void ensureLayerData(key);
    });
  }, [layers.tramways, layers.busways, layers.cycleways, layers.sidewalks, layers.places]);

  async function ensureLayerData(key: LayerKey) {
    if (infrastructure[key] || layerLoading[key]) return;
    setLayerLoading(prev => ({ ...prev, [key]: true }));
    setLayerErrors(prev => ({ ...prev, [key]: undefined }));
    try {
      const data = await loadInfrastructureData(key);
      setInfrastructure(prev => ({ ...prev, [key]: data }));
    } catch (error) {
      setLayerErrors(prev => ({
        ...prev,
        [key]: error instanceof Error ? error.message : 'Stratul nu a putut fi încărcat.',
      }));
    } finally {
      setLayerLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  function toggleLayer(key: LayerKey) {
    const next = !layers[key];
    setLayers(prev => ({ ...prev, [key]: next }));
    if (next) {
      void ensureLayerData(key);
    }
  }

  const allPeople = state?.people?.length ? state.people : people;
  const isUnauthenticatedCloud = Boolean(cloud && !cloud.user);
  const user: Person =
    externalUser ??
    cloud?.user ??
    (cloud
      ? { id: 'guest', name: 'Vizitator', initials: 'VZ', color: '#EBF3FF' }
      : allPeople.find(p => p.id === userId) || allPeople[0]);
  const personById = (id: string): Person =>
    allPeople.find(p => p.id === id) ||
    (user?.id === id ? user : { id, name: 'Cetățean', initials: 'CT', color: '#EBF3FF' });

  function requireAuthenticatedUser(): boolean {
    if (isUnauthenticatedCloud) {
      setModal('profile');
      setToast({ text: 'Autentifică-te cu Google sau e-mail pentru a continua.', error: true });
      return false;
    }
    return true;
  }

  // Strictly Decoupled Collections: Citizen Reports vs Community Posts
  const activePins = useMemo(() => (state?.pins || []).filter(p => !p.deleted && !p.demo), [state]);
  const citizenReportPins = useMemo(() => activePins.filter(p => p.type === 'report'), [activePins]);
  const communityPostPins = useMemo(
    () => activePins.filter(p => p.type === 'activity' || p.type === 'discussion'),
    [activePins],
  );

  const savedIds = state?.saved[user.id] || [];
  const selected = activePins.find(p => p.id === selectedPinId);
  const chatPin = activePins.find(p => p.id === chatPinId);
  const selectedMunicipal = useMemo(
    () =>
      municipalFeed.allReports.find(r => r.number === selectedMunicipalNumber) ??
      municipalFeed.reports.find(r => r.number === selectedMunicipalNumber),
    [municipalFeed.allReports, municipalFeed.reports, selectedMunicipalNumber],
  );
  const selectedVehicle = useMemo(
    () => stptFeed.vehicles.find(v => v.id === selectedVehicleId),
    [stptFeed.vehicles, selectedVehicleId],
  );

  // Exclusive Active Transport Line Geometry (for Transport module when a line or vehicle is selected)
  const activeLineRoute = useMemo<ActiveLineRoute | null>(() => {
    if (sidebarTab !== 'transport' || showAllTransportRoutes || !selectedTransportLine) return null;
    const summary = lineSummaries.find(
      l => l.line.toUpperCase() === selectedTransportLine.toUpperCase(),
    );
    if (!summary) return null;
    const dirSummary =
      summary.directions.find(d => d.dirKey === selectedTransportDirection) ?? summary.directions[0];
    if (!dirSummary) return null;
    return {
      line: summary.line,
      color: summary.color,
      direction: selectedTransportDirection,
      directionLabel: dirSummary.direction,
      shape: dirSummary.shape,
      stops: dirSummary.stops,
    };
  }, [sidebarTab, showAllTransportRoutes, selectedTransportLine, selectedTransportDirection, lineSummaries]);

  // Filtered Live Vehicles for the Map:
  // 1) In 'transport': isolated to selected line+direction, or filtered by networkSubFilters when Show All is enabled
  // 2) In 'route': when a public transit route is active, cross-references and displays the live GPS vehicles on the suggested transit lines!
  const mapLiveVehicles = useMemo<LiveVehicle[]>(() => {
    if (sidebarTab === 'route' && transitRoute) {
      const option = transitRoute.options[transitRoute.selected];
      if (!option) return [];
      const assignedLines = new Set(
        option.steps
          .filter(s => s.kind === 'ride')
          .map(s => s.line.toUpperCase()),
      );
      if (assignedLines.size === 0) return [];
      return stptFeed.vehicles.filter(v => assignedLines.has(v.line.toUpperCase()));
    }
    if (sidebarTab !== 'transport') return [];
    if (showAllTransportRoutes) {
      return stptFeed.vehicles.filter(v => {
        if (v.type === 'tram' && !networkSubFilters.tram) return false;
        if (v.type === 'trolleybus' && !networkSubFilters.trolleybus) return false;
        if (v.type === 'bus' && !networkSubFilters.bus) return false;
        return true;
      });
    }
    if (selectedTransportLine) {
      return stptFeed.vehicles.filter(v => {
        if (v.line.toUpperCase() !== selectedTransportLine.toUpperCase()) return false;
        if (v.directionId) {
          const expected = selectedTransportDirection === 'tur' ? '0' : '1';
          return v.directionId === expected;
        }
        return true;
      });
    }
    return [];
  }, [
    sidebarTab,
    transitRoute,
    showAllTransportRoutes,
    networkSubFilters,
    selectedTransportLine,
    selectedTransportDirection,
    stptFeed.vehicles,
  ]);

  // Filtered Community List (strictly decoupled: zero reports!)
  const visibleCommunityPins = useMemo(() => {
    if (communityFilter === 'official') return [];
    const q = normalizeSearch(search);
    return communityPostPins
      .filter(p =>
        communityFilter === 'saved'
          ? savedIds.includes(p.id)
          : communityFilter === 'all' || p.type === communityFilter,
      )
      .filter(p => !q || normalizeSearch(`${p.title} ${p.description} ${p.category} ${p.place}`).includes(q))
      .sort((a, b) => {
        if (sortBy === 'near') return distance(a.location, pointA.location) - distance(b.location, pointA.location);
        if (sortBy === 'active') {
          const score = (p: Pin) =>
            p.participants.length + (state?.messages.filter(m => m.pinId === p.id).length || 0);
          return score(b) - score(a);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [communityPostPins, communityFilter, savedIds, search, sortBy, pointA.location, state?.messages]);

  // Available Official Event Categories with live counts
  const availableCityEventCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of cityEventsFeed.events) {
      counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [cityEventsFeed.events]);

  // Filtered Official Municipal & Cultural Events for Community tab
  const visibleCityEvents = useMemo(() => {
    if (communityFilter === 'activity' || communityFilter === 'discussion') return [];
    const q = normalizeSearch(search);
    return cityEventsFeed.events
      .filter(ev => {
        if (communityFilter === 'saved' && !savedEventIds.includes(ev.id)) return false;
        if (communityEventCategory !== 'all' && ev.category !== communityEventCategory) return false;
        if (q && !normalizeSearch(`${ev.title} ${ev.venue} ${ev.category} ${ev.source}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'near') {
          return (
            distance({ lon: a.lon, lat: a.lat }, pointA.location) -
            distance({ lon: b.lon, lat: b.lat }, pointA.location)
          );
        }
        return a.startsAt.localeCompare(b.startsAt);
      });
  }, [cityEventsFeed.events, communityFilter, communityEventCategory, savedEventIds, search, sortBy, pointA.location]);

  // Filtered Citizen Reports
  const visibleCitizenReports = useMemo(() => {
    const q = normalizeSearch(search);
    return citizenReportPins
      .filter(() => reportsSourceFilter !== 'municipal')
      .filter(p => !q || normalizeSearch(`${p.title} ${p.description} ${p.category} ${p.subcategory ?? ''} ${p.place}`).includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [citizenReportPins, reportsSourceFilter, search]);

  const municipalSourceList = useMemo(
    () => (municipalFeed.allReports.length ? municipalFeed.allReports : municipalFeed.reports),
    [municipalFeed.allReports, municipalFeed.reports],
  );

  const availableMunicipalCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of municipalCategorii) counts.set(cat, 0);
    for (const report of municipalSourceList) {
      if (reportsStatusFilter !== 'all' && report.status !== reportsStatusFilter) continue;
      counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [municipalSourceList, reportsStatusFilter]);

  const availableMunicipalSubcategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of municipalSourceList) {
      if (reportsStatusFilter !== 'all' && report.status !== reportsStatusFilter) continue;
      if (reportsCategoryFilter !== 'all' && report.category !== reportsCategoryFilter) continue;
      counts.set(report.title, (counts.get(report.title) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [municipalSourceList, reportsStatusFilter, reportsCategoryFilter]);

  // Filtered Official Municipal Reports
  const visibleMunicipalReports = useMemo(() => {
    if (reportsSourceFilter === 'citizen') return [];
    const q = normalizeSearch(search);
    return municipalSourceList.filter(report => {
      if (reportsStatusFilter !== 'all' && report.status !== reportsStatusFilter) return false;
      if (reportsCategoryFilter !== 'all' && report.category !== reportsCategoryFilter) return false;
      if (reportsSubcategoryFilter !== 'all' && report.title !== reportsSubcategoryFilter) return false;
      if (q) {
        const hay = normalizeSearch(`${report.number} ${report.title} ${report.category} ${report.description ?? ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    municipalSourceList,
    reportsSourceFilter,
    reportsStatusFilter,
    reportsCategoryFilter,
    reportsSubcategoryFilter,
    search,
  ]);

  // News Feed Geo-Located Items for the Map when in 'news' tab
  const newsTemporalLimitMs = useMemo(() => {
    if (newsTemporalWindow === 'daily') return 24 * 3600_000;
    if (newsTemporalWindow === 'weekly') return 7 * 24 * 3600_000;
    return 30 * 24 * 3600_000;
  }, [newsTemporalWindow]);

  const mapNewsMunicipalReports = useMemo(() => {
    const now = Date.now();
    const sourceList = municipalFeed.allReports.length ? municipalFeed.allReports : municipalFeed.reports;
    return sourceList.filter(r => {
      if (!r.coordinates) return false;
      const ms = Date.parse(r.createdAt);
      return Number.isFinite(ms) && now - ms <= newsTemporalLimitMs;
    });
  }, [municipalFeed.allReports, municipalFeed.reports, newsTemporalLimitMs]);

  const mapNewsCitizenReports = useMemo(() => {
    const now = Date.now();
    return citizenReportPins.filter(p => {
      const ms = Date.parse(p.createdAt);
      return Number.isFinite(ms) && now - ms <= newsTemporalLimitMs;
    });
  }, [citizenReportPins, newsTemporalLimitMs]);

  // Isolated Map Pins & Municipal Reports based on Active Module
  const mapPins = useMemo<Pin[]>(() => {
    if (sidebarTab === 'news') return mapNewsCitizenReports;
    if (sidebarTab === 'reports') return visibleCitizenReports;
    if (sidebarTab === 'community') return visibleCommunityPins;
    return [];
  }, [sidebarTab, mapNewsCitizenReports, visibleCitizenReports, visibleCommunityPins]);

  const mapMunicipalReports = useMemo(() => {
    if (sidebarTab === 'news') return mapNewsMunicipalReports;
    if (sidebarTab === 'reports') return visibleMunicipalReports.filter(r => r.coordinates);
    return [];
  }, [sidebarTab, mapNewsMunicipalReports, visibleMunicipalReports]);

  const placeFeatures = infrastructure.places?.features || [];
  const filteredPlaces = useMemo(
    () => findPlaces(infrastructure, placesSearch, placeCategory, enabledPoiKinds),
    [infrastructure, placesSearch, placeCategory, enabledPoiKinds],
  );

  // Autocomplete candidates for Google Maps-style Route Planner (Point A, Waypoints & Point B)
  const allRouteCandidates = useMemo(() => {
    const items: RouteEndpoint[] = [];
    const seen = new Set<string>();
    for (const f of placeFeatures) {
      if (f.geometry?.type !== 'Point') continue;
      const name = String(f.properties?.name ?? '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const [lon, lat] = f.geometry.coordinates;
      items.push({ title: name, location: { lon, lat } });
    }
    if (transitNetwork) {
      for (const st of transitNetwork.stops) {
        const key = `Stația ${st.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ title: key, location: { lon: st.lon, lat: st.lat } });
      }
    }
    return items;
  }, [placeFeatures, transitNetwork]);

  const pointASuggestions = useMemo(() => {
    const q = normalizeSearch(pointAQuery);
    if (!q || q.length < 2) return [];
    return allRouteCandidates.filter(c => normalizeSearch(c.title).includes(q)).slice(0, 6);
  }, [allRouteCandidates, pointAQuery]);

  const pointBSuggestions = useMemo(() => {
    const q = normalizeSearch(pointBQuery);
    if (!q || q.length < 2) return [];
    return allRouteCandidates.filter(c => normalizeSearch(c.title).includes(q)).slice(0, 6);
  }, [allRouteCandidates, pointBQuery]);

  // Global Omni-Search Results
  const omniResults = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q || q.length < 2) return null;
    const lines = lineSummaries
      .filter(l => normalizeSearch(`${l.line} ${l.directions.map(d => d.direction).join(' ')}`).includes(q))
      .slice(0, 4);
    const places = findPlaces(infrastructure, search, 'all').slice(0, 4);
    const reports = citizenReportPins
      .filter(p => normalizeSearch(`${p.title} ${p.place} ${p.category} ${p.subcategory ?? ''}`).includes(q))
      .slice(0, 3);
    const pmt = (municipalFeed.allReports.length ? municipalFeed.allReports : municipalFeed.reports)
      .filter(r => normalizeSearch(`${r.number} ${r.title} ${r.category}`).includes(q))
      .slice(0, 3);
    const events = cityEventsFeed.events
      .filter(ev => normalizeSearch(`${ev.title} ${ev.venue} ${ev.category} ${ev.source}`).includes(q))
      .slice(0, 4);
    return { lines, places, reports, pmt, events };
  }, [search, lineSummaries, infrastructure, citizenReportPins, municipalFeed.allReports, municipalFeed.reports, cityEventsFeed.events]);

  async function run(action: Action, okText?: string) {
    if (!requireAuthenticatedUser()) return false;
    setBusy(true);
    setFormError('');
    try {
      if (onAction) {
        await onAction(action);
      } else if (cloud) {
        setState(await cloud.store.dispatch(action));
      } else {
        setState(await localDispatch(action));
      }
      if (okText) setToast({ text: okText });
      return true;
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Operațiunea nu a reușit.';
      if (modal) setFormError(text);
      else setToast({ text, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openCreateReport(defaultLocation = pointA.location) {
    if (!requireAuthenticatedUser()) return;
    setForm(emptyForm('report', defaultLocation));
    setReportFormStep(1);
    setFormError('');
    setModal('create-report');
  }

  function openCreateCommunity(type: 'activity' | 'discussion' = 'activity', defaultLocation = pointA.location) {
    if (!requireAuthenticatedUser()) return;
    setForm({
      ...emptyForm(type, defaultLocation),
      startsAt: type === 'activity' ? toLocalInput() : undefined,
      endsAt: type === 'activity' ? toLocalInput(new Date(Date.now() + 90000000).toISOString()) : undefined,
      capacity: type === 'activity' ? 15 : undefined,
    });
    setFormError('');
    setModal('create-community');
  }

  function toggleSaveCityEvent(eventId: string, clickEv?: ReactMouseEvent) {
    clickEv?.stopPropagation();
    setSavedEventIds(prev => {
      const exists = prev.includes(eventId);
      const next = exists ? prev.filter(id => id !== eventId) : [...prev, eventId];
      try {
        localStorage.setItem('urban-conect-saved-events', JSON.stringify(next));
      } catch {
        // ignore storage error
      }
      setToast({
        text: exists ? 'Evenimentul a fost eliminat din Salvate.' : 'Evenimentul a fost salvat în lista ta.',
      });
      return next;
    });
  }

  function findDiscussionForCityEvent(ev: OfficialCityEvent): Pin | undefined {
    const titlePrefix = `discuție: ${ev.title.toLowerCase().slice(0, 28)}`;
    return communityPostPins.find(
      p =>
        p.type === 'discussion' &&
        (p.relatedId === ev.id || p.title.toLowerCase().includes(titlePrefix)),
    );
  }

  function startOrOpenEventDiscussion(ev: OfficialCityEvent, clickEv?: ReactMouseEvent) {
    clickEv?.stopPropagation();
    const existing = findDiscussionForCityEvent(ev);
    if (existing) {
      setSelectedCityEvent(null);
      selectPin(existing.id);
      setChatPinId(existing.id);
      return;
    }
    if (!requireAuthenticatedUser()) return;
    const startStr = dateLabel(ev.startsAt, { day: 'numeric', month: 'short', year: 'numeric' });
    setForm({
      type: 'discussion',
      title: `Discuție: ${ev.title}`.slice(0, 95),
      category: 'Recomandări',
      place: ev.venue.slice(0, 95),
      location: { lon: ev.lon, lat: ev.lat },
      description: `Discuție comunitară despre evenimentul „${ev.title}” organizat la ${ev.venue} (${startStr}${ev.timeLabel ? `, ora ${ev.timeLabel}` : ''}). Cine participă sau are recomandări?`,
      relatedId: ev.id,
    });
    setFormError('');
    setModal('create-community');
  }

  function openMobileSheetForSelection() {
    setMobilePanelOpen(true);
    setMobileSheetSnap(curr => (curr === 'peek' ? 'half' : curr));
  }

  function selectPin(id: string) {
    setSelectedMunicipalNumber('');
    setSelectedVehicleId('');
    setSelectedVeloStation(null);
    setSelectedCityEvent(null);
    setSelectedPlace(null);
    setSelectedPinId(id);
    if (id) openMobileSheetForSelection();
  }

  function selectMunicipalReport(number: string) {
    setSelectedPinId('');
    setSelectedVehicleId('');
    setSelectedVeloStation(null);
    setSelectedCityEvent(null);
    setSelectedPlace(null);
    setSelectedMunicipalNumber(number);
    if (number) {
      if (sidebarTab !== 'reports' && sidebarTab !== 'news') {
        switchModule('reports');
        setSelectedMunicipalNumber(number);
      }
      openMobileSheetForSelection();
    }
  }

  function selectVehicle(vehicle: LiveVehicle) {
    setSelectedPinId('');
    setSelectedMunicipalNumber('');
    setSelectedVeloStation(null);
    setSelectedCityEvent(null);
    setSelectedPlace(null);
    if (sidebarTab !== 'transport' && sidebarTab !== 'route') {
      switchModule('transport');
    }
    setSelectedVehicleId(vehicle.id);
    if (sidebarTab === 'transport') {
      // Isolate exclusively that vehicle's line and direction on the map!
      setSelectedTransportLine(vehicle.line);
      if (vehicle.directionId === '1') {
        setSelectedTransportDirection('retur');
      } else if (vehicle.directionId === '0') {
        setSelectedTransportDirection('tur');
      }
      setShowAllTransportRoutes(false);
      setLayers(prev => ({
        ...prev,
        tramways: false,
        busways: false,
      }));
    }
    openMobileSheetForSelection();
  }

  function handleSelectTransportLine(line: string) {
    setSelectedVehicleId('');
    setSelectedTransportLine(line);
    if (line) {
      setShowAllTransportRoutes(false);
      setLayers(prev => ({
        ...prev,
        tramways: false,
        busways: false,
      }));
    }
  }

  function handleToggleShowAllTransportRoutes(enabled: boolean) {
    setShowAllTransportRoutes(enabled);
    if (enabled) {
      setSelectedTransportLine('');
      setSelectedVehicleId('');
      void ensureLayerData('tramways');
      void ensureLayerData('busways');
    }
    setLayers(prev => ({
      ...prev,
      tramways: enabled,
      busways: enabled,
    }));
  }

  function handleChangeNetworkSubFilters(next: NetworkSubFilters) {
    setNetworkSubFilters(next);
    if (next.tram) void ensureLayerData('tramways');
    if (next.trolleybus || next.bus) void ensureLayerData('busways');
  }

  // Smart Layers Category Selection (auto-zoom & layer isolation)
  function handleSelectSmartCategory(cat: string) {
    setPlaceCategory(cat);
    setSelectedPlace(null);
    setLayers({
      tramways: false,
      busways: false,
      cycleways: false,
      sidewalks: false,
      places: true,
    });
    setMapFit(v => v + 1);
  }

  function handleTogglePoiKind(kind: string) {
    setEnabledPoiKinds(prev => ({
      ...prev,
      [kind]: prev[kind] === false ? true : false,
    }));
    setMapFit(v => v + 1);
  }

  // Google Maps Style Routing: Start / Waypoints / Swap / Calculate
  function startRouteToDestination(dest: RouteEndpoint, mode: RouteMode = travelMode) {
    setTravelMode(mode);
    switchModule('route');
    setPointB(dest);
    setPointBQuery(dest.title);
    setRoute(undefined);
    setTransitRoute(undefined);
    void calculateRouteBetween(pointA, dest, mode, waypoints);
  }

  function addWaypoint() {
    if (waypoints.length >= 5) {
      setToast({ text: 'Poți adăuga cel mult 5 opriri intermediare.', error: true });
      return;
    }
    const defaultWp: RouteEndpoint = {
      location: { lon: 21.2289, lat: 45.7566 },
      title: 'Piața Unirii, Timișoara',
    };
    const nextWps = [...waypoints, defaultWp];
    setWaypoints(nextWps);
    setWaypointQueries([...waypointQueries, defaultWp.title]);
  }

  function updateWaypoint(index: number, endpoint: RouteEndpoint) {
    const nextWps = waypoints.map((w, idx) => (idx === index ? endpoint : w));
    const nextQueries = waypointQueries.map((q, idx) => (idx === index ? endpoint.title : q));
    setWaypoints(nextWps);
    setWaypointQueries(nextQueries);
    if (pointB) void calculateRouteBetween(pointA, pointB, travelMode, nextWps);
  }

  function removeWaypoint(index: number) {
    const nextWps = waypoints.filter((_, idx) => idx !== index);
    const nextQueries = waypointQueries.filter((_, idx) => idx !== index);
    setWaypoints(nextWps);
    setWaypointQueries(nextQueries);
    if (pointB) void calculateRouteBetween(pointA, pointB, travelMode, nextWps);
  }

  function swapRouteEndpoints() {
    if (!pointB) {
      setToast({ text: 'Alege mai întâi Punctul B (Destinația) pentru a inversa ruta.', error: true });
      return;
    }
    const prevA = pointA;
    const prevB = pointB;
    const reversedWps = [...waypoints].reverse();
    const reversedQueries = [...waypointQueries].reverse();
    setPointA(prevB);
    setPointB(prevA);
    setPointAQuery(prevB.title);
    setPointBQuery(prevA.title);
    setWaypoints(reversedWps);
    setWaypointQueries(reversedQueries);
    setRoute(undefined);
    setTransitRoute(undefined);
    void calculateRouteBetween(prevB, prevA, travelMode, reversedWps);
  }

  async function calculateRouteBetween(
    origin: RouteEndpoint = pointA,
    destination: RouteEndpoint | null = pointB,
    mode: RouteMode = travelMode,
    currentWaypoints: RouteEndpoint[] = waypoints,
  ) {
    if (!destination) {
      setToast({ text: 'Selectează Punctul B (Destinația) pentru calculul rutei.', error: true });
      return;
    }
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRouteBusy(true);
    setRoute(undefined);
    setTransitRoute(undefined);

    try {
      if (mode === 'transit') {
        const transitPoints: TransitPoint[] = [
          { ...origin.location, name: origin.title },
          ...currentWaypoints.map(w => ({ ...w.location, name: w.title })),
          { ...destination.location, name: destination.title },
        ];
        const planned = await planTransit(transitPoints, controller.signal);
        setTransitRoute({ ...planned, selected: 0 });
        setToast({ text: 'Rutele STPT și vehiculele live au fost calculate.' });
      } else {
        const result = await calculateRoute(
          origin.location,
          destination.location,
          currentWaypoints.map(w => w.location),
          controller.signal,
          mode,
        );
        setRoute(result);
        setToast({ text: result.warnings[0] || 'Traseul A → B a fost calculat.' });
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setToast({ text: e instanceof Error ? e.message : 'Traseul nu a putut fi calculat.', error: true });
      }
    } finally {
      if (routeAbort.current === controller) setRouteBusy(false);
    }
  }

  function requestCurrentGps(onLocate: (point: Point) => void) {
    if (!navigator.geolocation) {
      setToast({ text: 'Browserul nu oferă geolocalizare.', error: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = { lon: +pos.coords.longitude.toFixed(6), lat: +pos.coords.latitude.toFixed(6) };
        setUserLocation(p);
        onLocate(p);
      },
      () => setToast({ text: 'Permisiunea pentru locație a fost refuzată.', error: true }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function useGpsForPointA() {
    requestCurrentGps(p => {
      const nextA = { location: p, title: 'Locația curentă (GPS)' };
      setPointA(nextA);
      setPointAQuery(nextA.title);
      setFocus(x => x + 1);
      setToast({ text: 'Punctul A a fost setat la locația ta GPS.' });
    });
  }

  function useGpsForForm() {
    requestCurrentGps(async p => {
      setForm(f => ({ ...f, location: p }));
      setToast({ text: 'Coordonatele GPS ale sesizării au fost preluate.' });
      const label = await reverseGeocode(p, new AbortController().signal);
      if (label) setForm(f => ({ ...f, place: label }));
    });
  }

  async function onMapPick(point: Point) {
    if (pickTarget === 'form') {
      setForm(f => ({ ...f, location: point }));
      setPickTarget(null);
      geocodeAbort.current?.abort();
      const controller = new AbortController();
      geocodeAbort.current = controller;
      const label = await reverseGeocode(point, controller.signal);
      if (label && !controller.signal.aborted) setForm(f => ({ ...f, place: label }));
    } else if (pickTarget === 'pointA') {
      const nextA = { location: point, title: `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` };
      setPointA(nextA);
      setPointAQuery(nextA.title);
      setPickTarget(null);
      const label = await reverseGeocode(point, new AbortController().signal);
      if (label) {
        setPointA({ location: point, title: label });
        setPointAQuery(label);
      }
    } else if (pickTarget === 'pointB') {
      const nextB = { location: point, title: `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` };
      setPointB(nextB);
      setPointBQuery(nextB.title);
      setPickTarget(null);
      const label = await reverseGeocode(point, new AbortController().signal);
      if (label) {
        const resolvedB = { location: point, title: label };
        setPointB(resolvedB);
        setPointBQuery(label);
        void calculateRouteBetween(pointA, resolvedB, travelMode, waypoints);
      } else {
        void calculateRouteBetween(pointA, nextB, travelMode, waypoints);
      }
    } else if (pickTarget && pickTarget.startsWith('waypoint:')) {
      const wpIndex = Number(pickTarget.split(':')[1]);
      setPickTarget(null);
      const fallbackTitle = `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
      updateWaypoint(wpIndex, { location: point, title: fallbackTitle });
      const label = await reverseGeocode(point, new AbortController().signal);
      if (label) {
        updateWaypoint(wpIndex, { location: point, title: label });
      }
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    const candidate: FormInput = {
      ...form,
      subcategory: form.type === 'report' ? form.subcategory || reportSubcategories[form.category]?.[0] : undefined,
      startsAt: form.type === 'activity' && form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.type === 'activity' && form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      capacity: form.type === 'activity' && form.capacity ? Number(form.capacity) : undefined,
    };
    const parsed = formSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Verifică datele introduse.');
      return;
    }
    if (modal === 'edit' && selected) {
      if (await run({ type: 'edit', pinId: selected.id, input: parsed.data, userId: user.id }, 'Actualizat cu succes.')) {
        setModal(null);
      }
    } else {
      const id = crypto.randomUUID();
      if (
        await run(
          { type: 'create', id, input: parsed.data, userId: user.id },
          parsed.data.type === 'report' ? 'Sesizarea a fost înregistrată în baza de date.' : 'Postarea a fost publicată în Comunitate.',
        )
      ) {
        setModal(null);
        if (parsed.data.type === 'report') {
          switchModule('reports');
        } else {
          switchModule('community');
        }
        selectPin(id);
      }
    }
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    setBusy(true);
    setFormError('');
    try {
      const image = await compressPhoto(file);
      setForm(f => ({ ...f, image }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Fotografia nu a putut fi procesată.');
    } finally {
      setBusy(false);
    }
  }

  async function sharePin(pin: Pin) {
    const url = new URL(window.location.href);
    url.pathname = pin.type === 'report' ? '/sesizari' : '/comunitate';
    url.searchParams.set('pin', pin.id);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.toString());
      setToast({ text: 'Linkul a fost copiat în clipboard.' });
    }
  }

  function toggleChat(pinId: string, event?: ReactMouseEvent) {
    event?.stopPropagation();
    setChatVisibleCount(30);
    setChatPinId(current => {
      const next = current === pinId ? '' : pinId;
      if (!next) setChatExpanded(false);
      return next;
    });
  }

  function startChatResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 760) return;
    event.preventDefault();
    const startX = event.clientX;
    const panel = event.currentTarget.parentElement;
    const startWidth = panel?.getBoundingClientRect().width || chatWidth || 510;
    const sidebarWidth = window.innerWidth >= 1100 ? 395 : 380;
    const maxWidth = Math.max(280, window.innerWidth - sidebarWidth - 140);
    const clamp = (value: number) => Math.min(maxWidth, Math.max(280, Math.round(value)));
    const onMove = (moveEvent: PointerEvent) => setChatWidth(clamp(startWidth + moveEvent.clientX - startX));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (fatal) {
    return (
      <main className="fatal">
        <AlertTriangle size={36} />
        <h1>Baza de date nu a putut fi inițializată</h1>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          <RefreshCw size={16} /> Reîncearcă
        </button>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="fatal">
        <span className="spinner" />
        <p role="status">Se inițializează Urban Conect Timișoara…</p>
      </main>
    );
  }

  const chatMessages = chatPin ? state.messages.filter(m => m.pinId === chatPin.id) : [];
  const visibleChatMessages = chatMessages.slice(-chatVisibleCount);
  const hasOlderChatMessages = chatMessages.length > visibleChatMessages.length;

  function renderPinCard(pin: Pin) {
    const Icon = typeIcons[pin.type];
    const author = personById(pin.authorId);
    const count = state!.messages.filter(m => m.pinId === pin.id).length;
    const isSaved = savedIds.includes(pin.id);
    const isConfirmed = pin.supports.includes(user.id);
    const canConfirm = pin.type === 'report' && pin.status !== 'resolved' && pin.authorId !== user.id;

    return (
      <article className={`pin-card ${selected?.id === pin.id ? 'is-selected' : ''}`} key={pin.id}>
        <button type="button" className="card-main" onClick={() => selectPin(pin.id)}>
          <div className="card-top">
            <span className={`type-label ${pin.type}`}>
              <Icon size={13} />
              {meta[pin.type].label}
            </span>
            <span className="category-chip">{pin.category}</span>
            {pin.subcategory && <span className="subcategory-chip">{pin.subcategory}</span>}
            {pin.reportedToMunicipality && (
              <span className="pmt-linked-badge" title="Raportat și pe sesizari.primariatm.ro">
                Trimis PMT
              </span>
            )}
          </div>
          <h3>{pin.title}</h3>
          <span className="place">
            <MapPin size={12} />
            {pin.place} <span className="dot" /> {Math.round(distance(pin.location, pointA.location))} m
          </span>
          {pin.type === 'activity' && (
            <div className="card-date">
              <Calendar size={12} />
              {dateLabel(pin.startsAt!)} · {activityState(pin)}
            </div>
          )}
          <p className="card-description">{pin.description}</p>
        </button>
        <div className="card-footer">
          <span className="person-line">
            <span className="avatar tiny" style={{ background: author.color }}>
              {author.initials}
            </span>
            <span className="card-author">{author.name}</span>
          </span>
          {pin.type === 'activity' && (
            <span className="card-stat" title="Participanți">
              <Users size={12} />
              {pin.participants.length}
              {pin.capacity ? `/${pin.capacity}` : ''}
            </span>
          )}
          <button
            type="button"
            className="card-chat"
            aria-expanded={chatPin?.id === pin.id}
            onClick={event => toggleChat(pin.id, event)}
          >
            <MessageSquare size={13} />
            <span>Discuție</span>
            {count > 0 && <span className="card-message-count">({count})</span>}
          </button>
        </div>
        <div className="card-actions">
          {pin.type === 'report' && (
            <button
              type="button"
              className="icon-btn card-confirm"
              disabled={!canConfirm || busy}
              aria-pressed={isConfirmed}
              aria-label={`Confirmări (${pin.supports.length})`}
              onClick={() => run({ type: 'support', pinId: pin.id, userId: user.id })}
            >
              <ThumbsUp size={15} />
              <span>{pin.supports.length}</span>
            </button>
          )}
          <button
            type="button"
            className={`icon-btn card-bookmark ${isSaved ? 'bookmarked' : ''}`}
            aria-label={isSaved ? 'Elimină din salvate' : 'Salvează'}
            onClick={() => run({ type: 'save', pinId: pin.id, userId: user.id })}
          >
            <Bookmark size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <div
      className={`app-shell map-first ${mobilePanelOpen ? 'panel-open' : ''} sheet-snap-${mobileSheetSnap} ${chatPin ? 'chat-open' : ''}`}
    >
      {/* Top Unified Header */}
      <header className="app-header">
        <div className="header-identity">
          <a
            className="brand-logo"
            href="#harta"
            aria-label="Urban Conect Timișoara"
            onClick={e => {
              e.preventDefault();
              switchModule('news');
            }}
          >
            <picture>
              <source media="(max-width: 760px)" srcSet="/urban-connect-icon.png" type="image/png" />
              <img
                src={theme === 'dark' ? '/urban-connect-logo-v4-dark.png' : '/urban-connect-logo-v4.png'}
                alt="Urban Conect"
              />
            </picture>
          </a>
          <div className="header-city" title="Platformă inteligentă pentru Timișoara">
            <MapPin size={14} color="#0F52BA" />
            <span>Timișoara</span>
            {stptFeed.vehicles.length > 0 && (
              <span className="city-live-badge">{stptFeed.vehicles.length} STPT</span>
            )}
          </div>
        </div>

        {/* Global Omni-Search Bar */}
        <div className="global-search-container">
          <div className="global-search" role="search">
            <Search size={16} />
            <input
              type="search"
              name="urban-omni-search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={search}
              onFocus={() => setOmniSearchOpen(true)}
              onChange={e => {
                setSearch(e.target.value);
                setOmniSearchOpen(true);
              }}
              placeholder="Caută linii STPT, adrese, sesizări PMT, stații VeloTM, instituții…"
              aria-label="Caută în toată platforma Urban Conect"
            />
            {search && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setSearch('');
                  setOmniSearchOpen(false);
                }}
                aria-label="Șterge căutarea"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {omniSearchOpen && omniResults && (
            <div className="omni-search-dropdown" role="listbox" aria-label="Rezultate rapide">
              {omniResults.lines.length > 0 && (
                <div className="omni-section">
                  <span className="omni-section-title">Linii Transport STPT</span>
                  {omniResults.lines.map(l => (
                    <button
                      type="button"
                      key={`${l.type}-${l.line}`}
                      className="omni-item"
                      onClick={() => {
                        setOmniSearchOpen(false);
                        switchModule('transport');
                        handleSelectTransportLine(l.line);
                      }}
                    >
                      <span className="omni-badge" style={{ background: l.color }}>
                        {l.line}
                      </span>
                      <span>
                        <strong>Linia {l.line}</strong> — {l.directions.map(d => d.direction).join(' ↔ ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {omniResults.places.length > 0 && (
                <div className="omni-section">
                  <span className="omni-section-title">Locuri & Instituții</span>
                  {omniResults.places.map(f => {
                    const place = toMapPlace(f);
                    return (
                      <button
                        type="button"
                        key={place.id}
                        className="omni-item"
                        onClick={() => {
                          setOmniSearchOpen(false);
                          switchModule('places');
                          setSelectedPlace(place);
                        }}
                      >
                        <PlaceIcon kind={place.kind} size={15} />
                        <span>{place.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {omniResults.pmt.length > 0 && (
                <div className="omni-section">
                  <span className="omni-section-title">Sesizări Oficiale Primărie</span>
                  {omniResults.pmt.map(r => (
                    <button
                      type="button"
                      key={r.number}
                      className="omni-item"
                      onClick={() => {
                        setOmniSearchOpen(false);
                        selectMunicipalReport(r.number);
                      }}
                    >
                      <Building2 size={14} color="#0F52BA" />
                      <span>
                        <strong>{r.number}</strong> · {r.title}
                      </span>
                      <small>{municipalStatuses[r.status].label}</small>
                    </button>
                  ))}
                </div>
              )}

              {omniResults.reports.length > 0 && (
                <div className="omni-section">
                  <span className="omni-section-title">Sesizări Cetățenești</span>
                  {omniResults.reports.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      className="omni-item"
                      onClick={() => {
                        setOmniSearchOpen(false);
                        switchModule('reports');
                        selectPin(p.id);
                      }}
                    >
                      <AlertTriangle size={14} color="#0F52BA" />
                      <span>{p.title}</span>
                      <small>{p.place}</small>
                    </button>
                  ))}
                </div>
              )}

              {omniResults.events.length > 0 && (
                <div className="omni-section">
                  <span className="omni-section-title">Evenimente Oficiale</span>
                  {omniResults.events.map(ev => (
                    <button
                      type="button"
                      key={ev.id}
                      className="omni-item"
                      onClick={() => {
                        setOmniSearchOpen(false);
                        switchModule('community');
                        setSelectedCityEvent(ev);
                      }}
                    >
                      <Ticket size={14} color="#0F52BA" />
                      <span>{ev.title}</span>
                      <small>{ev.venue}</small>
                    </button>
                  ))}
                </div>
              )}

              {omniResults.lines.length === 0 &&
                omniResults.places.length === 0 &&
                omniResults.pmt.length === 0 &&
                omniResults.reports.length === 0 &&
                omniResults.events.length === 0 && (
                  <div className="omni-empty">Niciun rezultat pentru „{search}”.</div>
                )}
            </div>
          )}
        </div>

        <div className="app-header-actions">
          <button
            type="button"
            className="primary header-create"
            onClick={() =>
              sidebarTab === 'community' ? openCreateCommunity('activity') : openCreateReport()
            }
          >
            <Plus size={16} />
            <span>{sidebarTab === 'community' ? 'Eveniment / Discuție' : 'Raportează sesizare'}</span>
          </button>
          <button
            type="button"
            className={`header-profile ${isUnauthenticatedCloud ? 'unauthenticated' : ''}`}
            onClick={() => (onOpenAccount ? onOpenAccount() : setModal('profile'))}
            aria-label={isUnauthenticatedCloud ? 'Conectare cont Google sau e-mail' : `Cont activ: ${user.name}`}
            title={
              isUnauthenticatedCloud
                ? 'Conectează-te cu Google sau e-mail'
                : accountStatus
                  ? `${user.name} · ${accountStatus}`
                  : `Cont: ${user.name}`
            }
          >
            {isUnauthenticatedCloud ? (
              <span className="header-login-pill">Conectare</span>
            ) : (
              <span className="avatar" style={{ background: user.color }}>
                {user.initials}
              </span>
            )}
          </button>
        </div>

        <AiUrbanAssistant
          open={aiAssistantOpen}
          onToggleOpen={() => setAiAssistantOpen(prev => !prev)}
          activeModule={sidebarTab}
          pointA={pointA}
          pointB={pointB}
          userLocation={userLocation}
          routeCandidates={allRouteCandidates}
          lineSummaries={lineSummaries}
          liveVehicles={stptFeed.vehicles}
          stptAlerts={stptFeed.alerts}
          municipalReports={municipalSourceList}
          veloStations={veloFeed.stations}
          cityEvents={cityEventsFeed.events}
          selectedVehicle={selectedVehicle}
          selectedTransportLine={selectedTransportLine}
          selectedTransportDirection={selectedTransportDirection}
          selectedPlace={selectedPlace}
          selectedMunicipal={selectedMunicipal}
          municipalDetail={municipalDetail ?? undefined}
          selectedPin={selected}
          selectedVeloStation={selectedVeloStation}
          selectedCityEvent={selectedCityEvent}
          mapViewport={mapViewport}
          callbacks={{
            onPlanRoute: ({ origin, destination, waypoints: nextWaypoints, mode }) => {
              const targetMode = mode ?? travelMode;
              const resolvedOrigin = origin ?? pointA;
              const resolvedWaypoints = nextWaypoints ?? [];
              switchModule('route');
              if (origin) {
                setPointA(origin);
                setPointAQuery(origin.title);
              }
              setWaypoints(resolvedWaypoints);
              setWaypointQueries(resolvedWaypoints.map(w => w.title));
              setTravelMode(targetMode);
              setPointB(destination);
              setPointBQuery(destination.title);
              setRoute(undefined);
              setTransitRoute(undefined);
              void calculateRouteBetween(resolvedOrigin, destination, targetMode, resolvedWaypoints);
            },
            onSelectTransportLine: (line, direction) => {
              switchModule('transport');
              handleSelectTransportLine(line);
              if (direction) setSelectedTransportDirection(direction);
            },
            onInspectPlace: place => {
              switchModule('places');
              setSelectedPlace(place);
            },
            onSwitchModule: tab => switchModule(tab),
          }}
        />

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Comută la tema luminoasă' : 'Comută la tema întunecată'}
          title={theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'}
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </header>

      <main className="workspace" id="harta">
        <div className="main-layout">
          <section className="discovery" aria-label="Panou principal Urban Conect">
            <div
              className="sheet-grabber"
              role="button"
              tabIndex={0}
              aria-label="Glisează sau apasă pentru a ajusta înălțimea panoului mobil"
              onPointerDown={e => {
                sheetDragStartY.current = e.clientY;
                sheetDragged.current = false;
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={e => {
                if (sheetDragStartY.current === null) return;
                if (Math.abs(e.clientY - sheetDragStartY.current) > 18) {
                  sheetDragged.current = true;
                }
              }}
              onPointerUp={e => {
                if (sheetDragStartY.current === null) return;
                const dy = e.clientY - sheetDragStartY.current;
                sheetDragStartY.current = null;
                if (dy < -28) {
                  setMobilePanelOpen(true);
                  setMobileSheetSnap(curr => (curr === 'peek' ? 'half' : 'full'));
                } else if (dy > 28) {
                  setMobileSheetSnap(curr => (curr === 'full' ? 'half' : 'peek'));
                }
              }}
              onClick={() => {
                if (sheetDragged.current) {
                  sheetDragged.current = false;
                  return;
                }
                if (!mobilePanelOpen) {
                  setMobilePanelOpen(true);
                  setMobileSheetSnap('half');
                } else {
                  setMobileSheetSnap(curr => (curr === 'peek' ? 'half' : curr === 'half' ? 'full' : 'peek'));
                }
              }}
            >
              <span />
              <div className="mobile-sheet-snap-pills">
                <small>
                  {mobileSheetSnap === 'peek'
                    ? '30% · Glisează în sus'
                    : mobileSheetSnap === 'half'
                      ? '54% · Glisează sus / jos'
                      : '90% · Glisează în jos'}
                </small>
              </div>
            </div>

            {/* Primary 6-Module Navigation Tabs */}
            <div className="sidebar-tabs" role="tablist" aria-label="Secțiuni Urban Conect">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'news'}
                className={sidebarTab === 'news' ? 'active' : ''}
                onClick={() => switchModule('news')}
              >
                <Newspaper size={15} />
                <span>Noutăți</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'transport'}
                className={sidebarTab === 'transport' ? 'active' : ''}
                onClick={() => switchModule('transport')}
              >
                <Bus size={15} />
                <span>Transport</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'velo'}
                className={sidebarTab === 'velo' ? 'active' : ''}
                onClick={() => switchModule('velo')}
              >
                <Bike size={15} />
                <span>Velo</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'reports'}
                className={sidebarTab === 'reports' ? 'active' : ''}
                onClick={() => switchModule('reports')}
              >
                <AlertTriangle size={15} />
                <span>Sesizări</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'community'}
                className={sidebarTab === 'community' ? 'active' : ''}
                onClick={() => switchModule('community')}
              >
                <Users size={15} />
                <span>Comunitate</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'places'}
                className={sidebarTab === 'places' ? 'active' : ''}
                onClick={() => switchModule('places')}
              >
                <Sparkles size={15} />
                <span>Oraș</span>
              </button>
            </div>

            {(sidebarTab === 'route' || sidebarTab === 'layers') && (
              <div className="subtab-bar">
                <span>
                  {sidebarTab === 'route' ? 'Navigare A ↔ B (Stil Google Maps)' : 'Configurare Straturi'}
                </span>
                <button type="button" onClick={() => switchModule('news')}>
                  <X size={14} /> Închide
                </button>
              </div>
            )}

            <div className="mobile-panel-heading">
              <button
                type="button"
                className="icon-btn mobile-close-panel"
                onClick={() => setMobilePanelOpen(false)}
                aria-label="Restrânge panoul"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sidebar-content">
              {/* Contextual Inspector Panels: Vehicle, Municipal Report, or Pin */}
              {selectedVehicle ? (
                <VehicleDetailPanel
                  vehicle={selectedVehicle}
                  close={() => setSelectedVehicleId('')}
                  onAddStopToRoute={stop =>
                    startRouteToDestination({ location: { lon: stop.lon, lat: stop.lat }, title: `Stația ${stop.name}` }, 'transit')
                  }
                />
              ) : selectedMunicipal ? (
                <aside className="detail-panel municipal-detail-panel" aria-label="Detalii sesizare Primăria Timișoara">
                  <div className="detail-toolbar">
                    <button type="button" className="secondary" onClick={() => setSelectedMunicipalNumber('')}>
                      Înapoi la listă
                    </button>
                    <span>Sesizare Oficială Primăria Timișoara</span>
                    <div className="detail-tools">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setSelectedMunicipalNumber('')}
                        aria-label="Închide"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="detail-scroll">
                    {selectedMunicipal.photoUrl && (
                      <div className="detail-image">
                        <img src={selectedMunicipal.photoUrl} alt={selectedMunicipal.title} loading="lazy" />
                        <span>FOTOGRAFIE OFICIALĂ SESIZARE PMT</span>
                      </div>
                    )}
                    <div className="detail-content">
                      <div className="detail-badges">
                        <span className="official-badge">
                          <Building2 size={13} /> Primăria Municipiului Timișoara
                        </span>
                        <span className={`status-badge ${selectedMunicipal.status === 'Finalizata' ? 'resolved' : 'in-progress'}`}>
                          {municipalStatuses[selectedMunicipal.status].label}
                        </span>
                        <span className="ref-number-badge">{selectedMunicipal.number}</span>
                      </div>

                      <h2>{selectedMunicipal.title}</h2>

                      {/* 4-Stage Official Municipal Workflow Stepper */}
                      <div className="report-workflow-stepper" aria-label="Stadiul oficial al sesizării">
                        {[
                          { key: 'submitted', label: 'Depusă', active: true },
                          { key: 'registered', label: 'Înregistrată', active: true },
                          {
                            key: 'progress',
                            label: 'În lucru',
                            active:
                              selectedMunicipal.status === 'In lucru' ||
                              selectedMunicipal.status === 'Finalizata' ||
                              selectedMunicipal.status === 'Asteapta clarificari',
                          },
                          {
                            key: 'resolved',
                            label: 'Rezolvată',
                            active: selectedMunicipal.status === 'Finalizata',
                          },
                        ].map((step, idx) => (
                          <div key={step.key} className={`workflow-step ${step.active ? 'completed' : ''}`}>
                            <span className="workflow-step-dot">{idx + 1}</span>
                            <small>{step.label}</small>
                          </div>
                        ))}
                      </div>

                      <div className="detail-place">
                        <MapPin size={14} />
                        <span>
                          {municipalDetail?.street
                            ? `Str. ${municipalDetail.street}${municipalDetail.streetNumber ? ` nr. ${municipalDetail.streetNumber}` : ''}, Timișoara`
                            : `${selectedMunicipal.category} · ${selectedMunicipal.title}`}
                        </span>
                      </div>

                      <div className="activity-facts">
                        <div>
                          <Building2 size={16} />
                          <span>
                            <strong>Categorie oficială</strong>
                            <small>
                              {selectedMunicipal.category} — {selectedMunicipal.title}
                            </small>
                          </span>
                        </div>
                        <div>
                          <Calendar size={16} />
                          <span>
                            <strong>Data înregistrării</strong>
                            <small>{dateLabel(selectedMunicipal.createdAt)}</small>
                          </span>
                        </div>
                      </div>

                      {selectedMunicipal.description && (
                        <div className="municipal-description-box">
                          <strong>Descrierea sesizării</strong>
                          <p className="detail-description">{selectedMunicipal.description}</p>
                        </div>
                      )}

                      {municipalDetail?.history && municipalDetail.history.length > 0 && (
                        <div className="municipal-history-box">
                          <strong>Istoric actualizări status (Primăria Timișoara)</strong>
                          <ol className="municipal-history-timeline">
                            {municipalDetail.history.map((h, i) => (
                              <li key={`${h.status}-${i}`}>
                                <span className="history-status">{h.status}</span>
                                <small>{dateLabel(h.createdAt)}</small>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <div className="route-actions">
                        {selectedMunicipal.coordinates && (
                          <button
                            type="button"
                            className="secondary full"
                            onClick={() => {
                              const [lon, lat] = selectedMunicipal.coordinates!;
                              startRouteToDestination({ location: { lon, lat }, title: `Sesizare ${selectedMunicipal.number}` });
                            }}
                          >
                            <Navigation size={15} /> Navighează la această sesizare (A → B)
                          </button>
                        )}
                        <a
                          className="primary full"
                          href={municipalReportUrl(selectedMunicipal.number)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Deschide pe sesizari.primariatm.ro <ExternalLink size={15} />
                        </a>
                      </div>
                    </div>
                  </div>
                </aside>
              ) : selectedCityEvent ? (
                <aside className="detail-panel" aria-label="Detalii eveniment oficial">
                  <div className="detail-toolbar">
                    <button type="button" className="secondary" onClick={() => setSelectedCityEvent(null)}>
                      Înapoi la listă
                    </button>
                    <span>Eveniment Oficial Timișoara</span>
                    <div className="detail-tools">
                      <button
                        type="button"
                        className={`icon-btn ${savedEventIds.includes(selectedCityEvent.id) ? 'bookmarked' : ''}`}
                        aria-label="Salvează evenimentul"
                        title="Salvează evenimentul"
                        onClick={e => toggleSaveCityEvent(selectedCityEvent.id, e)}
                      >
                        <Bookmark size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Închide"
                        onClick={() => setSelectedCityEvent(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="detail-scroll">
                    <div className="detail-content">
                      <div className="detail-badges">
                        <span className="type-label activity">
                          <Ticket size={13} /> Eveniment Oficial
                        </span>
                        <span className="status-badge">{selectedCityEvent.category}</span>
                        <span className="official-source-chip">{selectedCityEvent.source}</span>
                      </div>

                      <h2>{selectedCityEvent.title}</h2>

                      <div className="detail-place">
                        <MapPin size={14} />
                        <span>
                          {selectedCityEvent.venue} · {selectedCityEvent.lat.toFixed(4)}, {selectedCityEvent.lon.toFixed(4)}
                        </span>
                      </div>

                      <div className="activity-facts" style={{ marginTop: 14 }}>
                        <div>
                          <Calendar size={16} />
                          <span>
                            <strong>
                              {dateLabel(selectedCityEvent.startsAt, {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                              {selectedCityEvent.timeLabel ? ` · ora ${selectedCityEvent.timeLabel}` : ''}
                            </strong>
                            <small>Organizator / Sursă: {selectedCityEvent.source}</small>
                          </span>
                        </div>
                        <div>
                          <MapPin size={16} />
                          <span>
                            <strong>{selectedCityEvent.venue}</strong>
                            <small>
                              {selectedCityEvent.category} · Timișoara ({selectedCityEvent.lat.toFixed(5)},{' '}
                              {selectedCityEvent.lon.toFixed(5)})
                            </small>
                          </span>
                        </div>
                      </div>

                      <div className="route-actions">
                        <button
                          type="button"
                          className="primary full"
                          onClick={e => startOrOpenEventDiscussion(selectedCityEvent, e)}
                        >
                          <MessageSquare size={16} />
                          {findDiscussionForCityEvent(selectedCityEvent)
                            ? 'Deschide discuția comunității despre eveniment'
                            : 'Pornește o discuție pe baza acestui eveniment'}
                        </button>

                        <button
                          type="button"
                          className={`secondary full ${savedEventIds.includes(selectedCityEvent.id) ? 'supported' : ''}`}
                          onClick={e => toggleSaveCityEvent(selectedCityEvent.id, e)}
                        >
                          <Bookmark size={16} />
                          {savedEventIds.includes(selectedCityEvent.id)
                            ? 'Eveniment salvat în lista ta'
                            : 'Salvează evenimentul'}
                        </button>

                        <button
                          type="button"
                          className="secondary full"
                          onClick={() =>
                            startRouteToDestination({
                              location: { lon: selectedCityEvent.lon, lat: selectedCityEvent.lat },
                              title: `${selectedCityEvent.title} (${selectedCityEvent.venue})`,
                            })
                          }
                        >
                          <Navigation size={15} /> Navighează la eveniment (A → B)
                        </button>

                        {selectedCityEvent.ticketsUrl && (
                          <a
                            className="secondary full"
                            href={selectedCityEvent.ticketsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Rezervă / Cumpără bilete <ExternalLink size={15} />
                          </a>
                        )}

                        <a
                          className="secondary full"
                          href={selectedCityEvent.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Pagina oficială a evenimentului <ExternalLink size={15} />
                        </a>
                      </div>
                    </div>
                  </div>
                </aside>
              ) : selected ? (
                <aside className="detail-panel" aria-label="Detalii">
                  <div className="detail-toolbar">
                    <button type="button" className="secondary" onClick={() => setSelectedPinId('')}>
                      Înapoi la listă
                    </button>
                    <div className="detail-tools">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Distribuie"
                        onClick={() => sharePin(selected)}
                      >
                        <Share2 size={16} />
                      </button>
                      <button
                        type="button"
                        className={`icon-btn ${savedIds.includes(selected.id) ? 'bookmarked' : ''}`}
                        aria-label="Salvează"
                        onClick={() => run({ type: 'save', pinId: selected.id, userId: user.id })}
                      >
                        <Bookmark size={16} />
                      </button>
                      {selected.authorId === user.id && (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Editează"
                            onClick={() => {
                              setForm({
                                type: selected.type,
                                title: selected.title,
                                description: selected.description,
                                category: selected.category,
                                subcategory:
                                  selected.subcategory ??
                                  (selected.type === 'report'
                                    ? reportSubcategories[selected.category]?.[0]
                                    : undefined),
                                place: selected.place,
                                location: selected.location,
                                image: selected.image,
                                startsAt: toLocalInput(selected.startsAt),
                                endsAt: toLocalInput(selected.endsAt),
                                capacity: selected.capacity,
                              });
                              setModal('edit');
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            aria-label="Șterge"
                            onClick={async () => {
                              if (await run({ type: 'delete', pinId: selected.id, userId: user.id }, 'Elementul a fost șters.')) {
                                setSelectedPinId('');
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Închide"
                        onClick={() => setSelectedPinId('')}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="detail-scroll">
                    {selected.image && (
                      <div className="detail-image">
                        <img src={selected.image} alt={`Fotografie pentru ${selected.title}`} />
                      </div>
                    )}
                    <div className="detail-content">
                      <div className="detail-badges">
                        <span className={`type-label ${selected.type}`}>{meta[selected.type].label}</span>
                        <span className="status-badge">{selected.category}</span>
                        {selected.subcategory && <span className="subcategory-chip">{selected.subcategory}</span>}
                        {selected.type === 'report' && (
                          <span className={`status-badge ${selected.status}`}>
                            {selected.status === 'resolved' ? 'Rezolvată' : 'Deschisă'}
                          </span>
                        )}
                      </div>
                      <h2 ref={detailHeading} tabIndex={-1}>
                        {selected.title}
                      </h2>
                      <div className="detail-place">
                        <MapPin size={13} />
                        {selected.place} · {selected.location.lat.toFixed(4)}, {selected.location.lon.toFixed(4)}
                      </div>
                      <p className="detail-description">{selected.description}</p>

                      {selected.type === 'report' && (
                        <>
                          {/* 4-Stage Citizen Report Workflow Stepper: Submitted -> Registered -> In Progress -> Resolved */}
                          <div className="report-workflow-stepper" aria-label="Fluxul sesizării">
                            {[
                              { key: 'submitted', label: 'Depusă', active: true },
                              {
                                key: 'registered',
                                label: 'Înregistrată',
                                active:
                                  selected.supports.length > 0 ||
                                  Boolean(selected.reportedToMunicipality) ||
                                  selected.status === 'resolved',
                              },
                              {
                                key: 'progress',
                                label: 'În lucru',
                                active:
                                  Boolean(selected.reportedToMunicipality) ||
                                  selected.supports.length >= 2 ||
                                  selected.status === 'resolved',
                              },
                              {
                                key: 'resolved',
                                label: 'Rezolvată',
                                active: selected.status === 'resolved',
                              },
                            ].map((step, idx) => (
                              <div key={step.key} className={`workflow-step ${step.active ? 'completed' : ''}`}>
                                <span className="workflow-step-dot">{idx + 1}</span>
                                <small>{step.label}</small>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            disabled={selected.status === 'resolved' || selected.authorId === user.id || busy}
                            className={`primary full support-button ${selected.supports.includes(user.id) ? 'supported' : ''}`}
                            onClick={() => run({ type: 'support', pinId: selected.id, userId: user.id })}
                          >
                            <ThumbsUp size={16} />
                            {selected.supports.includes(user.id)
                              ? 'Ai confirmat sesizarea'
                              : 'Confirmă sesizarea în teren'}
                            <span>{selected.supports.length}</span>
                          </button>

                          {selected.authorId === user.id && (
                            <button
                              type="button"
                              disabled={busy}
                              className="secondary full"
                              onClick={() =>
                                run(
                                  { type: 'resolve', pinId: selected.id, userId: user.id },
                                  selected.status === 'resolved'
                                    ? 'Sesizarea a fost redeschisă.'
                                    : 'Sesizarea a fost marcată ca rezolvată.',
                                )
                              }
                            >
                              <CheckCircle2 size={16} />
                              {selected.status === 'resolved'
                                ? 'Redeschide sesizarea'
                                : 'Marchează sesizarea ca rezolvată'}
                            </button>
                          )}

                          <div className="municipal-report-actions">
                            <a
                              className="secondary full"
                              href={municipalReportsPortal}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Trimite și pe sesizari.primariatm.ro <ExternalLink size={15} />
                            </a>
                            {selected.authorId === user.id && (
                              <label className="checkbox-line">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selected.reportedToMunicipality)}
                                  disabled={busy}
                                  onChange={event =>
                                    void run(
                                      {
                                        type: 'setMunicipalReported',
                                        pinId: selected.id,
                                        userId: user.id,
                                        enabled: event.target.checked,
                                      },
                                      event.target.checked
                                        ? 'Marcată ca trimisă la Primărie.'
                                        : 'Marcajul a fost eliminat.',
                                    )
                                  }
                                />
                                Am înregistrat această sesizare și pe portalul Primăriei
                              </label>
                            )}
                          </div>
                        </>
                      )}

                      {selected.type === 'activity' && (
                        <div className="activity-facts">
                          <div>
                            <Calendar size={15} />
                            <span>
                              <strong>{dateLabel(selected.startsAt!)}</strong>
                              <small>până la {dateLabel(selected.endsAt!)}</small>
                            </span>
                          </div>
                          <div>
                            <Users size={15} />
                            <span>
                              <strong>
                                {selected.participants.length}
                                {selected.capacity ? ` din ${selected.capacity}` : ''} participanți
                              </strong>
                              <small>{activityState(selected)}</small>
                            </span>
                          </div>
                          {selected.authorId !== user.id && (
                            <button
                              type="button"
                              disabled={busy}
                              className="primary full"
                              onClick={() => run({ type: 'join', pinId: selected.id, userId: user.id })}
                            >
                              <Users size={16} />
                              {selected.participants.includes(user.id) ? 'Retrage participarea' : 'Participă la eveniment'}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="route-actions">
                        <button
                          type="button"
                          className="primary full"
                          onClick={() =>
                            startRouteToDestination({ location: selected.location, title: selected.title })
                          }
                        >
                          <Navigation size={16} /> Navighează aici (A → B)
                        </button>
                      </div>
                    </div>
                  </div>
                </aside>
              ) : sidebarTab === 'news' ? (
                /* 1. NOUTĂȚI (Reconversia secțiunii Hartă în Flux de Date cu Filtrare Temporală) */
                <NewsFeedPanel
                  temporalWindow={newsTemporalWindow}
                  onChangeTemporalWindow={setNewsTemporalWindow}
                  stptAlerts={stptFeed.alerts}
                  municipalReports={
                    municipalFeed.allReports.length ? municipalFeed.allReports : municipalFeed.reports
                  }
                  citizenReports={citizenReportPins}
                  selectedMunicipalNumber={selectedMunicipalNumber}
                  selectedPinId={selectedPinId}
                  onSelectMunicipal={selectMunicipalReport}
                  onSelectPin={selectPin}
                  onOpenTransport={() => switchModule('transport')}
                  loading={municipalFeed.loading && stptFeed.status === 'loading'}
                />
              ) : sidebarTab === 'transport' ? (
                /* 2. TRANSPORT (Exclusiv linia selectată, Toggle Afișează Toate + Sub-filtre Tramvaie/Troleibuze/Autobuze, Tur/Retur) */
                <TransportPanel
                  feed={stptFeed}
                  lineSummaries={lineSummaries}
                  selectedVehicle={selectedVehicle}
                  selectedLine={selectedTransportLine}
                  selectedDirection={selectedTransportDirection}
                  showAllRoutes={showAllTransportRoutes}
                  networkSubFilters={networkSubFilters}
                  onSelectVehicle={selectVehicle}
                  onSelectLine={handleSelectTransportLine}
                  onChangeDirection={setSelectedTransportDirection}
                  onToggleShowAllRoutes={handleToggleShowAllTransportRoutes}
                  onChangeNetworkSubFilters={handleChangeNetworkSubFilters}
                  onPlanToStop={stop =>
                    startRouteToDestination(
                      { location: { lon: stop.lon, lat: stop.lat }, title: `Stația ${stop.name}` },
                      'transit',
                    )
                  }
                  onOpenRoutePlanner={() => switchModule('route')}
                  userLocation={userLocation}
                />
              ) : sidebarTab === 'velo' ? (
                /* 3. VELO (Markeri dinamici cu Biciclete disponibile + Dock-uri libere) */
                <VeloPanel
                  veloFeed={veloFeed}
                  selectedStation={selectedVeloStation}
                  layers={layers}
                  userLocation={userLocation}
                  onToggleLayer={toggleLayer}
                  onSelectStation={setSelectedVeloStation}
                  onPlanCyclingTo={(point, title) => startRouteToDestination({ location: point, title }, 'cycling')}
                  onOpenCyclingPlanner={() => {
                    setTravelMode('cycling');
                    switchModule('route');
                  }}
                />
              ) : sidebarTab === 'reports' ? (
                /* 4. SESIZĂRI (Decuplate strict de Comunitate; doar Sesizări PMT + Sesizări Cetățenești) */
                <div className="reports-module">
                  <div className="panel-intro">
                    <div className="module-header-row">
                      <div>
                        <span className="module-eyebrow">SESIZĂRI CIVICE & PRIMĂRIA TIMIȘOARA</span>
                        <h1>Sesizări Cetățenești</h1>
                      </div>
                      <button type="button" className="primary compact-btn" onClick={() => openCreateReport()}>
                        <Plus size={14} /> Raportează
                      </button>
                    </div>
                    <p>
                      Modul dedicat exclusiv sesizărilor urbane (Categorie → Subcategorie), integrat cu{' '}
                      <a href={municipalReportsPortal} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                        sesizari.primariatm.ro
                      </a>
                      .
                    </p>
                  </div>

                  <div className="reports-kpi-grid">
                    <div className="kpi-box">
                      <strong>{municipalFeed.reports.length}</strong>
                      <small>Active PMT</small>
                    </div>
                    <div className="kpi-box">
                      <strong>
                        {municipalFeed.allReports.filter(r => r.status === 'Finalizata').length}
                      </strong>
                      <small>Finalizate (30z)</small>
                    </div>
                    <div className="kpi-box">
                      <strong>{citizenReportPins.length}</strong>
                      <small>Cetățeni</small>
                    </div>
                  </div>

                  <div className="filter-tabs" role="tablist" aria-label="Sursă sesizări">
                    <button
                      type="button"
                      className={reportsSourceFilter === 'all' ? 'active' : ''}
                      onClick={() => {
                        setReportsSourceFilter('all');
                        setReportsStatusFilter('all');
                        setReportsCategoryFilter('all');
                        setReportsSubcategoryFilter('all');
                        setReportsVisibleLimit(80);
                      }}
                    >
                      Toate ({municipalSourceList.length + citizenReportPins.length})
                    </button>
                    <button
                      type="button"
                      className={reportsSourceFilter === 'municipal' ? 'active' : ''}
                      onClick={() => setReportsSourceFilter('municipal')}
                    >
                      <Building2 size={13} /> Oficiale PMT ({municipalSourceList.length})
                    </button>
                    <button
                      type="button"
                      className={reportsSourceFilter === 'citizen' ? 'active' : ''}
                      onClick={() => setReportsSourceFilter('citizen')}
                    >
                      Cetățeni ({citizenReportPins.length})
                    </button>
                  </div>

                  {reportsSourceFilter !== 'citizen' && (
                    <div className="reports-filters-grid">
                      <label className="compact-select-field">
                        <span>Stare oficială PMT</span>
                        <select
                          value={reportsStatusFilter}
                          onChange={e => {
                            setReportsStatusFilter(e.target.value as 'all' | MunicipalStatus);
                            setReportsVisibleLimit(80);
                            setMapFit(v => v + 1);
                          }}
                        >
                          <option value="all">Toate stările ({municipalSourceList.length})</option>
                          <option value="Inregistrata">
                            Înregistrată ({municipalSourceList.filter(r => r.status === 'Inregistrata').length})
                          </option>
                          <option value="In lucru">
                            În lucru ({municipalSourceList.filter(r => r.status === 'In lucru').length})
                          </option>
                          <option value="Finalizata">
                            Finalizată ({municipalSourceList.filter(r => r.status === 'Finalizata').length})
                          </option>
                          <option value="Asteapta clarificari">
                            Așteaptă clarificări ({municipalSourceList.filter(r => r.status === 'Asteapta clarificari').length})
                          </option>
                          <option value="Declinata competenta">
                            Declinată competența ({municipalSourceList.filter(r => r.status === 'Declinata competenta').length})
                          </option>
                        </select>
                      </label>

                      <label className="compact-select-field">
                        <span>Categorie Primărie</span>
                        <select
                          value={reportsCategoryFilter}
                          onChange={e => {
                            setReportsCategoryFilter(e.target.value);
                            setReportsSubcategoryFilter('all');
                            setReportsVisibleLimit(80);
                            setMapFit(v => v + 1);
                          }}
                        >
                          <option value="all">Toate categoriile ({availableMunicipalCategories.length})</option>
                          {availableMunicipalCategories.map(([cat, count]) => (
                            <option key={cat} value={cat}>
                              {cat} ({count})
                            </option>
                          ))}
                        </select>
                      </label>

                      {reportsCategoryFilter !== 'all' && availableMunicipalSubcategories.length > 0 && (
                        <label className="compact-select-field" style={{ gridColumn: '1 / -1' }}>
                          <span>Subcategorie Primărie ({reportsCategoryFilter})</span>
                          <select
                            value={reportsSubcategoryFilter}
                            onChange={e => {
                              setReportsSubcategoryFilter(e.target.value);
                              setReportsVisibleLimit(80);
                              setMapFit(v => v + 1);
                            }}
                          >
                            <option value="all">
                              Toate subcategoriile ({availableMunicipalSubcategories.reduce((acc, [, c]) => acc + c, 0)})
                            </option>
                            {availableMunicipalSubcategories.map(([subcat, count]) => (
                              <option key={subcat} value={subcat}>
                                {subcat} ({count})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}

                  {(reportsStatusFilter !== 'all' ||
                    reportsCategoryFilter !== 'all' ||
                    reportsSubcategoryFilter !== 'all') && (
                    <div className="results-heading" style={{ padding: '4px 16px 8px' }}>
                      <span className="results-count">
                        Rezultate filtrate: <strong>{visibleMunicipalReports.length}</strong> sesizări PMT
                      </span>
                      <button
                        type="button"
                        className="stop-route-btn"
                        onClick={() => {
                          setReportsStatusFilter('all');
                          setReportsCategoryFilter('all');
                          setReportsSubcategoryFilter('all');
                          setReportsVisibleLimit(80);
                          setMapFit(v => v + 1);
                        }}
                      >
                        Resetează filtrele
                      </button>
                    </div>
                  )}

                  <div className="pin-list" role="region" aria-label="Lista sesizărilor">
                    {reportsSourceFilter !== 'municipal' &&
                      visibleCitizenReports.map(pin => renderPinCard(pin))}

                    {reportsSourceFilter !== 'citizen' &&
                      visibleMunicipalReports.slice(0, reportsVisibleLimit).map(r => (
                        <article
                          className={`pin-card municipal-card ${selectedMunicipalNumber === r.number ? 'is-selected' : ''}`}
                          key={r.number}
                        >
                          <button
                            type="button"
                            className="card-main"
                            onClick={() => selectMunicipalReport(r.number)}
                          >
                            <div className="card-top">
                              <span className="type-label report">
                                <Building2 size={13} /> Sesizare Primărie
                              </span>
                              <span className={`status-badge ${r.status === 'Finalizata' ? 'resolved' : ''}`}>
                                {municipalStatuses[r.status].label}
                              </span>
                            </div>
                            <h3>{r.title}</h3>
                            <span className="place">
                              <MapPin size={12} />
                              {r.category} · {r.number} · {dateLabel(r.createdAt)}
                            </span>
                            {r.description && <p className="card-description">{r.description}</p>}
                          </button>
                          <div className="card-footer">
                            <span className="person-line">
                              <span className="card-author">sesizari.primariatm.ro</span>
                            </span>
                            <a
                              className="action-link"
                              href={municipalReportUrl(r.number)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ width: 'auto', padding: 0 }}
                            >
                              Oficial <ExternalLink size={12} />
                            </a>
                          </div>
                        </article>
                      ))}

                    {reportsSourceFilter !== 'citizen' &&
                      visibleMunicipalReports.length > reportsVisibleLimit && (
                        <button
                          type="button"
                          className="secondary full"
                          onClick={() => setReportsVisibleLimit(prev => prev + 80)}
                        >
                          Afișează încă 80 de sesizări ({visibleMunicipalReports.length - reportsVisibleLimit} rămase)
                        </button>
                      )}

                    {municipalFeed.loading &&
                      visibleCitizenReports.length === 0 &&
                      visibleMunicipalReports.length === 0 && <SkeletonCards count={4} />}

                    {!municipalFeed.loading &&
                      visibleCitizenReports.length === 0 &&
                      visibleMunicipalReports.length === 0 && (
                      <div className="empty-state">
                        <AlertTriangle size={28} />
                        <h3>Nicio sesizare pentru filtrele selectate</h3>
                        {(reportsStatusFilter !== 'all' ||
                          reportsCategoryFilter !== 'all' ||
                          reportsSubcategoryFilter !== 'all' ||
                          reportsSourceFilter !== 'all') && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setReportsSourceFilter('all');
                              setReportsStatusFilter('all');
                              setReportsCategoryFilter('all');
                              setReportsSubcategoryFilter('all');
                              setReportsVisibleLimit(80);
                            }}
                          >
                            Resetează toate filtrele ({municipalSourceList.length} sesizări)
                          </button>
                        )}
                        <button type="button" className="primary" onClick={() => openCreateReport()}>
                          <Plus size={15} /> Adaugă o sesizare
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : sidebarTab === 'community' ? (
                /* 5. COMUNITATE & EVENIMENTE OFICIALE (Decuplată definitiv de Sesizări) */
                <Fragment>
                  <div className="panel-intro community-intro">
                    <div className="community-title-row">
                      <div>
                        <span className="module-eyebrow">AGENDA CULTURALĂ & VIAȚA DE CARTIER</span>
                        <h1>Comunitate & Evenimente</h1>
                      </div>
                      <button
                        type="button"
                        className="secondary community-create"
                        onClick={() => openCreateCommunity('activity')}
                      >
                        <Plus size={14} /> Postare nouă
                      </button>
                    </div>
                    <p>
                      Evenimente culturale și municipale oficiale geolocalizate pe hartă, inițiative civice și discuții locale (fără sesizări).
                    </p>
                  </div>

                  <div className="filter-tabs" role="tablist" aria-label="Filtre Comunitate">
                    <button
                      type="button"
                      className={communityFilter === 'all' ? 'active' : ''}
                      onClick={() => {
                        setCommunityFilter('all');
                        setCommunityEventCategory('all');
                        setMapFit(v => v + 1);
                      }}
                    >
                      Toate ({communityPostPins.length + cityEventsFeed.events.length})
                    </button>
                    <button
                      type="button"
                      className={communityFilter === 'official' ? 'active' : ''}
                      onClick={() => {
                        setCommunityFilter('official');
                        setMapFit(v => v + 1);
                      }}
                    >
                      <Ticket size={13} /> Agenda Oficială ({cityEventsFeed.events.length})
                    </button>
                    <button
                      type="button"
                      className={`activity ${communityFilter === 'activity' ? 'active' : ''}`}
                      onClick={() => {
                        setCommunityFilter('activity');
                        setMapFit(v => v + 1);
                      }}
                    >
                      <Calendar size={13} /> Activități ({communityPostPins.filter(p => p.type === 'activity').length})
                    </button>
                    <button
                      type="button"
                      className={`discussion ${communityFilter === 'discussion' ? 'active' : ''}`}
                      onClick={() => {
                        setCommunityFilter('discussion');
                        setMapFit(v => v + 1);
                      }}
                    >
                      <MessageSquare size={13} /> Discuții ({communityPostPins.filter(p => p.type === 'discussion').length})
                    </button>
                    <button
                      type="button"
                      className={communityFilter === 'saved' ? 'active' : ''}
                      onClick={() => {
                        setCommunityFilter('saved');
                        setMapFit(v => v + 1);
                      }}
                    >
                      <Bookmark size={13} /> Salvate ({savedEventIds.length + communityPostPins.filter(p => savedIds.includes(p.id)).length})
                    </button>
                  </div>

                  <div className="reports-filters-grid" style={{ paddingBottom: 0 }}>
                    {communityFilter !== 'activity' &&
                      communityFilter !== 'discussion' &&
                      availableCityEventCategories.length > 0 && (
                        <label className="compact-select-field">
                          <span>Categorie Eveniment</span>
                          <select
                            value={communityEventCategory}
                            onChange={e => {
                              setCommunityEventCategory(e.target.value);
                              setMapFit(v => v + 1);
                            }}
                          >
                            <option value="all">Toate categoriile ({cityEventsFeed.events.length})</option>
                            {availableCityEventCategories.map(([cat, count]) => (
                              <option key={cat} value={cat}>
                                {cat} ({count})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    <label
                      className="compact-select-field"
                      style={
                        communityFilter === 'activity' || communityFilter === 'discussion'
                          ? { gridColumn: '1 / -1' }
                          : undefined
                      }
                    >
                      <span>Ordonare</span>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as 'newest' | 'active' | 'near')}
                      >
                        <option value="newest">Cronologic / Cele mai noi</option>
                        <option value="near">Aproape de mine</option>
                        <option value="active">Cele mai active</option>
                      </select>
                    </label>
                  </div>

                  <div className="results-heading">
                    <span className="results-count">
                      {visibleCityEvents.length} evenimente oficiale · {visibleCommunityPins.length} postări comunitate
                    </span>
                    <button
                      type="button"
                      className="stop-route-btn"
                      onClick={() => openCreateCommunity('discussion')}
                    >
                      <MessageSquare size={12} /> + Discuție nouă
                    </button>
                  </div>

                  {search.trim() && (
                    <div className="results-heading" style={{ padding: '0 18px 10px' }}>
                      <span className="results-count">
                        Filtrat după căutare: <strong>„{search}”</strong>
                      </span>
                      <button
                        type="button"
                        className="stop-route-btn"
                        onClick={() => setSearch('')}
                      >
                        Șterge filtrul
                      </button>
                    </div>
                  )}

                  <div className="pin-list" role="region" aria-label="Evenimente și Postări Comunitate">
                    {/* Official Municipal & Cultural Events Geolocated on the Map */}
                    {visibleCityEvents.map(ev => {
                      const isEventSaved = savedEventIds.includes(ev.id);
                      const linkedDiscussion = findDiscussionForCityEvent(ev);
                      const linkedMsgCount = linkedDiscussion
                        ? state.messages.filter(m => m.pinId === linkedDiscussion.id).length
                        : 0;
                      const startStr = dateLabel(ev.startsAt, { day: 'numeric', month: 'short', year: 'numeric' });
                      const endStr = ev.endsAt
                        ? dateLabel(ev.endsAt, { day: 'numeric', month: 'short', year: 'numeric' })
                        : undefined;
                      return (
                        <article
                          key={ev.id}
                          className="pin-card official-event-card"
                        >
                          <div className="card-actions">
                            <button
                              type="button"
                              className={`icon-btn card-bookmark ${isEventSaved ? 'bookmarked' : ''}`}
                              aria-label={isEventSaved ? 'Elimină din salvate' : 'Salvează evenimentul'}
                              title={isEventSaved ? 'Salvat (click pentru eliminare)' : 'Salvează evenimentul'}
                              onClick={e => toggleSaveCityEvent(ev.id, e)}
                            >
                              <Bookmark size={16} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="card-main"
                            onClick={() => setSelectedCityEvent(ev)}
                          >
                            <div className="card-top">
                              <span className="type-label activity">
                                <Ticket size={13} /> Eveniment Oficial
                              </span>
                              <span className="category-chip">{ev.category}</span>
                              <span className="official-source-chip">{ev.source}</span>
                            </div>
                            <h3>{ev.title}</h3>
                            <span className="place">
                              <MapPin size={12} />
                              {ev.venue}
                            </span>
                            <div className="card-date">
                              <Calendar size={12} />
                              {startStr}
                              {endStr && endStr !== startStr ? ` – ${endStr}` : ''}
                              {ev.timeLabel ? ` · ora ${ev.timeLabel}` : ''}
                            </div>
                          </button>
                          <div className="card-footer">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="card-chat"
                                onClick={e => startOrOpenEventDiscussion(ev, e)}
                                title="Pornește sau deschide o discuție comunitară despre acest eveniment"
                              >
                                <MessageSquare size={14} />
                                <span>
                                  {linkedDiscussion
                                    ? `Discuție (${linkedMsgCount})`
                                    : 'Pornește discuție'}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="stop-route-btn"
                                onClick={() =>
                                  startRouteToDestination({
                                    location: { lon: ev.lon, lat: ev.lat },
                                    title: `${ev.title} (${ev.venue})`,
                                  })
                                }
                              >
                                <Navigation size={12} /> Rută A→B
                              </button>
                            </div>
                            <div className="event-external-links">
                              {ev.ticketsUrl && (
                                <a
                                  href={ev.ticketsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-link"
                                  style={{ width: 'auto', padding: 0 }}
                                >
                                  Bilete <ExternalLink size={12} />
                                </a>
                              )}
                              <a
                                href={ev.officialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="action-link"
                                style={{ width: 'auto', padding: 0 }}
                              >
                                Oficial <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                    {/* Citizen Community Activities & Discussions */}
                    {visibleCommunityPins.map(pin => renderPinCard(pin))}

                    {cityEventsFeed.loading &&
                      visibleCityEvents.length === 0 &&
                      visibleCommunityPins.length === 0 && <SkeletonCards count={3} />}

                    {!cityEventsFeed.loading &&
                      visibleCityEvents.length === 0 &&
                      visibleCommunityPins.length === 0 && (
                      <div className="empty-state">
                        <Users size={28} />
                        <h3>Nu există evenimente sau discuții pe selecția curentă</h3>
                        <p>
                          {search.trim() || communityFilter !== 'all' || communityEventCategory !== 'all'
                            ? 'Filtrele active sau textul din bara de căutare ascund evenimentele disponibile.'
                            : 'Fii primul care organizează o activitate sau deschide o discuție în cartierul tău.'}
                        </p>
                        {(search.trim() || communityFilter !== 'all' || communityEventCategory !== 'all') && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setSearch('');
                              setCommunityFilter('all');
                              setCommunityEventCategory('all');
                            }}
                          >
                            Afișează toate evenimentele ({cityEventsFeed.events.length + communityPostPins.length})
                          </button>
                        )}
                        <div className="two-actions" style={{ width: '100%' }}>
                          <button type="button" className="primary" onClick={() => openCreateCommunity('activity')}>
                            <Calendar size={14} /> Creează eveniment
                          </button>
                          <button type="button" className="secondary" onClick={() => openCreateCommunity('discussion')}>
                            <MessageSquare size={14} /> Pornește discuție
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              ) : sidebarTab === 'places' ? (
                /* 6. ORAȘ & STRATURI INTELIGENTE (Smart Layers + BaseMap Style Switcher + Multi-POI Toggles) */
                <PlacesPanel
                  places={filteredPlaces}
                  query={placesSearch}
                  setQuery={setPlacesSearch}
                  category={placeCategory}
                  setCategory={handleSelectSmartCategory}
                  baseMapStyle={baseMapStyle}
                  onChangeBaseMapStyle={setBaseMapStyle}
                  enabledPoiKinds={enabledPoiKinds}
                  onTogglePoiKind={handleTogglePoiKind}
                  error={layerErrors.places || ''}
                  retry={() => void ensureLayerData('places')}
                  select={place => {
                    setSelectedPlace(place);
                    setLayers({
                      tramways: false,
                      busways: false,
                      cycleways: false,
                      sidewalks: false,
                      places: true,
                    });
                  }}
                  selected={selectedPlace || undefined}
                  clear={() => setSelectedPlace(null)}
                  add={place =>
                    startRouteToDestination({ location: place.location, title: place.title })
                  }
                  create={place => openCreateCommunity('activity', place.location)}
                  share={place => setSharePlace(place)}
                />
              ) : sidebarTab === 'route' ? (
                /* 7. SISTEMUL DE RUTARE (Punctul A + Opriri Intermediare Waypoints + Punctul B + Swap + Live GTFS-RT) */
                <div className="route-planner google-maps-router">
                  <div className="panel-intro">
                    <span className="module-eyebrow">NAVIGARE URBANĂ TIMIȘOARA</span>
                    <h1>Planificator A ↔ B</h1>
                    <p>
                      Alege modul de deplasare, setează Punctul A (Plecare), opriri intermediare opționale și Punctul B (Destinația) sau inversează ruta cu butonul Swap.
                    </p>
                  </div>

                  <RouteChat
                    catalog={placeFeatures}
                    onPlan={(origin, stops, mode) => {
                      const nextMode = mode ?? travelMode;
                      if (mode) setTravelMode(mode);
                      const nextA = origin
                        ? { location: origin.location, title: origin.title }
                        : pointA;
                      if (origin) {
                        setPointA(nextA);
                        setPointAQuery(nextA.title);
                      }
                      const destPlace = stops[stops.length - 1];
                      const midStops = stops
                        .slice(0, -1)
                        .map(s => ({ location: s.location, title: s.title }));
                      setWaypoints(midStops);
                      setWaypointQueries(midStops.map(s => s.title));
                      if (destPlace) {
                        const nextB = { location: destPlace.location, title: destPlace.title };
                        setPointB(nextB);
                        setPointBQuery(nextB.title);
                        void calculateRouteBetween(nextA, nextB, nextMode, midStops);
                      }
                    }}
                  />

                  <div className="travel-mode-picker" role="group" aria-label="Mod de deplasare">
                    <button
                      type="button"
                      className={travelMode === 'transit' ? 'active' : ''}
                      onClick={() => {
                        setTravelMode('transit');
                        if (pointB) void calculateRouteBetween(pointA, pointB, 'transit', waypoints);
                      }}
                    >
                      <span className="combined-transit-icon" aria-hidden="true">
                        <TrainFront size={14} />
                        <Bus size={14} />
                      </span>
                      STPT Public
                    </button>
                    <button
                      type="button"
                      className={travelMode === 'walking' ? 'active' : ''}
                      onClick={() => {
                        setTravelMode('walking');
                        if (pointB) void calculateRouteBetween(pointA, pointB, 'walking', waypoints);
                      }}
                    >
                      <Footprints size={15} /> Pe jos
                    </button>
                    <button
                      type="button"
                      className={travelMode === 'cycling' ? 'active' : ''}
                      onClick={() => {
                        setTravelMode('cycling');
                        if (pointB) void calculateRouteBetween(pointA, pointB, 'cycling', waypoints);
                      }}
                    >
                      <Bike size={15} /> Bicicletă
                    </button>
                    <button
                      type="button"
                      className={travelMode === 'driving' ? 'active' : ''}
                      onClick={() => {
                        setTravelMode('driving');
                        if (pointB) void calculateRouteBetween(pointA, pointB, 'driving', waypoints);
                      }}
                    >
                      <Car size={15} /> Mașină
                    </button>
                  </div>

                  {/* Unified Google Maps-style A ↔ Waypoints ↔ B Card with Central Swap Button */}
                  <div className="gmaps-route-box">
                    {/* Punctul A */}
                    <div className="gmaps-endpoint-row">
                      <span className="endpoint-badge point-a-badge" aria-hidden="true">A</span>
                      <div className="endpoint-input-wrap">
                        <label htmlFor="route-point-a-input" className="sr-only">Punctul A (Plecare)</label>
                        <input
                          id="route-point-a-input"
                          value={pointAQuery || pointA.title}
                          onChange={e => setPointAQuery(e.target.value)}
                          placeholder="Punctul A: Locația curentă sau adresă…"
                        />
                        <div className="endpoint-quick-btns">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Folosește locația curentă GPS"
                            aria-label="Folosește locația curentă GPS"
                            onClick={useGpsForPointA}
                          >
                            <LocateFixed size={15} />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn ${pickTarget === 'pointA' ? 'active' : ''}`}
                            title="Alege Punctul A pe hartă"
                            aria-label="Alege Punctul A pe hartă"
                            onClick={() => setPickTarget('pointA')}
                          >
                            <MapPin size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {pointASuggestions.length > 0 && pointAQuery !== pointA.title && (
                      <div className="endpoint-suggestions">
                        {pointASuggestions.map(s => (
                          <button
                            type="button"
                            key={`a-${s.title}`}
                            onClick={() => {
                              setPointA(s);
                              setPointAQuery(s.title);
                              if (pointB) void calculateRouteBetween(s, pointB, travelMode, waypoints);
                            }}
                          >
                            <MapPin size={13} /> {s.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Intermediate Waypoints (Opriri intermediare între A și B) */}
                    {waypoints.map((wp, idx) => {
                      const wpQuery = waypointQueries[idx] ?? wp.title;
                      const wpNorm = normalizeSearch(wpQuery);
                      const wpSuggestions =
                        wpNorm.length >= 2 && wpQuery !== wp.title
                          ? allRouteCandidates.filter(c => normalizeSearch(c.title).includes(wpNorm)).slice(0, 5)
                          : [];
                      const wpPickKey: PickTarget = `waypoint:${idx}`;
                      return (
                        <div key={`wp-${idx}`} className="waypoint-item-block">
                          <div className="gmaps-endpoint-row waypoint-row">
                            <span className="endpoint-badge waypoint-badge" aria-hidden="true">
                              {idx + 1}
                            </span>
                            <div className="endpoint-input-wrap">
                              <label htmlFor={`route-waypoint-${idx}`} className="sr-only">
                                Oprire intermediară {idx + 1}
                              </label>
                              <input
                                id={`route-waypoint-${idx}`}
                                value={wpQuery}
                                onChange={e => {
                                  const next = [...waypointQueries];
                                  next[idx] = e.target.value;
                                  setWaypointQueries(next);
                                }}
                                placeholder={`Oprire intermediară ${idx + 1}…`}
                              />
                              <div className="endpoint-quick-btns">
                                <button
                                  type="button"
                                  className={`icon-btn ${pickTarget === wpPickKey ? 'active' : ''}`}
                                  title={`Alege oprirea ${idx + 1} pe hartă`}
                                  aria-label={`Alege oprirea ${idx + 1} pe hartă`}
                                  onClick={() => setPickTarget(wpPickKey)}
                                >
                                  <MapPin size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn danger"
                                  title={`Elimină oprirea ${idx + 1}`}
                                  aria-label={`Elimină oprirea ${idx + 1}`}
                                  onClick={() => removeWaypoint(idx)}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                          {wpSuggestions.length > 0 && (
                            <div className="endpoint-suggestions">
                              {wpSuggestions.map(s => (
                                <button
                                  type="button"
                                  key={`wp-${idx}-${s.title}`}
                                  onClick={() => updateWaypoint(idx, s)}
                                >
                                  <MapPin size={13} /> {s.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Central Controls: Add Waypoint + Swap A ↔ B */}
                    <div className="gmaps-swap-divider">
                      <button
                        type="button"
                        className="add-waypoint-btn"
                        onClick={addWaypoint}
                        title="Adaugă o oprire intermediară între A și B"
                      >
                        <Plus size={14} />
                        <span>Adaugă oprire ({waypoints.length}/5)</span>
                      </button>
                      <button
                        type="button"
                        className="route-swap-btn"
                        onClick={swapRouteEndpoints}
                        aria-label="Inversează Punctul A și Punctul B (Swap)"
                        title="Inversează Punctul A și Punctul B (Swap)"
                      >
                        <ArrowUpDown size={15} />
                        <span>Inversează A ↔ B</span>
                      </button>
                    </div>

                    {/* Punctul B */}
                    <div className="gmaps-endpoint-row">
                      <span className="endpoint-badge point-b-badge" aria-hidden="true">B</span>
                      <div className="endpoint-input-wrap">
                        <label htmlFor="route-point-b-input" className="sr-only">Punctul B (Destinație)</label>
                        <input
                          id="route-point-b-input"
                          value={pointBQuery}
                          onChange={e => setPointBQuery(e.target.value)}
                          placeholder="Punctul B: Caută destinația sau stația…"
                        />
                        <div className="endpoint-quick-btns">
                          {pointB && (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Șterge destinația"
                              aria-label="Șterge destinația"
                              onClick={() => {
                                setPointB(null);
                                setPointBQuery('');
                                setRoute(undefined);
                                setTransitRoute(undefined);
                              }}
                            >
                              <X size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className={`icon-btn ${pickTarget === 'pointB' ? 'active' : ''}`}
                            title="Alege Punctul B pe hartă"
                            aria-label="Alege Punctul B pe hartă"
                            onClick={() => setPickTarget('pointB')}
                          >
                            <MapPin size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {pointBSuggestions.length > 0 && pointBQuery !== pointB?.title && (
                      <div className="endpoint-suggestions">
                        {pointBSuggestions.map(s => (
                          <button
                            type="button"
                            key={`b-${s.title}`}
                            onClick={() => {
                              setPointB(s);
                              setPointBQuery(s.title);
                              void calculateRouteBetween(pointA, s, travelMode, waypoints);
                            }}
                          >
                            <MapPin size={13} /> {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="route-actions">
                    <button
                      type="button"
                      className="primary full"
                      disabled={!pointB || routeBusy}
                      onClick={() => void calculateRouteBetween(pointA, pointB, travelMode, waypoints)}
                    >
                      {routeBusy ? <span className="spinner" /> : <Navigation size={16} />}
                      Calculează ruta A → B
                      {waypoints.length > 0 ? ` (${waypoints.length} opriri)` : ''}
                    </button>
                  </div>

                  {route && (
                    <div className="route-result" role="status">
                      <div>
                        <strong>
                          {(route.distance / 1000).toFixed(1)} <small>km</small>
                        </strong>
                        <strong>
                          {Math.max(1, Math.round(route.duration / 60))} <small>min</small>
                        </strong>
                      </div>
                      <p>
                        <strong>A:</strong> {pointA.title}
                        {waypoints.map((w, i) => (
                          <span key={`res-wp-${i}`}>
                            {' '}
                            → <strong>{i + 1}:</strong> {w.title}
                          </span>
                        ))}{' '}
                        → <strong>B:</strong> {pointB?.title}
                      </p>
                      <div className="route-result-actions">
                        <button
                          type="button"
                          className="secondary full"
                          onClick={() => {
                            setRoute(undefined);
                            setTransitRoute(undefined);
                          }}
                        >
                          <X size={15} /> Șterge ruta de pe hartă
                        </button>
                      </div>
                    </div>
                  )}

                  {transitRoute && (
                    <TransitResults
                      options={transitRoute.options}
                      selected={transitRoute.selected}
                      validFrom={transitRoute.validFrom}
                      validTo={transitRoute.validTo}
                      liveVehicles={stptFeed.vehicles}
                      onSelectVehicle={selectVehicle}
                      select={index => setTransitRoute(current => current && { ...current, selected: index })}
                    />
                  )}
                </div>
              ) : null}
            </div>

            <div className="sidebar-bottom">
              <span>
                <i /> Timișoara Live · Date Reale STPT & PMT
              </span>
              <button type="button" onClick={() => switchModule('route')}>
                <Route size={13} /> Rutare A→B
              </button>
            </div>
          </section>

          {chatPin && (
            <section
              className={`pin-chat ${chatExpanded ? 'expanded' : ''}`}
              style={!chatExpanded && chatWidth ? { flexBasis: `${chatWidth}px` } : undefined}
              aria-label={`Conversație: ${chatPin.title}`}
            >
              <div className="pin-chat-header">
                <span className="pin-chat-symbol">
                  <MessageSquare size={16} />
                </span>
                <div>
                  <h2 ref={chatHeading} tabIndex={-1}>
                    {chatPin.title}
                  </h2>
                  <p>
                    {chatPin.place} · {chatMessages.length} mesaje
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary chat-expand"
                  onClick={() => setChatExpanded(value => !value)}
                >
                  {chatExpanded ? 'Restrânge' : 'Extinde'}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Închide conversația"
                  onClick={() => {
                    setChatPinId('');
                    setChatExpanded(false);
                  }}
                >
                  <X size={17} />
                </button>
              </div>
              <div
                className="chat-resize"
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}
                onPointerDown={startChatResize}
              />
              <div className="pin-chat-history" role="log" aria-live="polite">
                {hasOlderChatMessages && (
                  <button
                    type="button"
                    className="secondary full"
                    onClick={() => setChatVisibleCount(count => count + 30)}
                  >
                    Încarcă mesaje mai vechi ({chatMessages.length - visibleChatMessages.length})
                  </button>
                )}
                <div className="messages">
                  {visibleChatMessages.map(m => {
                    const a = personById(m.authorId);
                    return (
                      <div className="message" key={m.id}>
                        <span className="avatar tiny" style={{ background: a.color }}>
                          {a.initials}
                        </span>
                        <div>
                          <div className="message-author">
                            <strong>{a.name}</strong>
                            <time>{dateLabel(m.createdAt)}</time>
                            {m.authorId === user.id && (
                              <button
                                type="button"
                                className="icon-btn danger"
                                onClick={() =>
                                  run({ type: 'deleteMessage', messageId: m.id, userId: user.id })
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <p>{m.body}</p>
                        </div>
                      </div>
                    );
                  })}
                  {chatMessages.length === 0 && (
                    <p className="no-messages">Niciun mesaj încă. Scrie primul comentariu.</p>
                  )}
                </div>
              </div>
              <form
                className="message-composer"
                onSubmit={async e => {
                  e.preventDefault();
                  if (
                    await run({
                      type: 'message',
                      pinId: chatPin.id,
                      userId: user.id,
                      body: messageText,
                      id: crypto.randomUUID(),
                    })
                  ) {
                    setMessageText('');
                  }
                }}
              >
                <input
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Scrie un comentariu…"
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || busy}
                  aria-label="Trimite mesaj"
                >
                  <Send size={15} />
                </button>
              </form>
            </section>
          )}

          {/* Central Interactive Map Surface (Strictly Isolated Context per Active Module) */}
          <section
            className={`map-area ${pickTarget ? 'is-picking' : ''}`}
            aria-label="Hartă Timișoara"
          >
            <Suspense
              fallback={
                <div className="map-loading" role="status">
                  <span className="spinner" />
                  Se încarcă harta…
                </div>
              }
            >
              <MapCanvas
                theme={theme}
                tab={sidebarTab}
                browsePlaces={sidebarTab === 'places' ? filteredPlaces : []}
                placeCatalog={placeFeatures}
                routePoints={
                  sidebarTab === 'route'
                    ? [
                        { location: pointA.location, title: pointA.title },
                        ...waypoints.map(wp => ({ location: wp.location, title: wp.title })),
                        ...(pointB
                          ? [{ location: pointB.location, title: pointB.title, destination: true }]
                          : []),
                      ]
                    : []
                }
                pins={mapPins}
                selected={selected}
                onSelect={selectPin}
                picking={Boolean(pickTarget)}
                onPick={onMapPick}
                picked={pickTarget === 'form' ? form.location : undefined}
                userLocation={userLocation}
                route={sidebarTab === 'route' ? route : undefined}
                transit={sidebarTab === 'route' && transitRoute ? transitRoute.options[transitRoute.selected] : undefined}
                mobilePanelOpen={mobilePanelOpen}
                liveVehicles={mapLiveVehicles}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={id => {
                  const v = stptFeed.vehicles.find(item => item.id === id);
                  if (v) selectVehicle(v);
                }}
                activeLineRoute={activeLineRoute}
                networkSubFilters={
                  sidebarTab === 'transport' && showAllTransportRoutes ? networkSubFilters : undefined
                }
                veloStations={sidebarTab === 'velo' ? veloFeed.stations : []}
                selectedVeloStation={sidebarTab === 'velo' ? selectedVeloStation : null}
                onSelectVeloStation={station => {
                  setSelectedVeloStation(station);
                  openMobileSheetForSelection();
                }}
                cityEvents={sidebarTab === 'community' ? visibleCityEvents : []}
                selectedCityEvent={sidebarTab === 'community' ? selectedCityEvent : null}
                onSelectCityEvent={ev => {
                  setSelectedCityEvent(ev);
                  openMobileSheetForSelection();
                }}
                municipalReports={mapMunicipalReports}
                selectedMunicipal={selectedMunicipal}
                onSelectMunicipal={selectMunicipalReport}
                focus={focus}
                mapFit={mapFit}
                infrastructure={infrastructure}
                visibility={layers}
                labels={pinLabels}
                buildings={showBuildings}
                baseMapStyle={baseMapStyle}
                focusedPlace={sidebarTab === 'places' ? selectedPlace || undefined : undefined}
                onInspectPlace={place => {
                  switchModule('places');
                  setSelectedPlace(place);
                  openMobileSheetForSelection();
                }}
                onInspectLine={info => setInfrastructureInspection(info)}
                onViewportChange={setMapViewport}
              />
            </Suspense>

            {/* Contextual Module Badge & Base Map Style Quick Switcher */}
            <div className="map-context-pill">
              <Layers size={13} />
              <span>
                Context hartă:{' '}
                <strong>
                  {sidebarTab === 'news'
                    ? `Noutăți & Trafic (${newsTemporalWindow === 'daily' ? 'Zilnic' : newsTemporalWindow === 'weekly' ? 'Săptămânal' : 'Lunar'})`
                    : sidebarTab === 'transport'
                      ? selectedTransportLine && !showAllTransportRoutes
                        ? `Linia ${selectedTransportLine} (${selectedTransportDirection.toUpperCase()})`
                        : showAllTransportRoutes
                          ? 'Rețea Transport STPT (Filtru Activ)'
                          : 'Transport STPT (Selectează o linie)'
                      : sidebarTab === 'velo'
                        ? 'VeloTM & Piste Ciclo'
                        : sidebarTab === 'reports'
                          ? 'Sesizări Cetățenești & PMT'
                          : sidebarTab === 'community'
                            ? `Comunitate & Agenda (${visibleCityEvents.length} evenimente)`
                            : sidebarTab === 'places'
                              ? `Straturi Oraș (${baseMapStyle === 'satellite' ? 'Satelit' : baseMapStyle === 'buildings3d' ? 'Clădiri 3D' : 'Minimal'})`
                              : 'Navigare A ↔ B'}
                </strong>
              </span>
            </div>

            <div className="map-utility-controls" aria-label="Utilitare hartă">
              <button
                type="button"
                onClick={useGpsForPointA}
                aria-label="Locația mea"
                title="Centrează pe locația mea"
              >
                <LocateFixed size={18} />
              </button>
              <button
                type="button"
                onClick={() => setMapFit(value => value + 1)}
                aria-label="Încadrează elementele active"
                title="Încadrează pe hartă"
              >
                <Compass size={18} />
              </button>
            </div>

            {pickTarget && (
              <div className="picking-notice" role="status">
                <MapPin size={18} />
                <div>
                  <strong>
                    {pickTarget === 'form'
                      ? 'Atinge harta pentru a fixa locația'
                      : pickTarget === 'pointA'
                        ? 'Atinge harta pentru Punctul A (Plecare)'
                        : pickTarget === 'pointB'
                          ? 'Atinge harta pentru Punctul B (Destinație)'
                          : `Atinge harta pentru oprirea intermediară ${Number(pickTarget.split(':')[1]) + 1}`}
                  </strong>
                  <span>Coordonatele vor fi preluate automat.</span>
                </div>
                <button type="button" className="secondary" onClick={() => setPickTarget(null)}>
                  Anulează
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="mobile-map-nav" aria-label="Navigație mobilă Urban Conect">
          <button
            type="button"
            className={sidebarTab === 'news' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('news')}
          >
            <Newspaper size={18} />
            <span>Noutăți</span>
          </button>
          <button
            type="button"
            className={sidebarTab === 'transport' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('transport')}
          >
            <Bus size={18} />
            <span>Transport</span>
          </button>
          <button
            type="button"
            className={sidebarTab === 'velo' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('velo')}
          >
            <Bike size={18} />
            <span>Velo</span>
          </button>
          <button
            type="button"
            className={sidebarTab === 'reports' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('reports')}
          >
            <AlertTriangle size={18} />
            <span>Sesizări</span>
          </button>
          <button
            type="button"
            className={sidebarTab === 'community' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('community')}
          >
            <Users size={18} />
            <span>Comunitate</span>
          </button>
          <button
            type="button"
            className={sidebarTab === 'places' && mobilePanelOpen ? 'active' : ''}
            onClick={() => switchModule('places')}
          >
            <Sparkles size={18} />
            <span>Oraș</span>
          </button>
        </nav>
      </main>

      {/* Decoupled Creation / Edit Modal */}
      <AnimatePresence>
        {(modal === 'create-report' || modal === 'create-community' || modal === 'edit') && !pickTarget && (
          <motion.div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setModal(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal wide"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="form-title"
              tabIndex={-1}
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.97 }}
              transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            >
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {modal === 'edit'
                    ? 'EDITARE'
                    : modal === 'create-report'
                      ? 'MODUL SESIZĂRI CETĂȚENEȘTI'
                      : 'MODUL COMUNITATE TIMIȘOARA'}
                </span>
                <h2 id="form-title">
                  {modal === 'edit'
                    ? 'Editează detaliile'
                    : modal === 'create-report'
                      ? 'Raportează o sesizare urbană'
                      : 'Publică în Comunitate'}
                </h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModal(null)}
                aria-label="Închide"
              >
                <X size={18} />
              </button>
            </div>

            {/* Community modal allows switching only between Activity and Discussion (never Report!) */}
            {modal === 'create-community' && (
              <div className="create-types" role="radiogroup" aria-label="Tip postare comunitate">
                {(['activity', 'discussion'] as PinType[]).map(t => {
                  const Icon = typeIcons[t];
                  return (
                    <button
                      type="button"
                      key={t}
                      className={`${t} ${form.type === t ? 'selected' : ''}`}
                      onClick={() =>
                        setForm({
                          ...emptyForm(t, form.location),
                          place: form.place,
                          startsAt: t === 'activity' ? toLocalInput() : undefined,
                          endsAt:
                            t === 'activity'
                              ? toLocalInput(new Date(Date.now() + 90000000).toISOString())
                              : undefined,
                          capacity: t === 'activity' ? 15 : undefined,
                        })
                      }
                    >
                      <Icon size={17} />
                      <span>{meta[t].label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={e => {
                if (modal === 'create-report' && reportFormStep < 3) {
                  e.preventDefault();
                  setReportFormStep(curr => (curr < 3 ? ((curr + 1) as 1 | 2 | 3) : 3));
                  return;
                }
                void submitForm(e);
              }}
              className="create-form"
            >
              {modal === 'create-report' && (
                <div className="report-workflow-stepper" role="tablist" aria-label="Pași sesizare relațională">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportFormStep === 1}
                    className={`workflow-step ${reportFormStep === 1 ? 'active' : 'completed'}`}
                    onClick={() => setReportFormStep(1)}
                  >
                    <span className="workflow-step-dot">{reportFormStep > 1 ? '✓' : '1'}</span>
                    <span>Categorie</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportFormStep === 2}
                    className={`workflow-step ${reportFormStep === 2 ? 'active' : reportFormStep > 2 ? 'completed' : ''}`}
                    onClick={() => setReportFormStep(2)}
                  >
                    <span className="workflow-step-dot">{reportFormStep > 2 ? '✓' : '2'}</span>
                    <span>Subcategorie</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportFormStep === 3}
                    className={`workflow-step ${reportFormStep === 3 ? 'active' : ''}`}
                    onClick={() => setReportFormStep(3)}
                  >
                    <span className="workflow-step-dot">3</span>
                    <span>Locație & Detalii</span>
                  </button>
                </div>
              )}

              <div className="form-grid">
                {modal === 'create-report' && reportFormStep === 1 && (
                  <div className="field full-width">
                    <span>Pasul 1 · Alege categoria principală a sesizării</span>
                    <select
                      aria-label="Categorie principală"
                      value={form.category}
                      onChange={e => {
                        const nextCat = e.target.value;
                        const nextSub = reportSubcategories[nextCat]?.[0];
                        setForm({ ...form, category: nextCat, subcategory: nextSub });
                      }}
                    >
                      {meta.report.categories.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div className="report-relational-grid">
                      {meta.report.categories.map(c => (
                        <button
                          type="button"
                          key={c}
                          className={`report-relational-pill ${form.category === c ? 'selected' : ''}`}
                          onClick={() => {
                            const nextSub = reportSubcategories[c]?.[0];
                            setForm({ ...form, category: c, subcategory: nextSub });
                            setReportFormStep(2);
                          }}
                        >
                          <strong>{c}</strong>
                          <small>{(reportSubcategories[c] || []).length} subcategorii</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {modal === 'create-report' && reportFormStep === 2 && (
                  <div className="field full-width">
                    <span>
                      Pasul 2 · Alege subcategoria pentru <strong>{form.category}</strong>
                    </span>
                    <select
                      aria-label="Subcategorie specifică"
                      value={form.subcategory || reportSubcategories[form.category]?.[0] || ''}
                      onChange={e => setForm({ ...form, subcategory: e.target.value })}
                    >
                      {(reportSubcategories[form.category] || []).map(sub => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                    <div className="report-relational-grid">
                      {(reportSubcategories[form.category] || []).map(sub => {
                        const isSelected = (form.subcategory || reportSubcategories[form.category]?.[0]) === sub;
                        return (
                          <button
                            type="button"
                            key={sub}
                            className={`report-relational-pill ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setForm({ ...form, subcategory: sub });
                              setReportFormStep(3);
                            }}
                          >
                            <strong>{sub}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(modal !== 'create-report' || reportFormStep === 3) && (
                  <>
                    {modal === 'create-report' && (
                      <div className="field full-width">
                        <div className="report-selected-relation">
                          <span>
                            <strong>{form.category}</strong> →{' '}
                            {form.subcategory || reportSubcategories[form.category]?.[0]}
                          </span>
                          <button
                            type="button"
                            className="action-link"
                            onClick={() => setReportFormStep(1)}
                          >
                            Schimbă
                          </button>
                        </div>
                      </div>
                    )}

                    <label className="field full-width">
                      Titlu
                      <input
                        required
                        minLength={5}
                        maxLength={100}
                        value={form.title}
                        onChange={e => setForm({ ...form, title: e.target.value })}
                        placeholder={
                          form.type === 'report'
                            ? 'Ex.: Groapă periculoasă pe banda de circulație'
                            : form.type === 'activity'
                              ? 'Ex.: Ecologizare în Parcul Rozelor'
                              : 'Ex.: Propuneri pentru amenajarea curții interioare'
                        }
                      />
                    </label>

                    {modal !== 'create-report' && (
                      <>
                        <label className="field">
                          Categorie
                          <select
                            value={form.category}
                            onChange={e => {
                              const nextCat = e.target.value;
                              const nextSub =
                                form.type === 'report' ? reportSubcategories[nextCat]?.[0] : undefined;
                              setForm({ ...form, category: nextCat, subcategory: nextSub });
                            }}
                          >
                            {meta[form.type].categories.map(c => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>

                        {form.type === 'report' && (
                          <label className="field">
                            Subcategorie specifică
                            <select
                              value={form.subcategory || reportSubcategories[form.category]?.[0] || ''}
                              onChange={e => setForm({ ...form, subcategory: e.target.value })}
                            >
                              {(reportSubcategories[form.category] || []).map(sub => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </>
                    )}

                    <label className={`field ${form.type === 'report' ? 'full-width' : ''}`}>
                      Zonă sau reper
                      <input
                        required
                        maxLength={100}
                        value={form.place}
                        onChange={e => setForm({ ...form, place: e.target.value })}
                      />
                    </label>

                    <div className="field full-width">
                      <span>Locație pe hartă (Coordonate GPS)</span>
                      <div className="location-field">
                        <div className="location-summary">
                          <MapPin size={16} />
                          <div>
                            <strong>{form.place || 'Timișoara'}</strong>
                            <small>
                              {form.location.lat.toFixed(5)}, {form.location.lon.toFixed(5)}
                            </small>
                          </div>
                        </div>
                        <div className="two-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={useGpsForForm}
                          >
                            <LocateFixed size={14} /> Locația mea GPS
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setPickTarget('form')}
                          >
                            Alege pe hartă
                          </button>
                        </div>
                      </div>
                    </div>

                    {form.type === 'activity' && (
                      <>
                        <label className="field">
                          Începe la
                          <input
                            type="datetime-local"
                            required
                            value={form.startsAt || ''}
                            onChange={e => setForm({ ...form, startsAt: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          Se încheie la
                          <input
                            type="datetime-local"
                            required
                            value={form.endsAt || ''}
                            onChange={e => setForm({ ...form, endsAt: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          Locuri disponibile (opțional)
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={form.capacity || ''}
                            onChange={e =>
                              setForm({
                                ...form,
                                capacity: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                          />
                        </label>
                      </>
                    )}

                    <label className="field full-width">
                      Descriere
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={4}
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        placeholder="Descrie situația clar și concis…"
                      />
                    </label>

                    <div className="field full-width">
                      <span>Fotografie {form.type === 'report' ? '(obligatorie)' : '(opțională)'}</span>
                      {form.image ? (
                        <div className="upload-preview">
                          <img src={form.image} alt="Previzualizare" />
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setForm({ ...form, image: undefined })}
                          >
                            Elimină fotografia
                          </button>
                        </div>
                      ) : (
                        <label className="upload-area">
                          <Upload size={20} />
                          <strong>Încarcă o fotografie din teren</strong>
                          <span>JPG, PNG, WebP sau HEIC</span>
                          <input
                            type="file"
                            accept={photoAccept}
                            hidden
                            onChange={e => onPhoto(e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                  </>
                )}
              </div>

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="form-actions">
                {modal === 'create-report' && reportFormStep > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setReportFormStep(curr => (curr > 1 ? ((curr - 1) as 1 | 2 | 3) : 1))}
                  >
                    ← Înapoi
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => setModal(null)}>
                  Anulează
                </button>
                {modal === 'create-report' && reportFormStep < 3 ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setReportFormStep(curr => (curr < 3 ? ((curr + 1) as 1 | 2 | 3) : 3))}
                  >
                    Continuă la Pasul {reportFormStep + 1} →
                  </button>
                ) : (
                  <button type="submit" className="primary" disabled={busy}>
                    {busy
                      ? 'Se salvează…'
                      : modal === 'edit'
                        ? 'Salvează modificările'
                        : form.type === 'report'
                          ? 'Înregistrează sesizarea'
                          : 'Publică în Comunitate'}
                  </button>
                )}
              </div>
            </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Account Modal (Supabase + Google OAuth Login & Session Management) */}
      {modal === 'profile' && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">AUTENTIFICARE & SESIUNE</span>
                <h2 id="profile-title">Cont Cetățean Urban Conect</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModal(null)}
                aria-label="Închide"
              >
                <X size={18} />
              </button>
            </div>
            {cloud?.account ? (
              cloud.account
            ) : (
              <div className="cloud-account">
                <div className="authenticated-profile-card">
                  <div>
                    <strong>{user.name}</strong>
                    <p>Sesiune activă · Timișoara</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {sharePlace && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSharePlace(null)}>
          <div
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">DISTRIBUIRE LOCAȚIE</span>
                <h2>Distribuie locul</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSharePlace(null)}
                aria-label="Închide"
              >
                <X size={18} />
              </button>
            </div>
            <p className="share-place-name">{sharePlace.title}</p>
            <div className="share-place-actions">
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  const link = placeLink(sharePlace);
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(link);
                    setToast({ text: 'Linkul a fost copiat.' });
                  }
                }}
              >
                Copiază linkul
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Închide notificarea">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
