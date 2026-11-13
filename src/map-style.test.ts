import { describe, expect, it } from 'vitest';
import { applyBaseStyle } from './map-style';

function fixture() {
  // Actual Liberty split: fill maxzoom=14, extrusion minzoom=14.
  const layers = [
    { id: 'building', type: 'fill', minzoom: 13, maxzoom: 14, layout: {} as Record<string, unknown>, paint: {} as Record<string, unknown> },
    { id: 'building-3d', type: 'fill-extrusion', minzoom: 14, maxzoom: 24, layout: {} as Record<string, unknown>, paint: {} as Record<string, unknown> },
    { id: 'poi_r1', type: 'symbol', minzoom: 15, maxzoom: 24, layout: {} as Record<string, unknown>, paint: {} as Record<string, unknown> },
    { id: 'osm-cycleways-solid', type: 'line', minzoom: 0, maxzoom: 24, layout: { visibility: 'visible' } as Record<string, unknown>, paint: {} as Record<string, unknown> },
  ];
  const map = { getStyle: () => ({ layers }), getLayer: (id: string) => layers.find(layer => layer.id === id), setLayoutProperty: (id: string, key: string, value: unknown) => { layers.find(layer => layer.id === id)!.layout[key] = value; }, setPaintProperty: (id: string, key: string, value: unknown) => { layers.find(layer => layer.id === id)!.paint[key] = value; }, setLayerZoomRange: (id: string, min: number, max: number) => { Object.assign(layers.find(layer => layer.id === id)!, { minzoom: min, maxzoom: max }); } };
  return { layers, map: map as unknown as Parameters<typeof applyBaseStyle>[0] };
}
describe('Regresie clădiri și straturi de bază', () => {
  it('păstrează contururile 2D la zoom 15–20 atunci când extrudarea este oprită', () => {
    const { map, layers } = fixture(); applyBaseStyle(map, { buildings: true, places: true });
    const fill = layers[0];
    for (const zoom of [15,17,20]) expect(fill.layout.visibility === 'visible' && fill.minzoom <= zoom && fill.maxzoom > zoom).toBe(true);
    expect(layers[1].layout.visibility).toBe('none');
  });
  it('oprește clădirile separat de locuri și infrastructură', () => {
    const { map, layers } = fixture(); applyBaseStyle(map, { buildings: false, places: true });
    expect(layers[0].layout.visibility).toBe('none'); expect(layers[2].layout.visibility).toBe('visible'); expect(layers[3].layout.visibility).toBe('visible');
  });
  it('oprește denumirile POI separat de clădiri', () => {
    const { map, layers } = fixture(); applyBaseStyle(map, { buildings: true, places: false });
    expect(layers[0].layout.visibility).toBe('visible'); expect(layers[2].layout.visibility).toBe('none');
  });
});
