import { describe, expect, it } from 'vitest';
import { findNextVehicleStops, getLineSummaries, searchTransit } from './transitRouter';
import type { TransitNetwork } from './transitRouter';

const stops = [
  { name: 'Plecare', lon: 21.18, lat: 45.75 },
  { name: 'Peron tramvai', lon: 21.205, lat: 45.75 },
  { name: 'Peron autobuz', lon: 21.206, lat: 45.75 },
  { name: 'Sosire', lon: 21.235, lat: 45.75 },
];
const network: TransitNetwork = {
  validFrom: '20261116', validTo: '20261231', stops,
  patterns: [
    { type: 'tram', line: '4', direction: 'Centru', shape: [[21.18, 45.75], [21.19, 45.754], [21.205, 45.75]],
      stops: [[0, 0, 1, 1], [1, 2, 1, 1]] },
    { type: 'bus', line: 'E2', direction: 'Sosire', shape: [[21.206, 45.75], [21.235, 45.75]],
      stops: [[2, 0, 1, 1], [3, 1, 1, 1]] },
  ],
};

describe('Rutare STPT', () => {
  it('folosește o transbordare între peroane apropiate și păstrează geometria cursei', () => {
    const [result] = searchTransit(network, [stops[0], stops[3]]);
    expect(result.transfers).toBe(1);
    const rides = result.steps.filter(step => step.kind === 'ride');
    expect(rides.map(ride => ride.line)).toEqual(['4', 'E2']);
    expect(rides[0].geometry.coordinates).toEqual(network.patterns[0].shape);
    const transfer = result.steps.find(step => step.kind === 'walk' && step.transfer);
    expect(transfer?.distance).toBeGreaterThan(0);
    expect(transfer?.distance).toBeLessThan(150);
  });

  it('respectă sensul curselor și limitele de îmbarcare', () => {
    expect(() => searchTransit(network, [stops[3], stops[0]])).toThrow('Nu am găsit o rută STPT');
    const restricted = structuredClone(network);
    restricted.patterns[1].stops[0][2] = 0;
    expect(() => searchTransit(restricted, [stops[0], stops[3]])).toThrow('Nu am găsit o rută STPT');
  });

  it('include o oprire cerută în ordinea aleasă', () => {
    const [result] = searchTransit(network, [stops[0], stops[1], stops[3]]);
    const rides = result.steps.filter(step => step.kind === 'ride');
    expect(rides.map(ride => ride.stops.at(-1)?.name)).toEqual(['Peron tramvai', 'Sosire']);
  });

  it('calculează următoarele opriri și rezumatele liniilor pentru vehiculele live', () => {
    const next = findNextVehicleStops(network, {
      line: '4',
      type: 'tram',
      lat: 45.75,
      lon: 21.181,
      headsign: 'Centru',
    });
    expect(next).not.toBeNull();
    expect(next?.upcoming.map(s => s.stop.name)).toContain('Peron tramvai');

    const summaries = getLineSummaries(network);
    expect(summaries.map(s => s.line)).toEqual(['4', 'E2']);
  });
});
