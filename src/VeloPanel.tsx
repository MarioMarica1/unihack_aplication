import { useMemo, useState } from 'react';
import {
  Bike,
  ChevronRight,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import { distance } from './domain';
import type { Point } from './domain';
import type { LayerKey, LayerVisibility } from './infrastructure';
import type { VeloFeedState, VeloStation } from './velo-live';
import { SkeletonCards } from './SkeletonCards';

type Props = {
  veloFeed: VeloFeedState;
  selectedStation: VeloStation | null;
  layers: LayerVisibility;
  userLocation?: Point;
  onToggleLayer: (key: LayerKey) => void;
  onSelectStation: (station: VeloStation | null) => void;
  onPlanCyclingTo: (point: Point, title: string) => void;
  onOpenCyclingPlanner: () => void;
};

export function VeloPanel({
  veloFeed,
  selectedStation,
  layers,
  userLocation,
  onToggleLayer,
  onSelectStation,
  onPlanCyclingTo,
  onOpenCyclingPlanner,
}: Props) {
  const [query, setQuery] = useState('');

  const filteredStations = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ro');
    const list = veloFeed.stations.filter(s => {
      if (!q) return true;
      return `${s.name} ${s.routeRefs ?? ''}`.toLocaleLowerCase('ro').includes(q);
    });
    if (userLocation) {
      return [...list].sort(
        (a, b) =>
          distance(userLocation, { lon: a.lon, lat: a.lat }) -
          distance(userLocation, { lon: b.lon, lat: b.lat }),
      );
    }
    return list;
  }, [veloFeed.stations, query, userLocation]);

  const totalAvailableBikes = useMemo(
    () => veloFeed.stations.reduce((acc, s) => acc + s.availableBikes, 0),
    [veloFeed.stations],
  );
  const totalFreeDocks = useMemo(
    () => veloFeed.stations.reduce((acc, s) => acc + s.freeDocks, 0),
    [veloFeed.stations],
  );

  return (
    <div className="velo-module">
      <div className="panel-intro">
        <div className="module-header-row">
          <div>
            <span className="module-eyebrow">MICROMOBILITATE & VELOTM</span>
            <h1>Biciclete & Piste Velo</h1>
          </div>
          <span className="velo-stat-pill">
            <Bike size={13} />
            {veloFeed.stations.length} stații
          </span>
        </div>
        <p>
          Markerii de pe hartă afișează dinamic numărul de biciclete disponibile (🚲) și numărul de dock-uri libere (🅿️) pentru fiecare stație VeloTM.
        </p>
      </div>

      {/* Live VeloTM Telemetry Summary */}
      <div className="reports-kpi-grid">
        <div className="kpi-box">
          <strong>{totalAvailableBikes}</strong>
          <small>🚲 Biciclete disponibile</small>
        </div>
        <div className="kpi-box">
          <strong>{totalFreeDocks}</strong>
          <small>🅿️ Dock-uri libere</small>
        </div>
        <div className="kpi-box">
          <strong>{veloFeed.stations.length}</strong>
          <small>Stații VeloTM active</small>
        </div>
      </div>

      <div className="velo-quick-actions">
        <button type="button" className="primary full" onClick={onOpenCyclingPlanner}>
          <Navigation size={15} />
          Planifică traseu cu bicicleta (A → B)
        </button>
      </div>

      {/* Contextual Velo Layer Controls */}
      <div className="velo-layers-box">
        <label className={`layer-row ${layers.cycleways ? 'on' : ''}`}>
          <span className="layer-row-icon" style={{ background: '#0596691c', color: '#059669' }}>
            <Bike size={18} />
          </span>
          <span className="layer-row-copy">
            <strong>Piste de biciclete (143 segmente)</strong>
            <small>Trasee dedicate (continuu) și benzi partajate pe carosabil (punctat).</small>
          </span>
          <input
            type="checkbox"
            checked={layers.cycleways}
            onChange={() => onToggleLayer('cycleways')}
            aria-label="Afișează pistele de biciclete"
          />
          <span className="switch" aria-hidden="true"><i /></span>
        </label>

        <div className="velo-legend-strip">
          <span>
            <i style={{ background: '#059669' }} /> Pistă dedicată
          </span>
          <span>
            <i style={{ borderTop: '2px dashed #059669', background: 'transparent' }} /> Traseu partajat
          </span>
        </div>
      </div>

      {/* Selected VeloTM Station Inspector Card */}
      {selectedStation && (
        <div className="selected-velo-station-card">
          <div className="selected-line-top">
            <div>
              <span className="module-eyebrow">STAȚIE VELOTM SELECTATĂ</span>
              <h3>{selectedStation.name}</h3>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onSelectStation(null)}
              aria-label="Închide detaliile stației"
            >
              <X size={16} />
            </button>
          </div>
          <div className="velo-station-metrics">
            <div className="velo-metric bikes">
              <strong>🚲 {selectedStation.availableBikes}</strong>
              <small>Biciclete disponibile</small>
            </div>
            <div className="velo-metric docks">
              <strong>🅿️ {selectedStation.freeDocks}</strong>
              <small>Dock-uri libere</small>
            </div>
            <div className="velo-metric capacity">
              <strong>{selectedStation.totalDocks}</strong>
              <small>Capacitate totală</small>
            </div>
          </div>
          <button
            type="button"
            className="primary full"
            onClick={() =>
              onPlanCyclingTo(
                { lon: selectedStation.lon, lat: selectedStation.lat },
                `Stația VeloTM ${selectedStation.name}`,
              )
            }
          >
            <Navigation size={15} />
            Navighează cu bicicleta spre {selectedStation.name}
          </button>
        </div>
      )}

      {/* Search & Stations List */}
      <div className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Caută stație VeloTM (ex. Libertății, Unirii, UVT)…"
          aria-label="Caută stații VeloTM"
        />
        {query && (
          <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Șterge">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="place-result-count">
        {filteredStations.length} stații VeloTM afișate pe hartă
      </div>

      <div className="place-results">
        {veloFeed.status === 'loading' && filteredStations.length === 0 && (
          <SkeletonCards count={4} />
        )}
        {filteredStations.map(station => {
          const distMeters = userLocation
            ? Math.round(distance(userLocation, { lon: station.lon, lat: station.lat }))
            : null;
          const isSelected = selectedStation?.id === station.id;
          return (
            <div className={`place-result-row ${isSelected ? 'selected-row' : ''}`} key={station.id}>
              <button
                type="button"
                className="place-result"
                onClick={() => onSelectStation(station)}
              >
                <span className="place-result-symbol velo-symbol">
                  <Bike size={17} />
                </span>
                <span>
                  <strong>Stația VeloTM {station.name}</strong>
                  <small className="velo-inline-telemetry">
                    <span className="velo-pill-bikes">🚲 {station.availableBikes} biciclete</span>
                    <span className="velo-pill-docks">🅿️ {station.freeDocks} dock-uri libere</span>
                    {distMeters !== null && <span>· {distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`}</span>}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="icon-btn place-share"
                title="Planifică traseu cu bicicleta până aici"
                aria-label={`Planifică traseu până la ${station.name}`}
                onClick={() =>
                  onPlanCyclingTo({ lon: station.lon, lat: station.lat }, `Stația VeloTM ${station.name}`)
                }
              >
                <MapPin size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
