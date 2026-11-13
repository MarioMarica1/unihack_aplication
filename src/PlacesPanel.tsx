import { ArrowLeft, ArrowRight, Building2, CalendarDays, ChevronRight, MapPin, Route, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { placeKindLabel, toMapPlace } from './infrastructure';
import type { Infrastructure, MapPlace } from './infrastructure';

export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro').trim();
export function findPlaces(data: Partial<Infrastructure> | undefined, query: string, category: string) {
  const term = normalizeSearch(query);
  return (data?.places?.features || []).filter(feature => {
    const p = feature.properties || {};
    return (category === 'all' || (category === 'transport' ? ['transport','tram_stop'].includes(p.kind) : category === 'culture' ? ['culture','museum'].includes(p.kind) : p.kind === category)) && (!term || normalizeSearch(`${p.name} ${p.street || ''} ${p.number || ''} ${placeKindLabel[p.kind] || ''}`).includes(term));
  }).sort((a,b) => {
    if (term) { const exactA = normalizeSearch(a.properties?.name || '') === term; const exactB = normalizeSearch(b.properties?.name || '') === term; if (exactA !== exactB) return exactA ? -1 : 1; }
    return String(a.properties?.name).localeCompare(String(b.properties?.name), 'ro');
  });
}
type Props = { data?: Partial<Infrastructure>; query: string; category: string; setCategory: (value: string) => void; error: string; retry: () => void; select: (place: MapPlace) => void; selected?: MapPlace; clear: () => void; add: (place: MapPlace) => void; create: (place: MapPlace) => void };
export default function PlacesPanel({ data, query, category, setCategory, error, retry, select, selected, clear, add, create }: Props) {
  const [limit, setLimit] = useState(40);
  const places = useMemo(() => findPlaces(data, query, category), [data, query, category]);
  const source = selected ? data?.places?.features.find(f => `osm:${f.properties?.osmId}` === selected.id) : undefined;
  if (selected) return <div className="place-details"><button className="back-link" onClick={clear}><ArrowLeft size={17} />Înapoi la rezultate</button><span className="place-detail-icon"><Building2 size={30} /></span><span className="place-origin">LOC OPENSTREETMAP</span><h1>{selected.title}</h1><p className="place-category">{placeKindLabel[selected.kind || ''] || 'Loc pe hartă'}</p>{source?.properties?.street && <p className="place-address"><MapPin size={16} />{source.properties.street} {source.properties.number}</p>}<div className="place-actions"><button className="primary full" onClick={() => add(selected)}><Route size={17} />Adaugă în circuit</button><button className="secondary full" onClick={() => create(selected)}><CalendarDays size={17} />Creează activitate aici</button></div><p className="source-note">Poziție din OpenStreetMap. Pentru clădiri și parcuri poate indica centrul suprafeței, nu intrarea.</p><a className="osm-link" href={selected.id.startsWith('osm:') ? `https://www.openstreetmap.org/${selected.id.slice(4)}` : `https://www.openstreetmap.org/?mlat=${selected.location.lat}&mlon=${selected.location.lon}#map=18/${selected.location.lat}/${selected.location.lon}`} target="_blank" rel="noreferrer">Vezi în OpenStreetMap <ArrowRight size={14} /></a></div>;
  if (error) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="alert">Locurile nu s-au putut încărca.</p><button className="secondary" onClick={retry}>Reîncearcă</button></div>;
  if (!data?.places) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="status">Se încarcă locurile…</p></div>;

  return <div className="places-panel"><div className="panel-intro"><h1>{query ? 'Rezultatele căutării' : 'Locuri în Timișoara'}</h1></div><label className="place-category-filter">Categorie<select value={category} onChange={e => { setCategory(e.target.value); setLimit(40); }}>{[['all','Toate'],['food','Mâncare'],['shop','Magazine'],['education','Educație'],['health','Sănătate'],['park','Parcuri'],['culture','Cultură'],['transport','Transport'],['building','Clădiri'],['services','Servicii'],['sport','Sport']].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className="place-result-count" role="status">{places.length.toLocaleString('ro-RO')} rezultate{query ? ` pentru „${query}”` : ''}</div><div className="place-results">{places.slice(0,limit).map(feature => { const p = feature.properties || {}; return <button key={p.osmId} className="place-result" onClick={() => select(toMapPlace(feature))}><span className={`place-result-symbol ${p.kind}`}><MapPin size={17} /></span><span><strong>{p.name}</strong><small>{placeKindLabel[p.kind] || 'Loc'}{p.street ? ` · ${p.street}` : ''}</small></span><ChevronRight size={16} /></button>; })}{places.length === 0 && <div className="empty-state"><Search size={28} /><h3>Niciun loc găsit</h3><p>Încearcă alt nume sau schimbă categoria. Căutarea folosește locurile OSM din zona demonstrativă.</p></div>}{places.length > limit && <button className="secondary full" onClick={() => setLimit(value => value + 40)}>Arată încă 40 de locuri</button>}</div></div>;
}
