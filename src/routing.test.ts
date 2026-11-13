import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRoute } from './routing';
const start = { lon: 21.22, lat: 45.75 };
const stops = [{ lon: 21.23, lat: 45.76 }, { lon: 21.24, lat: 45.77 }];
afterEach(() => vi.unstubAllGlobals());
describe('Contract rutare', () => {
  it('folosește lon/lat, circuit auto și ordinea returnată de provider', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', trips: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.24, 45.77], [21.23, 45.76], [21.22, 45.75]] }, distance: 4000, duration: 500 }], waypoints: [{ waypoint_index: 0, distance: 0 }, { waypoint_index: 2, distance: 10 }, { waypoint_index: 1, distance: 70 }] }) });
    vi.stubGlobal('fetch', request);
    const result = await calculateRoute(start, stops);
    expect(request.mock.calls[0][0]).toContain('/driving/21.22,45.75;21.23,45.76;21.24,45.77?roundtrip=true');
    expect(result.order).toEqual([0, 2, 1]); expect(result.warnings).toHaveLength(1);
  });
  it('refuză răspunsurile fără un circuit complet și nu inventează geometrie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'NoTrips' }) }));
    await expect(calculateRoute(start, stops)).rejects.toThrow('Nu există');
  });
  it('nu trimite cereri pentru mai puțin de două opriri', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(calculateRoute(start, stops.slice(0, 1))).rejects.toThrow('2 și 7'); expect(request).not.toHaveBeenCalled();
  });
  it.each([['walking', 'routed-foot'], ['cycling', 'routed-bike'], ['driving', 'routed-car']] as const)('folosește serverul dedicat pentru %s', async (mode, path) => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', trips: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.24, 45.77], [21.22, 45.75]] }, distance: 3000, duration: 2000 }], waypoints: [{ waypoint_index: 0, distance: 0, location: [21.22, 45.75] }, { waypoint_index: 1, distance: 0, location: [21.23, 45.76] }, { waypoint_index: 2, distance: 0, location: [21.24, 45.77] }] }) });
    vi.stubGlobal('fetch', request);
    const result = await calculateRoute(start, stops, undefined, mode);
    expect(request.mock.calls[0][0]).toContain(`/${path}/trip/`);
    expect(result.mode).toBe(mode); expect(result.waypoints).toHaveLength(3);
  });
  it('refuză o ordine cu opriri duplicate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', trips: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.24, 45.77]] }, distance: 3000, duration: 2000 }], waypoints: [{ waypoint_index: 0 }, { waypoint_index: 1 }, { waypoint_index: 1 }] }) }));
    await expect(calculateRoute(start, stops)).rejects.toThrow('Ordinea');
  });
});
