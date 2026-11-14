import { Bike, Building2, Bus, Footprints, Layers, MapPinned, TrainFront } from 'lucide-react';
import type { ReactNode } from 'react';
import { layerDefinitions } from './infrastructure';
import type { LayerKey, LayerVisibility } from './infrastructure';
import metadata from '../public/data/metadata.json';
import { tramColors } from './tram-lines';

type Props = {
  visibility: LayerVisibility; toggle: (key: LayerKey) => void;
  layers: Record<LayerKey, { error: string; loading: boolean; retry: () => void }>;
  buildings: boolean; setBuildings: (value: boolean) => void;
  tramRefs: string[];
  live: ReactNode;
};
function Row({ name, description, checked, onChange, icon, color, count, disabled = false }: { name: string; description: string; checked: boolean; onChange: () => void; icon: ReactNode; color: string; count?: number; disabled?: boolean }) {
  return <label className={`layer-row ${checked ? 'on' : ''}`}>
    <span className="layer-row-icon" style={{ color, background: `${color}12` }}>{icon}</span>
    <span className="layer-row-copy"><strong>{name}{count !== undefined && <em>{count.toLocaleString('ro-RO')}</em>}</strong><small>{description}</small></span>
    <input aria-label={`Strat ${name}`} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="switch" aria-hidden="true"><i /></span>
  </label>;
}
export default function MapLayersPanel({ visibility, toggle, layers, buildings, setBuildings, tramRefs, live }: Props) {
  const mobilityActive = visibility.cycleways || visibility.tramways || visibility.busways || visibility.sidewalks;
  return <div className="layer-panel">
    <div className="panel-intro"><h1>Straturi hartă</h1></div>
    <section className="layer-group" aria-label="Straturi oraș"><h2>Oraș și locuri <span>PMT / OSM</span></h2>
      <Row name="Clădiri" description="Contururi, clădiri și adrese la apropiere" checked={buildings} onChange={() => setBuildings(!buildings)} icon={<Building2 size={18} />} color="#69778a" />
      <Row name="Locuri și servicii" description="Magazine, cafenele, școli, instituții" checked={visibility.places} onChange={() => toggle('places')} icon={<MapPinned size={18} />} color="#397e9a" />
      {visibility.places && layers.places.loading && <p className="layer-status" role="status">Se încarcă locurile…</p>}
      {visibility.places && layers.places.error && <div className="form-error" role="alert">{layers.places.error} <button onClick={layers.places.retry}>Reîncearcă</button></div>}
    </section>
    <section className="layer-group" aria-label="Straturi infrastructură"><h2>Mobilitate <span>STPT / PMT / OSM</span></h2>
      {(['cycleways','tramways','busways','sidewalks'] as const).map(key => <div key={key}><Row name={layerDefinitions[key].label} description={layerDefinitions[key].description} checked={visibility[key]} onChange={() => toggle(key)} icon={key === 'cycleways' ? <Bike size={18} /> : key === 'tramways' ? <TrainFront size={18} /> : key === 'busways' ? <Bus size={18} /> : <Footprints size={18} />} color={key === 'busways' ? layerDefinitions.busways.color : layerDefinitions[key].color} />{visibility[key] && layers[key].loading && <p className="layer-status" role="status">Se încarcă…</p>}{visibility[key] && layers[key].error && <div className="form-error" role="alert">{layers[key].error} <button onClick={layers[key].retry}>Reîncearcă</button></div>}</div>)}
      {live}
    </section>
    {mobilityActive && <div className="active-layer-legend" aria-label="Legendă mobilitate">
      {(['cycleways', 'tramways', 'busways', 'sidewalks'] as const).filter(key => visibility[key]).map(key =>
        <span key={key}><i style={{ background: layerDefinitions[key].color }} />{layerDefinitions[key].short}</span>)}
      {visibility.tramways && <div className="tram-line-legend" aria-label="Culorile liniilor de tramvai">
        {tramRefs.map(line => <span key={line} title={`Tramvai ${line}`}><i style={{ background: tramColors[line as keyof typeof tramColors] ?? layerDefinitions.tramways.color }} />{line}</span>)}
      </div>}
      <small><span className="legend-line solid" /> Geometrie cartografiată separat</small>
      <small><span className="legend-line dashed" /> Informație pe axul străzii</small>
    </div>}
    <details className="data-notes"><summary><Layers size={15} />Acoperire și sursa datelor</summary><div>
      <p>BBOX țintă Timișoara: {metadata.bbox.join(', ')}. Export sincronizat {new Date(metadata.exportedAt).toLocaleDateString('ro-RO')}.</p>
      <p>{metadata.counts.places.toLocaleString('ro-RO')} locuri și stații, {metadata.counts.cycleways.toLocaleString('ro-RO')} segmente/relatii velo, {metadata.counts.tramways.toLocaleString('ro-RO')} segmente și rute de tramvai, {metadata.counts.busways.toLocaleString('ro-RO')} rute STPT bus/troleibuz, {metadata.counts.sidewalks.toLocaleString('ro-RO')} segmente pietonale.</p>
      <p>Rutele GTFS folosesc shapes și stații, iar relațiile OSM includ geometriile membrilor. Trotuarele de pe axul străzii sunt informații, nu geometrii survey. Accesul și traseele se verifică în teren.</p>
      <p>{metadata.notes}</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a> · <a href="https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip" target="_blank" rel="noreferrer">GTFS SMTT</a>
    </div></details>
  </div>;
}
