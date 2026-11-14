import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Camera, ExternalLink, Globe, Image as ImageIcon } from 'lucide-react';
import { fetchPlacePhotos, getCachedPlacePhotos, getSatelliteTilePreview } from './place-photos';
import type { PlacePhoto } from './place-photos';
import type { MunicipalReport, MunicipalReportDetail } from './municipal-reports';

type PlaceRef = {
  id: string;
  title: string;
  kind?: string;
  location: { lat: number; lon: number };
};

export function SatelliteLocationPreview({
  lat,
  lon,
  zoom = 18,
  badgeLabel,
  alt,
  compact = false,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  badgeLabel?: string;
  alt: string;
  compact?: boolean;
}) {
  const [tileFailed, setTileFailed] = useState(false);
  const preview = getSatelliteTilePreview(lat, lon, zoom);

  if (tileFailed) {
    return (
      <div className={`satellite-fallback-box ${compact ? 'is-compact' : ''}`}>
        <Globe size={compact ? 18 : 24} />
        {!compact && <span>Previzualizare indisponibilă offline</span>}
      </div>
    );
  }

  return (
    <div className={`satellite-tile-frame ${compact ? 'is-compact' : ''}`}>
      <img
        src={preview.tileUrl}
        alt={alt}
        loading="lazy"
        style={{
          objectPosition: `${preview.fracX.toFixed(1)}% ${preview.fracY.toFixed(1)}%`,
        }}
        onError={() => setTileFailed(true)}
      />
      <span
        className="satellite-pin-dot"
        style={{
          left: `${preview.fracX.toFixed(1)}%`,
          top: `${preview.fracY.toFixed(1)}%`,
        }}
        aria-hidden="true"
      />
      {badgeLabel && <span className="detail-photo-badge">{badgeLabel}</span>}
    </div>
  );
}

export function PlaceCardThumb({ place, icon }: { place: PlaceRef; icon: ReactNode }) {
  const cached = getCachedPlacePhotos(place.id)?.[0];
  const [imgFailed, setImgFailed] = useState(false);

  if (cached && !imgFailed) {
    return (
      <span className="place-card-thumb" aria-hidden="true">
        <img
          src={cached.thumbUrl || cached.url}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
        <span className={`place-card-kind-badge ${place.kind || ''}`}>{icon}</span>
      </span>
    );
  }

  return (
    <span className="place-card-thumb" aria-hidden="true">
      <SatelliteLocationPreview
        lat={place.location.lat}
        lon={place.location.lon}
        zoom={18}
        alt=""
        compact
      />
      <span className={`place-card-kind-badge ${place.kind || ''}`}>{icon}</span>
    </span>
  );
}

export function PlacePhotoHero({ place }: { place: PlaceRef }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>(() => getCachedPlacePhotos(place.id) ?? []);
  const [loading, setLoading] = useState<boolean>(() => !getCachedPlacePhotos(place.id));
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'photo' | 'satellite'>('photo');
  const [brokenUrls, setBrokenUrls] = useState<Record<string, true>>({});

  useEffect(() => {
    const sc = rootRef.current?.closest('.sidebar-content, .detail-scroll');
    if (sc) sc.scrollTop = 0;

    let cancelled = false;
    const cached = getCachedPlacePhotos(place.id);
    setActiveIndex(0);
    setBrokenUrls({});
    if (cached) {
      setPhotos(cached);
      setLoading(false);
      setViewMode(cached.length > 0 ? 'photo' : 'satellite');
      return;
    }

    setPhotos([]);
    setLoading(true);
    setViewMode('photo');
    void fetchPlacePhotos(place).then(resolved => {
      if (cancelled) return;
      setPhotos(resolved);
      setLoading(false);
      if (resolved.length === 0) {
        setViewMode('satellite');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [place.id, place.title, place.location.lat, place.location.lon]);

  const workingPhotos = photos.filter(p => !brokenUrls[p.url]);
  const activePhoto = workingPhotos[activeIndex] ?? workingPhotos[0];
  const showingGroundPhoto = viewMode === 'photo' && Boolean(activePhoto);

  return (
    <div ref={rootRef} className="place-hero-media">
      <div className="place-hero-stage">
        {showingGroundPhoto && activePhoto ? (
          <>
            <img
              src={activePhoto.thumbUrl || activePhoto.url}
              alt={`${place.title} — ${activePhoto.title}`}
              loading="eager"
              onError={() => {
                setBrokenUrls(prev => ({ ...prev, [activePhoto.url]: true }));
              }}
            />
            <span className="detail-photo-badge">
              {activePhoto.source === 'wikimedia'
                ? 'WIKIMEDIA COMMONS'
                : activePhoto.source === 'wikipedia'
                  ? 'WIKIPEDIA'
                  : 'OPENSTREETMAP'}
            </span>
          </>
        ) : (
          <SatelliteLocationPreview
            lat={place.location.lat}
            lon={place.location.lon}
            zoom={18}
            alt={`Ortofotoplan satelit ${place.title}`}
            badgeLabel={loading ? 'SE CAUTĂ FOTO · SATELIT Z18' : 'ORTOFOTOPLAN SATELIT Z18'}
          />
        )}

        <div className="place-media-mode-switch" role="group" aria-label="Mod vizualizare locație">
          {workingPhotos.length > 0 && (
            <button
              type="button"
              className={showingGroundPhoto ? 'active' : ''}
              onClick={() => setViewMode('photo')}
            >
              <Camera size={12} /> Foto ({workingPhotos.length})
            </button>
          )}
          <button
            type="button"
            className={!showingGroundPhoto ? 'active' : ''}
            onClick={() => setViewMode('satellite')}
          >
            <Globe size={12} /> Satelit
          </button>
        </div>
      </div>

      {showingGroundPhoto && workingPhotos.length > 1 && (
        <div className="media-thumb-strip" role="list" aria-label="Galerie fotografii locație">
          {workingPhotos.map((photo, idx) => (
            <button
              key={photo.url}
              type="button"
              className={`media-thumb-btn ${idx === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Fotografia ${idx + 1}: ${photo.title}`}
            >
              <img src={photo.thumbUrl || photo.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="place-hero-caption">
        {showingGroundPhoto && activePhoto ? (
          <>
            <span>{activePhoto.attribution || activePhoto.title}</span>
            {activePhoto.pageUrl && (
              <a href={activePhoto.pageUrl} target="_blank" rel="noreferrer">
                Sursă <ExternalLink size={11} />
              </a>
            )}
          </>
        ) : (
          <span>
            {loading
              ? 'Căutare fotografie publică (OSM / Wikimedia)...'
              : 'Imagine aeriană Esri World Imagery la coordonatele exacte (fără foto Wikimedia/OSM)'}
          </span>
        )}
      </div>
    </div>
  );
}

export function MunicipalReportVisual({
  report,
  detail,
}: {
  report: MunicipalReport;
  detail?: MunicipalReportDetail;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [brokenUrls, setBrokenUrls] = useState<Record<string, true>>({});

  useEffect(() => {
    setActiveIndex(0);
    setBrokenUrls({});
  }, [report.number]);

  const rawPhotos = [
    ...(detail?.photoUrls ?? []),
    ...(report.photoUrls ?? []),
    ...(report.photoUrl ? [report.photoUrl] : []),
  ];
  const uniquePhotos = rawPhotos.filter((url, idx) => Boolean(url) && rawPhotos.indexOf(url) === idx);
  const validPhotos = uniquePhotos.filter(url => !brokenUrls[url]);
  const currentUrl = validPhotos[activeIndex] ?? validPhotos[0];

  if (currentUrl) {
    return (
      <div className="municipal-media-wrap">
        <div className="detail-image">
          <img
            src={currentUrl}
            alt={`${report.title} (${report.number})`}
            loading="eager"
            onError={() => setBrokenUrls(prev => ({ ...prev, [currentUrl]: true }))}
          />
          <span>
            <ImageIcon size={12} /> FOTOGRAFIE OFICIALĂ SESIZARE PMT
            {validPhotos.length > 1 ? ` · ${Math.min(activeIndex + 1, validPhotos.length)}/${validPhotos.length}` : ''}
          </span>
        </div>

        {validPhotos.length > 1 && (
          <div className="media-thumb-strip" role="list" aria-label="Fotografii sesizare">
            {validPhotos.map((url, idx) => (
              <button
                key={url}
                type="button"
                className={`media-thumb-btn ${idx === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Fotografia ${idx + 1} din ${validPhotos.length}`}
              >
                <img src={url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (report.coordinates) {
    const [lon, lat] = report.coordinates;
    return (
      <div className="municipal-media-wrap">
        <div className="detail-image satellite-report-hero">
          <SatelliteLocationPreview
            lat={lat}
            lon={lon}
            zoom={18}
            alt={`Ortofotoplan zonă pentru sesizarea ${report.number}`}
            badgeLabel="VEDERE AERIANĂ ZONĂ · SESIZARE FĂRĂ FOTO ATAȘATĂ"
          />
        </div>
      </div>
    );
  }

  return null;
}
