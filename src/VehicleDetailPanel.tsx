import { useEffect, useState } from 'react';
import { Accessibility, ArrowLeft, Bus, Clock, Compass, ExternalLink, Gauge, MapPin, Navigation, Radio, Route, TrainFront } from 'lucide-react';
import { stptLink } from './stpt-live';
import type { LiveVehicle } from './stpt-live';
import { findNextVehicleStops, loadTransitNetwork, vehicleLabels } from './transitRouter';
import type { TransitNetwork, TransitStop } from './transitRouter';
import { tramColors } from './tram-lines';
import { busLineColor } from './transport-colors';

type Props = {
  vehicle: LiveVehicle;
  close: () => void;
  onAddStopToRoute: (stop: TransitStop) => void;
};

export default function VehicleDetailPanel({ vehicle, close, onAddStopToRoute }: Props) {
  const [network, setNetwork] = useState<TransitNetwork>();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    void loadTransitNetwork(controller.signal).then(setNetwork).catch(() => undefined);
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const lineColor = vehicle.type === 'tram'
    ? tramColors[vehicle.line as keyof typeof tramColors] ?? '#7c3aed'
    : busLineColor(vehicle.line);

  const ageSeconds = Math.max(0, Math.round((now - Date.parse(vehicle.recordedAt)) / 1000));
  const freshnessLabel = ageSeconds < 60
    ? `acum ${ageSeconds} sec`
    : `acum ${Math.round(ageSeconds / 60)} min`;

  const nextInfo = network ? findNextVehicleStops(network, vehicle) : undefined;
  const Icon = vehicle.type === 'tram' ? TrainFront : Bus;

  return (
    <aside className="detail-panel vehicle-detail-panel" aria-label={`${vehicleLabels[vehicle.type]} ${vehicle.line}`}>
      <div className="detail-toolbar">
        <button className="icon-btn" aria-label="Înapoi" onClick={close}><ArrowLeft size={20} /></button>
        <span className="toolbar-title">Monitorizare vehicul în timp real</span>
      </div>
      <div className="detail-scroll">
        <div className="detail-content">
          <div className="detail-badges">
            <span className="vehicle-line-pill" style={{ background: lineColor }}>
              <Icon size={15} />
              {vehicleLabels[vehicle.type]} {vehicle.line}
            </span>
            <span className="live-indicator-badge">
              <Radio size={12} /> LIVE · {freshnessLabel}
            </span>
            {vehicle.isAccessible && (
              <span className="accessible-badge" title="Vehicul accesibil pentru persoane cu mobilitate redusă">
                <Accessibility size={13} /> Accesibil PMR
              </span>
            )}
          </div>

          <h2>
            {vehicle.headsign ? `Spre ${vehicle.headsign}` : nextInfo?.direction ? `Spre ${nextInfo.direction}` : `Linia ${vehicle.line}`}
          </h2>

          <p className="detail-place">
            <MapPin size={16} />
            {vehicle.stop ? `În zona stației: ${vehicle.stop}` : `${vehicle.lat.toFixed(5)}, ${vehicle.lon.toFixed(5)}`}
          </p>

          <div className="vehicle-telemetry-grid">
            <div className="telemetry-card">
              <Gauge size={18} />
              <div>
                <small>Viteză GPS</small>
                <strong>{vehicle.speed !== undefined ? `${vehicle.speed} km/h` : 'În stație / N/A'}</strong>
              </div>
            </div>
            <div className="telemetry-card">
              <Navigation size={18} />
              <div>
                <small>Indicativ flotă</small>
                <strong>#{vehicle.id}</strong>
              </div>
            </div>
            <div className="telemetry-card">
              <Clock size={18} />
              <div>
                <small>Ultimul semnal</small>
                <strong>{new Date(vehicle.recordedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
              </div>
            </div>
            <div className="telemetry-card">
              <Compass size={18} />
              <div>
                <small>Coordonate</small>
                <strong>{vehicle.lat.toFixed(4)}, {vehicle.lon.toFixed(4)}</strong>
              </div>
            </div>
          </div>

          {nextInfo && nextInfo.upcoming.length > 0 && (
            <section className="vehicle-next-stops" aria-label="Următoarele stații pe traseu">
              <div className="section-header-row">
                <h3>Următoarele stații pe sensul „{nextInfo.direction}”</h3>
                <span className="estimate-tag">Estimare SMTT</span>
              </div>
              <ol className="vehicle-stops-timeline">
                {nextInfo.upcoming.map((item, index) => (
                  <li key={`${item.stop.name}-${index}`} className={index === 0 ? 'current-stop' : ''}>
                    <span className="stop-dot" style={{ borderColor: lineColor }} />
                    <div className="stop-info">
                      <strong>{item.stop.name}</strong>
                      <small>
                        {index === 0 && item.distanceMeters < 180
                          ? 'În apropierea stației'
                          : `~${item.estimatedMinutes} min · ${item.distanceMeters < 1000 ? `${item.distanceMeters} m` : `${(item.distanceMeters / 1000).toFixed(1)} km`}`}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="stop-route-btn"
                      title={`Planifică traseu până la ${item.stop.name}`}
                      onClick={() => onAddStopToRoute(item.stop)}
                    >
                      <Route size={14} /> Traseu
                    </button>
                  </li>
                ))}
              </ol>
              <p className="source-note">
                Poziția vehiculului provine în timp real de la STPT (`live.stpt.ro`). Timpii până la următoarele stații sunt estimați geometric pe baza vitezei medii și a rețelei GTFS SMTT.
              </p>
            </section>
          )}

          <a className="secondary full" href={stptLink(vehicle.line)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Deschide linia {vehicle.line} pe Live.STPT
          </a>
        </div>
      </div>
    </aside>
  );
}
