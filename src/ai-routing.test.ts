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

  it('parsează formularea colocvială „duma de la gara la iulius mall dupa la upt”', async () => {
    const intent = parseNavigationIntent('duma de la gara la iulius mall dupa la upt');
    expect(intent.isNavigation).toBe(true);
    expect(intent.originRaw).toBe('gara');
    expect(intent.waypointRaws).toEqual(['iulius mall']);
    expect(intent.destinationRaw).toBe('upt');

    const origin = await geocodeLocation(intent.originRaw!, []);
    const wp = await geocodeLocation(intent.waypointRaws[0], []);
    const dest = await geocodeLocation(intent.destinationRaw!, []);
    expect(origin?.title).toBe('Gara Timișoara Nord');
    expect(wp?.title).toBe('Iulius Town Timișoara');
    expect(dest?.title).toBe('Universitatea Politehnica Timișoara (UPT)');
  });

  it('parsează „duma la gara dupa la mall” fără punct de plecare explicit', async () => {
    const intent = parseNavigationIntent('duma la gara dupa la mall');
    expect(intent.isNavigation).toBe(true);
    expect(intent.originRaw).toBeUndefined();
    expect(intent.waypointRaws).toEqual(['gara']);
    expect(intent.destinationRaw).toBe('mall');

    const wp = await geocodeLocation(intent.waypointRaws[0], []);
    const dest = await geocodeLocation(intent.destinationRaw!, []);
    expect(wp?.title).toBe('Gara Timișoara Nord');
    expect(dest?.title).toBe('Iulius Town Timișoara');
  });

  it('parsează rutele cu „de la X prin W la Y” în opriri intermediare', async () => {
    const intent = parseNavigationIntent('de la aeroport prin piata unirii la bastion');
    expect(intent.isNavigation).toBe(true);
    expect(intent.originRaw).toBe('aeroport');
    expect(intent.waypointRaws).toEqual(['piata unirii']);
    expect(intent.destinationRaw).toBe('bastion');

    const origin = await geocodeLocation(intent.originRaw!, []);
    const wp = await geocodeLocation(intent.waypointRaws[0], []);
    const dest = await geocodeLocation(intent.destinationRaw!, []);
    expect(origin?.title).toContain('Aeroport');
    expect(wp?.title).toBe('Piața Unirii, Timișoara');
    expect(dest?.title).toContain('Bastion');
  });

  it('nu confundă întrebările non-navigaționale cu o rută', () => {
    const intent = parseNavigationIntent('Când a fost construit Domul Romano-Catolic?');
    expect(intent.isNavigation).toBe(false);
    expect(intent.waypointRaws).toEqual([]);
  });
});
