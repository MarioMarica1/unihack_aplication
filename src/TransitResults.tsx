import { Bus, Compass, Footprints, Radio, TrainFront } from 'lucide-react';
import type { CSSProperties } from 'react';
import { distance as geoDistance } from './domain';
import type { LiveVehicle } from './stpt-live';
import { vehicleLabels } from './transitRouter';
import type { TransitOption, TransitStep } from './transitRouter';

const minutes = (seconds: number) => Math.ceil(seconds / 60);
const metres = (distance: number) => distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`;
const dateLabel = (day: string) => `${day.slice(6, 8)}.${day.slice(4, 6)}.${day.slice(0, 4)}`;

function StepIcon({ step }: { step: TransitStep }) {
  const Icon = step.kind === 'walk' ? Footprints : step.type === 'tram' ? TrainFront : Bus;
  return <Icon size={16} aria-hidden="true" />;
}

export default function TransitResults({
  options,
  selected,
  select,
  validFrom,
  validTo,
  liveVehicles = [],
  onSelectVehicle,
}: {
  options: TransitOption[];
  selected: number;
  select: (index: number) => void;
  validFrom: string;
  validTo: string;
  liveVehicles?: LiveVehicle[];
  onSelectVehicle?: (vehicle: LiveVehicle) => void;
}) {
  const option = options[selected];
  const steps = option.steps.filter(step => step.kind === 'ride' || step.transfer || step.distance >= 1);
  const rides = steps.filter(step => step.kind === 'ride');
  const assignedLines = [...new Set(rides.map(r => r.line.toUpperCase()))];
  const activeRouteVehicles = liveVehicles.filter(v => assignedLines.includes(v.line.toUpperCase()));

  return (
    <section className="transit-result" aria-label="Rezultate transport public">
      {options.length > 1 && (
        <div className="transit-options" role="group" aria-label="Variante STPT">
          {options.map((item, index) => (
            <button
              type="button"
              className="secondary"
              key={index}
              aria-pressed={selected === index}
              onClick={() => select(index)}
            >
              Varianta {index + 1}
              <br />
              {minutes(item.duration)} min
            </button>
          ))}
        </div>
      )}
      <div className="transit-summary-header">
        <p className="transit-summary">
          <strong>{minutes(option.duration)} min</strong> · {metres(option.distance)}
          {option.transfers
            ? ` · ${option.transfers} ${option.transfers === 1 ? 'schimbare' : 'schimbări'}`
            : rides.length === 1
              ? ' · Direct'
              : ''}
        </p>
        <span className="transit-live-pill" title="Vehicule GPS STPT active pe liniile acestui traseu">
          <Radio size={12} />
          {activeRouteVehicles.length} vehicule live pe traseu
        </span>
      </div>

      <ol className="transit-pills" aria-label="Rezumatul traseului">
        {steps.map((step, index) => (
          <li
            key={index}
            style={step.kind === 'ride' ? ({ '--line-color': step.color } as CSSProperties) : undefined}
          >
            <StepIcon step={step} />
            {step.kind === 'ride' ? step.line : `${minutes(step.duration)} min`}
          </li>
        ))}
      </ol>

      <ol className="transit-timeline">
        {steps.map((step, index) => {
          const boardStop = step.kind === 'ride' ? step.stops[0] : undefined;
          const lineLive =
            step.kind === 'ride'
              ? liveVehicles
                  .filter(v => v.line.toUpperCase() === step.line.toUpperCase())
                  .map(v => ({
                    vehicle: v,
                    distToBoard: boardStop
                      ? Math.round(geoDistance({ lon: boardStop.lon, lat: boardStop.lat }, { lon: v.lon, lat: v.lat }))
                      : 0,
                  }))
                  .sort((a, b) => a.distToBoard - b.distToBoard)
              : [];

          return (
            <li key={index}>
              <span
                className="transit-step-icon"
                style={step.kind === 'ride' ? ({ '--line-color': step.color } as CSSProperties) : undefined}
              >
                <StepIcon step={step} />
              </span>
              {step.kind === 'walk' ? (
                <div>
                  <strong>
                    {step.transfer
                      ? step.distance >= 1
                        ? `Schimbă la ${step.to}`
                        : `Schimbă linia la ${step.to}`
                      : `Mergi pe jos până la ${step.to}`}
                  </strong>
                  {step.distance >= 1 && (
                    <p>
                      De la {step.from} · {metres(step.distance)} · ~{minutes(step.duration)} min
                      {step.approximate ? ' · estimare în linie dreaptă' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <strong>Urcă la {step.stops[0].name}</strong>
                  <p>
                    <span className="transit-line-badge" style={{ '--line-color': step.color } as CSSProperties}>
                      {vehicleLabels[step.type]} {step.line}
                    </span>{' '}
                    spre {step.direction}
                  </p>
                  <p>
                    Mergi {step.stops.length - 1} {step.stops.length === 2 ? 'stație' : 'stații'} · ~{minutes(step.duration)}{' '}
                    min
                  </p>

                  {/* Live GTFS-RT Cross-referenced vehicles on this line */}
                  <div className="transit-step-live-box">
                    {lineLive.length > 0 ? (
                      <>
                        <div className="transit-step-live-header">
                          <span className="pulse-dot" />
                          <span>
                            GPS Live linia {step.line}: {lineLive.length}{' '}
                            {lineLive.length === 1 ? 'vehicul pe traseu' : 'vehicule pe traseu'}
                          </span>
                        </div>
                        <div className="transit-step-live-chips">
                          {lineLive.slice(0, 3).map(({ vehicle, distToBoard }) => (
                            <button
                              type="button"
                              key={vehicle.id}
                              className="transit-live-vehicle-chip"
                              onClick={() => onSelectVehicle?.(vehicle)}
                              title={`Focalizează vehiculul #${vehicle.id} pe hartă`}
                            >
                              <strong>#{vehicle.id}</strong>
                              <span>la {metres(distToBoard)} de urcare</span>
                              {typeof vehicle.bearing === 'number' && (
                                <Compass size={11} style={{ transform: `rotate(${vehicle.bearing}deg)` }} />
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <small className="muted-inline">
                        Niciun emițător GPS live activ în acest moment pe linia {step.line}.
                      </small>
                    )}
                  </div>

                  {step.stops.length > 2 && (
                    <details>
                      <summary>Stații intermediare ({step.stops.length - 2})</summary>
                      <ul>
                        {step.stops.slice(1, -1).map((stop, i) => (
                          <li key={i}>{stop.name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <strong>Coboară la {step.stops.at(-1)?.name}</strong>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="routing-attribution">
        Estimare pe baza rețelei SMTT ({dateLabel(validFrom)}–{dateLabel(validTo)}) corelată în timp real cu pozițiile GPS GTFS-RT STPT.
      </p>
    </section>
  );
}
