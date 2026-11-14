import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { municipalStatuses } from './municipal-reports';
import type { MunicipalReport } from './municipal-reports';

const sourceId = 'municipal-reports';
const clusterId = 'municipal-report-clusters';
const pointId = 'municipal-report-points';

export function showMunicipalReports(map: Map, reports: MunicipalReport[]) {
  const data: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: reports.flatMap(report => report.coordinates ? [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: report.coordinates },
      properties: { number: report.number, color: municipalStatuses[report.status].color },
    }] : []),
  };
  const source = map.getSource<GeoJSONSource>(sourceId);
  if (source) { void source.setData(data); return; }
  if (!data.features.length) return;
  map.addSource(sourceId, { type: 'geojson', data, cluster: true, clusterRadius: 40, clusterMaxZoom: 17 });
  map.addLayer({
    id: clusterId, type: 'circle', source: sourceId, filter: ['has', 'point_count'],
    paint: { 'circle-color': '#554593', 'circle-radius': 17, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
  });
  map.addLayer({
    id: 'municipal-report-cluster-count', type: 'symbol', source: sourceId, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: pointId, type: 'circle', source: sourceId, filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
  });
}

export function municipalFeatureAt(map: Map, point: MapMouseEvent['point']) {
  const layers = [pointId, clusterId].filter(id => map.getLayer(id));
  return layers.length ? map.queryRenderedFeatures(point, { layers })[0] : undefined;
}

export function openMunicipalFeature(map: Map, feature: NonNullable<ReturnType<typeof municipalFeatureAt>>, select: (number: string) => void) {
  if (feature.geometry.type !== 'Point') return;
  const [lon, lat] = feature.geometry.coordinates;
  if (feature.layer.id === clusterId) {
    const source = map.getSource<GeoJSONSource>(sourceId);
    void source?.getClusterExpansionZoom(feature.properties.cluster_id).then(zoom => {
      if (map.getSource(sourceId) === source) map.easeTo({ center: [lon, lat], zoom });
    }).catch(() => undefined);
    return;
  }
  if (typeof feature.properties.number === 'string') select(feature.properties.number);
}
