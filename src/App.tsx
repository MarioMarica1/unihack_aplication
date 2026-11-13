import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownUp, ArrowLeft, ArrowRight, Bike, Bookmark, CalendarDays, Car, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Compass, Layers, MapPinned, ExternalLink, Flag, Footprints, Leaf, LocateFixed, MapPin, Maximize, MessageCircle, MoreHorizontal, Plus, Route, Search, Send, Settings2, ShieldCheck, Sparkles, Sprout, ThumbsUp, Trash2, TriangleAlert, Upload, Users, X } from 'lucide-react';
import { activityState, center, dateLabel, distance, formSchema, meta, people, pointSchema } from './domain';
import type { Action, FormInput, Pin, PinType, Point, State } from './domain';
import { compressPhoto, dispatch, loadState, subscribe } from './storage';
import { calculateRoute, travelModes } from './routing';
import type { RouteResult, TravelMode } from './routing';
import MapLayersPanel from './MapLayersPanel';
import PlacesPanel, { normalizeSearch } from './PlacesPanel';
import { useMapData } from './infrastructure';
import type { CommunityVisibility, Infrastructure, LayerKey, LayerVisibility, MapPlace } from './infrastructure';

const MapView = lazy(() => import('./MapCanvas'));
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

function PinCard({ pin, person, selected, select, saved, save, messages }: { pin: Pin; person: typeof guest; selected: boolean; select: () => void; saved: boolean; save: () => void; messages: number }) {
  return <article className={`pin-card ${selected ? 'is-selected' : ''}`}>
    <button className="card-main" data-pin-id={pin.id} onClick={select}>
      <div className="card-top"><span className={`type-label ${pin.type}`}>{iconFor(pin.type, 14)}{meta[pin.type].label}</span>{pin.demo && <span className="demo-label">DEMO</span>}</div>
      <h3>{pin.title}</h3><p className="place"><MapPin size={13} />{pin.place || 'Loc ales pe hartă'}</p>
      {pin.type === 'activity' && <div className="card-date"><CalendarDays size={14} />{dateLabel(pin.startsAt!, { weekday: 'short' })}<span className="dot" />{activityState(pin)}</div>}
      {pin.type !== 'activity' && <p className="card-description">{pin.description}</p>}
      <div className="card-footer"><div className="person-line"><span className="avatar tiny" style={{ background: person.color }}>{person.initials}</span>{person.name}</div><span className="card-stat">{pin.type === 'activity' ? <><Users size={14} />{pin.participants.length}{pin.capacity ? `/${pin.capacity}` : ''}</> : pin.type === 'report' ? <><ThumbsUp size={14} />{pin.supports.length}</> : <><MessageCircle size={14} />{messages}</>}</span></div>
    </button><button className={`card-bookmark ${saved ? 'bookmarked' : ''}`} aria-label={saved ? 'Elimină din salvate' : 'Salvează pinul'} onClick={save}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button>
  </article>;
}

const localStore = { loadState, dispatch, subscribe };
const guest: typeof people[number] = { id: '', name: 'Vizitator', initials: '', color: '#e9f2ee' };
type Cloud = { store: typeof localStore; user: typeof guest | null; account: ReactNode };

export default function App({ cloud }: { cloud?: Cloud }) {
  const store = cloud?.store ?? localStore;
  const accountId = cloud?.user?.id;
  const request = useRef(0);
  const [state, setState] = useState<State | null>(null); const [fatal, setFatal] = useState('');
  const [userId, setUserId] = useState(() => sessionStorage.getItem('vecin-user') || 'radu');
  const [view, setView] = useState<'layers' | 'places' | 'explore' | 'saved' | 'routes'>('explore');
  const [panelOpen, setPanelOpen] = useState(() => !!readPin()); const [activePlace, setActivePlace] = useState<MapPlace>();
  const [inspection, setInspection] = useState<{ title: string; description: string }>();
  const [buildings, setBuildings] = useState(true);
  const [community, setCommunity] = useState<CommunityVisibility>({ report: true, activity: true, discussion: true });
  const [query, setQuery] = useState(''); const [placeCategory, setPlaceCategory] = useState('all'); const [sort, setSort] = useState<'recent' | 'near'>('recent'); const [includePast, setIncludePast] = useState(false);
  const [selectedId, setSelectedId] = useState(readPin); const [modal, setModal] = useState<'profile' | 'help' | null>(null);
  const [form, setForm] = useState<{ id: string; type: PinType; pin?: Pin; related?: Pin; place?: MapPlace } | null>(null);
  const [formLocation, setFormLocation] = useState<Point>(); const [picking, setPicking] = useState<'form' | 'route' | null>(null);
  const [formMinimized, setFormMinimized] = useState(false); const [locationPoint, setLocationPoint] = useState<Point>(); const [gpsBusy, setGpsBusy] = useState(false); const [gpsFocus, setGpsFocus] = useState(0);
  const [toast, setToast] = useState<{ text: string; error?: boolean }>(); const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<LayerVisibility>({ cycleways: false, tramways: false, sidewalks: false, places: false }); const [pinLabels, setPinLabels] = useState(false); const [mapFit, setMapFit] = useState(0);
  const [travelMode, setTravelMode] = useState<TravelMode>('walking'); const [extraStops, setExtraStops] = useState<MapPlace[]>([]); const [pickStop, setPickStop] = useState(false);
  const [start, setStart] = useState<Point>(center); const [stopIds, setStopIds] = useState<string[]>([]); const [route, setRoute] = useState<RouteResult>(); const [routeBusy, setRouteBusy] = useState(false); const [routeError, setRouteError] = useState('');
  const sidebarScroll = useRef<HTMLDivElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const routeFeedback = useRef<HTMLDivElement>(null);
  const [addDestination, setAddDestination] = useState(false);
  const locationChoice = useRef(0);
  const [formGpsError, setFormGpsError] = useState('');
  useEffect(() => { sidebarScroll.current?.scrollTo({ top: 0 }); }, [view, selectedId]);
  useEffect(() => {
    if (route || routeError) routeFeedback.current?.scrollIntoView({ block: 'nearest' });
  }, [route, routeError]);
  const routeController = useRef<AbortController | null>(null); const [tick, setTick] = useState(0);
  const user = cloud ? cloud.user ?? guest : people.find(p => p.id === userId) || people[0];
  const profiles = state?.people ?? people;
  const cycleways = useMapData('cycleways', visibility.cycleways);
  const tramways = useMapData('tramways', visibility.tramways);
  const sidewalks = useMapData('sidewalks', visibility.sidewalks);
  const places = useMapData('places', visibility.places || view === 'places');
  const infrastructure = useMemo<Partial<Infrastructure>>(() => ({
    cycleways: cycleways.data, tramways: tramways.data, sidewalks: sidewalks.data, places: places.data,
  }), [cycleways.data, tramways.data, sidewalks.data, places.data]);
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
    const handleHistory = () => { const id = readPin(); setSelectedId(id); if (id) setPanelOpen(true); };
    window.addEventListener('popstate', handleHistory);
    const timer = setInterval(() => setTick(v => v + 1), 30000);
    return () => { window.removeEventListener('popstate', handleHistory); clearInterval(timer); routeController.current?.abort(); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(undefined), toast.error ? 7000 : 4000); return () => clearTimeout(timer); }, [toast]);
  function select(id: string) {
    if (id && !selectedId) detailTrigger.current = document.activeElement as HTMLElement;
    setSelectedId(id);
    if (id) { setActivePlace(undefined); setPanelOpen(true); }
    const path = id ? `/pins/${encodeURIComponent(id)}` : '/';
    if (path !== location.pathname || location.search) history.pushState({}, '', path);
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
    button?.focus();
  }
  function cancelPicking() {
    setPicking(null); setPickStop(false);
    if (form) setFormMinimized(false);
  }
  useEffect(() => {
    if (modal || (form && !formMinimized)) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (picking) cancelPicking();
      else if (selectedId) closeDetail();
      else if (activePlace) setActivePlace(undefined);
      else if (panelOpen && innerWidth <= 760) closeToolPanel();
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [modal, form, formMinimized, picking, selectedId, activePlace, panelOpen]);
  const allPins = useMemo(() => (state?.pins || []).filter(p => !p.deleted), [state]);
  const selected = allPins.find(p => p.id === selectedId);
  const mapPins = useMemo(() => allPins.filter(pin => community[pin.type] && (includePast || pin.type !== 'activity' || (pin.status !== 'cancelled' && Date.parse(pin.endsAt!) > Date.now()))), [allPins, community, includePast, tick]);
  const savedIds = state?.saved[user.id] || [];
  const searchTerm = normalizeSearch(query);
  const pins = useMemo(() => (view === 'saved' ? allPins : mapPins).filter(p => {
    if (view === 'saved' && !savedIds.includes(p.id)) return false;
    return normalizeSearch(`${p.title} ${p.description} ${p.place} ${p.category}`).includes(searchTerm);
  }).sort((a, b) => sort === 'near' ? distance(locationPoint || center, a.location) - distance(locationPoint || center, b.location) : Date.parse(b.createdAt) - Date.parse(a.createdAt)), [allPins, view, savedIds, mapPins, searchTerm, sort, locationPoint]);
  const stops = stopIds.map(id => allPins.find(p => p.id === id) || extraStops.find(p => p.id === id)).filter((p): p is Pin | MapPlace => !!p);
  const stopLocations = stops.map(p => `${p.id}:${p.location.lon},${p.location.lat}`).join('|');
  useEffect(() => {
    if (stops.length !== stopIds.length) setStopIds(stops.map(p => p.id));
    invalidateRoute();
  }, [stopLocations]);
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
    setFormLocation(pin?.location || related?.location || place?.location); setForm({ id, type, pin, related, place }); setFormMinimized(false); setPicking(null); setPickStop(false);
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
      if (target === 'route') { setStart(point); setPicking(null); setPickStop(false); invalidateRoute(); }
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
  function invalidateRoute() { routeController.current?.abort(); routeController.current = null; setRoute(undefined); setRouteError(''); setRouteBusy(false); }
  function addStop(id: string) {
    if (stopIds.includes(id)) { setStopIds(current => current.filter(p => p !== id)); invalidateRoute(); return; }
    if (stopIds.length >= 7) { setToast({ text: 'Poți adăuga maximum 7 opriri.', error: true }); return; }
    setStopIds(current => [...current, id]); invalidateRoute(); setToast({ text: 'Locul a fost adăugat în circuit.' });
  }
  function addPlace(place: MapPlace) {
    if (stopIds.includes(place.id)) { setToast({ text: 'Acest loc este deja în circuit.' }); return; }
    if (stopIds.length >= 7) { setToast({ text: 'Poți adăuga maximum 7 opriri.', error: true }); return; }
    setExtraStops(current => [...current.filter(p => p.id !== place.id), place]); setStopIds(current => [...current, place.id]); invalidateRoute(); setView('routes'); setPanelOpen(true); setActivePlace(undefined); select(''); setToast({ text: `${place.title} a fost adăugat în circuit.` });
  }
  function toggleLayer(key: LayerKey) { setVisibility(current => ({ ...current, [key]: !current[key] })); }
  function toggleCommunity(key: PinType) { setCommunity(current => ({ ...current, [key]: !current[key] })); if (selected?.type === key) select(''); }
  function switchView(next: typeof view) { setView(next); setQuery(''); setPlaceCategory('all'); setActivePlace(undefined); setPanelOpen(true); select(''); }
  function inspectPlace(place: MapPlace) { setActivePlace(place); setView('places'); setPanelOpen(true); select(''); }
  async function buildRoute() {
    const controller = new AbortController(); routeController.current?.abort(); routeController.current = controller; setRoute(undefined); setRouteBusy(true); setRouteError('');
    const timeout = setTimeout(() => controller.abort('timeout'), 20000);
    try { const result = await calculateRoute(start, stops.map(p => p.location), controller.signal, travelMode); if (routeController.current === controller) setRoute(result); }
    catch (e) { if (routeController.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) setRouteError(controller.signal.reason === 'timeout' ? 'Calculul a durat prea mult. Punctele sunt păstrate; reîncearcă.' : errorText(e)); }
    finally { clearTimeout(timeout); if (routeController.current === controller) setRouteBusy(false); }
  }
  if (fatal && !state) return <main className="fatal"><TriangleAlert size={40} /><h1>Nu am putut deschide datele</h1><p>{fatal}</p><button className="primary" onClick={() => location.reload()}>Reîncearcă</button></main>;
  if (!state) return <main className="fatal"><span className="spinner" /><h2>Pregătim cartierul tău…</h2></main>;
  return <div className={`app-shell map-first ${panelOpen ? 'panel-open' : ''} ${selected ? 'pin-open' : ''}`}>
    <header className="app-header">
      <button className="app-brand" aria-label="Vecin — harta principală" onClick={() => { switchView('explore'); setPanelOpen(false); }}><span><Sprout size={23} /></span><strong>vecin<span>.</span></strong></button>
      <span className="header-city"><MapPin size={15} />Timișoara</span>
      <div className="global-search"><Search size={19} /><input aria-label="Caută locuri în Timișoara" placeholder="Caută locuri" value={view === 'places' ? query : ''} onChange={e => { setQuery(e.target.value); setPlaceCategory('all'); setView('places'); setActivePlace(undefined); setSelectedId(''); history.replaceState({}, '', '/'); setPanelOpen(true); }} />{view === 'places' && query && <button aria-label="Șterge căutarea locurilor" onClick={() => { setQuery(''); setPlaceCategory('all'); setActivePlace(undefined); }}><X size={17} /></button>}</div>
      <div className="app-header-actions"><button className="header-saved" aria-label="Pinuri salvate" onClick={() => switchView('saved')}><Bookmark size={20} /></button><button className="primary header-create" aria-label="Adaugă în comunitate" onClick={() => openForm('report')}><Plus size={19} /><span>Adaugă</span></button><button className="header-profile" aria-label={cloud ? user.id ? 'Contul meu' : 'Conectează-te' : 'Alege profilul demo'} onClick={() => setModal('profile')}><span className="avatar" style={{ background: user.color }}>{user.initials || <Users size={17} />}</span></button></div>
    </header>
    <div className="workspace">
      <main className="main-layout">
        <aside className="discovery" aria-label="Panou hartă">
          <nav className="sidebar-tabs" aria-label="Instrumentele hărții">{([['explore','Comunitate'],['places','Locuri'],['routes','Circuit'],['layers','Straturi']] as const).map(([key,label]) => <button key={key} className={view === key || (view === 'saved' && key === 'explore') ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => switchView(key)}>{label}</button>)}</nav>
          {!selectedId && <div className="mobile-panel-heading"><button className="icon-btn" aria-label="Închide panoul" onClick={closeToolPanel}><X size={18} /></button></div>}
          {selectedId && !picking ? (selected ? <Detail pin={selected} state={state} profiles={profiles} canShare={!!cloud || !!selected.demo} userId={user.id} busy={busy} close={closeDetail} act={act} edit={() => openForm(selected.type, selected)} createActivity={() => openForm('activity', undefined, selected)} addStop={() => { if (stops.length >= 7 && !stopIds.includes(selected.id)) { addStop(selected.id); return; } addStop(selected.id); switchView('routes'); }} inRoute={stopIds.includes(selected.id)} openRelated={select} notify={setToast} /> : <div className="detail-panel"><div className="detail-toolbar"><button className="icon-btn" aria-label="Înapoi" onClick={closeDetail}><ArrowLeft size={20} /></button></div><div className="empty-state"><MapPin size={30} /><h2>Pin indisponibil</h2><p>{cloud ? 'Pinul a fost retras sau linkul nu mai este valid.' : 'Linkul poate indica un pin retras sau creat în alt browser.'}</p></div></div>) : <>
          <div className="sidebar-content" ref={sidebarScroll}>
            {view === 'layers' ? <>{inspection && <div className="infrastructure-inspection"><button className="icon-btn" aria-label="Închide informația despre strat" onClick={() => setInspection(undefined)}><X size={16} /></button><strong>{inspection.title}</strong><p>{inspection.description}</p></div>}<MapLayersPanel visibility={visibility} toggle={toggleLayer} layers={{ cycleways, tramways, sidewalks, places }} labels={pinLabels} setLabels={setPinLabels} buildings={buildings} setBuildings={setBuildings} /></> : view === 'places' ? <PlacesPanel data={infrastructure} query={query} category={placeCategory} setCategory={setPlaceCategory} error={places.error} retry={places.retry} select={inspectPlace} selected={activePlace} clear={() => setActivePlace(undefined)} add={addPlace} create={place => openForm('activity', undefined, undefined, place)} /> : view === 'routes' ? <><div className="panel-intro"><h1>Planifică un circuit</h1><p>Alege modul de transport și 2–7 opriri. Circuitul revine la start.</p></div><div className="route-planner">
            <div className="travel-mode-picker" role="group" aria-label="Mod de transport">{(['walking', 'cycling', 'driving'] as const).map(mode => <button key={mode} className={travelMode === mode ? 'active' : ''} aria-pressed={travelMode === mode} onClick={() => { setTravelMode(mode); invalidateRoute(); }}>{mode === 'walking' ? <Footprints size={18} /> : mode === 'cycling' ? <Bike size={18} /> : <Car size={18} />}<span>{travelModes[mode].label}</span></button>)}</div>
            <div className="route-notice"><Route size={18} /><p><strong>Circuit {travelMode === 'walking' ? 'pietonal' : travelMode === 'cycling' ? 'pentru bicicletă' : 'auto'}</strong><br />Calcul pe rețeaua {travelMode === 'walking' ? 'pietonală' : travelMode === 'cycling' ? 'accesibilă bicicletelor' : 'rutieră auto'}, cu profil OSRM dedicat.</p></div>
            <label className="field-label">PUNCT DE PORNIRE</label><div className="route-start"><span className="start-dot" /><div><strong>{start.lon === center.lon && start.lat === center.lat ? 'Centrul Timișoarei' : 'Punctul ales'}</strong><small>{start.lat.toFixed(5)}, {start.lon.toFixed(5)}</small></div></div>
            <div className="two-actions"><button className="secondary" onClick={() => locate('route')} disabled={gpsBusy}><LocateFixed size={15} />{gpsBusy ? 'Se caută…' : 'Poziția mea'}</button><button className="secondary" onClick={() => { setPickStop(false); setPicking('route'); select(''); }}><MapPin size={15} />Alege pe hartă</button></div>
            <div className="section-label"><span>OPRIRI</span><span>{stops.length}/7</span></div>
            {stops.length === 0 && <div className="empty-route"><MapPin size={24} /><p>Adaugă cel puțin două locuri.<br />Alege din listă sau deschide un pin pe hartă.</p></div>}
            {(route ? route.order.filter(index => index > 0).map(index => stops[index - 1]).filter(Boolean) : stops).map((p, i) => <div className="route-stop" key={p.id}><span>{i + 1}</span><div><strong>{p.title}</strong><small>{p.id.startsWith('osm:') || p.id.startsWith('tile:') ? 'Loc OpenStreetMap' : p.id.startsWith('point:') ? 'Punct ales pe hartă' : 'Pin al comunității'}</small></div><button className="icon-btn" aria-label={`Elimină ${p.title}`} onClick={() => addStop(p.id)}><X size={15} /></button></div>)}
            <button className="secondary full" disabled={stops.length >= 7} aria-expanded={addDestination} onClick={() => setAddDestination(value => !value)}><Plus size={16} />Adaugă oprire</button>
            {addDestination && <div className="destination-options"><select className="stop-select" aria-label="Adaugă oprire" value="" onChange={e => { if (e.target.value) { addStop(e.target.value); setAddDestination(false); } }} disabled={stops.length >= 7}><option value="">+ Adaugă un loc din comunitate</option>{allPins.filter(p => !stopIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <button className="secondary full manual-stop" disabled={stops.length >= 7} onClick={() => { setAddDestination(false); setPickStop(true); setPicking('route'); select(''); }}><MapPin size={15} />Alege pe hartă</button><button className="secondary full" onClick={() => { setAddDestination(false); switchView('places'); document.querySelector<HTMLInputElement>('.global-search input')?.focus(); }}>Caută un loc</button></div>}
            <button className="primary full" disabled={stops.length < 2 || routeBusy} onClick={() => void buildRoute()}>{routeBusy ? <span className="spinner" /> : <Route size={18} />}{routeBusy ? 'Calculăm drumul…' : 'Generează circuitul'}</button>
            <div ref={routeFeedback}>{routeError && <p className="form-error" role="alert">{routeError}</p>}
            {route && <div className="route-result"><span className="eyebrow">CIRCUIT CALCULAT · {travelModes[route.mode].label.toLocaleUpperCase('ro')}</span><div><strong>{(route.distance / 1000).toFixed(1)} <small>km</small></strong><strong>{Math.ceil(route.duration / 60)} <small>min</small></strong></div><p>Ordinea vizitelor: start → {route.order.filter(i => i > 0).map(i => stops[i - 1]?.title).join(' → ')} → start.</p>{route.warnings.map(w => <p key={w} className="warning">{w}</p>)}<small>Durată estimată, fără trafic live. Nu garantează evitarea sesizărilor.</small></div>}</div>
            <p className="routing-attribution">Rutare © <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS / OSRM</a> · © OpenStreetMap<br /><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Semnalează o eroare în hartă</a>. Serviciu public fără garanție de disponibilitate. Punctele circuitului sunt trimise furnizorului la calcul.</p>
          </div></> : <><div className="panel-intro"><h1>{view === 'saved' ? 'Pinuri salvate' : 'În comunitate'}</h1><button className="community-saved" onClick={() => switchView(view === 'saved' ? 'explore' : 'saved')}><Bookmark size={14} />{view === 'saved' ? 'Toată comunitatea' : 'Vezi pinurile salvate'}</button></div><div className="search-box"><Search size={17} /><input aria-label="Caută în comunitate" placeholder="Caută un loc, o idee, o activitate…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-btn" aria-label="Șterge căutarea" onClick={() => setQuery('')}><X size={15} /></button>}</div>
            {view !== 'saved' && <div className="filter-tabs" role="group" aria-label="Tipuri afișate pe hartă și în listă">{(['report', 'activity', 'discussion'] as const).map(type => <button key={type} className={community[type] ? `active ${type}` : type} aria-pressed={community[type]} onClick={() => toggleCommunity(type)}>{iconFor(type, 14)}{meta[type].plural}</button>)}</div>}
            <div className="results-heading"><span>{pins.length} {view === 'saved' ? 'salvate' : 'pinuri'}</span>
              <details className="list-options">
                <summary><ArrowDownUp size={14} />Opțiuni</summary>
                <div className="list-options-body"><label>Ordine<select value={sort} onChange={event => setSort(event.target.value === 'near' ? 'near' : 'recent')}><option value="recent">Cele mai recente</option><option value="near">{locationPoint ? 'Aproape de mine' : 'Aproape de centru'}</option></select></label>
                {view === 'explore' && community.activity && <label className="checkbox-line"><input type="checkbox" checked={includePast} onChange={e => setIncludePast(e.target.checked)} />Include activități încheiate sau anulate</label>}</div>
              </details>
            </div>
            <div className="pin-list">{pins.map(pin => <PinCard key={pin.id} pin={pin} person={profiles.find(p => p.id === pin.authorId) ?? guest} selected={selectedId === pin.id} select={() => select(pin.id)} saved={savedIds.includes(pin.id)} save={() => perform({ type: 'save', pinId: pin.id, userId: user.id, enabled: !savedIds.includes(pin.id) })} messages={state.messages.filter(m => m.pinId === pin.id).length} />)}{pins.length === 0 && <div className="empty-state"><Sprout size={30} />
              <h3>{view === 'saved' ? 'Niciun pin salvat' : allPins.length ? 'Niciun pin găsit' : 'Comunitatea începe cu primul pin'}</h3>
              {view === 'saved'
                ? <button className="secondary" onClick={() => switchView('explore')}>Explorează comunitatea</button>
                : allPins.length
                  ? <button className="secondary" onClick={() => { setQuery(''); setIncludePast(true); setCommunity({ report: true, activity: true, discussion: true }); }}>Arată toate rezultatele</button>
                  : <button className="primary" onClick={() => openForm('report')}>Adaugă un pin</button>}
            </div>}</div></>}
          </div>
          <footer className="sidebar-bottom"><span><i />{cloud ? 'Vecin · Timișoara' : 'Demo local · date în acest browser'}</span><button onClick={() => setModal('help')}><CircleHelp size={15} />Ghid</button></footer>
          </>}
        </aside>
        <section className={`map-area ${picking ? 'is-picking' : ''}`} aria-label="Harta comunității">
          <Suspense fallback={<div className="map-surface"><div className="map-loading" role="status">Se încarcă harta…</div></div>}><MapView pins={mapPins} selected={selected} onSelect={select} picking={!!picking} onPick={point => { if (picking === 'form') chooseFormLocation(point); else if (pickStop) { addPlace({ id: `point:${crypto.randomUUID()}`, title: `Oprire pe hartă ${stops.length + 1}`, location: point }); setPickStop(false); } else { setStart(point); invalidateRoute(); } setPicking(null); if (form) setFormMinimized(false); }} picked={picking === 'form' || (form && formMinimized) ? formLocation : view === 'routes' ? start : undefined} userLocation={locationPoint} route={view === 'routes' ? route : undefined} focus={gpsFocus} infrastructure={infrastructure} visibility={visibility} labels={pinLabels} mapFit={mapFit} buildings={buildings} focusedPlace={activePlace} onInspectPlace={inspectPlace} onInspectLine={info => { setInspection(info); setView('layers'); setPanelOpen(true); select(''); }} /></Suspense>
          <div className="map-utility-controls"><button aria-label="Localizează-mă" onClick={() => locate()} disabled={gpsBusy}>{gpsBusy ? <span className="spinner" /> : <LocateFixed size={20} />}</button><button aria-label="Arată toate pinurile" onClick={() => { select(''); setMapFit(value => value + 1); }}><Maximize size={19} /></button></div>
          {picking && <div className="picking-notice"><MapPin size={20} /><div><strong>Atinge un punct pe hartă</strong><span>{picking === 'form' ? 'Aici va apărea pinul tău.' : pickStop ? 'Adaugă o destinație în circuit.' : 'Alege începutul circuitului.'}</span></div><button className="secondary" onClick={cancelPicking}>Renunță</button></div>}
        </section>
      </main>
    </div>
    <nav className="mobile-map-nav" aria-label="Navigare mobilă">{([['explore','Comunitate'],['places','Locuri'],['routes','Circuit'],['layers','Straturi']] as const).map(([key,label]) => <button key={key} className={(view === key || (key === 'explore' && view === 'saved')) && panelOpen ? 'active' : ''} aria-expanded={(view === key || (key === 'explore' && view === 'saved')) && panelOpen} onClick={() => { if (picking) cancelPicking(); if (view === key && panelOpen && !selectedId) { closeToolPanel(); select(''); } else switchView(key); }}>{key === 'layers' ? <Layers size={20} /> : key === 'places' ? <MapPinned size={20} /> : key === 'explore' ? <Users size={20} /> : <Route size={20} />}<span>{label}</span></button>)}</nav>
    {form && <div style={{ display: formMinimized ? 'none' : undefined }}><CreateForm placePreset={form.place?.title} active={!formMinimized} type={form.type} pin={form.pin} related={form.related} point={formLocation} setPoint={chooseFormLocation} gpsError={formGpsError} cloud={!!cloud} pick={() => { setFormMinimized(true); setPicking('form'); }} locate={() => locate('form')} gpsBusy={gpsBusy} close={() => { ++locationChoice.current; setForm(null); setPicking(null); setFormMinimized(false); }} submit={async input => { const id = form.id; await act(form.pin ? { type: 'edit', pinId: id, input, userId: user.id } : { type: 'create', id, input, userId: user.id }, form.pin ? 'Modificările au fost salvate.' : 'Pinul tău este acum în comunitate.'); ++locationChoice.current; setForm(null); setView('explore'); setCommunity(current => ({ ...current, [input.type]: true })); setQuery(''); select(id); }} /></div>}
    {modal === 'profile' && cloud && <Modal title={user.id ? 'Contul meu' : 'Conectează-te'} close={() => setModal(null)}>{cloud.account}</Modal>}
    {modal === 'profile' && !cloud && <Modal title="Profiluri demo" close={() => setModal(null)}><p className="modal-intro">Acestea sunt identități simulate, pentru demo. Schimbă profilul ca să testezi înscrierea, confirmările și conversațiile. Nu sunt conturi Supabase.</p><div className="profile-options">{people.map(p => <button key={p.id} className={user.id === p.id ? 'chosen' : ''} onClick={() => { setUserId(p.id); sessionStorage.setItem('vecin-user', p.id); setModal(null); setToast({ text: `Testezi acum ca ${p.name}.` }); }}><span className="avatar" style={{ background: p.color }}>{p.initials}</span><span><strong>{p.name}</strong><small>Profil demonstrativ</small></span>{user.id === p.id ? <Check size={20} /> : <ChevronRight size={20} />}</button>)}</div><div className="info-box"><ShieldCheck size={19} /><p>Datele sunt comune filelor de browser de pe aceeași adresă. Alte dispozitive nu le văd. Autentificarea reală și sincronizarea cloud sunt următoarea etapă.</p></div></Modal>}
    {modal === 'help' && <Modal title="Bun venit în Vecin." close={() => setModal(null)}><p className="modal-intro">O hartă pentru lucrurile pe care le putem face împreună. Acesta este primul demo funcțional pentru UniHack / Connected Communities.</p><div className="help-steps"><div><TriangleAlert /><span><strong>Semnalează ceva de îmbunătățit</strong><p>Alege locul, adaugă o fotografie și publică. Un alt profil poate confirma sau comenta.</p></span></div><div><CalendarDays /><span><strong>Adună oamenii în jurul unei idei</strong><p>Creează o activitate, testează înscrierea și discută cu participanții.</p></span></div><div><Route /><span><strong>Leagă locurile într-un circuit</strong><p>Alege 2–7 opriri și calculează un circuit pietonal, pentru bicicletă sau auto. Necesită internet.</p></span></div></div><div className="info-box"><ShieldCheck /><p>{cloud ? 'Pinurile, fotografiile și conversațiile publicate sunt vizibile comunității.' : 'În demo, pinurile, fotografiile, conversațiile și înscrierile sunt salvate în acest browser.'}</p></div><button className="primary full" onClick={() => setModal(null)}>Hai să explorăm <ArrowRight size={17} /></button></Modal>}
    {fatal && state && !toast && <div className="toast error" role="status">Datele nu s-au putut actualiza. Reîncercăm automat.</div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <TriangleAlert size={18} /> : <Check size={18} />}<span>{toast.text}</span><button aria-label="Închide notificarea" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
  </div>;
}

function ArrowUpRightSmall() { return <ExternalLink size={12} />; }

type DetailProps = { pin: Pin; state: State; profiles: typeof people; canShare: boolean; userId: string; busy: boolean; close: () => void; act: (action: Action, success?: string) => Promise<State>; edit: () => void; createActivity: () => void; addStop: () => void; inRoute: boolean; openRelated: (id: string) => void; notify: (toast: { text: string; error?: boolean }) => void };
function Detail({ pin, state, profiles, canShare, userId, busy, close, act, edit, createActivity, addStop, inRoute, openRelated, notify }: DetailProps) {
  const [body, setBody] = useState(''); const [menu, setMenu] = useState(false); const [messageLimit, setMessageLimit] = useState(30);
  const messagesEnd = useRef<HTMLDivElement>(null); const detailTitle = useRef<HTMLHeadingElement>(null); const author = profiles.find(p => p.id === pin.authorId) ?? guest;
  const messages = state.messages.filter(m => m.pinId === pin.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const mine = pin.authorId === userId; const saved = state.saved[userId]?.includes(pin.id); const status = pin.type === 'activity' ? activityState(pin) : pin.status === 'resolved' ? 'Rezolvată' : 'Deschisă';
  useEffect(() => { setBody(''); setMenu(false); setMessageLimit(30); detailTitle.current?.focus({ preventScroll: true }); }, [pin.id]);
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
  async function send(e: FormEvent) {
    e.preventDefault(); if (!body.trim() || busy) return;
    try { await act({ type: 'message', id: crypto.randomUUID(), pinId: pin.id, userId, body }); setBody(''); setTimeout(() => messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100); } catch { /* draft retained */ }
  }
  return <aside className="detail-panel" aria-label={`Detalii: ${pin.title}`}>
    <div className="detail-toolbar"><button className="icon-btn" aria-label="Înapoi" onClick={close}><ArrowLeft size={20} /></button><div className="detail-tools"><button className={`icon-btn ${saved ? 'bookmarked' : ''}`} aria-label={saved ? 'Elimină din salvate' : 'Salvează pinul'} disabled={busy} onClick={() => run({ type: 'save', pinId: pin.id, userId, enabled: !saved })}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>{canShare && <button className="icon-btn" aria-label="Distribuie" onClick={() => void share()}><ExternalLink size={18} /></button>}</div></div>
    <div className="detail-scroll">
      <div className="detail-content"><div className="detail-badges"><span className={`type-label ${pin.type}`}>{iconFor(pin.type, 15)}{meta[pin.type].label}</span>{pin.type !== 'discussion' && <span className={`status-badge ${pin.status === 'resolved' ? 'resolved' : ''}`}>{status}</span>}{pin.demo && <span className="demo-label">DEMO</span>}</div>
        <h2 tabIndex={-1} ref={detailTitle}>{pin.title}</h2><p className="detail-place"><MapPin size={16} />{pin.place || `${pin.location.lat.toFixed(5)}, ${pin.location.lon.toFixed(5)}`}</p>
        <div className="detail-author"><span className="avatar" style={{ background: author.color }}>{author.initials}</span><div><strong>{author.name}{mine ? ' · tu' : ''}</strong><small>Publicat {dateLabel(pin.createdAt)}</small></div><button className="icon-btn" aria-label="Opțiuni pin" onClick={() => setMenu(v => !v)}><MoreHorizontal size={20} /></button></div>
        {menu && <div className="detail-menu">{mine && <><button onClick={() => { edit(); setMenu(false); }}><Settings2 size={15} />Editează</button><button className="danger" disabled={busy} onClick={() => { if (confirm('Retragi acest pin? Nu va mai fi afișat, iar conversația va fi eliminată.')) { void act({ type: 'delete', pinId: pin.id, userId }, 'Pinul a fost retras.').then(close).catch(() => {}); } }}><Trash2 size={15} />Retrage pinul</button></>}<button onClick={() => { const reason = prompt('De ce raportezi acest conținut?'); if (reason) { run({ type: 'flag', pinId: pin.id, userId, reason }, state.people ? 'Raportarea a fost înregistrată.' : 'Raportarea a fost înregistrată în acest browser.'); setMenu(false); } }}><Flag size={15} />Raportează conținutul</button></div>}
        {pin.type === 'activity' && <div className="activity-facts"><div><CalendarDays size={19} /><span><strong>{dateLabel(pin.startsAt!)}</strong><small>Până la {dateLabel(pin.endsAt!)} · ora României</small></span></div><div><Users size={19} /><span><strong>{pin.participants.length}{pin.capacity ? ` din ${pin.capacity} locuri ocupate` : ' participanți'}</strong><small>Organizatorul este inclus</small></span></div></div>}
        {pin.relatedId && <button className="related-pin" onClick={() => openRelated(pin.relatedId!)}><TriangleAlert size={16} /><span>Vezi sesizarea de la care a pornit</span><ChevronRight size={16} /></button>}
        {pin.type === 'report' && <>{!mine && pin.status !== 'resolved' ? <button className={`primary full support-button ${pin.supports.includes(userId) ? 'supported' : ''}`} aria-pressed={pin.supports.includes(userId)} disabled={busy} onClick={() => run({ type: 'support', pinId: pin.id, userId, enabled: !pin.supports.includes(userId) })}><ThumbsUp size={18} />{pin.supports.includes(userId) ? 'Retrage confirmarea' : 'Confirm și eu'}<span>{pin.supports.length}</span></button> : <p className="support-count"><ThumbsUp size={16} />Confirmări: {pin.supports.length}</p>}{mine && <button className="secondary full" disabled={busy} onClick={() => run({ type: 'resolve', pinId: pin.id, userId }, pin.status === 'resolved' ? 'Sesizarea a fost redeschisă.' : 'Ai marcat sesizarea ca rezolvată.')}><CheckCheck size={17} />{pin.status === 'resolved' ? 'Redeschide sesizarea' : 'Marchează ca rezolvată'}</button>}{pin.changedAt && <small className="muted-text">Stare actualizată de {author.name}, {dateLabel(pin.changedAt)}.</small>}<button className="action-link" onClick={createActivity}><Sprout size={17} />Organizează o acțiune aici <ArrowRight size={16} /></button></>}
        {pin.type === 'activity' && <>{!mine && <button className="primary full" disabled={busy || pin.status === 'cancelled' || Date.parse(pin.startsAt!) <= Date.now() || (status === 'Completă' && !pin.participants.includes(userId))} onClick={() => run({ type: 'join', pinId: pin.id, userId, enabled: !pin.participants.includes(userId) }, pin.participants.includes(userId) ? 'Te-ai retras din activitate.' : 'Ești înscris! Ne vedem acolo.')}><Users size={18} />{pin.participants.includes(userId) ? 'Retrage participarea' : status === 'Completă' ? 'Toate locurile sunt ocupate' : status === 'Urmează' ? 'Particip și eu' : 'Înscrieri închise'}</button>}{mine && <div className="organizer-note"><CheckCheck size={17} />Ești organizator și participant.{pin.status !== 'cancelled' && <button className="action-link danger" disabled={busy} onClick={() => { if (confirm('Anulezi activitatea? Participanții vor vedea starea „Anulată”.')) run({ type: 'cancel', pinId: pin.id, userId }, 'Activitatea a fost anulată.'); }}>Anulează activitatea</button>}</div>}</>}
        <p className="detail-description">{pin.description}</p>
        {pin.image && <figure className="detail-image"><img loading="lazy" src={pin.image} alt={pin.demo ? 'Ilustrație demonstrativă' : `Fotografie pentru ${pin.title}`} />{pin.demo && <span>ILUSTRAȚIE DEMO</span>}</figure>}
        <section className="conversation"><div className="conversation-heading"><h3>Conversația locului</h3><span>{messages.length}</span><small><i />{state.people ? 'Public' : 'Local'}</small></div>
          {messages.length > messageLimit && <button className="action-link" onClick={() => setMessageLimit(n => n + 30)}>Arată mesaje mai vechi</button>}
          <div className="messages">{messages.slice(-messageLimit).map(msg => { const person = profiles.find(p => p.id === msg.authorId) ?? guest; return <div key={msg.id} className="message"><span className="avatar tiny" style={{ background: person.color }}>{person.initials}</span><div><div className="message-author"><strong>{person.name}</strong><time>{dateLabel(msg.createdAt, { day: undefined, month: undefined })}</time>{msg.authorId === userId && <button aria-label="Șterge mesajul" disabled={busy} onClick={() => { if (confirm('Ștergi acest mesaj?')) run({ type: 'deleteMessage', messageId: msg.id, userId }); }}><Trash2 size={12} /></button>}</div><p>{msg.body}</p></div></div>; })}{messages.length === 0 && <p className="no-messages">Începe tu conversația.</p>}<div ref={messagesEnd} /></div>
          <form className="message-composer" onSubmit={e => void send(e)}><input aria-label="Mesaj pentru conversație" placeholder="Scrie un mesaj…" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} /><button aria-label="Trimite mesajul" disabled={!body.trim() || busy} type="submit"><Send size={17} /></button></form>
        </section>
        <button className="secondary full route-add" onClick={addStop}><Route size={17} />{inRoute ? 'Elimină din circuit' : 'Adaugă în circuit'}</button>
      </div>
    </div>
  </aside>;
}

type FormProps = { cloud: boolean; gpsError: string; type: PinType; pin?: Pin; related?: Pin; placePreset?: string; point?: Point; setPoint: (point: Point) => void; pick: () => void; locate: () => void; gpsBusy: boolean; close: () => void; submit: (input: FormInput) => Promise<void>; active: boolean };
function CreateForm({ cloud, gpsError, type: initialType, pin, related, placePreset, point, setPoint, pick, locate, gpsBusy, close, submit, active }: FormProps) {
  const [type, setType] = useState<PinType>(initialType); const [title, setTitle] = useState(pin?.title || (related ? `Acțiune: ${related.title}` : '')); const [description, setDescription] = useState(pin?.description || '');
  const [category, setCategory] = useState(pin?.category || meta[initialType].categories[0]); const [place, setPlace] = useState(pin?.place || related?.place || placePreset || '');
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
  return <Modal title={pin ? 'Editează pinul' : 'Adaugă în comunitate'} close={dismiss} wide active={active}><form onSubmit={e => void send(e)} className="create-form" onChange={() => setDirty(true)}>
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
      <label className="field">Categorie<select value={category} onChange={e => setCategory(e.target.value)}>{meta[type].categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="field">Numele locului <small>opțional</small><input maxLength={100} placeholder="Ex. intrarea în Parcul Central" value={place} onChange={e => setPlace(e.target.value)} /></label>
      {type === 'activity' && <><label className="field">Începe<input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label><label className="field">Se încheie<input required type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></label><label className="field full-width">Număr total de locuri <small>opțional · organizatorul ocupă un loc</small><input type="number" min={1} max={500} placeholder="Fără limită" value={capacity} onChange={e => setCapacity(e.target.value)} /></label></>}
      {type !== 'discussion' && <div className="field full-width">{type === 'report' ? 'Fotografie' : 'Imagine · opțional'}<input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setImageBusy(true); setError(''); try { setImage(await compressPhoto(file)); setDirty(true); } catch (e) { setError(errorText(e)); } finally { setImageBusy(false); if (fileRef.current) fileRef.current.value = ''; } }} />{image ? <div className="upload-preview"><img src={image} alt="Previzualizare fotografie" /><button type="button" className="secondary" onClick={() => { setImage(''); setDirty(true); }}>Elimină fotografia</button></div> : <button type="button" className="upload-area" disabled={imageBusy} onClick={() => fileRef.current?.click()}>{imageBusy ? <span className="spinner" /> : <Upload size={24} />}<strong>{imageBusy ? 'Pregătim fotografia…' : 'Alege o fotografie'}</strong><span>JPG, PNG sau WebP · max. 15 MB · comprimare automată</span></button>}</div>}

    </div>
    <div className="publish-note"><ShieldCheck size={18} /><p>{type === 'activity' ? 'Orele sunt introduse în fusul orar al dispozitivului și afișate în ora României. ' : ''}{cloud ? 'Locația, conținutul și fotografia pinului vor fi publice.' : 'Locația și conținutul pinului sunt salvate în acest browser.'}</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary" disabled={saving} onClick={dismiss}>Renunță</button><button type="submit" className="primary" disabled={saving || imageBusy}>{saving ? <span className="spinner" /> : <Plus size={18} />}{saving ? 'Se salvează…' : pin ? 'Salvează modificările' : 'Publică în comunitate'}</button></div>
  </form></Modal>;
}
