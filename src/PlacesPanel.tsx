import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Database,
  ExternalLink,
  Globe,
  Landmark,
  Layers,
  MapPin,
  Route,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { placeKindLabel, toMapPlace } from './infrastructure';
import type { Infrastructure, MapPlace } from './infrastructure';
import type { BaseMapStyle } from './map-style';
import { buildPlaceCatalog, filterPlaces } from './place-catalog';
import { PlaceIcon } from './place-icons';
export { normalizeSearch } from './place-catalog';

const categories = [
  ['all', 'Toate reperele'],
  ['services', 'Instituții & Servicii'],
  ['health', 'Spitale & Sănătate'],
  ['park', 'Parcuri & Spații verzi'],
  ['education', 'Școli & Universități'],
  ['culture', 'Cultură & Turism'],
  ['food', 'Restaurante & Cafenele'],
  ['shop', 'Magazine & Piețe'],
  ['sport', 'Sport & Agrement'],
  ['lodging', 'Hoteluri & Cazare'],
  ['transport', 'Stații & Mobilitate'],
  ['building', 'Clădiri & Adrese'],
] as const;

const officialPortals = [
  {
    title: 'Primăria Municipiului Timișoara',
    subtitle: 'Anunțuri oficiale, hotărâri, proiecte de infrastructură și servicii publice',
    url: 'https://www.primariatm.ro/',
  },
  {
    title: 'Portalul Oficial de Sesizări',
    subtitle: 'Depunere și urmărire sesizări oficiale către direcțiile Primăriei',
    url: 'https://sesizari.primariatm.ro/',
  },
  {
    title: 'Open Data Timișoara (CKAN)',
    subtitle: '36 seturi de date deschise: mobilitate, trafic, calitatea aerului și apei',
    url: 'https://data.primariatm.ro/',
  },
  {
    title: 'Decidem Timișoara',
    subtitle: 'Bugetare participativă, consultări publice și inițiative cetățenești',
    url: 'https://decidem.primariatm.ro/',
  },
];

export function placeLink(place: MapPlace) {
  const { lat, lon } = place.location;
  const osmId = place.id.match(/^osm:((?:node|way|relation)\/\d+)$/)?.[1];
  return osmId ? `https://www.openstreetmap.org/${osmId}` : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}

export function findPlaces(
  data: Partial<Infrastructure> | undefined,
  query: string,
  category: string,
  enabledPoiKinds?: Record<string, boolean>,
) {
  const filtered = filterPlaces(buildPlaceCatalog(data?.places), query, category);
  if (!enabledPoiKinds) return filtered;
  return filtered.filter(f => {
    const kind = String(f.properties?.kind || 'services');
    return enabledPoiKinds[kind] !== false;
  });
}

type Props = {
  places?: Infrastructure['places']['features'];
  detailsInLayers?: boolean;
  query: string;
  setQuery?: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  baseMapStyle?: BaseMapStyle;
  onChangeBaseMapStyle?: (style: BaseMapStyle) => void;
  enabledPoiKinds?: Record<string, boolean>;
  onTogglePoiKind?: (kind: string) => void;
  error: string;
  retry: () => void;
  select: (place: MapPlace) => void;
  selected?: MapPlace;
  clear: () => void;
  add: (place: MapPlace) => void;
  create: (place: MapPlace) => void;
  share: (place: MapPlace) => void;
};

export default function PlacesPanel({
  places,
  detailsInLayers,
  query,
  setQuery,
  category,
  setCategory,
  baseMapStyle = 'buildings3d',
  onChangeBaseMapStyle,
  enabledPoiKinds,
  onTogglePoiKind,
  error,
  retry,
  select,
  selected,
  clear,
  add,
  create,
  share,
}: Props) {
  const [limit, setLimit] = useState(40);
  const [subTab, setSubTab] = useState<'directory' | 'portals'>('directory');

  const source = selected ? places?.find(f => `osm:${f.properties?.osmId}` === selected.id) : undefined;
  if (selected) {
    const transitStop = selected.id.startsWith('osm:gtfs-stop/');
    return (
      <div className="place-details">
        <button className="back-link" onClick={clear}>
          <ArrowLeft size={17} />
          {detailsInLayers ? 'Înapoi la straturi' : 'Înapoi la catalogul orașului'}
        </button>
        <span className="place-detail-icon"><PlaceIcon kind={selected.kind} size={30} /></span>
        <h1>{selected.title}</h1>
        <p className="place-category">{placeKindLabel[selected.kind || ''] || 'Loc pe hartă'}</p>
        {selected.description && <p className="place-address">{selected.description}</p>}
        {source?.properties?.street && (
          <p className="place-address">
            <MapPin size={16} />
            {source.properties.street} {source.properties.number}
          </p>
        )}
        <p className="place-coords-tag">
          Coordonate: {selected.location.lat.toFixed(5)}, {selected.location.lon.toFixed(5)}
        </p>
        <div className="place-actions">
          <button className="primary full" onClick={() => add(selected)}>
            <Route size={17} /> Adaugă în traseu
          </button>
          <button className="secondary full" onClick={() => create(selected)}>
            <CalendarDays size={17} /> Creează activitate aici
          </button>
          <button className="secondary full" onClick={() => share(selected)}>
            <Share2 size={17} /> Distribuie locația
          </button>
        </div>
        <p className="source-note">
          {transitStop
            ? 'Stație din rețeaua oficială SMTT / STPT. Poți verifica vehiculele în timp real în secțiunea Transport.'
            : 'Poziție verificată din OpenStreetMap și nomenclatorul urban Timișoara. Pentru clădiri și parcuri indică centrul geometric.'}
        </p>
        <a className="osm-link" href={placeLink(selected)} target="_blank" rel="noreferrer">
          Vezi în OpenStreetMap <ArrowRight size={14} />
        </a>
      </div>
    );
  }
  if (error) {
    return (
      <div className="panel-intro">
        <h1>Ghid Urban & Instituții</h1>
        <p role="alert">Locurile nu s-au putut încărca.</p>
        <button className="secondary" onClick={retry}>Reîncearcă</button>
      </div>
    );
  }
  if (!places) {
    return (
      <div className="panel-intro">
        <h1>Ghid Urban & Instituții</h1>
        <p role="status">Se încarcă catalogul de locuri și instituții din Timișoara…</p>
      </div>
    );
  }

  return (
    <div className="places-panel">
      <div className="panel-intro">
        <span className="module-eyebrow">STRATURI INTELIGENTE · 9.331 REPERE</span>
        <h1>{query ? 'Rezultatele căutării' : 'Oraș & Straturi Inteligente'}</h1>
        <div className="subtab-bar" role="tablist" aria-label="Secțiuni informații oraș">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'directory'}
            className={subTab === 'directory' ? 'active' : ''}
            onClick={() => setSubTab('directory')}
          >
            <Landmark size={15} /> Straturi & Locuri POI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'portals'}
            className={subTab === 'portals' ? 'active' : ''}
            onClick={() => setSubTab('portals')}
          >
            <Database size={15} /> Date Deschise & Portaluri
          </button>
        </div>
      </div>

      {/* Base Map Layer Controller: Satelit / Harta cu Clădiri 3D / Minimal */}
      {onChangeBaseMapStyle && (
        <div className="basemap-style-controller" role="group" aria-label="Controlor strat de bază hartă">
          <div className="basemap-style-header">
            <Layers size={14} />
            <strong>Mod hartă de bază (MapLibre)</strong>
          </div>
          <div className="basemap-style-buttons">
            <button
              type="button"
              className={`basemap-style-btn ${baseMapStyle === 'buildings3d' ? 'active' : ''}`}
              aria-pressed={baseMapStyle === 'buildings3d'}
              onClick={() => onChangeBaseMapStyle('buildings3d')}
            >
              <Building2 size={14} />
              <div>
                <strong>Harta cu Clădiri 3D</strong>
                <small>Extrudare 3D + perspectivă</small>
              </div>
            </button>
            <button
              type="button"
              className={`basemap-style-btn ${baseMapStyle === 'satellite' ? 'active' : ''}`}
              aria-pressed={baseMapStyle === 'satellite'}
              onClick={() => onChangeBaseMapStyle('satellite')}
            >
              <Globe size={14} />
              <div>
                <strong>Satelit</strong>
                <small>Ortofotoplan de înaltă rezoluție</small>
              </div>
            </button>
            <button
              type="button"
              className={`basemap-style-btn ${baseMapStyle === 'minimal' ? 'active' : ''}`}
              aria-pressed={baseMapStyle === 'minimal'}
              onClick={() => onChangeBaseMapStyle('minimal')}
            >
              <Layers size={14} />
              <div>
                <strong>Minimal</strong>
                <small>Hartă curată fără clădiri</small>
              </div>
            </button>
          </div>
        </div>
      )}

      {subTab === 'portals' ? (
        <div className="city-portals-view">
          <div className="portals-intro-card">
            <Globe size={20} />
            <div>
              <strong>Ecosistemul Digital Timișoara</strong>
              <p>Urban Conect se conectează la sursele publice oficiale ale Primăriei Municipiului Timișoara, STPT, SMTT și OpenStreetMap.</p>
            </div>
          </div>
          <div className="portal-cards-list">
            {officialPortals.map(portal => (
              <a
                key={portal.url}
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-link-card"
              >
                <div>
                  <strong>{portal.title}</strong>
                  <p>{portal.subtitle}</p>
                </div>
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Functional Multi-POI Dataset Toggles */}
          {enabledPoiKinds && onTogglePoiKind && (
            <div className="poi-dataset-toggles-box" role="group" aria-label="Comutatoare seturi de date POI pe hartă">
              <div className="poi-dataset-header">
                <strong>Seturi de date POI vizibile pe hartă</strong>
                <small>Comută independent afișarea spitalelor, parcurilor, instituțiilor etc.</small>
              </div>
              <div className="poi-dataset-grid">
                {(
                  [
                    ['health', 'Spitale & Sănătate'],
                    ['park', 'Parcuri & Spații verzi'],
                    ['services', 'Instituții & Servicii'],
                    ['education', 'Școli & Universități'],
                    ['culture', 'Cultură & Muzee'],
                    ['food', 'Restaurante & Cafenele'],
                    ['transport', 'Stații Transport'],
                    ['shop', 'Magazine & Piețe'],
                  ] as const
                ).map(([kindKey, kindLabel]) => {
                  const isOn = enabledPoiKinds[kindKey] !== false;
                  return (
                    <button
                      type="button"
                      key={kindKey}
                      className={`poi-dataset-toggle ${isOn ? 'active' : ''}`}
                      aria-pressed={isOn}
                      onClick={() => onTogglePoiKind(kindKey)}
                    >
                      <PlaceIcon kind={kindKey} size={13} />
                      <span>{kindLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {setQuery && (
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Caută instituții, spitale, școli, parcuri"
                placeholder="Caută spital, școală, parc, restaurant, stradă…"
                value={query}
                onChange={e => { setQuery(e.target.value); setLimit(40); }}
              />
              {query && (
                <button className="icon-btn" aria-label="Șterge căutarea" onClick={() => setQuery('')}>
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          <div className="place-category-pills" role="group" aria-label="Categorii de locuri">
            {categories.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={category === key ? 'active' : ''}
                aria-pressed={category === key}
                onClick={() => { setCategory(key); setLimit(40); }}
              >
                <PlaceIcon kind={key} size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <label className="place-category-filter">
            <PlaceIcon kind={category} size={17} />
            <span id="place-category-label">Categorie</span>
            <select
              aria-labelledby="place-category-label"
              value={category}
              onChange={event => { setCategory(event.target.value); setLimit(40); }}
            >
              {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <div className="place-result-count" role="status">
            {places.length.toLocaleString('ro-RO')} rezultate{query ? ` pentru „${query}”` : ''}
          </div>
          <div className="place-results">
            {places.slice(0, limit).map(feature => {
              const props = feature.properties || {};
              const place = toMapPlace(feature);

              return (
                <div className="place-result-row" key={place.id}>
                  <button className="place-result" onClick={() => select(place)}>
                    <span className={`place-result-symbol ${place.kind || ''}`}><PlaceIcon kind={place.kind} /></span>
                    <span>
                      <strong>{place.title}</strong>
                      <small>{placeKindLabel[props.kind] || 'Loc'}{props.street ? ` · ${props.street}` : ''}</small>
                    </span>
                  </button>
                  <button
                    className="icon-btn place-share"
                    aria-label={`Distribuie ${place.title}`}
                    title="Distribuie"
                    onClick={() => share(place)}
                  >
                    <Share2 size={17} />
                  </button>
                </div>
              );
            })}
            {places.length === 0 && (
              <div className="empty-state">
                <Search size={28} />
                <h3>Niciun loc găsit</h3>
                <p>Încearcă alt nume sau schimbă categoria. Căutarea folosește locurile OSM din Timișoara.</p>
              </div>
            )}
            {places.length > limit && (
              <button className="secondary full" onClick={() => setLimit(value => value + 40)}>
                Arată încă 40 de locuri
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
