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

  it('includes all 5 official statuses, description, and CloudFront photo URL when includeAllStatuses is true', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const reports = normalizeMunicipalReports([
      {
        webconInstanceNr: 'SZN2026-10',
        status: 'Finalizata',
        createdAt: new Date(now - 5000).toISOString(),
        descriere: 'Intervenție finalizată pe carosabil.',
        files: [{ path: 'sesizari/2026/photo1.jpg' }],
      },
      {
        webconInstanceNr: 'SZN2026-11',
        status: 'Declinata competenta',
        createdAt: new Date(now - 2000).toISOString(),
      },
    ], now, true);
    expect(reports.map(r => r.number)).toEqual(['SZN2026-10', 'SZN2026-11']);
    expect(reports[0].status).toBe('Finalizata');
    expect(reports[0].description).toBe('Intervenție finalizată pe carosabil.');
    expect(reports[0].photoUrl).toBe('https://d6r4wmx5epyg3.cloudfront.net/sesizari/2026/photo1.jpg');
  });

  it('lets only the author set and clear the community report marker', () => {
    const state = mutate(createSeed(), {
      type: 'create',
      id: 'rep-real-1',
      userId: 'mihai',
      input: {
        type: 'report',
        title: 'Pavaj deteriorat pe Bulevardul Republicii',
        description: 'Dale desprinse pe trotuarul pietonal din centrul orașului.',
        category: 'Accesibilitate',
        place: 'Bulevardul Republicii',
        location: { lon: 21.2182, lat: 45.7545 },
        image: 'data:image/webp;base64,realphoto',
      },
    });
    const action = { type: 'setMunicipalReported', pinId: 'rep-real-1', userId: 'mihai', enabled: true } as const;
    expect(() => mutate(state, { ...action, userId: 'ana' })).toThrow('autorul');
    const marked = mutate(state, action);
    expect(marked.pins.find(pin => pin.id === action.pinId)?.reportedToMunicipality).toBe(true);
    const cleared = mutate(marked, { ...action, enabled: false });
    expect(cleared.pins.find(pin => pin.id === action.pinId)?.reportedToMunicipality).toBe(false);
  });
});
