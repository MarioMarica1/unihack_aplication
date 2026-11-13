import type { Map as MapLibreMap } from 'maplibre-gl';
type StyleMap = Pick<MapLibreMap, 'getStyle' | 'getLayer' | 'setLayoutProperty' | 'setPaintProperty' | 'setLayerZoomRange'>;
export function applyBaseStyle(map: StyleMap, options: { buildings: boolean; places: boolean }) {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('osm-') || layer.id.startsWith('route-')) continue;
    if (/building/.test(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', options.buildings && layer.type !== 'fill-extrusion' ? 'visible' : 'none');
      if (layer.type === 'fill') {
        // Liberty's building fill stops at z14; extending it is required when 3D is disabled.
        map.setLayerZoomRange(layer.id, 13, 24);
        map.setPaintProperty(layer.id, 'fill-color', '#e8ded2');
        map.setPaintProperty(layer.id, 'fill-outline-color', '#cfbfad');
      }
    }
    if (layer.id.startsWith('poi_')) {
      map.setLayoutProperty(layer.id, 'visibility', options.places ? 'visible' : 'none');
      map.setLayoutProperty(layer.id, 'text-font', ['Noto Sans Regular']);
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get','name:ro'], ['get','name'], ['get','name:latin'], ['get','name_en']]);
      map.setPaintProperty(layer.id, 'text-color', '#4c5969');
      map.setPaintProperty(layer.id, 'text-halo-width', 1.4);
    }
  }
  if (map.getLayer('building-addresses')) map.setLayoutProperty('building-addresses', 'visibility', options.buildings ? 'visible' : 'none');
}
