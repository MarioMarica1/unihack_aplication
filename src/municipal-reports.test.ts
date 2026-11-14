import { describe, expect, it } from 'vitest';
import { normalizeMunicipalReports } from '../server/municipal-reports.ts';
import { createSeed, mutate } from './domain';
import { municipalReportsWindowMs } from './municipal-reports';

describe('municipal reports', () => {
  it('keeps only the requested statuses within the rolling 30-day window', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const row = (id: number, status: string, time: number) => ({
      webconInstanceNr: `SZN2026-${id}`, status, createdAt: new Date(time).toISOString(),
    });
    const reports = normalizeMunicipalReports([
      row(1, 'Inregistrata', now - municipalReportsWindowMs),
      row(2, 'In lucru', now - 1000),
      row(3, 'In lucru', now - municipalReportsWindowMs - 1),
      row(4, 'Finalizata', now - 1000),
      row(5, 'Asteapta clarificari', now - 1000),
      row(6, 'Inregistrata', now + 1),
    ], now);
    expect(reports.map(report => report.number)).toEqual(['SZN2026-1', 'SZN2026-2']);
    expect(reports[0].coordinates).toBeUndefined();
  });

  it('lets only the author set and clear the community report marker', () => {
    const state = createSeed();
    const action = { type: 'setMunicipalReported', pinId: 'seed-road', userId: 'mihai', enabled: true } as const;
    expect(() => mutate(state, { ...action, userId: 'ana' })).toThrow('autorul');
    const marked = mutate(state, action);
    expect(marked.pins.find(pin => pin.id === action.pinId)?.reportedToMunicipality).toBe(true);
    const cleared = mutate(marked, { ...action, enabled: false });
    expect(cleared.pins.find(pin => pin.id === action.pinId)?.reportedToMunicipality).toBe(false);
  });
});
