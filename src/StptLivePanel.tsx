import { ExternalLink, Radio } from 'lucide-react';
import { stptHome, stptLines, stptLink } from './stpt-live';
import type { LiveVehicleType } from './stpt-live';

type Props = {
  enabled: boolean;
  toggle: () => void;
  kind: LiveVehicleType | '';
  setKind: (kind: LiveVehicleType | '') => void;
  line: string;
  setLine: (line: string) => void;
  status: 'loading' | 'ready' | 'unavailable';
  count: number;
};

export default function StptLivePanel({ enabled, toggle, kind, setKind, line, setLine, status, count }: Props) {
  const groups = (Object.keys(stptLines) as LiveVehicleType[]).filter(key => !kind || key === kind);
  return <div className="stpt-live-card">
    <label className={`layer-row ${enabled ? 'on' : ''}`}>
      <span className="layer-row-icon stpt-radio"><Radio size={18} /></span>
      <span className="layer-row-copy">
        <strong>STPT Live <span className="stpt-live-badge">LIVE</span></strong>
        <small>Tramvaie, autobuze și troleibuze</small>
      </span>
      <input aria-label="STPT Live (Timp Real)" type="checkbox" checked={enabled} onChange={toggle} />
      <span className="switch" aria-hidden="true"><i /></span>
    </label>
    {enabled && <div className="stpt-live-controls">
      <label>Tip de vehicul
        <select aria-label="Tip de vehicul" value={kind} onChange={event => setKind(event.target.value as LiveVehicleType | '')}>
          <option value="">Toate</option>
          {Object.entries(stptLines).map(([type, group]) => <option key={type} value={type}>{group.label}</option>)}
        </select>
      </label>
      <label>Linie
        <select aria-label="Linie STPT" value={line} onChange={event => setLine(event.target.value)}>
          <option value="">Toate</option>
          {groups.map(key => <optgroup key={key} label={stptLines[key].label}>
            {stptLines[key].lines.map(number => <option key={number} value={number}>{number}</option>)}
          </optgroup>)}
        </select>
      </label>
      <p className="stpt-live-status" role="status">{status === 'loading' ? 'Se încarcă pozițiile…'
        : status === 'unavailable' ? 'Pozițiile live sunt disponibile pe Live.STPT.'
        : count ? `${count} ${count === 1 ? 'vehicul pe hartă' : 'vehicule pe hartă'}`
        : 'Nu sunt vehicule pentru selecția curentă.'}</p>
    </div>}
    <a className="stpt-live-link" href={enabled ? stptLink(line) : stptHome} target="_blank" rel="noopener noreferrer">
      Deschide harta STPT Live <ExternalLink size={15} aria-hidden="true" />
    </a>
  </div>;
}
