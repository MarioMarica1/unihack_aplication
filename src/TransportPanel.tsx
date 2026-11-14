import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bus,
  Compass,
  Eye,
  Radio,
  Route,
  Search,
  TrainFront,
  X,
} from 'lucide-react';
import type { Point } from './domain';
import type { NetworkSubFilters } from './mobility-map';
import type { FeedState, LiveVehicle, LiveVehicleType } from './stpt-live';
import { stptLines } from './stpt-live';
import type { LineSummary, TransitStop } from './transitRouter';
import { vehicleLabels } from './transitRouter';
import { tramColors } from './tram-lines';
import { busLineColor } from './transport-colors';

type Props = {
  feed: FeedState;
  lineSummaries: LineSummary[];
  selectedVehicle?: LiveVehicle;
  selectedLine: string;
  selectedDirection: 'tur' | 'retur';
  showAllRoutes: boolean;
  networkSubFilters: NetworkSubFilters;
  onSelectVehicle: (vehicle: LiveVehicle) => void;
  onSelectLine: (line: string) => void;
  onChangeDirection: (dir: 'tur' | 'retur') => void;
  onToggleShowAllRoutes: (enabled: boolean) => void;
  onChangeNetworkSubFilters: (next: NetworkSubFilters) => void;
  onPlanToStop: (stop: TransitStop) => void;
  onOpenRoutePlanner: () => void;
  userLocation?: Point;
};

export function TransportPanel({
  feed,
  lineSummaries,
  selectedVehicle,
  selectedLine,
  selectedDirection,
  showAllRoutes,
  networkSubFilters,
  onSelectVehicle,
  onSelectLine,
  onChangeDirection,
  onToggleShowAllRoutes,
  onChangeNetworkSubFilters,
  onPlanToStop,
  onOpenRoutePlanner,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | LiveVehicleType>('all');

  const activeLineSummary = useMemo(
    () => lineSummaries.find(l => l.line.toUpperCase() === selectedLine.toUpperCase()),
    [lineSummaries, selectedLine],
  );

  const activeDirectionSummary = useMemo(() => {
    if (!activeLineSummary) return undefined;
    return (
      activeLineSummary.directions.find(d => d.dirKey === selectedDirection) ??
      activeLineSummary.directions[0]
    );
  }, [activeLineSummary, selectedDirection]);

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('ro');
    return feed.vehicles.filter(v => {
      if (modeFilter !== 'all' && v.type !== modeFilter) return false;
      if (showAllRoutes) {
        if (v.type === 'tram' && !networkSubFilters.tram) return false;
        if (v.type === 'trolleybus' && !networkSubFilters.trolleybus) return false;
        if (v.type === 'bus' && !networkSubFilters.bus) return false;
      } else if (selectedLine) {
        if (v.line.toUpperCase() !== selectedLine.toUpperCase()) return false;
        if (v.directionId) {
          const expectedDir = selectedDirection === 'tur' ? '0' : '1';
          if (v.directionId !== expectedDir) return false;
        }
      }
      if (q) {
        const hay = `${v.line} ${v.headsign ?? ''} ${v.stop ?? ''} ${v.id}`.toLocaleLowerCase('ro');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed.vehicles, modeFilter, selectedLine, showAllRoutes, networkSubFilters, selectedDirection, searchQuery]);

  const lineVehicleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of feed.vehicles) {
      const k = v.line.toUpperCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [feed.vehicles]);

  const modeCounts = useMemo(() => {
    let tram = 0;
    let trolleybus = 0;
    let bus = 0;
    for (const v of feed.vehicles) {
      if (v.type === 'tram') tram++;
      else if (v.type === 'trolleybus') trolleybus++;
      else bus++;
    }
    return { tram, trolleybus, bus };
  }, [feed.vehicles]);

  const badgeColor = (type: LiveVehicleType, line: string) =>
    type === 'tram'
      ? tramColors[line as keyof typeof tramColors] ?? '#7c3aed'
      : type === 'trolleybus'
        ? '#0e7490'
        : busLineColor(line);

  return (
    <div className="transport-module">
      <div className="panel-intro">
        <div className="module-header-row">
          <div>
            <span className="module-eyebrow">MOBILITATE URBANĂ STPT</span>
            <h1>Transport Public Live</h1>
          </div>
          <span className="live-pill" title="Vehicule monitorizate prin GPS în timp real">
            <span className="pulse-dot" />
            {feed.vehicles.length} live
          </span>
        </div>
        <p>
          Selectează o linie sau un vehicul de pe hartă pentru a izola exclusiv traseul său și sensul de deplasare (Tur / Retur).
        </p>
      </div>

      {/* Master Toggle: "Afișează toate" vs Exclusive Line Filter */}
      <div className="transport-control-bar">
        <button
          type="button"
          role="switch"
          aria-checked={showAllRoutes}
          className={`show-all-routes-toggle ${showAllRoutes ? 'active' : ''}`}
          onClick={() => onToggleShowAllRoutes(!showAllRoutes)}
        >
          <Eye size={15} />
          <span>Afișează Toate</span>
          <span className="switch" aria-hidden="true"><i /></span>
        </button>
        <button type="button" className="secondary compact-btn" onClick={onOpenRoutePlanner}>
          <Route size={14} />
          Rutare A→B
        </button>
      </div>

      {/* Secondary Sub-filters when Show All is enabled: [Tramvaie], [Troleibuze], [Autobuze] */}
      {showAllRoutes && (
        <div className="network-subfilters-box" role="group" aria-label="Sub-filtre rețea pe tip de vehicul">
          <div className="network-subfilters-header">
            <strong>Sub-filtre rețea afișată pe hartă</strong>
            <small>Selectează tipurile de trasee pentru a evita supraîncărcarea hărții</small>
          </div>
          <div className="network-subfilters-pills">
            <button
              type="button"
              className={`subfilter-toggle-btn tram ${networkSubFilters.tram ? 'active' : ''}`}
              aria-pressed={networkSubFilters.tram}
              onClick={() =>
                onChangeNetworkSubFilters({
                  ...networkSubFilters,
                  tram: !networkSubFilters.tram,
                })
              }
            >
              <TrainFront size={14} />
              <span>Tramvaie</span>
              <b className="subfilter-count">{modeCounts.tram}</b>
            </button>
            <button
              type="button"
              className={`subfilter-toggle-btn trolleybus ${networkSubFilters.trolleybus ? 'active' : ''}`}
              aria-pressed={networkSubFilters.trolleybus}
              onClick={() =>
                onChangeNetworkSubFilters({
                  ...networkSubFilters,
                  trolleybus: !networkSubFilters.trolleybus,
                })
              }
            >
              <Bus size={14} />
              <span>Troleibuze</span>
              <b className="subfilter-count">{modeCounts.trolleybus}</b>
            </button>
            <button
              type="button"
              className={`subfilter-toggle-btn bus ${networkSubFilters.bus ? 'active' : ''}`}
              aria-pressed={networkSubFilters.bus}
              onClick={() =>
                onChangeNetworkSubFilters({
                  ...networkSubFilters,
                  bus: !networkSubFilters.bus,
                })
              }
            >
              <Bus size={14} />
              <span>Autobuze</span>
              <b className="subfilter-count">{modeCounts.bus}</b>
            </button>
          </div>
        </div>
      )}

      {/* Tur / Retur Direction Selector when a line is selected */}
      {selectedLine && (
        <div className="selected-line-banner">
          <div className="selected-line-top">
            <div className="selected-line-title">
              <span
                className="line-badge-box"
                style={{
                  background: activeLineSummary?.color ?? '#0F52BA',
                }}
              >
                {selectedLine}
              </span>
              <div>
                <strong>
                  {activeLineSummary ? `${vehicleLabels[activeLineSummary.type]} ${selectedLine}` : `Linia ${selectedLine}`}
                </strong>
                <small>
                  {showAllRoutes ? 'Rețea filtrată afișată' : 'Traseu izolat exclusiv pe hartă'}
                </small>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onSelectLine('')}
              aria-label="Deselectează linia"
              title="Deselectează linia"
            >
              <X size={16} />
            </button>
          </div>

          <div className="tur-retur-selector" role="group" aria-label="Sens de mers Tur sau Retur">
            <button
              type="button"
              className={selectedDirection === 'tur' ? 'active' : ''}
              onClick={() => onChangeDirection('tur')}
            >
              <ArrowLeftRight size={13} />
              <div>
                <strong>Tur</strong>
                <small>{activeLineSummary?.directions[0]?.direction ?? 'Sens 1'}</small>
              </div>
            </button>
            <button
              type="button"
              className={selectedDirection === 'retur' ? 'active' : ''}
              onClick={() => onChangeDirection('retur')}
            >
              <ArrowLeftRight size={13} />
              <div>
                <strong>Retur</strong>
                <small>{activeLineSummary?.directions[1]?.direction ?? activeLineSummary?.directions[0]?.direction ?? 'Sens 2'}</small>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Line Selector Grid (Inspired by live.stpt.ro / image_0f8062.jpg) */}
      <div className="stpt-line-selector-groups">
        {(['tram', 'trolleybus', 'bus'] as const).map(groupKey => {
          const group = stptLines[groupKey];
          if (modeFilter !== 'all' && modeFilter !== groupKey) return null;
          return (
            <div className="stpt-line-group" key={groupKey}>
              <div className="stpt-line-group-header">
                <span>{group.label}</span>
              </div>
              <div className="stpt-line-buttons">
                {group.lines.map(line => {
                  const isSelected = !showAllRoutes && selectedLine.toUpperCase() === line.toUpperCase();
                  const count = lineVehicleCounts.get(line.toUpperCase()) ?? 0;
                  const color = badgeColor(groupKey, line);
                  return (
                    <button
                      type="button"
                      key={line}
                      className={`stpt-line-btn ${isSelected ? 'selected' : ''} ${count > 0 ? 'has-live' : ''}`}
                      style={{
                        '--line-btn-color': color,
                      } as React.CSSProperties}
                      onClick={() => onSelectLine(isSelected ? '' : line)}
                      title={`Linia ${line}${count ? ` (${count} vehicule live)` : ''}`}
                    >
                      <span>{line}</span>
                      {count > 0 && <b className="line-live-dot" title={`${count} vehicule pe traseu`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Mode Filter */}
      <div className="search-box">
        <Search size={16} />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Caută linie (ex. 9, E2, 14), stație sau capăt…"
          aria-label="Caută vehicule sau stații"
        />
        {searchQuery && (
          <button type="button" className="icon-btn" onClick={() => setSearchQuery('')} aria-label="Șterge căutarea">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="filter-tabs">
        <button type="button" className={modeFilter === 'all' ? 'active' : ''} onClick={() => setModeFilter('all')}>
          Toate ({feed.vehicles.length})
        </button>
        <button type="button" className={modeFilter === 'tram' ? 'active' : ''} onClick={() => setModeFilter('tram')}>
          <TrainFront size={13} /> Tramvaie
        </button>
        <button type="button" className={modeFilter === 'trolleybus' ? 'active' : ''} onClick={() => setModeFilter('trolleybus')}>
          Troleibuze
        </button>
        <button type="button" className={modeFilter === 'bus' ? 'active' : ''} onClick={() => setModeFilter('bus')}>
          Autobuze
        </button>
      </div>

      {feed.alerts.length > 0 && (
        <details className="stpt-alerts-box">
          <summary>
            <AlertTriangle size={15} />
            <span>{feed.alerts.length} alerte și devieri STPT active</span>
          </summary>
          <div className="alerts-list">
            {feed.alerts.slice(0, 6).map(alert => (
              <div key={alert.id} className="alert-item">
                <strong>{alert.header}</strong>
                {alert.description && <p>{alert.description}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Stops along selected line & direction (Tur / Retur) */}
      {selectedLine && activeDirectionSummary && (
        <div className="selected-line-stops-box">
          <div className="stops-timeline-heading">
            Stații pe sensul {selectedDirection === 'tur' ? 'Tur' : 'Retur'} ({activeDirectionSummary.stops.length} opriri)
          </div>
          <ol className="vehicle-stops-timeline compact">
            {activeDirectionSummary.stops.map((stop, idx) => {
              const vehicleAtStop = filteredVehicles.find(
                v => v.stop && v.stop.toLocaleLowerCase('ro') === stop.name.toLocaleLowerCase('ro'),
              );
              return (
                <li key={`${stop.name}-${idx}`} className={vehicleAtStop ? 'is-next' : ''}>
                  <span className="stop-dot" style={{ borderColor: activeLineSummary?.color }} />
                  <div className="stop-info">
                    <strong>
                      {stop.name}
                      {vehicleAtStop && (
                        <span className="vehicle-at-stop-badge">
                          Vehicul #{vehicleAtStop.id} în stație
                        </span>
                      )}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="stop-route-btn"
                    onClick={() => onPlanToStop(stop)}
                  >
                    Destinație B
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Live Vehicles List */}
      <div className="vehicle-list-heading">
        <span>
          {filteredVehicles.length} vehicule afișate pe hartă
          {selectedLine && !showAllRoutes ? ` · Linia ${selectedLine} (${selectedDirection.toUpperCase()})` : ''}
        </span>
      </div>

      <div className="vehicle-cards">
        {filteredVehicles.slice(0, 80).map(v => {
          const ageSec = Math.max(0, Math.round((Date.now() - Date.parse(v.recordedAt)) / 1000));
          const isSelected = selectedVehicle?.id === v.id;
          const dirLabel = v.directionId === '1' ? 'Retur' : 'Tur';
          return (
            <button
              type="button"
              key={v.id}
              className={`vehicle-row-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectVehicle(v)}
            >
              <span
                className="line-badge-box"
                style={{
                  background: badgeColor(v.type, v.line),
                }}
              >
                {v.line}
              </span>
              <div className="vehicle-row-copy">
                <strong>
                  {v.headsign ? `→ ${v.headsign}` : `${vehicleLabels[v.type]} ${v.line}`}
                  <span className="dir-pill">{dirLabel}</span>
                  {v.isAccessible && <span className="pmr-tag" title="Accesibil PMR">PMR</span>}
                </strong>
                <small>
                  {v.stop ? `Stație: ${v.stop}` : `ID flotă: ${v.id}`}
                </small>
              </div>
              <div className="vehicle-row-meta">
                {typeof v.bearing === 'number' && (
                  <span className="heading-tag" title={`Azimut deplasare: ${v.bearing}°`}>
                    <Compass size={11} style={{ transform: `rotate(${v.bearing}deg)` }} />
                    {typeof v.speed === 'number' && v.speed > 0 ? `${v.speed} km/h` : `${v.bearing}°`}
                  </span>
                )}
                <small>{ageSec < 60 ? `${ageSec}s` : `${Math.round(ageSec / 60)}m`}</small>
              </div>
            </button>
          );
        })}
        {filteredVehicles.length === 0 && (
          <div className="empty-state">
            <Radio size={26} />
            <h3>Niciun vehicul activ pe selecția curentă</h3>
            <p>Încearcă să comuți între Tur și Retur sau ajustează sub-filtrele rețelei.</p>
          </div>
        )}
      </div>
    </div>
  );
}
