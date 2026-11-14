import { Popup } from 'maplibre-gl';
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { municipalReportUrl, municipalStatuses } from './municipal-reports';
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

export function openMunicipalFeature(map: Map, feature: NonNullable<ReturnType<typeof municipalFeatureAt>>, reports: MunicipalReport[], dark: boolean) {
  if (feature.geometry.type !== 'Point') return;
  const [lon, lat] = feature.geometry.coordinates;
  if (feature.layer.id === clusterId) {
    const source = map.getSource<GeoJSONSource>(sourceId);
    void source?.getClusterExpansionZoom(feature.properties.cluster_id).then(zoom => {
      if (map.getSource(sourceId) === source) map.easeTo({ center: [lon, lat], zoom });
    }).catch(() => undefined);
    return;
  }
  const report = reports.find(report => report.number === feature.properties.number);
  if (!report) return;
  const content = document.createElement('div');
  content.className = 'municipal-report-popup';
  const title = document.createElement('strong');
  title.textContent = 'Sesizare Primăria Timișoara';
  const details = document.createElement('p');
  details.textContent = [municipalStatuses[report.status].label, report.category,
    new Date(report.createdAt).toLocaleDateString('ro-RO')].filter(Boolean).join(' · ');
  const link = document.createElement('a');
  link.href = municipalReportUrl(report.number);
  link.textContent = report.number;
  link.target = '_blank';
  link.rel = 'noreferrer';
  content.append(title, details, link);
  return new Popup({ className: dark ? 'municipal-popup-dark' : undefined, maxWidth: '260px' })
    .setLngLat([lon, lat]).setDOMContent(content).addTo(map);
}
