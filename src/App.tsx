import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Accessibility, ArrowDownUp, ArrowLeft, ArrowRight, Bike, Bookmark, CalendarDays, Car, TrainFront, Check, CheckCheck, ChevronRight, CircleHelp, Dumbbell, HandHeart, Landmark, Layers, Lightbulb, MapPinned, ExternalLink, Flag, Footprints, LocateFixed, MapPin, Maximize, MessageCircle, Moon, MoreHorizontal, Plus, Route, Search, Settings2, ShieldCheck, Sparkles, Sprout, Star, Sun, ThumbsUp, Trash2, Trees, TriangleAlert, Upload, Users, Wrench, X } from 'lucide-react';
import { activityState, center, dateLabel, distance, formSchema, meta, people, pointSchema } from './domain';
import type { Action, FormInput, Pin, PinType, Point, State } from './domain';
import { compressPhoto, dispatch, loadState, photoAccept, subscribe } from './storage';
import { calculateRoute, travelModes } from './routing';
import type { RouteResult, TravelMode } from './routing';
import { planTransit } from './transitRouter';
import TransitResults from './TransitResults';
import MapLayersPanel from './MapLayersPanel';
import PlacesPanel, { normalizeSearch, placeLink } from './PlacesPanel';
import PinChat from './PinChat';
import { readTheme, saveTheme } from './theme';
import { useMapData } from './infrastructure';
import type { Infrastructure, LayerKey, LayerVisibility, MapPlace } from './infrastructure';
import StptLivePanel from './StptLivePanel';
import { useStptVehicles } from './stpt-live';
import { useMunicipalReports } from './useMunicipalReports';
import { municipalReportId, municipalReportsPortal, municipalReportUrl, municipalStatuses } from './municipal-reports';
import type { MunicipalReport } from './municipal-reports';
import type { LiveVehicleType } from './stpt-live';
import { buildPlaceCatalog, filterPlaces } from './place-catalog';

const MapView = lazy(() => import('./MapCanvas'));
const hiddenLayers: LayerVisibility = { cycleways: false, tramways: false, busways: false, sidewalks: false, places: false };
const iconFor = (type: PinType, size = 18) => type === 'report' ? <TriangleAlert size={size} /> : type === 'activity' ? <CalendarDays size={size} /> : <MessageCircle size={size} />;
const readPin = () => { try { return decodeURIComponent(location.pathname.match(/^\/pins\/([^/]+)/)?.[1] || new URLSearchParams(location.search).get('pin') || ''); } catch { return ''; } };
const localDateValue = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'A apărut o eroare. Reîncearcă.';

function Modal({ title, children, close, wide = false, active = true }: { title: string; children: ReactNode; close: () => void; wide?: boolean; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const closer = useRef(close); closer.current = close;
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null; const root = ref.current; root?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closer.current();
      if (e.key === 'Tab' && root) {
        const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]')).filter(el => el.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler); return () => { document.removeEventListener('keydown', handler); before?.focus(); };
  }, [active]);
  if (!active) return null;
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}><div role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`} tabIndex={-1} ref={ref}><header className="modal-header"><div><h2>{title}</h2></div><button className="icon-btn" aria-label="Închide" onClick={close}><X /></button></header>{children}</div></div>;
}

function SharePlace({ place, close }: { place: MapPlace; close: () => void }) {
  const url = placeLink(place);
  const text = `${place.title}\n${url}`;
  const [feedback, setFeedback] = useState('');
  return <Modal title="Distribuie locul" close={close}>
    <p className="share-place-name">{place.title}</p>
    <label className="field">Link către loc<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    <div className="share-place-actions">
      <a className="primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <button className="secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setFeedback('Numele și linkul au fost copiate.'); }
        catch { setFeedback('Selectează linkul și copiază-l manual.'); }
      }}>Copiază linkul</button>
      {typeof navigator.share === 'function' && <button className="secondary" onClick={async () => {
        try { await navigator.share({ title: place.title, text: place.title, url }); }
        catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setFeedback('Folosește WhatsApp sau copiază linkul.'); }
      }}>Alte aplicații</button>}
    </div>
    {feedback && <p className="share-place-feedback" role="status">{feedback}</p>}
  </Modal>;
}

function PinCard({ pin, person, userId, busy, selected, select, saved, save, confirm, messages, openChat, chatOpen }: {
  pin: Pin; person: typeof guest; userId: string; busy: boolean; selected: boolean; select: () => void;
  saved: boolean; save: () => void; confirm: (enabled: boolean) => void; messages: number;
  openChat: (trigger: HTMLButtonElement) => void; chatOpen: boolean;
}) {
  const supported = pin.supports.includes(userId);
  const canConfirm = pin.authorId !== userId && pin.status !== 'resolved';
  const confirmationLabel = supported ? 'Retrage confirmarea' : 'Confirm și eu';
  return <article className={`pin-card ${selected ? 'is-selected' : ''}`}>
    <button className="card-main" data-pin-id={pin.id} onClick={select}>
      <div className="card-top"><span className={`type-label ${pin.type}`}>{iconFor(pin.type, 14)}{meta[pin.type].label}</span>{pin.demo && <span className="demo-label">DEMO</span>}</div>
      <h3>{pin.title}</h3><p className="place"><MapPin size={13} />{pin.place || 'Loc ales pe hartă'}</p>
      {pin.type === 'activity' && <div className="card-date"><CalendarDays size={14} />{dateLabel(pin.startsAt!, { weekday: 'short' })}<span className="dot" />{activityState(pin)}</div>}
      {pin.type !== 'activity' && <p className="card-description">{pin.description}</p>}
    </button>
    <div className="card-actions">
      <button className={`card-bookmark ${saved ? 'bookmarked' : ''}`} title="Salvează pin" aria-label={saved ? 'Elimină din salvate' : 'Salvează pin'} disabled={busy} onClick={save}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button>
      {pin.type === 'report' && (canConfirm
        ? <button className="card-confirm" aria-pressed={supported} aria-label={confirmationLabel} title={confirmationLabel} disabled={busy} onClick={() => confirm(!supported)}><ThumbsUp size={16} fill={supported ? 'currentColor' : 'none'} /><span>{pin.supports.length}</span></button>
        : <span className="card-confirm" title={`${pin.supports.length} confirmări`}><ThumbsUp size={16} aria-hidden="true" /><span aria-label={`${pin.supports.length} confirmări`}>{pin.supports.length}</span></span>)}
    </div>
    <div className="card-footer">
      <div className="person-line"><span className="avatar tiny" style={{ background: person.color }}>{person.initials}</span><span className="card-author" title={person.name}>{person.name}</span></div>
      {pin.type === 'activity' && <span className="card-stat" aria-label={`${pin.participants.length} participanți`}><Users size={14} aria-hidden="true" />{pin.participants.length}{pin.capacity ? `/${pin.capacity}` : ''}</span>}
      <button className="card-chat" aria-expanded={chatOpen} onClick={event => openChat(event.currentTarget)}><MessageCircle size={15} />Deschide chat{pin.type === 'discussion' && messages > 0 && <span className="card-message-count" aria-hidden="true">{messages}</span>}</button>
    </div>
  </article>;
}

function routeLocationSource(id: string) {
  if (id.startsWith('osm:gtfs-stop/')) return 'Stație SMTT';
  if (id.startsWith('osm:') || id.startsWith('tile:')) return 'Loc OpenStreetMap';
  if (id.startsWith('point:')) return 'Punct ales pe hartă';
  return 'Pin al comunității';
}

function MunicipalDetail({ report, close }: { report: MunicipalReport; close: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), [report.number]);
  return <aside className="detail-panel" aria-label={report.title}>
    <div className="detail-toolbar"><button className="icon-btn" aria-label="Înapoi" onClick={close}><ArrowLeft size={20} /></button></div>
    <div className="detail-scroll"><div className="detail-content">
      <div className="detail-badges"><span className="type-label report">Primăria Timișoara</span><span className="status-badge">{municipalStatuses[report.status].label}</span></div>
      <h2 ref={title} tabIndex={-1}>{report.title}</h2>
      <p className="detail-description">{report.number} · {dateLabel(report.createdAt)}</p>
      <a className="action-link" href={municipalReportUrl(report.number)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Vezi sesizarea pe portalul Primăriei</a>
    </div></div>
  </aside>;
}

function MunicipalCard({ report, select }: { report: MunicipalReport; select: () => void }) {
  return <article className="pin-card">
    <button type="button" className="card-main" data-pin-id={municipalReportId(report.number)} onClick={select}>
      <div className="card-top"><span className="type-label report">{iconFor('report', 14)}Primăria Timișoara</span><span className="status-badge">{municipalStatuses[report.status].label}</span></div>
      <h3>{report.title}</h3><p className="place">{report.number} · {dateLabel(report.createdAt)}</p>
    </button>
  </article>;
}

const localStore = { loadState, dispatch, subscribe };
const guest: typeof people[number] = { id: '', name: 'Vizitator', initials: '', color: '#e9f2ee' };
type Cloud = { store: typeof localStore; user: typeof guest | null; account: ReactNode; reopenAccount?: boolean };

export default function App({ cloud }: { cloud?: Cloud }) {
  const [theme, setTheme] = useState(readTheme);
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    saveTheme(next); setTheme(next);
  }
  const store = cloud?.store ?? localStore;
  const accountId = cloud?.user?.id;
  const request = useRef(0);
  const [state, setState] = useState<State | null>(null); const [fatal, setFatal] = useState('');
  const [userId, setUserId] = useState(() => sessionStorage.getItem('vecin-user') || 'radu');
  const [view, setView] = useState<'layers' | 'places' | 'explore' | 'saved' | 'routes'>('explore');
  const [panelOpen, setPanelOpen] = useState(() => !!readPin()); const [activePlace, setActivePlace] = useState<MapPlace>();
  const [inspection, setInspection] = useState<{ title: string; description: string }>();
  const [buildings, setBuildings] = useState(true);
  const [community, setCommunity] = useState<Record<PinType, boolean>>({ report: true, activity: true, discussion: true });
  const [query, setQuery] = useState(''); const [placeCategory, setPlaceCategory] = useState('all'); const [sort, setSort] = useState<'recent' | 'near'>('recent'); const [includePast, setIncludePast] = useState(false);
  const [selectedId, setSelectedId] = useState(readPin); const [modal, setModal] = useState<'profile' | 'help' | null>(cloud?.reopenAccount ? 'profile' : null);
  const [chatId, setChatId] = useState<string>();
  const [sharedPlace, setSharedPlace] = useState<MapPlace>();
  const chatTrigger = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState<{ id: string; type: PinType; pin?: Pin; related?: Pin; place?: MapPlace } | null>(null);
  const [formLocation, setFormLocation] = useState<Point>(); const [picking, setPicking] = useState<'form' | 'route' | null>(null);
  const [formMinimized, setFormMinimized] = useState(false); const [locationPoint, setLocationPoint] = useState<Point>(); const [gpsBusy, setGpsBusy] = useState(false); const [gpsFocus, setGpsFocus] = useState(0);
  const [toast, setToast] = useState<{ text: string; error?: boolean }>(); const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<LayerVisibility>(hiddenLayers); const [pinLabels, setPinLabels] = useState(false); const [mapFit, setMapFit] = useState(0);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [municipalEnabled, setMunicipalEnabled] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);
  const municipalVisible = view === 'explore' && community.report && municipalEnabled && !picking;
  const municipalReports = useMunicipalReports(municipalVisible);
  const [liveType, setLiveType] = useState<LiveVehicleType | ''>('');
  const [liveLine, setLiveLine] = useState('');
  const mapVisibility = view === 'layers' && !picking ? visibility : hiddenLayers;
  const { status: liveStatus, vehicles } = useStptVehicles(view === 'layers' && liveEnabled && !picking);
  const liveVehicles = useMemo(() => vehicles.filter(vehicle =>
    (!liveType || vehicle.type === liveType) && (!liveLine || vehicle.line === liveLine)
  ), [vehicles, liveType, liveLine]);
  const [travelMode, setTravelMode] = useState<TravelMode | 'transit'>('walking'); const [routePickTarget, setRoutePickTarget] = useState<'start' | 'destination' | 'waypoint' | null>(null);
  const [start, setStart] = useState<Point>(center); const [destination, setDestination] = useState<Pin | MapPlace | null>(null); const [waypoints, setWaypoints] = useState<(Pin | MapPlace)[]>([]); const [route, setRoute] = useState<RouteResult>(); const [routeBusy, setRouteBusy] = useState(false); const [routeError, setRouteError] = useState('');
  const [transit, setTransit] = useState<Awaited<ReturnType<typeof planTransit>>>();
  const [transitIndex, setTransitIndex] = useState(0);
  const hasRoute = !!(route || transit);
  const sidebarScroll = useRef<HTMLDivElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const routeFeedback = useRef<HTMLDivElement>(null);
  const [routeOptionsFor, setRouteOptionsFor] = useState<'destination' | 'waypoint' | null>(null);
  const locationChoice = useRef(0);
  const [formGpsError, setFormGpsError] = useState('');
  useEffect(() => { sidebarScroll.current?.scrollTo({ top: 0 }); }, [view, selectedId]);
  useEffect(() => {
    if (route || transit || routeError) routeFeedback.current?.scrollIntoView({ block: 'start' });
  }, [route, transit, routeError]);
  const routeController = useRef<AbortController | null>(null); const [tick, setTick] = useState(0);
  const user = cloud ? cloud.user ?? guest : people.find(p => p.id === userId) || people[0];
  const profiles = state?.people ?? people;
  const cycleways = useMapData('cycleways', mapVisibility.cycleways);
  const tramways = useMapData('tramways', mapVisibility.tramways);
  const tramRefs = useMemo(() => {
    const refs = tramways.data?.features.flatMap(({ properties }) => String(properties?.ref || properties?.routeRefs || '').split(/\s*[,;•]\s*/)) ?? [];
    return [...new Set(refs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));
  }, [tramways.data]);
  const busways = useMapData('busways', mapVisibility.busways);
  const sidewalks = useMapData('sidewalks', mapVisibility.sidewalks);
  const places = useMapData('places', mapVisibility.places || view === 'places' || mapVisibility.cycleways || mapVisibility.tramways || mapVisibility.busways);
  const placeCatalog = useMemo(() => buildPlaceCatalog(places.data), [places.data]);
  const filteredPlaces = useMemo(() => filterPlaces(placeCatalog, query, placeCategory), [placeCatalog, query, placeCategory]);
  const allMapPlaces = useMemo(() => filterPlaces(placeCatalog, '', 'all'), [placeCatalog]);
  const infrastructure = useMemo<Partial<Infrastructure>>(() => ({
    cycleways: cycleways.data, tramways: tramways.data, busways: busways.data, sidewalks: sidewalks.data, places: places.data,
  }), [cycleways.data, tramways.data, busways.data, sidewalks.data, places.data]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const version = ++request.current;
      void store.loadState().then(value => {
        if (active && version === request.current) { setState(value); setFatal(''); }
      }).catch(error => {
        if (active && version === request.current) {
          setFatal(errorText(error));
        }
      });
    };
    refresh();
    const unsubscribe = store.subscribe(refresh);
    return () => { active = false; unsubscribe(); };
  }, [store, accountId]);
  useEffect(() => {
    const handleHistory = () => {
      const id = readPin();
      setChatId(undefined);
      setSelectedId(id);
      if (id) {
        setView('explore'); setPanelOpen(true); setActivePlace(undefined); setInspection(undefined); setSharedPlace(undefined);
        setVisibility(hiddenLayers); setLiveEnabled(false); setLiveType(''); setLiveLine(''); setBuildings(true);
      }
    };
    window.addEventListener('popstate', handleHistory);
    const timer = setInterval(() => setTick(v => v + 1), 30000);
    return () => { window.removeEventListener('popstate', handleHistory); clearInterval(timer); routeController.current?.abort(); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(undefined), toast.error ? 7000 : 4000); return () => clearTimeout(timer); }, [toast]);
  function select(id: string) {
    setChatId(undefined);
    if (id && !selectedId) detailTrigger.current = document.activeElement as HTMLElement;
    setSelectedId(id);
    if (id) { setActivePlace(undefined); setPanelOpen(true); }
    const path = id ? `/pins/${encodeURIComponent(id)}` : '/';
    if (path !== location.pathname || location.search) history.pushState({}, '', path);
  }
  function openChat(id: string, trigger: HTMLButtonElement) {
    chatTrigger.current = trigger;
    setChatId(id);
  }
  function closeChat() {
    setChatId(undefined);
    requestAnimationFrame(() => {
      const trigger = chatTrigger.current;
      if (trigger?.isConnected && trigger.offsetWidth) trigger.focus();
    });
  }
  function closeDetail() {
    select('');
    requestAnimationFrame(() => {
      const trigger = detailTrigger.current;
      const fallback = document.querySelector<HTMLElement>(innerWidth <= 760 ? '.mobile-map-nav button.active' : '.sidebar-tabs button.active');
      const cardId = trigger?.dataset.pinId;
      const restored = cardId ? document.querySelector<HTMLElement>(`.card-main[data-pin-id="${CSS.escape(cardId)}"]`) : null;
      (trigger?.isConnected && trigger.offsetWidth ? trigger : restored ?? fallback)?.focus();
    });
  }
  function closeToolPanel() {
    const button = document.querySelector<HTMLElement>('.mobile-map-nav button.active');
    setPanelOpen(false);
    setChatId(undefined);
    button?.focus();
  }
  function cancelPicking() {
    setPicking(null); setRoutePickTarget(null);
    if (form) setFormMinimized(false);
  }
  useEffect(() => {
    if (modal || sharedPlace || (form && !formMinimized)) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (picking) cancelPicking();
      else if (chatId) closeChat();
      else if (selectedId) closeDetail();
      else if (activePlace) setActivePlace(undefined);
      else if (panelOpen && innerWidth <= 760) closeToolPanel();
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [modal, sharedPlace, form, formMinimized, picking, chatId, selectedId, activePlace, panelOpen]);
  const allPins = useMemo(() => (state?.pins || []).filter(p => !p.deleted), [state]);
  const selected = allPins.find(p => p.id === selectedId);
  const chatPin = allPins.find(p => p.id === chatId);
  const currentPins = useMemo(() => allPins.filter(pin => includePast || pin.type !== 'activity' || (pin.status !== 'cancelled' && Date.parse(pin.endsAt!) > Date.now())), [allPins, includePast, tick]);
  const communityPins = useMemo(() => currentPins.filter(pin => community[pin.type]), [currentPins, community]);
  const savedIds = state?.saved[user.id] || [];
  const searchTerm = normalizeSearch(query);
  const officialReports = useMemo(() => municipalVisible ? municipalReports.reports.filter(report =>
    normalizeSearch(`${report.title} ${report.category} ${report.number} ${municipalStatuses[report.status].label} Primărie`).includes(searchTerm)
  ) : [], [municipalVisible, municipalReports.reports, searchTerm]);
  const selectedMunicipal = municipalVisible ? municipalReports.reports.find(report => municipalReportId(report.number) === selectedId) : undefined;
  const pins = useMemo(() => (view === 'saved' ? allPins : communityPins).filter(p => {
    if (view === 'saved' && !savedIds.includes(p.id)) return false;
    return normalizeSearch(`${p.title} ${p.description} ${p.place} ${p.category}`).includes(searchTerm);
  }), [allPins, view, savedIds, communityPins, searchTerm]);
  const communityResults = useMemo(() => {
    const point = locationPoint ?? center;
    const results = [
      ...pins.map(pin => ({ kind: 'community' as const, pin, date: Date.parse(pin.createdAt), meters: distance(point, pin.location) })),
      ...officialReports.map(report => ({ kind: 'municipal' as const, report, date: Date.parse(report.createdAt),
        meters: report.coordinates ? distance(point, { lon: report.coordinates[0], lat: report.coordinates[1] }) : Infinity })),
    ];
    return results.sort((a, b) => (sort === 'near' ? a.meters - b.meters : 0) || b.date - a.date);
  }, [pins, officialReports, sort, locationPoint]);
  useEffect(() => { setVisibleCount(30); }, [view, query, community, municipalEnabled, sort]);
  const mapPins = useMemo(() => {
    if (picking || (view !== 'explore' && view !== 'saved')) return [];
    return selected && !pins.includes(selected) ? [...pins, selected] : pins;
  }, [view, pins, selected, picking]);
  useEffect(() => { if (state && chatId && !chatPin) setChatId(undefined); }, [state, chatId, chatPin]);
  const resolveRouteLocation = (location: Pin | MapPlace) => allPins.find(p => p.id === location.id) || ('kind' in location || /^(point:|osm:|tile:)/.test(location.id) ? location : undefined);
  const routeDestination = destination ? resolveRouteLocation(destination) : null;
  const routeWaypoints = waypoints.map(resolveRouteLocation).filter((p): p is Pin | MapPlace => !!p);
  const routePoints = [...routeWaypoints, ...(routeDestination ? [routeDestination] : [])];
  const stopLocations = routePoints.map(p => `${p.id}:${p.location.lon},${p.location.lat}`).join('|');
  useEffect(() => {
    if (destination && routeDestination !== destination) setDestination(routeDestination ?? null);
    if (routeWaypoints.length !== waypoints.length || routeWaypoints.some((p, index) => p !== waypoints[index])) setWaypoints(routeWaypoints);
  }, [stopLocations, allPins]);
  useEffect(() => { invalidateRoute(); }, [stopLocations]);
  async function act(action: Action, success?: string) {
    if (!user.id) { setModal('profile'); throw new Error('Conectează-te pentru a continua.'); }
    if (busy) throw new Error('Așteaptă finalizarea salvării curente.');
    setBusy(true);
    try { const next = await store.dispatch(action); ++request.current; setState(next); setFatal(''); if (success) setToast({ text: success }); return next; }
    catch (error) { if (action.type !== 'create' && action.type !== 'edit') setToast({ text: errorText(error), error: true }); throw error; }
    finally { setBusy(false); }
  }
  function perform(action: Action, success?: string) { void act(action, success).catch(() => {}); }
  function openForm(type: PinType, pin?: Pin, related?: Pin, place?: MapPlace) {
    if (!user.id) { setModal('profile'); return; }
    const id = pin?.id ?? crypto.randomUUID();
    ++locationChoice.current;
    setFormGpsError('');
    setToast(undefined);
    setFormLocation(pin?.location || related?.location || place?.location); setForm({ id, type, pin, related, place }); setFormMinimized(false); setPicking(null); setRoutePickTarget(null);
  }
  function locate(target: 'map' | 'route' | 'form' = 'map') {
    const choice = locationChoice.current;
    const failure = (text: string) => {
      if (target === 'form') {
        if (locationChoice.current === choice) setFormGpsError(text);
      } else setToast({ text, error: true });
    };
    if (!navigator.geolocation) { failure('Localizarea nu este disponibilă. Alege punctul manual pe hartă.'); return; }
    if (target === 'form') setFormGpsError('');
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lon: position.coords.longitude, lat: position.coords.latitude }; setLocationPoint(point); setGpsFocus(n => n + 1); setGpsBusy(false);
      if (target === 'route') { setStart(point); setPicking(null); setRoutePickTarget(null); invalidateRoute(); }
      if (target === 'form') {
        if (locationChoice.current === choice) chooseFormLocation(point);
      } else {
        setToast({ text: `Locație găsită · precizie aproximativă ${Math.round(position.coords.accuracy)} m. Poți corecta punctul pe hartă.` });
      }
    }, () => { setGpsBusy(false); failure('Nu am putut obține locația. Alege punctul pe hartă.'); }, { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true });
  }
  function chooseFormLocation(point: Point) {
    ++locationChoice.current;
    setFormGpsError('');
    setFormLocation(point);
  }
  function invalidateRoute() { routeController.current?.abort(); routeController.current = null; setRoute(undefined); setTransit(undefined); setTransitIndex(0); setRouteError(''); setRouteBusy(false); }
  function cancelRoute() {
    invalidateRoute();
    setToast({ text: hasRoute ? 'Traseul a fost eliminat de pe hartă. Opririle au fost păstrate.' : 'Calculul a fost oprit.' });
  }
  function addRouteLocation(location: Pin | MapPlace, target?: 'destination' | 'waypoint') {
    const id = location.id;
    if (target === 'destination') {
      if (id === destination?.id) return;
      setDestination(location); setWaypoints(current => current.filter(item => item.id !== id)); invalidateRoute(); setToast({ text: `${location.title} este destinația traseului.` }); return;
    }
    if (id === destination?.id) {
      setDestination(null); invalidateRoute(); setToast({ text: 'Destinația a fost eliminată.' }); return;
    }
    if (waypoints.some(item => item.id === id)) {
      setWaypoints(current => current.filter(item => item.id !== id)); invalidateRoute(); setToast({ text: 'Oprirea a fost eliminată.' }); return;
    }
    if (!destination) {
      setDestination(location); invalidateRoute(); setToast({ text: `${location.title} este destinația traseului.` }); return;
    }
    if (waypoints.length >= 6) { setToast({ text: 'Poți adăuga maximum 6 opriri intermediare.', error: true }); return; }
    setWaypoints(current => [...current, location]); invalidateRoute(); setToast({ text: `${location.title} a fost adăugat ca oprire.` });
  }
  function addPlace(place: MapPlace) {
    addRouteLocation(place, routePickTarget === 'destination' ? 'destination' : undefined);
    setRoutePickTarget(null); setRouteOptionsFor(null); switchView('routes');
  }
  function toggleLayer(key: LayerKey) { setVisibility(current => ({ ...current, [key]: !current[key] })); }
  function chooseCommunity(type: PinType) {
    setCommunity(current => {
      if (current[type] && Object.values(current).filter(Boolean).length === 1) return current;
      return { ...current, [type]: !current[type] };
    });
    select('');
  }
  function switchView(next: typeof view, clearPin = true) {
    if (picking) cancelPicking();
    if (view === 'layers' && next !== 'layers') {
      setVisibility(hiddenLayers); setLiveEnabled(false); setLiveType(''); setLiveLine(''); setBuildings(true);
    }
    setView(next); setQuery(''); setPlaceCategory('all'); setActivePlace(undefined); setInspection(undefined);
    setSharedPlace(undefined); setPanelOpen(true); if (clearPin) select('');
  }
  function inspectPlace(place: MapPlace) {
    setActivePlace(place); setInspection(undefined); setPanelOpen(true); select('');
  }
  function pickMapPoint(point: Point) {
    if (picking === 'form') chooseFormLocation(point);
    else if (routePickTarget && routePickTarget !== 'start') {
      const title = routePickTarget === 'destination' ? 'Destinație aleasă pe hartă' : `Oprire pe hartă ${waypoints.length + 1}`;
      addRouteLocation({ id: `point:${crypto.randomUUID()}`, title, location: point }, routePickTarget);
    } else {
      setStart(point);
      invalidateRoute();
    }
    cancelPicking();
  }
  async function buildRoute() {
    if (!routeDestination) return;
    const controller = new AbortController(); routeController.current?.abort(); routeController.current = controller; setRoute(undefined); setRouteBusy(true); setRouteError('');
    setTransit(undefined); setTransitIndex(0);
    const timeout = setTimeout(() => controller.abort('timeout'), 20000);
    try {
      if (travelMode === 'transit') {
        const points = [{ ...start, name: 'Punctul de pornire' }, ...routePoints.map(p => ({ ...p.location, name: p.title }))];
        const result = await planTransit(points, controller.signal);
        if (routeController.current === controller) setTransit(result);
      } else {
        const result = await calculateRoute(start, routeDestination.location, routeWaypoints.map(p => p.location), controller.signal, travelMode);
        if (routeController.current === controller) setRoute(result);
      }
    }
    catch (e) { if (routeController.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) setRouteError(controller.signal.reason === 'timeout' ? 'Calculul a durat prea mult. Punctele sunt păstrate; reîncearcă.' : errorText(e)); }
    finally { clearTimeout(timeout); if (routeController.current === controller) setRouteBusy(false); }
  }
  if (fatal && !state) return <main className="fatal"><TriangleAlert size={40} /><h1>Nu am putut deschide datele</h1><p>{fatal}</p><button className="primary" onClick={() => location.reload()}>Reîncearcă</button></main>;
  if (!state) return <main className="fatal"><span className="spinner" /><h2>Pregătim cartierul tău…</h2></main>;
  return <div className={`app-shell map-first ${panelOpen ? 'panel-open' : ''} ${selectedId ? 'pin-open' : ''} ${chatPin ? 'chat-open' : ''}`}>
    <header className="app-header">
      <div className="header-identity">
        <button className="app-brand" aria-label="Urban Conect — harta principală" onClick={() => { switchView('explore'); setPanelOpen(false); }}>
          <img className="brand-icon" src="/favicon.svg" width={43} height={43} alt="" />
          <span className="brand-wordmark" aria-hidden="true">urban <span>conect</span></span>
        </button>
        <span className="header-city"><MapPin size={15} />Timișoara</span>
      </div>
      <div className="global-search"><Search size={19} /><input aria-label="Caută destinație" placeholder="Caută destinație" value={view === 'places' ? query : ''} onChange={e => { if (view !== 'places') switchView('places'); setQuery(e.target.value); setActivePlace(undefined); setPanelOpen(true); }} />{view === 'places' && query && <button aria-label="Șterge căutarea locurilor" onClick={() => { setQuery(''); setPlaceCategory('all'); setActivePlace(undefined); }}><X size={17} /></button>}</div>
      <div className="app-header-actions"><button className="header-saved" title="Pinuri salvate" aria-label="Pinuri salvate" onClick={() => switchView('saved')}><Bookmark size={20} /></button><button className="primary header-create" aria-label="Adaugă Anunț" onClick={() => openForm('report')}><Plus size={18} /><span>Adaugă Anunț</span></button><button className="header-profile" aria-label={cloud ? user.id ? 'Contul meu' : 'Conectează-te' : 'Alege profilul demo'} onClick={() => setModal('profile')}><span className="avatar" style={{ background: user.color }}>{user.initials || <Users size={17} />}</span></button></div>
      <button className="theme-toggle" type="button" role="switch" aria-label="Mod noapte" aria-checked={theme === 'dark'} title={theme === 'dark' ? 'Comută la modul zi' : 'Comută la modul noapte'} onClick={toggleTheme}>
        {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
      </button>
    </header>
    <div className="workspace">
      <main className="main-layout">
        <aside className="discovery" aria-label="Panou hartă">
          <nav className="sidebar-tabs" aria-label="Instrumentele hărții">{([['explore','Comunitate'],['places','Locuri'],['routes','Traseu'],['layers','Straturi']] as const).map(([key,label]) => <button key={key} className={view === key || (view === 'saved' && key === 'explore') ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => switchView(key)}>{label}</button>)}</nav>
          {!selectedId && <div className="mobile-panel-heading"><button className="icon-btn" aria-label="Închide panoul" onClick={closeToolPanel}><X size={18} /></button></div>}
          {selectedId && !picking ? (selectedMunicipal ? <MunicipalDetail report={selectedMunicipal} close={closeDetail} /> : selected ? <Detail pin={selected} state={state} profiles={profiles} canShare={!!cloud || !!selected.demo} userId={user.id} busy={busy} close={closeDetail} act={act} edit={() => openForm(selected.type, selected)} createActivity={() => openForm('activity', undefined, selected)} addStop={() => { addRouteLocation(selected); switchView('routes'); }} inRoute={destination?.id === selected.id || waypoints.some(item => item.id === selected.id)} openRelated={select} notify={setToast} openChat={trigger => openChat(selected.id, trigger)} chatOpen={chatId === selected.id} /> : <div className="detail-panel"><div className="detail-toolbar"><button className="icon-btn" aria-label="Înapoi" onClick={closeDetail}><ArrowLeft size={20} /></button></div><div className="empty-state"><MapPin size={30} /><h2>{selectedId.startsWith('pmt:') && municipalReports.loading ? 'Se încarcă sesizarea…' : 'Pin indisponibil'}</h2><p>{selectedId.startsWith('pmt:') ? 'Sesizările Primăriei apar în Comunitate cât timp sunt active și au cel mult 30 de zile.' : cloud ? 'Pinul a fost retras sau linkul nu mai este valid.' : 'Linkul poate indica un pin retras sau creat în alt browser.'}</p></div></div>) : <>
          <div className="sidebar-content" ref={sidebarScroll}>
            {view === 'layers' && !activePlace ? <>{inspection && <div className="infrastructure-inspection"><button className="icon-btn" aria-label="Închide informația despre strat" onClick={() => setInspection(undefined)}><X size={16} /></button><strong>{inspection.title}</strong><p>{inspection.description}</p></div>}<MapLayersPanel tramRefs={tramRefs} live={<StptLivePanel enabled={liveEnabled} toggle={() => setLiveEnabled(enabled => !enabled)} kind={liveType} setKind={type => { setLiveType(type); setLiveLine(''); }} line={liveLine} setLine={setLiveLine} status={liveStatus} count={liveVehicles.length} />} visibility={visibility} toggle={toggleLayer} layers={{ cycleways, tramways, busways, sidewalks, places }} buildings={buildings} setBuildings={setBuildings} /></> : (view === 'places' || (view === 'layers' && activePlace)) ? <PlacesPanel places={places.data ? (view === 'places' ? filteredPlaces : allMapPlaces) : undefined} detailsInLayers={view === 'layers'} query={query} category={placeCategory} setCategory={setPlaceCategory} error={places.error} retry={places.retry} select={inspectPlace} selected={activePlace} clear={() => setActivePlace(undefined)} add={addPlace} create={place => openForm('activity', undefined, undefined, place)} share={setSharedPlace} /> : view === 'routes' ? <><div className="panel-intro"><h1>Planifică un traseu</h1><p>Alege modul de transport, o destinație și opriri opționale.</p></div><div className="route-planner">
            <div className="travel-mode-picker" role="group" aria-label="Mod de transport">{(['walking', 'cycling', 'driving', 'transit'] as const).map(mode => <button key={mode} className={travelMode === mode ? 'active' : ''} aria-pressed={travelMode === mode} onClick={() => { if (mode !== travelMode) { setTravelMode(mode); invalidateRoute(); } }}>{mode === 'walking' ? <Footprints size={18} /> : mode === 'cycling' ? <Bike size={18} /> : mode === 'driving' ? <Car size={18} /> : <TrainFront size={18} />}<span>{mode === 'transit' ? 'Transport public' : travelModes[mode].label}</span></button>)}</div>
            <div className="route-notice"><Route size={18} />{travelMode === 'transit' ? <p><strong>Traseu cu transportul public</strong><br />Calcul pe rețeaua STPT, cu deplasare pe jos între stații când este necesar.</p> : <p><strong>Traseu {travelMode === 'walking' ? 'pietonal' : travelMode === 'cycling' ? 'pentru bicicletă' : 'auto'}</strong><br />Calcul pe rețeaua {travelMode === 'walking' ? 'pietonală' : travelMode === 'cycling' ? 'accesibilă bicicletelor' : 'rutieră auto'}, cu profil OSRM dedicat.</p>}</div>
            <label className="field-label">PUNCT DE PORNIRE</label><div className="route-start"><span className="start-dot" /><div><strong>{start.lon === center.lon && start.lat === center.lat ? 'Centrul Timișoarei' : 'Punctul ales'}</strong><small>{start.lat.toFixed(5)}, {start.lon.toFixed(5)}</small></div></div>
            <div className="two-actions"><button className="secondary" onClick={() => locate('route')} disabled={gpsBusy}><LocateFixed size={15} />{gpsBusy ? 'Se caută…' : 'Poziția mea'}</button><button className="secondary" onClick={() => { setRoutePickTarget('start'); setPicking('route'); select(''); }}><MapPin size={15} />Alege pe hartă</button></div>
            <div className="section-label"><span>DESTINAȚIE</span></div>
            {routeDestination ? <div className="route-stop route-destination"><span>D</span><div><strong>{routeDestination.title}</strong><small>{routeLocationSource(routeDestination.id)}</small></div><button className="icon-btn" aria-label="Elimină destinația" onClick={() => { setDestination(null); invalidateRoute(); }}><X size={15} /></button></div> : <div className="empty-route"><MapPin size={24} /><p>Adaugă o destinație. Alege din listă sau deschide un pin pe hartă.</p></div>}
            <button className="secondary full" aria-expanded={routeOptionsFor === 'destination'} onClick={() => setRouteOptionsFor(value => value === 'destination' ? null : 'destination')}><Plus size={16} />{routeDestination ? 'Schimbă destinația' : 'Alege destinația'}</button>
            {routeDestination && <><div className="section-label"><span>OPRIRI INTERMEDIARE</span><span>{routeWaypoints.length}/6</span></div>
              {routeWaypoints.map((p, i) => <div className="route-stop" key={p.id}><span>{i + 1}</span><div><strong>{p.title}</strong><small>{routeLocationSource(p.id)}</small></div><button className="icon-btn" aria-label={`Elimină oprirea ${p.title}`} onClick={() => setWaypoints(current => current.filter(item => item.id !== p.id))}><X size={15} /></button></div>)}
              <button className="secondary full" disabled={routeWaypoints.length >= 6} aria-expanded={routeOptionsFor === 'waypoint'} onClick={() => setRouteOptionsFor(value => value === 'waypoint' ? null : 'waypoint')}><Plus size={16} />Adaugă oprire</button>
            </>}
            {routeOptionsFor && <div className="destination-options"><select className="stop-select" aria-label={routeOptionsFor === 'destination' ? 'Alege destinația' : 'Adaugă oprire'} value="" onChange={e => { const pin = allPins.find(p => p.id === e.target.value); if (pin) addRouteLocation(pin, routeOptionsFor); setRouteOptionsFor(null); }}><option value="">{routeOptionsFor === 'destination' ? 'Alege din comunitate' : 'Alege un pin din comunitate'}</option>{allPins.filter(p => p.id !== destination?.id && (routeOptionsFor === 'destination' || !waypoints.some(item => item.id === p.id))).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <button className="secondary full manual-stop" disabled={routeOptionsFor === 'waypoint' && routeWaypoints.length >= 6} onClick={() => { setRoutePickTarget(routeOptionsFor); setRouteOptionsFor(null); setPicking('route'); select(''); }}><MapPin size={15} />Alege pe hartă</button><button className="secondary full" onClick={() => { if (routeOptionsFor === 'destination') setRoutePickTarget('destination'); setRouteOptionsFor(null); switchView('places'); document.querySelector<HTMLInputElement>('.global-search input')?.focus(); }}>Caută un loc</button></div>}
            <div className="route-actions">
              <button className="primary full" disabled={!routeDestination || routeBusy} onClick={() => void buildRoute()}>{routeBusy ? <span className="spinner" /> : <Route size={18} />}{routeBusy ? 'Calculăm traseul…' : 'Generează traseul'}</button>
              {routeBusy && <button className="secondary" onClick={cancelRoute}>Oprește calculul</button>}
            </div>
            <div ref={routeFeedback}>{routeError && <p className="form-error" role="alert">{routeError}</p>}
            {hasRoute && <div className="route-result-actions">
              <button className="secondary route-show-map" onClick={closeToolPanel}><MapPinned size={16} />Vezi pe hartă</button>
              <button className="secondary" onClick={cancelRoute}><Trash2 size={16} />Elimină traseul</button>
            </div>}
            {transit && <TransitResults {...transit} selected={transitIndex} select={setTransitIndex} />}{route && <div className="route-result"><span className="eyebrow">TRASEU CALCULAT · {travelModes[route.mode].label.toLocaleUpperCase('ro')}</span><div><strong>{(route.distance / 1000).toFixed(1)} <small>km</small></strong><strong>{Math.ceil(route.duration / 60)} <small>min</small></strong></div><p>Ordinea vizitelor: start → {route.order.filter(i => i > 0).map(i => routePoints[i - 1]?.title).join(' → ')}.</p>{route.warnings.map(w => <p key={w} className="warning">{w}</p>)}<small>Durată estimată, fără trafic live. Nu garantează evitarea sesizărilor.</small></div>}</div>
            <p className="routing-attribution">Rutare © <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS / OSRM</a> · © OpenStreetMap<br /><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Semnalează o eroare în hartă</a>. Serviciu public fără garanție de disponibilitate. Punctele traseului sunt trimise furnizorului la calcul.</p>
          </div></> : <><div className="panel-intro community-intro"><div className="community-title-row"><h1>{view === 'saved' ? 'Pinuri salvate' : 'În comunitate'}</h1>{view !== 'saved' && <button className="secondary community-create" onClick={() => openForm('report')}><Plus size={16} />Adaugă Anunț</button>}</div><button className="community-saved" onClick={() => switchView(view === 'saved' ? 'explore' : 'saved')}><Bookmark size={14} />{view === 'saved' ? 'Toată comunitatea' : 'Vezi pinurile salvate'}</button></div>
            <div className="search-box"><Search size={17} /><input aria-label="Caută în comunitate" placeholder="Caută un loc, o idee, o activitate…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-btn" aria-label="Șterge căutarea" onClick={() => setQuery('')}><X size={15} /></button>}</div>
            {view !== 'saved' && <>
              <div className="filter-tabs" role="group" aria-label="Tipuri de anunț afișate">{(['report', 'activity', 'discussion'] as const).map(type => <button key={type} className={community[type] ? `active ${type}` : type} aria-pressed={community[type]} onClick={() => chooseCommunity(type)}>{iconFor(type, 14)}{meta[type].plural}</button>)}</div>
            </>}
            <div className="results-heading"><span className="results-count">{communityResults.length} {view === 'saved' ? 'salvate' : 'Anunțuri'}</span>
              <div className="community-filter-controls">
              {view === 'explore' && community.report && <button type="button" className="secondary municipal-filter-toggle" role="switch" aria-checked={municipalEnabled} onClick={() => setMunicipalEnabled(enabled => !enabled)}>
                <span className="switch" aria-hidden="true"><i /></span>
                <span>Sesizarile Primariei</span>
              </button>}
              <details className="list-options">
                <summary><ArrowDownUp size={14} />Filtre</summary>
                <div className="list-options-body"><label className="checkbox-line"><input type="checkbox" checked={pinLabels} onChange={e => setPinLabels(e.target.checked)} />Arată numele pe hartă</label><label>Ordine<select value={sort} onChange={event => setSort(event.target.value === 'near' ? 'near' : 'recent')}><option value="recent">Cele mai recente</option><option value="near">{locationPoint ? 'Aproape de mine' : 'Aproape de centru'}</option></select></label>
                {view === 'explore' && community.activity && <label className="checkbox-line"><input type="checkbox" checked={includePast} onChange={e => setIncludePast(e.target.checked)} />Include activități încheiate sau anulate</label>}</div>
              </details>
              </div>
            </div>
            {municipalVisible && municipalReports.error && <div className="form-error" role="status">Sesizările Primăriei nu s-au putut actualiza. <button type="button" onClick={municipalReports.retry}>Reîncearcă</button></div>}<div className="pin-list">{communityResults.slice(0, visibleCount).map(result => {
              if (result.kind === 'municipal') {
                const id = municipalReportId(result.report.number);
                return <MunicipalCard key={id} report={result.report} select={() => select(id)} />;
              }
              const { pin } = result;
              return <PinCard key={pin.id} pin={pin} person={profiles.find(p => p.id === pin.authorId) ?? guest} userId={user.id} busy={busy} selected={selectedId === pin.id} select={() => select(pin.id)} saved={savedIds.includes(pin.id)} save={() => perform({ type: 'save', pinId: pin.id, userId: user.id, enabled: !savedIds.includes(pin.id) })} confirm={enabled => perform({ type: 'support', pinId: pin.id, userId: user.id, enabled })} messages={state.messages.filter(m => m.pinId === pin.id).length} openChat={trigger => openChat(pin.id, trigger)} chatOpen={chatId === pin.id} />;
            })}{communityResults.length > visibleCount && <button type="button" className="secondary community-more" onClick={() => setVisibleCount(count => count + 30)}>Vezi mai multe anunțuri</button>}{communityResults.length === 0 && <div className="empty-state"><Sprout size={30} />
              <h3>{view === 'saved' ? 'Niciun pin salvat' : allPins.length ? 'Niciun pin găsit' : 'Comunitatea începe cu primul pin'}</h3>
              {view === 'saved'
                ? <button className="secondary" onClick={() => switchView('explore')}>Explorează comunitatea</button>
                : query ? <button className="secondary" onClick={() => setQuery('')}>Șterge căutarea</button>
                  : community.activity && !includePast && allPins.some(pin => pin.type === 'activity')
                    ? <button className="secondary" onClick={() => setIncludePast(true)}>Arată și activitățile încheiate</button>
                    : null}
            </div>}</div></>}
          </div>
          <footer className="sidebar-bottom"><span><i />{cloud ? 'Urban Connect · Timișoara' : 'Demo local · date în acest browser'}</span><button onClick={() => setModal('help')}><CircleHelp size={15} />Ghid</button></footer>
          </>}
        </aside>
        {chatPin && <PinChat key={chatPin.id} pin={chatPin} messages={state.messages} profiles={profiles} userId={user.id} busy={busy} cloud={!!cloud} close={closeChat} signIn={() => setModal('profile')} act={act} />}
        <section className={`map-area ${picking ? 'is-picking' : ''}`} aria-label="Harta comunității">
          <Suspense fallback={<div className="map-surface"><div className="map-loading" role="status">Se încarcă harta…</div></div>}>
            <MapView theme={theme} tab={view} browsePlaces={view === 'places' ? filteredPlaces : allMapPlaces} placeCatalog={placeCatalog}
              liveVehicles={view === 'layers' && !picking ? liveVehicles : []}
              municipalReports={municipalVisible ? officialReports : undefined} selectedMunicipal={selectedMunicipal} onSelectMunicipal={number => select(municipalReportId(number))}
              routePoints={view === 'routes' && !picking ? [{ location: start, title: 'Punct de pornire' }, ...routeWaypoints, ...(routeDestination ? [{ ...routeDestination, destination: true }] : [])] : []}
              pins={mapPins} selected={selected} onSelect={select} picking={!!picking} onPick={pickMapPoint}
              picked={picking === 'form' || (form && formMinimized) ? formLocation : undefined} userLocation={locationPoint}
              route={picking ? undefined : route} transit={picking ? undefined : transit?.options[transitIndex]} mobilePanelOpen={panelOpen}
              focus={gpsFocus} infrastructure={infrastructure} visibility={mapVisibility} labels={pinLabels} mapFit={mapFit} buildings={buildings}
              focusedPlace={activePlace} onInspectPlace={inspectPlace} onInspectLine={info => { setInspection(info); setActivePlace(undefined); setPanelOpen(true); }} />
          </Suspense>
          {hasRoute && !picking && <button className={`secondary map-remove-route ${view === 'routes' && !selectedId ? 'route-panel-action' : ''}`} onClick={cancelRoute}><Trash2 size={16} />Elimină traseul</button>}
          <div className="map-utility-controls"><button aria-label="Localizează-mă" onClick={() => locate()} disabled={gpsBusy}>{gpsBusy ? <span className="spinner" /> : <LocateFixed size={20} />}</button>{(view === 'explore' || view === 'saved') && <button aria-label="Încadrează pinurile afișate" onClick={() => { select(''); setMapFit(value => value + 1); }}><Maximize size={19} /></button>}</div>
          {picking && <div className="picking-notice"><MapPin size={20} /><div><strong>Atinge un punct pe hartă</strong><span>{picking === 'form' ? 'Aici va apărea pinul tău.' : routePickTarget === 'destination' ? 'Setează destinația traseului.' : routePickTarget === 'waypoint' ? 'Adaugă o oprire intermediară.' : 'Alege începutul traseului.'}</span></div><button className="secondary" onClick={cancelPicking}>Renunță</button></div>}
        </section>
      </main>
    </div>
    <nav className="mobile-map-nav" aria-label="Navigare mobilă">{([['explore','Comunitate'],['places','Locuri'],['routes','Traseu'],['layers','Straturi']] as const).map(([key,label]) => <button key={key} className={(view === key || (key === 'explore' && view === 'saved')) && panelOpen ? 'active' : ''} aria-expanded={(view === key || (key === 'explore' && view === 'saved')) && panelOpen} onClick={() => { if (picking) cancelPicking(); if (view === key && panelOpen && !selectedId) { closeToolPanel(); select(''); } else switchView(key); }}>{key === 'layers' ? <Layers size={20} /> : key === 'places' ? <MapPinned size={20} /> : key === 'explore' ? <Users size={20} /> : <Route size={20} />}<span>{label}</span></button>)}</nav>
    {form && <div style={{ display: formMinimized ? 'none' : undefined }}><CreateForm placePreset={form.place?.title} active={!formMinimized} type={form.type} pin={form.pin} related={form.related} point={formLocation} setPoint={chooseFormLocation} gpsError={formGpsError} cloud={!!cloud} pick={() => { setFormMinimized(true); setPicking('form'); }} locate={() => locate('form')} gpsBusy={gpsBusy} close={() => { ++locationChoice.current; setForm(null); setPicking(null); setFormMinimized(false); }} submit={async input => { const id = form.id; await act(form.pin ? { type: 'edit', pinId: id, input, userId: user.id } : { type: 'create', id, input, userId: user.id }, form.pin ? 'Modificările au fost salvate.' : 'Pinul tău este acum în comunitate.'); ++locationChoice.current; setForm(null); switchView('explore', false); setCommunity(current => ({ ...current, [input.type]: true })); setQuery(''); select(id); }} /></div>}
    {sharedPlace && <SharePlace place={sharedPlace} close={() => setSharedPlace(undefined)} />}
    {modal === 'profile' && cloud && <Modal title={user.id ? 'Contul meu' : 'Conectează-te'} close={() => setModal(null)}>{cloud.account}</Modal>}
    {modal === 'profile' && !cloud && <Modal title="Profiluri demo" close={() => setModal(null)}><p className="modal-intro">Acestea sunt identități simulate, pentru demo. Schimbă profilul ca să testezi înscrierea, confirmările și conversațiile. Nu sunt conturi Supabase.</p><div className="profile-options">{people.map(p => <button key={p.id} className={user.id === p.id ? 'chosen' : ''} onClick={() => { setUserId(p.id); sessionStorage.setItem('vecin-user', p.id); setModal(null); setToast({ text: `Testezi acum ca ${p.name}.` }); }}><span className="avatar" style={{ background: p.color }}>{p.initials}</span><span><strong>{p.name}</strong><small>Profil demonstrativ</small></span>{user.id === p.id ? <Check size={20} /> : <ChevronRight size={20} />}</button>)}</div><div className="info-box"><ShieldCheck size={19} /><p>Datele sunt comune filelor de browser de pe aceeași adresă. Alte dispozitive nu le văd. Autentificarea reală și sincronizarea cloud sunt următoarea etapă.</p></div></Modal>}
    {modal === 'help' && <Modal title="Bun venit în Urban Connect" close={() => setModal(null)}><p className="modal-intro">O hartă pentru lucrurile pe care le putem face împreună. Acesta este primul demo funcțional pentru UniHack / Connected Communities.</p><div className="help-steps"><div><TriangleAlert /><span><strong>Semnalează ceva de îmbunătățit</strong><p>Alege locul, adaugă o fotografie și publică. Un alt profil poate confirma sau comenta.</p></span></div><div><CalendarDays /><span><strong>Adună oamenii în jurul unei idei</strong><p>Creează o activitate, testează înscrierea și discută cu participanții.</p></span></div><div><Route /><span><strong>Leagă locurile într-un traseu</strong><p>Alege o destinație și opriri opționale, apoi calculează traseul pietonal, pentru bicicletă sau auto. Necesită internet.</p></span></div></div><div className="info-box"><ShieldCheck /><p>{cloud ? 'Pinurile, fotografiile și conversațiile publicate sunt vizibile comunității.' : 'În demo, pinurile, fotografiile, conversațiile și înscrierile sunt salvate în acest browser.'}</p></div><button className="primary full" onClick={() => setModal(null)}>Hai să explorăm <ArrowRight size={17} /></button></Modal>}
    {fatal && state && !toast && <div className="toast error" role="status">Datele nu s-au putut actualiza. Reîncercăm automat.</div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <TriangleAlert size={18} /> : <Check size={18} />}<span>{toast.text}</span><button aria-label="Închide notificarea" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
  </div>;
}

type DetailProps = { pin: Pin; state: State; profiles: typeof people; canShare: boolean; userId: string; busy: boolean; close: () => void; act: (action: Action, success?: string) => Promise<State>; edit: () => void; createActivity: () => void; addStop: () => void; inRoute: boolean; openRelated: (id: string) => void; notify: (toast: { text: string; error?: boolean }) => void; openChat: (trigger: HTMLButtonElement) => void; chatOpen: boolean };
function Detail({ pin, state, profiles, canShare, userId, busy, close, act, edit, createActivity, addStop, inRoute, openRelated, notify, openChat, chatOpen }: DetailProps) {
  const [menu, setMenu] = useState(false);
  const detailTitle = useRef<HTMLHeadingElement>(null); const author = profiles.find(p => p.id === pin.authorId) ?? guest;
  const mine = pin.authorId === userId; const saved = state.saved[userId]?.includes(pin.id); const status = pin.type === 'activity' ? activityState(pin) : pin.status === 'resolved' ? 'Rezolvată' : 'Deschisă';
  useEffect(() => { setMenu(false); detailTitle.current?.focus({ preventScroll: true }); }, [pin.id]);
  const run = (action: Action, success?: string) => { void act(action, success).catch(() => {}); };
  async function share() {
    const url = `${location.origin}/pins/${pin.id}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: pin.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        notify({ text: 'Link copiat.' });
      }
    }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) notify({ text: `Linkul pinului: ${url}`, error: true }); }
  }
  return <aside className="detail-panel" aria-label={`Detalii: ${pin.title}`}>
    <div className="detail-toolbar"><button className="icon-btn" aria-label="Înapoi" onClick={close}><ArrowLeft size={20} /></button><div className="detail-tools"><button className={`icon-btn ${saved ? 'bookmarked' : ''}`} title="Salvează pin" aria-label={saved ? 'Elimină din salvate' : 'Salvează pin'} disabled={busy} onClick={() => run({ type: 'save', pinId: pin.id, userId, enabled: !saved })}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>{canShare && <button className="icon-btn" aria-label="Distribuie" onClick={() => void share()}><ExternalLink size={18} /></button>}</div></div>
    <div className="detail-scroll">
      <div className="detail-content"><div className="detail-badges"><span className={`type-label ${pin.type}`}>{iconFor(pin.type, 15)}{meta[pin.type].label}</span>{pin.type !== 'discussion' && <span className={`status-badge ${pin.status === 'resolved' ? 'resolved' : ''}`}>{status}</span>}{pin.demo && <span className="demo-label">DEMO</span>}</div>
        <h2 tabIndex={-1} ref={detailTitle}>{pin.title}</h2><p className="detail-place"><MapPin size={16} />{pin.place || `${pin.location.lat.toFixed(5)}, ${pin.location.lon.toFixed(5)}`}</p>
        <div className="detail-author"><span className="avatar" style={{ background: author.color }}>{author.initials}</span><div><strong>{author.name}{mine ? ' · tu' : ''}</strong><small>Publicat {dateLabel(pin.createdAt)}</small></div><button className="icon-btn" aria-label="Opțiuni pin" onClick={() => setMenu(v => !v)}><MoreHorizontal size={20} /></button></div>
        {menu && <div className="detail-menu">{mine && <><button onClick={() => { edit(); setMenu(false); }}><Settings2 size={15} />Editează</button><button className="danger" disabled={busy} onClick={() => { if (confirm('Retragi acest pin? Nu va mai fi afișat, iar conversația va fi eliminată.')) { void act({ type: 'delete', pinId: pin.id, userId }, 'Pinul a fost retras.').then(close).catch(() => {}); } }}><Trash2 size={15} />Retrage pinul</button></>}<button onClick={() => { const reason = prompt('De ce raportezi acest conținut?'); if (reason) { run({ type: 'flag', pinId: pin.id, userId, reason }, state.people ? 'Raportarea a fost înregistrată.' : 'Raportarea a fost înregistrată în acest browser.'); setMenu(false); } }}><Flag size={15} />Raportează conținutul</button></div>}
        {pin.type === 'activity' && <div className="activity-facts"><div><CalendarDays size={19} /><span><strong>{dateLabel(pin.startsAt!)}</strong><small>Până la {dateLabel(pin.endsAt!)} · ora României</small></span></div><div><Users size={19} /><span><strong>{pin.participants.length}{pin.capacity ? ` din ${pin.capacity} locuri ocupate` : ' participanți'}</strong><small>Organizatorul este inclus</small></span></div></div>}
        {pin.relatedId && <button className="related-pin" onClick={() => openRelated(pin.relatedId!)}><TriangleAlert size={16} /><span>Vezi sesizarea de la care a pornit</span><ChevronRight size={16} /></button>}
        {pin.type === 'report' && <div className="municipal-report-actions">
          <a className="action-link" href={municipalReportsPortal + '/#adauga'} target="_blank" rel="noreferrer"><ExternalLink size={16} />Deschide portalul de sesizări al Primăriei</a>
          <label className="checkbox-line">
            <input type="checkbox" role="switch" checked={!!pin.reportedToMunicipality} disabled={!mine || busy}
              onChange={event => run({ type: 'setMunicipalReported', pinId: pin.id, userId, enabled: event.target.checked })} />
            Raportată la Primărie
          </label>
        </div>}
        {pin.type === 'report' && <>{!mine && pin.status !== 'resolved' ? <button className={`primary full support-button ${pin.supports.includes(userId) ? 'supported' : ''}`} aria-pressed={pin.supports.includes(userId)} disabled={busy} onClick={() => run({ type: 'support', pinId: pin.id, userId, enabled: !pin.supports.includes(userId) })}><ThumbsUp size={18} />{pin.supports.includes(userId) ? 'Retrage confirmarea' : 'Confirm și eu'}<span>{pin.supports.length}</span></button> : <p className="support-count"><ThumbsUp size={16} />Confirmări: {pin.supports.length}</p>}{mine && <button className="secondary full" disabled={busy} onClick={() => run({ type: 'resolve', pinId: pin.id, userId }, pin.status === 'resolved' ? 'Sesizarea a fost redeschisă.' : 'Ai marcat sesizarea ca rezolvată.')}><CheckCheck size={17} />{pin.status === 'resolved' ? 'Redeschide sesizarea' : 'Marchează ca rezolvată'}</button>}{pin.changedAt && <small className="muted-text">Stare actualizată de {author.name}, {dateLabel(pin.changedAt)}.</small>}<button className="action-link" onClick={createActivity}><Sprout size={17} />Organizează o acțiune aici <ArrowRight size={16} /></button></>}
        {pin.type === 'activity' && <>{!mine && <button className="primary full" disabled={busy || pin.status === 'cancelled' || Date.parse(pin.startsAt!) <= Date.now() || (status === 'Completă' && !pin.participants.includes(userId))} onClick={() => run({ type: 'join', pinId: pin.id, userId, enabled: !pin.participants.includes(userId) }, pin.participants.includes(userId) ? 'Te-ai retras din activitate.' : 'Ești înscris! Ne vedem acolo.')}><Users size={18} />{pin.participants.includes(userId) ? 'Retrage participarea' : status === 'Completă' ? 'Toate locurile sunt ocupate' : status === 'Urmează' ? 'Particip și eu' : 'Înscrieri închise'}</button>}{mine && <div className="organizer-note"><CheckCheck size={17} />Ești organizator și participant.{pin.status !== 'cancelled' && <button className="action-link danger" disabled={busy} onClick={() => { if (confirm('Anulezi activitatea? Participanții vor vedea starea „Anulată”.')) run({ type: 'cancel', pinId: pin.id, userId }, 'Activitatea a fost anulată.'); }}>Anulează activitatea</button>}</div>}</>}
        <button className="secondary full" aria-expanded={chatOpen} onClick={event => openChat(event.currentTarget)}><MessageCircle size={17} />Deschide chat</button>
        <p className="detail-description">{pin.description}</p>
        {pin.image && <figure className="detail-image"><img loading="lazy" src={pin.image} alt={pin.demo ? 'Ilustrație demonstrativă' : `Fotografie pentru ${pin.title}`} />{pin.demo && <span>ILUSTRAȚIE DEMO</span>}</figure>}
        <button className="secondary full route-add" onClick={addStop}><Route size={17} />{inRoute ? 'Elimină din traseu' : 'Adaugă în traseu'}</button>
      </div>
    </div>
  </aside>;
}

type FormProps = { cloud: boolean; gpsError: string; type: PinType; pin?: Pin; related?: Pin; placePreset?: string; point?: Point; setPoint: (point: Point) => void; pick: () => void; locate: () => void; gpsBusy: boolean; close: () => void; submit: (input: FormInput) => Promise<void>; active: boolean };
const announcementCategoryIcons: Record<string, typeof Wrench> = {
  Infrastructură: Wrench, Curățenie: Sparkles, 'Spații verzi': Trees, Iluminat: Lightbulb, Accesibilitate: Accessibility,
  Voluntariat: HandHeart, Sport: Dumbbell, Social: Users, Cultură: Landmark,
  'Idei pentru cartier': Lightbulb, Întrebare: CircleHelp, Recomandări: Star,
};
function CreateForm({ cloud, gpsError, type: initialType, pin, related, placePreset, point, setPoint, pick, locate, gpsBusy, close, submit, active }: FormProps) {
  const [type, setType] = useState<PinType>(initialType); const [title, setTitle] = useState(pin?.title || (related ? `Acțiune: ${related.title}` : '')); const [description, setDescription] = useState(pin?.description || '');
  const [category, setCategory] = useState(pin?.category || meta[initialType].categories[0]); const [place, setPlace] = useState(pin?.place || related?.place || placePreset || '');
  const CategoryIcon = announcementCategoryIcons[category] ?? MapPin;
  const [image, setImage] = useState(pin?.image || ''); const [imageBusy, setImageBusy] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const initialDate = new Date(Date.now() + 24 * 3600000).toISOString();
  const [startsAt, setStartsAt] = useState(localDateValue(pin?.startsAt || initialDate)); const [endsAt, setEndsAt] = useState(localDateValue(pin?.endsAt || new Date(Date.parse(initialDate) + 2 * 3600000).toISOString())); const [capacity, setCapacity] = useState(pin?.capacity?.toString() || '');
  const [dirty, setDirty] = useState(false);
  const [manualLat, setManualLat] = useState(point?.lat.toString() ?? '');
  const [manualLon, setManualLon] = useState(point?.lon.toString() ?? '');
  const [locationError, setLocationError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const locationField = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!point) return;
    setManualLat(String(point.lat)); setManualLon(String(point.lon)); setLocationError('');
  }, [point]);
  const dismiss = () => { if (!saving && (!dirty || confirm('Închizi formularul? Modificările nesalvate vor fi pierdute.'))) close(); };
  async function send(e: FormEvent) {
    e.preventDefault(); if (saving || imageBusy) return; setError('');
    if (!point) {
      setLocationError('Alege locația înainte de a publica.');
      locationField.current?.scrollIntoView({ block: 'center' });
      locationField.current?.querySelector('button')?.focus();
      return;
    }
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAt);
    const result = formSchema.safeParse({ type, title, description, category, place, location: point, image: type === 'report' || type === 'activity' ? image || undefined : undefined,
      startsAt: type === 'activity' && Number.isFinite(start) ? new Date(start).toISOString() : undefined, endsAt: type === 'activity' && Number.isFinite(end) ? new Date(end).toISOString() : undefined,
      capacity: type === 'activity' && capacity ? Number(capacity) : undefined, relatedId: related?.id || pin?.relatedId });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setSaving(true); try { await submit(result.data); } catch (e) { setError(errorText(e)); } finally { setSaving(false); }
  }
  return <Modal title={pin ? 'Editează pinul' : 'Adaugă Anunț'} close={dismiss} wide active={active}><form onSubmit={e => void send(e)} className="create-form" onChange={() => setDirty(true)}>
    {!pin && !related && <div className="create-types">{(['report', 'activity', 'discussion'] as const).map(t => <button type="button" key={t} className={type === t ? `selected ${t}` : ''} aria-pressed={type === t} onClick={() => { setType(t); setCategory(meta[t].categories[0]); setDirty(true); }}>{iconFor(t, 21)}<span>{meta[t].label}</span></button>)}</div>}
    {related && <div className="info-box"><Sprout size={20} /><p>Activitate legată de „{related.title}”. Alege o acțiune comunitară sigură, precum o curățenie sau o întâlnire.</p></div>}
    <div className="form-grid">
      <div className="field full-width" ref={locationField}>
        Locație <small>obligatorie</small>
        <div className="location-field">
          <div className="location-summary"><MapPin size={19} /><div><strong>{point ? place || 'Locație confirmată' : 'Alege locația'}</strong>{point && <small>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</small>}</div></div>
          <div className="two-actions"><button className="secondary" type="button" onClick={pick}>Alege pe hartă</button><button type="button" className="secondary" aria-label="Folosește poziția mea" disabled={gpsBusy} onClick={locate}><LocateFixed size={17} />{gpsBusy ? 'Se caută…' : 'Poziția mea'}</button></div>
        </div>
        <details className="coordinate-details"><summary>Introdu coordonatele manual</summary>
          <div className="two-actions"><label>Latitudine<input inputMode="decimal" value={manualLat} onChange={e => setManualLat(e.target.value)} /></label><label>Longitudine<input inputMode="decimal" value={manualLon} onChange={e => setManualLon(e.target.value)} /></label></div>
          <button className="secondary" type="button" onClick={() => {
            const lat = manualLat.trim(); const lon = manualLon.trim();
            const result = pointSchema.safeParse({ lat: Number(lat.replace(',', '.')), lon: Number(lon.replace(',', '.')) });
            if (!lat || !lon || !result.success) { setLocationError('Introdu o latitudine și o longitudine valide.'); return; }
            setPoint(result.data); setDirty(true);
          }}>Confirmă coordonatele</button>
        </details>
        {(locationError || gpsError) && <p className="form-error" role="alert">{locationError || gpsError}</p>}
      </div>
      <label className="field full-width">Titlu<input required minLength={5} maxLength={100} placeholder={type === 'report' ? 'Ce ai observat în cartier?' : type === 'activity' ? 'Ce facem împreună?' : 'Despre ce vrei să discutăm?'} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="field full-width">Descriere<textarea required minLength={10} maxLength={2000} rows={3} placeholder="Câteva detalii îi ajută pe vecini să înțeleagă." value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="field"><span className="pin-category-label" id="pin-category-label"><CategoryIcon size={14} aria-hidden="true" />Categorie</span><select aria-labelledby="pin-category-label" value={category} onChange={e => setCategory(e.target.value)}>{meta[type].categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="field">Numele locului<input maxLength={100} placeholder="Ex. intrarea în Parcul Central" value={place} onChange={e => setPlace(e.target.value)} /></label>
      {type === 'activity' && <><label className="field">Începe<input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label><label className="field">Se încheie<input required type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></label><label className="field full-width">Număr total de locuri <small>opțional · organizatorul ocupă un loc</small><input type="number" min={1} max={500} placeholder="Fără limită" value={capacity} onChange={e => setCapacity(e.target.value)} /></label></>}
      {type !== 'discussion' && <div className="field full-width">
        {type === 'report' ? 'Fotografie' : 'Imagine · opțional'}
        <input ref={fileRef} hidden type="file" accept={photoAccept} onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setImageBusy(true);
          setError('');
          try { setImage(await compressPhoto(file)); setDirty(true); }
          catch (e) { setError(errorText(e)); }
          finally { setImageBusy(false); if (fileRef.current) fileRef.current.value = ''; }
        }} />
        {image ? <div className="upload-preview">
          <img src={image} alt="Previzualizare fotografie" />
          <button type="button" className="secondary" onClick={() => { setImage(''); setDirty(true); }}>Elimină fotografia</button>
        </div> : <button type="button" className="upload-area" disabled={imageBusy} onClick={() => fileRef.current?.click()}>
          {imageBusy ? <span className="spinner" /> : <Upload size={24} />}
          <strong>{imageBusy ? 'Pregătim fotografia…' : 'Alege o fotografie'}</strong>
          <span>JPG, PNG, WebP sau HEIC compatibil · max. 15 MB</span>
        </button>}
      </div>}

    </div>
    <div className="publish-note"><ShieldCheck size={18} /><p>{type === 'activity' ? 'Orele sunt introduse în fusul orar al dispozitivului și afișate în ora României. ' : ''}{cloud ? 'Locația, conținutul și fotografia pinului vor fi publice.' : 'Locația și conținutul pinului sunt salvate în acest browser.'}</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary" disabled={saving} onClick={dismiss}>Renunță</button><button type="submit" className="primary" disabled={saving || imageBusy}>{saving ? <span className="spinner" /> : <Plus size={18} />}{saving ? 'Se salvează…' : pin ? 'Salvează modificările' : 'Publică în comunitate'}</button></div>
  </form></Modal>;
}
