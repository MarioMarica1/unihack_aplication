import type { Map as MapLibreMap } from 'maplibre-gl';
type StyleMap = Pick<MapLibreMap, 'getStyle' | 'getLayer' | 'setLayoutProperty' | 'setPaintProperty' | 'setLayerZoomRange'>;
export function isBasePlaceLayer(layer: ReturnType<StyleMap['getStyle']>['layers'][number]) {
  return layer.type === 'symbol' && ('source-layer' in layer && layer['source-layer'] === 'poi' || layer.id.startsWith('poi_'));
}

export function applyBaseStyle(map: StyleMap, options: { buildings: boolean; places: boolean; dark?: boolean }) {
  for (const layer of map.getStyle().layers) {
    if (/^(osm-|route-|mobility-|stpt-)/.test(layer.id)) continue;
    if (options.dark) {
      const id = layer.id;
      if (layer.type === 'background') map.setPaintProperty(id, 'background-color', '#242f3e');
      if (id === 'water' || id === 'waterway' || id === 'water_name') {
        if (layer.type === 'fill') map.setPaintProperty(id, 'fill-color', '#0e1626');
        if (layer.type === 'line') map.setPaintProperty(id, 'line-color', '#17263c');
        if (layer.type === 'symbol') { map.setPaintProperty(id, 'text-color', '#9eb2c9'); map.setPaintProperty(id, 'text-halo-color', '#0e1626'); }
      }
      if (id === 'landcover_wood' || id === 'landuse_park' || /landcover_(grass|forest)/.test(id)) {
        if (layer.type === 'fill') { map.setPaintProperty(id, 'fill-color', '#1b3329'); map.setPaintProperty(id, 'fill-opacity', 0.9); }
      }
      if (id === 'landuse_residential') map.setPaintProperty(id, 'fill-color', '#293544');
      if (id === 'highway_minor' || id === 'highway_path') map.setPaintProperty(id, 'line-color', '#38414e');
      if (id === 'highway_major_casing') map.setPaintProperty(id, 'line-color', '#1f2835');
      if (id === 'highway_major_inner') map.setPaintProperty(id, 'line-color', ['match', ['get', 'class'], 'trunk', '#5c6f84', '#526478']);
      if (id === 'highway_major_subtle') map.setPaintProperty(id, 'line-color', '#526478');
      if (id === 'highway_motorway_casing') map.setPaintProperty(id, 'line-color', '#1f2835');
      if (id === 'highway_motorway_inner' || id === 'highway_motorway_subtle') map.setPaintProperty(id, 'line-color', '#5c6f84');
      if (id === 'road_area_pier') map.setPaintProperty(id, 'fill-color', '#38414e');
      if (id === 'road_pier') map.setPaintProperty(id, 'line-color', '#526478');
      if (/^railway/.test(id)) map.setPaintProperty(id, 'line-color', id.includes('dashline') ? '#2b3848' : '#46566a');
      if (id.startsWith('aeroway-') && layer.type === 'line') map.setPaintProperty(id, 'line-color', id.includes('casing') ? '#1f2835' : '#526478');
      if (id === 'aeroway-area' && layer.type === 'fill') map.setPaintProperty(id, 'fill-color', '#38414e');
    }
    if (/building|housenumber/.test(layer.id) || ('source-layer' in layer && ['building', 'housenumber'].includes(layer['source-layer'] ?? ''))) {
      map.setLayoutProperty(layer.id, 'visibility', options.buildings && layer.type !== 'fill-extrusion' ? 'visible' : 'none');
      if (layer.type === 'fill') {
        // Liberty's building fill stops at z14; extending it is required when 3D is disabled.
        map.setLayerZoomRange(layer.id, 13, 24);
        map.setPaintProperty(layer.id, 'fill-color', options.dark ? '#2b3646' : '#e8ded2');
        map.setPaintProperty(layer.id, 'fill-outline-color', options.dark ? '#202936' : '#cfbfad');
        if (options.dark) map.setPaintProperty(layer.id, 'fill-opacity', 0.72);
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
