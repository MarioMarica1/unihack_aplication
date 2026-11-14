import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRoute } from './routing';
const start = { lon: 21.22, lat: 45.75 };
const waypoints = [{ lon: 21.23, lat: 45.76 }];
const destination = { lon: 21.24, lat: 45.77 };
afterEach(() => vi.unstubAllGlobals());
describe('Contract rutare', () => {
  it('trimite startul, opririle și destinația în ordinea aleasă fără circuit', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.23, 45.76], [21.24, 45.77]] }, distance: 4000, duration: 500 }], waypoints: [{ distance: 0 }, { distance: 10 }, { distance: 70 }] }) });
    vi.stubGlobal('fetch', request);
    const result = await calculateRoute(start, destination, waypoints);
    expect(request.mock.calls[0][0]).toContain('/route/v1/driving/21.22,45.75;21.23,45.76;21.24,45.77?');
    expect(request.mock.calls[0][0]).not.toContain('roundtrip');
    expect(result.order).toEqual([0, 1, 2]); expect(result.warnings).toHaveLength(1);
  });
  it('refuză răspunsurile fără o rută și nu inventează geometrie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'NoRoute' }) }));
    await expect(calculateRoute(start, destination, waypoints)).rejects.toThrow('Nu există');
  });
  it('calculează o rută directă cu o singură destinație', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.24, 45.77]] }, distance: 2000, duration: 300 }], waypoints: [{ distance: 0 }, { distance: 0 }] }) });
    vi.stubGlobal('fetch', request);
    const result = await calculateRoute(start, destination);
    expect(request).toHaveBeenCalledOnce(); expect(result.order).toEqual([0, 1]);
  });
  it.each([['walking', 'routed-foot'], ['cycling', 'routed-bike'], ['driving', 'routed-car']] as const)('folosește serverul dedicat pentru %s', async (mode, path) => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.23, 45.76], [21.24, 45.77]] }, distance: 3000, duration: 2000 }], waypoints: [{ distance: 0, location: [21.22, 45.75] }, { distance: 0, location: [21.23, 45.76] }, { distance: 0, location: [21.24, 45.77] }] }) });
    vi.stubGlobal('fetch', request);
    const result = await calculateRoute(start, destination, waypoints, undefined, mode);
    expect(request.mock.calls[0][0]).toContain(`/${path}/route/`);
    expect(result.mode).toBe(mode); expect(result.waypoints).toHaveLength(3);
  });
  it('refuză răspunsurile cu un număr greșit de puncte', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[21.22, 45.75], [21.24, 45.77]] }, distance: 3000, duration: 2000 }], waypoints: [{ distance: 0 }] }) }));
    await expect(calculateRoute(start, destination, waypoints)).rejects.toThrow('Nu există');
  });
});
