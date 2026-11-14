import type { Map as MapLibreMap } from 'maplibre-gl';
type StyleMap = Pick<MapLibreMap, 'getStyle' | 'getLayer' | 'setLayoutProperty' | 'setPaintProperty' | 'setLayerZoomRange'>;
export function isBasePlaceLayer(layer: ReturnType<StyleMap['getStyle']>['layers'][number]) {
  return layer.type === 'symbol' && ('source-layer' in layer && layer['source-layer'] === 'poi' || layer.id.startsWith('poi_'));
}

export function applyBaseStyle(map: StyleMap, options: { buildings: boolean; places: boolean; dark?: boolean }) {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('osm-') || layer.id.startsWith('route-')) continue;
    if (/building|housenumber/.test(layer.id) || ('source-layer' in layer && ['building', 'housenumber'].includes(layer['source-layer'] ?? ''))) {
      map.setLayoutProperty(layer.id, 'visibility', options.buildings && layer.type !== 'fill-extrusion' ? 'visible' : 'none');
      if (layer.type === 'fill') {
        // Liberty's building fill stops at z14; extending it is required when 3D is disabled.
        map.setLayerZoomRange(layer.id, 13, 24);
        map.setPaintProperty(layer.id, 'fill-color', options.dark ? '#262f3a' : '#e8ded2');
        map.setPaintProperty(layer.id, 'fill-outline-color', options.dark ? '#35414e' : '#cfbfad');
      }
    }
    if (isBasePlaceLayer(layer)) {
      map.setLayoutProperty(layer.id, 'visibility', options.places ? 'visible' : 'none');
      map.setLayoutProperty(layer.id, 'text-font', ['Noto Sans Regular']);
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get','name:ro'], ['get','name'], ['get','name:latin'], ['get','name_en']]);
      map.setPaintProperty(layer.id, 'text-color', options.dark ? '#d1deed' : '#4c5969');
      if (options.dark) map.setPaintProperty(layer.id, 'text-halo-color', '#151c27');
      map.setPaintProperty(layer.id, 'text-halo-width', 1.4);
    } else if (options.dark && layer.type === 'symbol' && layer.layout?.['text-field']) {
      map.setPaintProperty(layer.id, 'text-color', '#afbed0');
      map.setPaintProperty(layer.id, 'text-halo-color', '#151c27');
      map.setPaintProperty(layer.id, 'text-halo-width', 1);
    }
  }
  if (map.getLayer('building-addresses')) map.setLayoutProperty('building-addresses', 'visibility', options.buildings ? 'visible' : 'none');
}
