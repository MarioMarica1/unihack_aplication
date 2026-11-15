import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  parseCdpCalendarHtml,
  parseRomanianDateRangeIso,
} from '../server/city-events.ts';
import {
  filterAndSortActiveCityEvents,
  formatCityEventDate,
  isCityEventExpired,
  type OfficialCityEvent,
} from './city-events';

const makeEvent = (overrides: Partial<OfficialCityEvent>): OfficialCityEvent => ({
  id: 'ev-1',
  title: 'Eveniment Test',
  category: 'Eveniment Cultural & Comunitar',
  venue: 'Piața Victoriei',
  lat: 45.7544,
  lon: 21.2265,
  startsAt: '2026-11-15T00:00:00.000Z',
  source: 'Visit Timișoara',
  officialUrl: 'https://visit-timisoara.com/ro/',
  ...overrides,
});

describe('official city events', () => {
  it('excludes past events while preserving today and ongoing multi-day events', () => {
    const todayNoonBucharest = '2026-11-15T10:30:00.000Z'; // 12:30 Europe/Bucharest

    expect(
      isCityEventExpired(makeEvent({ startsAt: '2026-11-14T00:00:00.000Z', endsAt: '2026-11-14T00:00:00.000Z' }), todayNoonBucharest),
    ).toBe(true);
    expect(
      isCityEventExpired(makeEvent({ startsAt: '2026-11-11T00:00:00.000Z', endsAt: '2026-11-13T00:00:00.000Z' }), todayNoonBucharest),
    ).toBe(true);
    expect(
      isCityEventExpired(makeEvent({ startsAt: '2026-11-15T00:00:00.000Z', endsAt: '2026-11-15T00:00:00.000Z' }), todayNoonBucharest),
    ).toBe(false);
    expect(
      isCityEventExpired(makeEvent({ startsAt: '2026-11-06T00:00:00.000Z', endsAt: '2027-01-30T00:00:00.000Z' }), todayNoonBucharest),
    ).toBe(false);
    // Past midnight in Europe/Bucharest (2026-11-16 00:30 EET), 2026-11-15 event has now passed
    expect(
      isCityEventExpired(makeEvent({ startsAt: '2026-11-15T00:00:00.000Z' }), '2026-11-15T22:30:00.000Z'),
    ).toBe(true);
  });

  it('filters expired events and sorts active events newest-to-oldest by default and ascending for upcoming', () => {
    const today = '2026-11-15T10:30:00.000Z';
    const sample: OfficialCityEvent[] = [
      makeEvent({ id: 'past', title: 'Eveniment Trecut', startsAt: '2026-11-14T00:00:00.000Z' }),
      makeEvent({ id: 'today-early', title: 'Matineu Azi', startsAt: '2026-11-15T00:00:00.000Z', timeLabel: '13:00' }),
      makeEvent({ id: 'dec', title: 'Conferință Decembrie', startsAt: '2026-12-03T00:00:00.000Z', timeLabel: '18:00' }),
      makeEvent({ id: 'ongoing', title: 'Expoziție În Desfășurare', startsAt: '2026-11-11T00:00:00.000Z', endsAt: '2026-11-24T00:00:00.000Z' }),
      makeEvent({ id: 'today-late', title: 'Spectacol Seară', startsAt: '2026-11-15T00:00:00.000Z', timeLabel: '19:30' }),
      makeEvent({ id: 'nov19', title: 'Concert 19 Noiembrie', startsAt: '2026-11-19T00:00:00.000Z', timeLabel: '19:00' }),
    ];

    expect(filterAndSortActiveCityEvents(sample, today, 'desc').map(e => e.id)).toEqual([
      'dec',
      'nov19',
      'today-late',
      'today-early',
      'ongoing',
    ]);

    expect(filterAndSortActiveCityEvents(sample, today, 'asc').map(e => e.id)).toEqual([
      'ongoing',
      'today-early',
      'today-late',
      'nov19',
      'dec',
    ]);
  });

  it('decodes Romanian HTML entities and parses single, multi-month, and cross-year Romanian date ranges', () => {
    expect(decodeHtmlEntities('&#8220;Repeti&#539;ii&#8221; &amp; Muzic&#259; &ndash; Timi&#537;oara')).toBe(
      '“Repetiții” & Muzică – Timișoara',
    );

    expect(parseRomanianDateRangeIso('15 noiembrie 2026 , 18:00')).toEqual({
      startsAt: '2026-11-15T00:00:00.000Z',
      endsAt: undefined,
      timeLabel: '18:00',
    });

    expect(parseRomanianDateRangeIso('13&ndash;16 noiembrie 2026 , 17:00 &ndash; 19:00')).toEqual({
      startsAt: '2026-11-13T00:00:00.000Z',
      endsAt: '2026-11-16T00:00:00.000Z',
      timeLabel: '17:00 – 19:00',
    });

    expect(parseRomanianDateRangeIso('6 noiembrie 2026 &ndash; 30 ianuarie 2027')).toEqual({
      startsAt: '2026-11-06T00:00:00.000Z',
      endsAt: '2027-01-30T00:00:00.000Z',
      timeLabel: undefined,
    });
  });

  it('parses Centrul de Proiecte calendar cards without misaligning missing venues', () => {
    const html = `
      <section><div id="_dynamic_list-4-8525">
        <div id="div_block-5-8525-1">
          <div data-id="code_block-149-8525">Expozi&#539;ie</div>
          <div data-id="div_block-129-8525"><div>9&ndash;15 noiembrie 2026</div></div>
          <h1 data-id="headline-137-8525"><span data-id="span-138-8525">Zilele Culturii S&acirc;rbe</span></h1>
          <a class="ct-link" href="https://centruldeproiecte.ro/ev1" data-id="link-141-8525">Detalii</a>
        </div>
        <div id="div_block-5-8525-2">
          <div data-id="code_block-149-8525">Teatru</div>
          <div data-id="div_block-129-8525"><div>19 noiembrie 2026</div><div>,</div><div>19:00</div></div>
          <h1 data-id="headline-137-8525"><span data-id="span-138-8525">Spectacol Nou</span></h1>
          <div><span data-id="span-140-8525">Bastion 3, Strada Hector 1</span></div>
          <a class="ct-link" href="https://centruldeproiecte.ro/ev2" data-id="link-141-8525">Detalii</a>
        </div>
      </div></section>
    `;

    const cards = parseCdpCalendarHtml(html);
    expect(cards).toEqual([
      {
        title: 'Zilele Culturii Sârbe',
        categoryRaw: 'Expoziție',
        venueRaw: '',
        officialUrl: 'https://centruldeproiecte.ro/ev1',
        startsAt: '2026-11-09T00:00:00.000Z',
        endsAt: '2026-11-15T00:00:00.000Z',
        timeLabel: undefined,
      },
      {
        title: 'Spectacol Nou',
        categoryRaw: 'Teatru',
        venueRaw: 'Bastion 3, Strada Hector 1',
        officialUrl: 'https://centruldeproiecte.ro/ev2',
        startsAt: '2026-11-19T00:00:00.000Z',
        endsAt: undefined,
        timeLabel: '19:00',
      },
    ]);
  });

  it('formats official event dates without displaying spurious midnight UTC offset hours', () => {
    const formatted = formatCityEventDate('2026-11-15T00:00:00.000Z', 'short');
    expect(formatted).toContain('2026');
    expect(formatted).not.toMatch(/\d{2}:\d{2}/);
  });
});
