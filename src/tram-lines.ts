import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from 'geojson';

export const tramColors = {
  '1': '#ef4444', '2': '#3b82f6', '4': '#10b981', '5': '#eab308',
  '6': '#ec4899', '7': '#8b5cf6', '8': '#f97316', '9': '#06b6d4',
};

type TramGeometry = LineString | MultiLineString;
const parts = (geometry: TramGeometry) => geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;

// Match shared segments in either direction, ignoring insignificant coordinate precision.
function segmentKey(start: Position, end: Position) {
  const pointKey = (point: Position) => point.map(value => value.toFixed(6)).join(',');
  return [pointKey(start), pointKey(end)].sort().join(';');
}

export function withTramLabels(data: FeatureCollection<TramGeometry>): FeatureCollection<TramGeometry> {
  const segmentRefs = new Map<string, Set<string>>();
  for (const feature of data.features) {
    const ref = String(feature.properties?.ref || feature.properties?.routeRefs || '').trim();
    if (!ref) continue;
    for (const coordinates of parts(feature.geometry)) {
      for (let i = 1; i < coordinates.length; i++) {
        const key = segmentKey(coordinates[i - 1], coordinates[i]);
        const refs = segmentRefs.get(key) ?? new Set<string>();
        ref.split(/\s*[,;•]\s*/).filter(Boolean).forEach(line => refs.add(line));
        segmentRefs.set(key, refs);
      }
    }
  }

  const labels: Feature<LineString>[] = [];
  const labelledSegments = new Set<string>();
  const features = data.features.map(feature => {
    const ref = String(feature.properties?.ref || feature.properties?.routeRefs || '').trim();
    for (const coordinates of parts(feature.geometry)) {
      let run: Position[] = [];
      let previous = '';
      const flush = () => {
        if (previous && run.length > 1) labels.push({
          type: 'Feature', geometry: { type: 'LineString', coordinates: run },
          properties: { labelOnly: true, lines_label: previous },
        });
      };
      for (let i = 1; i < coordinates.length; i++) {
        const start = coordinates[i - 1], end = coordinates[i];
        const key = segmentKey(start, end);
        const refs = [...(segmentRefs.get(key) ?? [])].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));
        const label = refs.length > 1 ? `Tramvai ${refs.join(' • ')}` : feature.properties?.lines_label || (ref ? `Tramvai ${ref}` : feature.properties?.name || '');
        if (!label || labelledSegments.has(key)) {
          flush(); run = []; previous = '';
          continue;
        }
        labelledSegments.add(key);
        if (label !== previous) { flush(); run = [start]; previous = label; }
        run.push(end);
      }
      flush();
    }
    return { ...feature, properties: { ...feature.properties, ref } };
  });
  return { ...data, features: [...features, ...labels] };
}
