import { describe, expect, it } from 'vitest';
import { normalizeStptAlerts, normalizeStptVehicles } from '../server/stpt-live';
import { computeStationTelemetry } from '../server/velo-live';

describe('STPT Live adapter & VeloTM telemetry', () => {
  it('normalizes real STPT vehicle telemetry, infers transport mode and Tur/Retur directionId', () => {
    const now = Date.parse('2026-11-14T18:00:00Z');
    const raw = {
      vehicles: [
        {
          id: 'TM-01',
          routeId: 'R_TV_9',
          line: '9',
          lat: 45.7537,
          lng: 21.2257,
          bearing: 180,
          speed: 24,
          directionId: '0',
          shapeId: '9.1_T',
          headsign: 'Gara de Nord',
          stop: 'Catedrala Mitropolitană',
          isAccessible: true,
          timestamp: Math.floor((now - 5000) / 1000),
          tripId: 'TRIP_9_1',
        },
        {
          id: 'TB-14',
          routeId: 'R_TB_14',
          line: '14',
          lat: 45.761,
          lng: 21.231,
          shapeId: '14.1_R',
          timestamp: Math.floor((now - 10000) / 1000),
        },
        {
          id: 'AB-OLD',
          routeId: 'R_AB_33',
          line: '33',
          lat: 45.74,
          lng: 21.21,
          timestamp: Math.floor((now - 20 * 60_000) / 1000),
        },
      ],
    };

    const vehicles = normalizeStptVehicles(raw, now);
    expect(vehicles).toHaveLength(2);
    expect(vehicles[0]).toMatchObject({
      id: 'TM-01',
      type: 'tram',
      line: '9',
      lat: 45.7537,
      lon: 21.2257,
      headsign: 'Gara de Nord',
      stop: 'Catedrala Mitropolitană',
      isAccessible: true,
      directionId: '0',
      shapeId: '9.1_T',
    });
    expect(vehicles[1].type).toBe('trolleybus');
    expect(vehicles[1].directionId).toBe('1');
  });

  it('normalizes STPT service alerts', () => {
    const alerts = normalizeStptAlerts({
      alerts: [
        { id: 'a1', header: 'Deviere linia 6', description: 'Lucrări pe Bulevardul Cetății' },
      ],
    });
    expect(alerts).toEqual([
      { id: 'a1', header: 'Deviere linia 6', description: 'Lucrări pe Bulevardul Cetății' },
    ]);
  });

  it('computes dynamic VeloTM station availableBikes and freeDocks matching totalDocks', () => {
    const telemetry = computeStationTelemetry(
      { id: 'node/4498490592', name: 'Libertății', lon: 21.227, lat: 45.755, totalDocks: 20 },
      Date.parse('2026-11-14T14:00:00Z'),
    );
    expect(telemetry.availableBikes).toBeGreaterThanOrEqual(0);
    expect(telemetry.freeDocks).toBeGreaterThanOrEqual(0);
    expect(telemetry.availableBikes + telemetry.freeDocks).toBe(20);
  });
});
