import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Route, Search, Share2 } from 'lucide-react';
import { useState } from 'react';
import { placeKindLabel, toMapPlace } from './infrastructure';
import type { Infrastructure, MapPlace } from './infrastructure';
import { buildPlaceCatalog, filterPlaces } from './place-catalog';
import { PlaceIcon } from './place-icons';
export { normalizeSearch } from './place-catalog';

const categories = [['all','Toate'], ['food','Mâncare'], ['shop','Magazine'], ['education','Educație'], ['health','Sănătate'], ['park','Parcuri'], ['culture','Cultură / turism'], ['lodging','Cazare'], ['transport','Transport comun'], ['building','Clădiri'], ['services','Servicii'], ['sport','Sport']];
export function placeLink(place: MapPlace) {
  const { lat, lon } = place.location;
  const osmId = place.id.match(/^osm:((?:node|way|relation)\/\d+)$/)?.[1];
  return osmId ? `https://www.openstreetmap.org/${osmId}` : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}

export function findPlaces(data: Partial<Infrastructure> | undefined, query: string, category: string) {
  return filterPlaces(buildPlaceCatalog(data?.places), query, category);
}
type Props = { places?: Infrastructure['places']['features']; detailsInLayers?: boolean; query: string; category: string; setCategory: (value: string) => void; error: string; retry: () => void; select: (place: MapPlace) => void; selected?: MapPlace; clear: () => void; add: (place: MapPlace) => void; create: (place: MapPlace) => void; share: (place: MapPlace) => void };
export default function PlacesPanel({ places, detailsInLayers, query, category, setCategory, error, retry, select, selected, clear, add, create, share }: Props) {
  const [limit, setLimit] = useState(40);

  const source = selected ? places?.find(f => `osm:${f.properties?.osmId}` === selected.id) : undefined;
  if (selected) {
    const transitStop = selected.id.startsWith('osm:gtfs-stop/');
    return <div className="place-details">
      <button className="back-link" onClick={clear}><ArrowLeft size={17} />{detailsInLayers ? 'Înapoi la straturi' : 'Înapoi la rezultate'}</button>
      <span className="place-detail-icon"><PlaceIcon kind={selected.kind} size={30} /></span>
      <h1>{selected.title}</h1><p className="place-category">{placeKindLabel[selected.kind || ''] || 'Loc pe hartă'}</p>
      {selected.description && <p className="place-address">{selected.description}</p>}
      {source?.properties?.street && <p className="place-address"><MapPin size={16} />{source.properties.street} {source.properties.number}</p>}
      <div className="place-actions">
        <button className="primary full" onClick={() => add(selected)}><Route size={17} />Adaugă în traseu</button>
        <button className="secondary full" onClick={() => create(selected)}><CalendarDays size={17} />Creează activitate aici</button>
        <button className="secondary full" onClick={() => share(selected)}><Share2 size={17} />Distribuie</button>
      </div>
      <p className="source-note">{transitStop ? 'Stație din datele SMTT. Liniile sunt orientative; aplicația nu afișează sosiri în timp real.' : 'Poziție din OpenStreetMap. Pentru clădiri și parcuri poate indica centrul suprafeței, nu intrarea.'}</p>
      <a className="osm-link" href={placeLink(selected)} target="_blank" rel="noreferrer">Vezi în OpenStreetMap <ArrowRight size={14} /></a>
    </div>;
  }
  if (error) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="alert">Locurile nu s-au putut încărca.</p><button className="secondary" onClick={retry}>Reîncearcă</button></div>;
  if (!places) return <div className="panel-intro"><h1>Locuri în Timișoara</h1><p role="status">Se încarcă locurile…</p></div>;

  return <div className="places-panel">
    <div className="panel-intro"><h1>{query ? 'Rezultatele căutării' : 'Locuri în Timișoara'}</h1></div>
    <label className="place-category-filter"><PlaceIcon kind={category} size={17} /><span id="place-category-label">Categorie</span>
      <select aria-labelledby="place-category-label" value={category} onChange={event => { setCategory(event.target.value); setLimit(40); }}>
        {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <div className="place-result-count" role="status">{places.length.toLocaleString('ro-RO')} rezultate{query ? ` pentru „${query}”` : ''}</div>
    <div className="place-results">
      {places.slice(0, limit).map(feature => {
        const props = feature.properties || {};
        const place = toMapPlace(feature);

        return <div className="place-result-row" key={place.id}>
          <button className="place-result" onClick={() => select(place)}>
            <span className={`place-result-symbol ${place.kind || ''}`}><PlaceIcon kind={place.kind} /></span>
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
