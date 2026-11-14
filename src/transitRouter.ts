import type { LineString, Position } from 'geojson';
import { distance } from './domain';
import type { Point } from './domain';
import { calculateRoute } from './routing';
import { tramColors } from './tram-lines';
import { busLineColor } from './transport-colors';

export type VehicleType = 'tram' | 'bus' | 'trolleybus';
export type TransitStop = Point & { name: string };
type Call = [stop: number, shapeIndex: number, pickup: number, dropoff: number];
export type TransitPattern = { type: VehicleType; line: string; direction: string; shape: Position[]; stops: Call[] };
export type TransitNetwork = { validFrom: string; validTo: string; stops: TransitStop[]; patterns: TransitPattern[] };
type Segment = { distance: number; duration: number; geometry: LineString };
type Walk = Segment & { kind: 'walk'; from: string; to: string; transfer: boolean; approximate: boolean };
type Ride = Segment & {
  kind: 'ride'; type: VehicleType; line: string; direction: string; color: string;
  stops: TransitStop[]; wait: number;
};
export type TransitStep = Walk | Ride;
export type TransitOption = { steps: TransitStep[]; distance: number; duration: number; transfers: number };
export type TransitPoint = Point & { name: string };
type Boarding = { pattern: number; call: number };
type RideChoice = Boarding & { end: number; metres: number };
type Leg = { rides: RideChoice[]; score: number };
type Alighting = { stop: number; ride: RideChoice; seconds: number };

const walkSpeed = 1.4;
const accessRadius = 800;
const transferRadius = 150;
const wait = 270;
const transferPenalty = 300;
const speeds = { tram: 22 / 3.6, bus: 20 / 3.6, trolleybus: 20 / 3.6 };
export const vehicleLabels = { tram: 'Tramvai', bus: 'Autobuz', trolleybus: 'Troleibuz' };
const coordinate = ({ lon, lat }: Point): Position => [lon, lat];
const point = ([lon, lat]: Position): Point => ({ lon, lat });

function prepare(network: TransitNetwork) {
  const boardings: Boarding[][] = network.stops.map(() => []);
  const lengths = network.patterns.map((pattern, index) => {
    pattern.stops.forEach(([stop, , pickup], call) => {
      if (pickup && call < pattern.stops.length - 1) boardings[stop].push({ pattern: index, call });
    });
    let total = 0;
    return pattern.shape.map((position, i) => {
      if (i) total += distance(point(pattern.shape[i - 1]), point(position));
      return total;
    });
  });
  const transfers = network.stops.map(stop => network.stops.flatMap((other, index) => {
    if (Math.abs(stop.lat - other.lat) > .0014 || Math.abs(stop.lon - other.lon) > .002) return [];
    const metres = distance(stop, other);
    return metres <= transferRadius ? [{ index, metres }] : [];
  }));
  const alightings: Alighting[][][] = network.patterns.map((pattern, index) => pattern.stops.map(([startStop, startIndex], call) =>
    pattern.stops.slice(call + 1).flatMap(([stop, shapeIndex, , dropoff], offset) => {
      if (!dropoff || stop === startStop || shapeIndex <= startIndex) return [];
      const metres = lengths[index][shapeIndex] - lengths[index][startIndex];
      const ride = { pattern: index, call, end: call + 1 + offset, metres };
      return metres > 0 ? [{ stop, ride, seconds: metres / speeds[pattern.type] }] : [];
    })
  ));
  return { boardings, transfers, alightings };
}

function walk(from: TransitPoint, to: TransitPoint, transfer = false): Walk {
  const metres = distance(from, to);
  return {
    kind: 'walk', from: from.name, to: to.name, transfer, approximate: metres > 0,
    distance: metres, duration: metres / walkSpeed,
    geometry: { type: 'LineString', coordinates: [coordinate(from), coordinate(to)] },
  };
}

function optionsForLeg(network: TransitNetwork, graph: ReturnType<typeof prepare>, from: TransitPoint, to: TransitPoint): TransitOption[] {
  const access = network.stops.map(stop => distance(from, stop));
  const egress = network.stops.map(stop => distance(to, stop));
  const candidates = new Map<string, Leg>();
  const endChoices: { ride: RideChoice; score: number }[][] = network.stops.map(() => []);
  const lineKey = (ride: RideChoice) => {
    const { type, line } = network.patterns[ride.pattern];
    return `${type}:${line}`;
  };
  function keep(rides: RideChoice[], score: number) {
    const key = rides.map(lineKey).join('>');
    if (score < (candidates.get(key)?.score ?? Infinity)) candidates.set(key, { rides, score });
  }

  graph.boardings.forEach((boardings, stop) => {
    const choices = new Map<string, { ride: RideChoice; score: number }>();
    for (const boarding of boardings) {
      for (const end of graph.alightings[boarding.pattern][boarding.call]) {
        if (egress[end.stop] > accessRadius) continue;
        const key = lineKey(end.ride);
        const score = wait + end.seconds + egress[end.stop] / walkSpeed;
        if (score < (choices.get(key)?.score ?? Infinity)) choices.set(key, { ride: end.ride, score });
      }
    }
    endChoices[stop] = [...choices.values()];
  });

  graph.boardings.forEach((boardings, stop) => {
    if (access[stop] > accessRadius) return;
    for (const boarding of boardings) {
      for (const end of graph.alightings[boarding.pattern][boarding.call]) {
        const first = access[stop] / walkSpeed + wait + end.seconds;
        if (egress[end.stop] <= accessRadius) keep([end.ride], first + egress[end.stop] / walkSpeed);
        for (const transfer of graph.transfers[end.stop]) {
          for (const second of endChoices[transfer.index]) {
            if (lineKey(end.ride) === lineKey(second.ride)) continue;
            keep([end.ride, second.ride], first + transfer.metres / walkSpeed + second.score + transferPenalty);
          }
        }
      }
    }
  });

  const ranked = [...candidates.values()].sort((a, b) => a.score - b.score);
  const direct = ranked.find(option => option.rides.length === 1);
  const useful = ranked.filter(option => !direct || option.rides.length === 1 || option.score < direct.score);
  return useful.slice(0, 3).map(({ rides }) => {
    const steps: TransitStep[] = [];
    let previous = from;
    for (const choice of rides) {
      const pattern = network.patterns[choice.pattern];
      const calls = pattern.stops.slice(choice.call, choice.end + 1);
      const stops = calls.map(([id]) => network.stops[id]);
      steps.push(walk(previous, stops[0], steps.length > 0));
      steps.push({
        kind: 'ride', type: pattern.type, line: pattern.line, direction: pattern.direction, stops, wait,
        color: pattern.type === 'tram' ? tramColors[pattern.line as keyof typeof tramColors] ?? '#a855f7'
          : busLineColor(pattern.line),
        distance: choice.metres, duration: choice.metres / speeds[pattern.type],
        geometry: { type: 'LineString', coordinates: pattern.shape.slice(calls[0][1], calls.at(-1)![1] + 1) },
      });
      previous = stops.at(-1)!;
    }
    steps.push(walk(previous, to));
    return summarize(steps);
  });
}

function summarize(steps: TransitStep[]): TransitOption {
  const rides = steps.filter((step): step is Ride => step.kind === 'ride');
  return {
    steps,
    distance: steps.reduce((total, step) => total + step.distance, 0),
    duration: steps.reduce((total, step) => total + step.duration, 0) + rides.reduce((total, step) => total + step.wait, 0),
    transfers: steps.filter(step => step.kind === 'walk' && step.transfer).length,
  };
}

export function searchTransit(network: TransitNetwork, points: TransitPoint[]): TransitOption[] {
  const graph = prepare(network);
  let results: TransitOption[] = [summarize([])];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    const options = optionsForLeg(network, graph, from, to);
    if (!options.length) {
      if (points.length > 2 && distance(from, to) <= accessRadius) options.push(summarize([walk(from, to)]));
      else throw new Error(`Nu am găsit o rută STPT de la „${from.name}” la „${to.name}”. Alege puncte mai apropiate de stații sau încearcă alt mod.`);
    }
    results = results.flatMap(previous => options.map(option => summarize([...previous.steps, ...option.steps])))
      .sort((a, b) => (a.duration + a.transfers * transferPenalty) - (b.duration + b.transfers * transferPenalty)).slice(0, 3);
  }
  const withTransit = results.filter(option => option.steps.some(step => step.kind === 'ride'));
  if (!withTransit.length) throw new Error('Punctele pot fi parcurse pe jos. Alege modul „Pe jos”.');
  return withTransit;
}

let cachedNetwork: TransitNetwork | undefined;

export async function loadTransitNetwork(signal?: AbortSignal): Promise<TransitNetwork> {
  if (!cachedNetwork) {
    const response = await fetch('/data/stpt-network.json', { signal });
    if (!response.ok) throw new Error('Nu am putut încărca rețeaua STPT. Reîncearcă.');
    const data = await response.json() as TransitNetwork;
    if (!data.stops?.length || !data.patterns?.length) throw new Error('Rețeaua STPT nu conține trasee. Reîncearcă.');
    cachedNetwork = data;
  }
  return cachedNetwork;
}

export async function planTransit(points: TransitPoint[], signal: AbortSignal) {
  const network = await loadTransitNetwork(signal);
  const options = searchTransit(network, points);
  const refined = new Map<Walk, Walk>();
  const requests = new Map<string, Promise<Segment | undefined>>();
  const walkingSignal = AbortSignal.any([signal, AbortSignal.timeout(6500)]);
  for (const option of options) for (const step of option.steps) {
    if (step.kind !== 'walk' || step.distance < 25) continue;
    const key = JSON.stringify(step.geometry.coordinates);
    let pending = requests.get(key);
    if (!pending && requests.size < 5) {
      const [from, to] = step.geometry.coordinates;
      pending = calculateRoute(point(from), point(to), [], walkingSignal, 'walking')
        .then(({ distance, duration, geometry }) => ({ distance, duration, geometry }))
        .catch(() => undefined);
      requests.set(key, pending);
    }
    void pending?.then(result => {
      if (result) refined.set(step, { ...step, ...result, approximate: false });
    });
  }
  await Promise.all(requests.values());
  signal.throwIfAborted();
  const estimates = options.map(option => summarize(option.steps.map(step => step.kind === 'walk' ? refined.get(step) ?? step : step)));
  return { options: estimates, validFrom: network.validFrom, validTo: network.validTo };
}

export type UpcomingStopEstimate = {
  stop: TransitStop;
  distanceMeters: number;
  estimatedMinutes: number;
};

export function findNextVehicleStops(
  network: TransitNetwork,
  vehicle: { type: VehicleType; line: string; lat: number; lon: number; headsign?: string; stop?: string },
): { direction: string; upcoming: UpcomingStopEstimate[] } | undefined {
  const lineUpper = vehicle.line.toUpperCase();
  const matching = network.patterns.filter(p => p.line.toUpperCase() === lineUpper);
  if (!matching.length) return undefined;

  const headsignNorm = (vehicle.headsign ?? '').toLocaleLowerCase('ro').trim();
  const preferred = headsignNorm
    ? matching.find(p => p.direction.toLocaleLowerCase('ro').includes(headsignNorm) || headsignNorm.includes(p.direction.toLocaleLowerCase('ro'))) ?? matching[0]
    : matching[0];

  const pos: Point = { lon: vehicle.lon, lat: vehicle.lat };
  let closestCallIndex = 0;
  let closestDist = Infinity;

  preferred.stops.forEach(([stopIdx], callIndex) => {
    const st = network.stops[stopIdx];
    if (!st) return;
    const d = distance(pos, st);
    if (d < closestDist) {
      closestDist = d;
      closestCallIndex = callIndex;
    }
  });

  const speedMps = speeds[preferred.type] || 5.5;
  const upcoming: UpcomingStopEstimate[] = [];
  let cumulativeMeters = 0;
  let prevPoint = pos;

  for (let i = closestCallIndex; i < Math.min(preferred.stops.length, closestCallIndex + 8); i++) {
    const [stopIdx] = preferred.stops[i];
    const st = network.stops[stopIdx];
    if (!st) continue;
    cumulativeMeters += distance(prevPoint, st);
    prevPoint = st;
    upcoming.push({
      stop: st,
      distanceMeters: Math.round(cumulativeMeters),
      estimatedMinutes: Math.max(1, Math.round(cumulativeMeters / speedMps / 60)),
    });
  }

  return { direction: preferred.direction, upcoming };
}

export type LineDirectionSummary = {
  dirKey: 'tur' | 'retur';
  direction: string;
  stops: TransitStop[];
  shape: Position[];
};

export type LineSummary = {
  line: string;
  type: VehicleType;
  color: string;
  directions: LineDirectionSummary[];
};

export function getLineSummaries(network: TransitNetwork): LineSummary[] {
  const byKey = new Map<string, LineSummary>();
  for (const pattern of network.patterns) {
    const key = `${pattern.type}:${pattern.line}`;
    let entry = byKey.get(key);
    if (!entry) {
      const color = pattern.type === 'tram'
        ? tramColors[pattern.line as keyof typeof tramColors] ?? '#0F52BA'
        : busLineColor(pattern.line);
      entry = { line: pattern.line, type: pattern.type, color, directions: [] };
      byKey.set(key, entry);
    }
    const stops = pattern.stops.map(([idx]) => network.stops[idx]).filter(Boolean);
    if (!entry.directions.some(d => d.direction === pattern.direction)) {
      const dirKey: 'tur' | 'retur' = entry.directions.length === 0 ? 'tur' : 'retur';
      entry.directions.push({ dirKey, direction: pattern.direction, stops, shape: pattern.shape });
    }
  }
  const typeOrder: Record<VehicleType, number> = { tram: 1, trolleybus: 2, bus: 3 };
  return [...byKey.values()].sort((a, b) =>
    typeOrder[a.type] - typeOrder[b.type] || a.line.localeCompare(b.line, 'ro', { numeric: true }),
  );
}
