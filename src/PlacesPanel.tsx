import { ArrowLeft, ArrowRight, Building2, Bus, CalendarDays, Coffee, Dumbbell, GraduationCap, HeartPulse, Landmark, MapPin, Route, Search, Share2, ShoppingBag, TrainFront, Trees, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { placeKindLabel, toMapPlace } from './infrastructure';
import type { Infrastructure, MapPlace } from './infrastructure';

export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro').trim();

// Landmarks already present in the bundled OSM export, in browsing order.
const featured = new Map(['node/13157952377', 'way/4975934', 'relation/1250434', 'way/98090655', 'way/222924327', 'way/97929100'].map((id, index) => [id, index]));
const placeIcons = { park: Trees, sport: Dumbbell, museum: Landmark, tram_stop: TrainFront, food: Coffee,
  shop: ShoppingBag, health: HeartPulse, education: GraduationCap, culture: Landmark, transport: Bus, services: Wrench, building: Building2 };
const categories = [['all','Toate'], ['food','Mâncare'], ['shop','Magazine'], ['education','Educație'], ['health','Sănătate'], ['park','Parcuri'], ['culture','Cultură'], ['transport','Transport comun'], ['building','Clădiri'], ['services','Servicii'], ['sport','Sport']];
export function placeIcon(kind?: string) { return placeIcons[kind as keyof typeof placeIcons] ?? MapPin; }

export function placeLink(place: MapPlace) {
  const { lat, lon } = place.location;
  const osmId = place.id.match(/^osm:((?:node|way|relation)\/\d+)$/)?.[1];
  return osmId ? `https://www.openstreetmap.org/${osmId}` : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}

export function findPlaces(data: Partial<Infrastructure> | undefined, query: string, category: string) {
  const term = normalizeSearch(query);
  return (data?.places?.features || []).filter(feature => {
    const p = feature.properties || {};
    return (category === 'all' || (category === 'transport' ? ['transport','tram_stop'].includes(p.kind) : category === 'culture' ? ['culture','museum'].includes(p.kind) : p.kind === category)) && (!term || normalizeSearch(`${p.name} ${p.street || ''} ${p.number || ''} ${placeKindLabel[p.kind] || ''}`).includes(term));
  }).sort((a,b) => {
    if (term) { const exactA = normalizeSearch(a.properties?.name || '') === term; const exactB = normalizeSearch(b.properties?.name || '') === term; if (exactA !== exactB) return exactA ? -1 : 1; }
    if (!term && category === 'all') {
      const priority = (p: typeof a.properties) => featured.get(p?.osmId) ?? (p?.kind === 'building' ? 100 : 50);
      const difference = priority(a.properties) - priority(b.properties);
      if (difference) return difference;
    }
    return String(a.properties?.name).localeCompare(String(b.properties?.name), 'ro');
  });
}
type Props = { data?: Partial<Infrastructure>; query: string; category: string; setCategory: (value: string) => void; error: string; retry: () => void; select: (place: MapPlace) => void; selected?: MapPlace; clear: () => void; add: (place: MapPlace) => void; create: (place: MapPlace) => void; share: (place: MapPlace) => void };
export default function PlacesPanel({ data, query, category, setCategory, error, retry, select, selected, clear, add, create, share }: Props) {
  const [limit, setLimit] = useState(40);
  const places = useMemo(() => findPlaces(data, query, category), [data, query, category]);
  const source = selected ? data?.places?.features.find(f => `osm:${f.properties?.osmId}` === selected.id) : undefined;
  if (selected) {
    const Icon = placeIcon(selected.kind);
    return <div className="place-details">
      <button className="back-link" onClick={clear}><ArrowLeft size={17} />Înapoi la rezultate</button>
      <span className="place-detail-icon"><Icon size={30} /></span>
      <h1>{selected.title}</h1><p className="place-category">{placeKindLabel[selected.kind || ''] || 'Loc pe hartă'}</p>
      {source?.properties?.street && <p className="place-address"><MapPin size={16} />{source.properties.street} {source.properties.number}</p>}
      <div className="place-actions">
        <button className="primary full" onClick={() => add(selected)}><Route size={17} />Adaugă în traseu</button>
        <button className="secondary full" onClick={() => create(selected)}><CalendarDays size={17} />Creează activitate aici</button>
        <button className="secondary full" onClick={() => share(selected)}><Share2 size={17} />Distribuie</button>
      </div>
      <p className="source-note">Poziție din OpenStreetMap. Pentru clădiri și parcuri poate indica centrul suprafeței, nu intrarea.</p>
      <a className="osm-link" href={placeLink(selected)} target="_blank" rel="noreferrer">Vezi în OpenStreetMap <ArrowRight size={14} /></a>
    </div>;
  }
  if (error) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="alert">Locurile nu s-au putut încărca.</p><button className="secondary" onClick={retry}>Reîncearcă</button></div>;
  if (!data?.places) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="status">Se încarcă locurile…</p></div>;

  const CategoryIcon = category === 'all' ? MapPin : placeIcon(category);
  return <div className="places-panel">
    <div className="panel-intro"><h1>{query ? 'Rezultatele căutării' : 'Locuri în Timișoara'}</h1></div>
    <label className="place-category-filter"><CategoryIcon size={17} aria-hidden="true" /><span id="place-category-label">Categorie</span>
      <select aria-labelledby="place-category-label" value={category} onChange={event => { setCategory(event.target.value); setLimit(40); }}>
        {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <div className="place-result-count" role="status">{places.length.toLocaleString('ro-RO')} rezultate{query ? ` pentru „${query}”` : ''}</div>
    <div className="place-results">
      {places.slice(0, limit).map(feature => {
        const props = feature.properties || {};
        const place = toMapPlace(feature);
        const Icon = placeIcon(place.kind);
        return <div className="place-result-row" key={place.id}>
          <button className="place-result" onClick={() => select(place)}>
            <span className={`place-result-symbol ${place.kind || ''}`}><Icon size={18} /></span>
            <span><strong>{place.title}</strong><small>{placeKindLabel[props.kind] || 'Loc'}{props.street ? ` · ${props.street}` : ''}</small></span>
          </button>
          <button className="icon-btn place-share" aria-label={`Distribuie ${place.title}`} title="Distribuie" onClick={() => share(place)}><Share2 size={17} /></button>
        </div>;
      })}
      {places.length === 0 && <div className="empty-state"><Search size={28} /><h3>Niciun loc găsit</h3><p>Încearcă alt nume sau schimbă categoria. Căutarea folosește locurile OSM din zona demonstrativă.</p></div>}
      {places.length > limit && <button className="secondary full" onClick={() => setLimit(value => value + 40)}>Arată încă 40 de locuri</button>}
    </div>
  </div>;
}
