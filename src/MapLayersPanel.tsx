import { Bike, Building2, Eye, Footprints, Layers, MapPinned, TrainFront } from 'lucide-react';
import type { ReactNode } from 'react';
import { layerDefinitions } from './infrastructure';
import type { LayerKey, LayerVisibility } from './infrastructure';
import metadata from '../public/data/metadata.json';

type Props = {
  visibility: LayerVisibility; toggle: (key: LayerKey) => void;
  layers: Record<LayerKey, { error: string; loading: boolean; retry: () => void }>;
  labels: boolean; setLabels: (value: boolean) => void; buildings: boolean; setBuildings: (value: boolean) => void;
};
function Row({ name, description, checked, onChange, icon, color, count, disabled = false }: { name: string; description: string; checked: boolean; onChange: () => void; icon: ReactNode; color: string; count?: number; disabled?: boolean }) {
  return <label className={`layer-row ${checked ? 'on' : ''}`}>
    <span className="layer-row-icon" style={{ color, background: `${color}12` }}>{icon}</span>
    <span className="layer-row-copy"><strong>{name}{count !== undefined && <em>{count.toLocaleString('ro-RO')}</em>}</strong><small>{description}</small></span>
    <input aria-label={`Strat ${name}`} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="switch" aria-hidden="true"><i /></span>
  </label>;
}
export default function MapLayersPanel({ visibility, toggle, layers, labels, setLabels, buildings, setBuildings }: Props) {
  const mobilityActive = visibility.cycleways || visibility.tramways || visibility.sidewalks;
  return <div className="layer-panel">
    <div className="panel-intro"><h1>Straturi hartă</h1></div>
    <section className="layer-group" aria-label="Straturi oraș"><h2>Oraș și locuri <span>OPENSTREETMAP</span></h2>
      <Row name="Clădiri" description="Contururi, clădiri și adrese la apropiere" checked={buildings} onChange={() => setBuildings(!buildings)} icon={<Building2 size={18} />} color="#69778a" />
      <Row name="Locuri și servicii" description="Magazine, cafenele, școli, instituții" checked={visibility.places} onChange={() => toggle('places')} icon={<MapPinned size={18} />} color="#397e9a" />
      {visibility.places && layers.places.loading && <p className="layer-status" role="status">Se încarcă locurile…</p>}
      {visibility.places && layers.places.error && <div className="form-error" role="alert">{layers.places.error} <button onClick={layers.places.retry}>Reîncearcă</button></div>}
    </section>
    <section className="layer-group" aria-label="Straturi infrastructură"><h2>Mobilitate <span>DATE OSM</span></h2>
      {(['cycleways','tramways','sidewalks'] as const).map(key => <div key={key}><Row name={layerDefinitions[key].label} description={key === 'cycleways' ? 'Piste dedicate și benzi pe stradă' : key === 'tramways' ? 'Șine de tramvai cartografiate' : 'Trotuare și informații asociate străzii'} checked={visibility[key]} onChange={() => toggle(key)} icon={key === 'cycleways' ? <Bike size={18} /> : key === 'tramways' ? <TrainFront size={18} /> : <Footprints size={18} />} color={layerDefinitions[key].color} />{visibility[key] && layers[key].loading && <p className="layer-status" role="status">Se încarcă…</p>}{visibility[key] && layers[key].error && <div className="form-error" role="alert">{layers[key].error} <button onClick={layers[key].retry}>Reîncearcă</button></div>}</div>)}
    </section>
    <section className="layer-group appearance-group"><h2>Afișare</h2><Row name="Etichete pentru toate pinurile" description="Arată numele lângă fiecare pin" checked={labels} onChange={() => setLabels(!labels)} icon={<Eye size={18} />} color="#6c7b8c" /></section>
    {mobilityActive && <div className="active-layer-legend" aria-label="Legendă mobilitate">
      {(['cycleways', 'tramways', 'sidewalks'] as const).filter(key => visibility[key]).map(key =>
        <span key={key}><i style={{ background: layerDefinitions[key].color }} />{layerDefinitions[key].short}</span>)}
      <small>Linie continuă — geometrie separată. Linie întreruptă — informație pe axul străzii.</small>
    </div>}
    <details className="data-notes"><summary><Layers size={15} />Acoperire și sursa datelor</summary><div>
      <p>Zona demonstrativă acoperă centrul Timișoarei și cartierele apropiate. Harta de bază se poate explora oriunde. Export OSM din {new Date(metadata.exportedAt).toLocaleDateString('ro-RO')}.</p>
      <p>{metadata.counts.places.toLocaleString('ro-RO')} locuri, {metadata.counts.cycleways} segmente pentru biciclete, {metadata.counts.tramways} segmente de șină și {metadata.counts.sidewalks.toLocaleString('ro-RO')} segmente de trotuar.</p>
      <p>Liniile întrerupte indică etichete OSM ale străzii, inclusiv trotuare separate cartografiate în apropiere. Poziția și accesul se verifică în teren. Locurile din clădiri și parcuri pot indica centrul suprafeței.</p>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
    </div></details>
  </div>;
}
