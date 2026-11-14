import { describe, expect, it } from 'vitest';
import { geocodeLocation, parseNavigationIntent } from './AiUrbanAssistant';

describe('AI Urban Assistant multi-stop & waypoint routing', () => {
  it('parsează corect „vreau sa merg la gara si apoi la mall” în waypoint + destinație', async () => {
    const intent = parseNavigationIntent('vreau sa merg la gara si apoi la mall');
    expect(intent.isNavigation).toBe(true);
    expect(intent.waypointRaws).toEqual(['gara']);
    expect(intent.destinationRaw).toBe('mall');

    const wp = await geocodeLocation(intent.waypointRaws[0], []);
    const dest = await geocodeLocation(intent.destinationRaw!, []);
    expect(wp?.title).toBe('Gara Timișoara Nord');
    expect(dest?.title).toBe('Iulius Town Timișoara');
  });

  it('parsează plecare explicită, opriri multiple și mod de transport (cycling)', async () => {
    const intent = parseNavigationIntent('de la UVT la gara si apoi la mall sagului cu bicicleta');
    expect(intent.isNavigation).toBe(true);
    expect(intent.originRaw).toBe('UVT');
    expect(intent.waypointRaws).toEqual(['gara']);
    expect(intent.destinationRaw).toBe('mall sagului');
    expect(intent.mode).toBe('cycling');

    const origin = await geocodeLocation(intent.originRaw!, []);
    const wp = await geocodeLocation(intent.waypointRaws[0], []);
    const dest = await geocodeLocation(intent.destinationRaw!, []);
    expect(origin?.title).toBe('Universitatea de Vest din Timișoara (UVT)');
    expect(wp?.title).toBe('Gara Timișoara Nord');
    expect(dest?.title).toBe('Shopping City Timișoara');
  });

  it('suportă și sintaxa „cu oprire la ...” cu mai multe puncte intermediare', () => {
    const intent = parseNavigationIntent('vreau să merg la aeroport cu oprire la piața unirii și bastion');
    expect(intent.isNavigation).toBe(true);
    expect(intent.destinationRaw).toBe('aeroport');
    expect(intent.waypointRaws).toEqual(['piața unirii', 'bastion']);
  });

  it('nu confundă întrebările non-navigaționale cu o rută', () => {
    const intent = parseNavigationIntent('Când a fost construit Domul Romano-Catolic?');
    expect(intent.isNavigation).toBe(false);
    expect(intent.waypointRaws).toEqual([]);
  });
});
