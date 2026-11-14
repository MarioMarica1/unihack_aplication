import { Bus, Footprints, TrainFront } from 'lucide-react';
import type { CSSProperties } from 'react';
import { vehicleLabels } from './transitRouter';
import type { TransitOption, TransitStep } from './transitRouter';

const minutes = (seconds: number) => Math.ceil(seconds / 60);
const metres = (distance: number) => distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`;
const dateLabel = (day: string) => `${day.slice(6, 8)}.${day.slice(4, 6)}.${day.slice(0, 4)}`;

function StepIcon({ step }: { step: TransitStep }) {
  const Icon = step.kind === 'walk' ? Footprints : step.type === 'tram' ? TrainFront : Bus;
  return <Icon size={16} aria-hidden="true" />;
}

export default function TransitResults({ options, selected, select, validFrom, validTo }: {
  options: TransitOption[]; selected: number; select: (index: number) => void; validFrom: string; validTo: string;
}) {
  const option = options[selected];
  const steps = option.steps.filter(step => step.kind === 'ride' || step.transfer || step.distance >= 1);
  const rides = steps.filter(step => step.kind === 'ride');
  return <section className="transit-result" aria-label="Rezultate transport public">
    {options.length > 1 && <div className="transit-options" role="group" aria-label="Variante STPT">
      {options.map((item, index) => <button type="button" className="secondary" key={index} aria-pressed={selected === index} onClick={() => select(index)}>
        Varianta {index + 1}<br />{minutes(item.duration)} min
      </button>)}
    </div>}
    <p className="transit-summary"><strong>{minutes(option.duration)} min</strong> · {metres(option.distance)}
      {option.transfers ? ` · ${option.transfers} ${option.transfers === 1 ? 'schimbare' : 'schimbări'}` : rides.length === 1 ? ' · Direct' : ''}
    </p>
    <ol className="transit-pills" aria-label="Rezumatul traseului">
      {steps.map((step, index) => <li key={index} style={step.kind === 'ride' ? { '--line-color': step.color } as CSSProperties : undefined}>
        <StepIcon step={step} />{step.kind === 'ride' ? step.line : `${minutes(step.duration)} min`}
      </li>)}
    </ol>
    <ol className="transit-timeline">
      {steps.map((step, index) => <li key={index}>
        <span className="transit-step-icon" style={step.kind === 'ride' ? { '--line-color': step.color } as CSSProperties : undefined}><StepIcon step={step} /></span>
        {step.kind === 'walk' ? <div>
          <strong>{step.transfer ? (step.distance >= 1 ? `Schimbă la ${step.to}` : `Schimbă linia la ${step.to}`) : `Mergi pe jos până la ${step.to}`}</strong>
          {step.distance >= 1 && <p>De la {step.from} · {metres(step.distance)} · ~{minutes(step.duration)} min{step.approximate ? ' · estimare în linie dreaptă' : ''}</p>}
        </div> : <div>
          <strong>Urcă la {step.stops[0].name}</strong>
          <p><span className="transit-line-badge" style={{ '--line-color': step.color } as CSSProperties}>{vehicleLabels[step.type]} {step.line}</span> spre {step.direction}</p>
          <p>Mergi {step.stops.length - 1} {step.stops.length === 2 ? 'stație' : 'stații'} · ~{minutes(step.duration)} min</p>
          {step.stops.length > 2 && <details><summary>Stații intermediare</summary><ul>{step.stops.slice(1, -1).map((stop, i) => <li key={i}>{stop.name}</li>)}</ul></details>}
          <strong>Coboară la {step.stops.at(-1)?.name}</strong>
        </div>}
      </li>)}
    </ol>
    <p className="routing-attribution">Estimare pe baza rețelei SMTT ({dateLabel(validFrom)}–{dateLabel(validTo)}), cu ~5 min de așteptare la fiecare urcare. Verifică orarul înainte de plecare.</p>
  </section>;
}
