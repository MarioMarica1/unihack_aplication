import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Construction,
  ExternalLink,
  MapPin,
  Newspaper,
  Radio,
  Search,
  TrafficCone,
  X,
} from 'lucide-react';
import { dateLabel } from './domain';
import type { Pin } from './domain';
import type { MunicipalReport } from './municipal-reports';
import { municipalReportUrl, municipalStatuses } from './municipal-reports';
import type { LiveAlert } from './stpt-live';

export type TemporalWindow = 'daily' | 'weekly' | 'monthly';

type NewsCategory = 'all' | 'stpt' | 'traffic' | 'works' | 'lighting';

type Props = {
  temporalWindow: TemporalWindow;
  onChangeTemporalWindow: (window: TemporalWindow) => void;
  stptAlerts: LiveAlert[];
  municipalReports: MunicipalReport[];
  citizenReports: Pin[];
  selectedMunicipalNumber: string;
  selectedPinId: string;
  onSelectMunicipal: (number: string) => void;
  onSelectPin: (id: string) => void;
  onOpenTransport: () => void;
};

const temporalLimitsMs: Record<TemporalWindow, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function classifyNewsCategory(text: string, category: string): NewsCategory {
  const hay = `${category} ${text}`.toLocaleLowerCase('ro');
  if (/șantier|santier|lucrări|lucrari|săpătur|sapatur|construc|asfalt|bordur/.test(hay)) return 'works';
  if (/iluminat|semafor|semnalizare|indicator|stâlp|stalp|cabl/.test(hay)) return 'lighting';
  if (/strad|carosabil|trafic|blocat|închis|inchis|deviere|circulaț|circulat|pod|pasaj|trotuar|grop/.test(hay)) return 'traffic';
  return 'traffic';
}

export function NewsFeedPanel({
  temporalWindow,
  onChangeTemporalWindow,
  stptAlerts,
  municipalReports,
  citizenReports,
  selectedMunicipalNumber,
  selectedPinId,
  onSelectMunicipal,
  onSelectPin,
  onOpenTransport,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory>('all');
  const [query, setQuery] = useState('');

  const now = Date.now();
  const maxAgeMs = temporalLimitsMs[temporalWindow];

  const feedItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ro');
    const items: Array<
      | {
          kind: 'stpt-alert';
          id: string;
          title: string;
          description: string;
          category: NewsCategory;
          badge: string;
          timestampMs: number;
        }
      | {
          kind: 'municipal';
          id: string;
          report: MunicipalReport;
          category: NewsCategory;
          timestampMs: number;
        }
      | {
          kind: 'citizen';
          id: string;
          pin: Pin;
          category: NewsCategory;
          timestampMs: number;
        }
    > = [];

    // 1. Live STPT Traffic & Diversion Announcements
    for (const alert of stptAlerts) {
      if (categoryFilter !== 'all' && categoryFilter !== 'stpt') continue;
      if (q && !`${alert.header} ${alert.description}`.toLocaleLowerCase('ro').includes(q)) continue;
      items.push({
        kind: 'stpt-alert',
        id: `stpt-${alert.id}`,
        title: alert.header,
        description: alert.description,
        category: 'stpt',
        badge: 'STPT Devieri & Trafic',
        timestampMs: now,
      });
    }

    // 2. Official Municipal Infrastructure, Traffic, Street Closures & Works Announcements
    for (const report of municipalReports) {
      const createdMs = Date.parse(report.createdAt);
      if (!Number.isFinite(createdMs) || now - createdMs > maxAgeMs) continue;
      const cat = classifyNewsCategory(
        `${report.title} ${report.description ?? ''}`,
        report.category,
      );
      if (categoryFilter !== 'all' && categoryFilter !== cat) continue;
      if (q) {
        const hay = `${report.number} ${report.title} ${report.category} ${report.description ?? ''}`.toLocaleLowerCase('ro');
        if (!hay.includes(q)) continue;
      }
      items.push({
        kind: 'municipal',
        id: `pmt-${report.number}`,
        report,
        category: cat,
        timestampMs: createdMs,
      });
    }

    // 3. Real Citizen Traffic & Infrastructure Reports
    for (const pin of citizenReports) {
      const createdMs = Date.parse(pin.createdAt);
      if (!Number.isFinite(createdMs) || now - createdMs > maxAgeMs) continue;
      const cat = classifyNewsCategory(`${pin.title} ${pin.description}`, pin.category);
      if (categoryFilter !== 'all' && categoryFilter !== cat) continue;
      if (q) {
        const hay = `${pin.title} ${pin.description} ${pin.place} ${pin.category}`.toLocaleLowerCase('ro');
        if (!hay.includes(q)) continue;
      }
      items.push({
        kind: 'citizen',
        id: `pin-${pin.id}`,
        pin,
        category: cat,
        timestampMs: createdMs,
      });
    }

    return items.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [stptAlerts, municipalReports, citizenReports, temporalWindow, maxAgeMs, categoryFilter, query, now]);

  return (
    <div className="news-feed-module">
      <div className="panel-intro">
        <div className="module-header-row">
          <div>
            <span className="module-eyebrow">FLUX URBAN ÎN TIMP REAL</span>
            <h1>Noutăți & Alerte Trafic</h1>
          </div>
          <span className="live-pill">
            <span className="pulse-dot" />
            {feedItems.length} evenimente
          </span>
        </div>
        <p>
          Flux integrat cu anunțuri oficiale STPT (devieri de traseu), străzi închise, șantiere în lucru și alerte rutiere din Timișoara.
        </p>
      </div>

      {/* Temporal Filter System: Zilnic, Săptămânal, Lunar */}
      <div className="temporal-filter-bar" role="group" aria-label="Filtrare temporală Noutăți">
        <button
          type="button"
          className={temporalWindow === 'daily' ? 'active' : ''}
          onClick={() => onChangeTemporalWindow('daily')}
        >
          <Clock size={14} />
          <span>Zilnic (24h)</span>
        </button>
        <button
          type="button"
          className={temporalWindow === 'weekly' ? 'active' : ''}
          onClick={() => onChangeTemporalWindow('weekly')}
        >
          <Calendar size={14} />
          <span>Săptămânal (7z)</span>
        </button>
        <button
          type="button"
          className={temporalWindow === 'monthly' ? 'active' : ''}
          onClick={() => onChangeTemporalWindow('monthly')}
        >
          <Calendar size={14} />
          <span>Lunar (30z)</span>
        </button>
      </div>

      {/* Search Box */}
      <div className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Caută stradă, linie deviată, șantier sau anunț…"
          aria-label="Caută în fluxul de noutăți"
        />
        {query && (
          <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Șterge căutarea">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="place-category-pills">
        <button
          type="button"
          className={categoryFilter === 'all' ? 'active' : ''}
          onClick={() => setCategoryFilter('all')}
        >
          Toate ({feedItems.length})
        </button>
        <button
          type="button"
          className={categoryFilter === 'stpt' ? 'active' : ''}
          onClick={() => setCategoryFilter('stpt')}
        >
          Devieri STPT ({stptAlerts.length})
        </button>
        <button
          type="button"
          className={categoryFilter === 'traffic' ? 'active' : ''}
          onClick={() => setCategoryFilter('traffic')}
        >
          Trafic & Străzi
        </button>
        <button
          type="button"
          className={categoryFilter === 'works' ? 'active' : ''}
          onClick={() => setCategoryFilter('works')}
        >
          Lucrări & Șantiere
        </button>
        <button
          type="button"
          className={categoryFilter === 'lighting' ? 'active' : ''}
          onClick={() => setCategoryFilter('lighting')}
        >
          Semafoare & Iluminat
        </button>
      </div>

      {/* News Feed Stream */}
      <div className="pin-list news-stream-list" role="region" aria-label="Flux de noutăți și alerte">
        {feedItems.slice(0, 80).map(item => {
          if (item.kind === 'stpt-alert') {
            return (
              <article className="pin-card news-card stpt-news-card" key={item.id}>
                <div className="card-main">
                  <div className="card-top">
                    <span className="official-badge stpt-alert-badge">
                      <Radio size={12} /> {item.badge}
                    </span>
                    <span className="status-badge in-progress">Activ azi</span>
                  </div>
                  <h3>{item.title}</h3>
                  {item.description && <p className="card-description">{item.description}</p>}
                  <div className="news-card-actions">
                    <button type="button" className="secondary compact-btn" onClick={onOpenTransport}>
                      Vezi pe harta Transport
                    </button>
                  </div>
                </div>
              </article>
            );
          }

          if (item.kind === 'municipal') {
            const r = item.report;
            const isSelected = selectedMunicipalNumber === r.number;
            return (
              <article
                className={`pin-card municipal-card ${isSelected ? 'is-selected' : ''}`}
                key={item.id}
              >
                <button
                  type="button"
                  className="card-main"
                  onClick={() => onSelectMunicipal(r.number)}
                >
                  <div className="card-top">
                    <span className="type-label report">
                      {item.category === 'works' ? <Construction size={12} /> : <TrafficCone size={12} />}
                      Anunț / Intervenție PMT
                    </span>
                    <span className={`status-badge ${r.status === 'Finalizata' ? 'resolved' : 'in-progress'}`}>
                      {municipalStatuses[r.status].label}
                    </span>
                  </div>
                  <h3>{r.title}</h3>
                  {r.description && <p className="card-description">{r.description}</p>}
                  <span className="place">
                    <MapPin size={12} />
                    {r.category} · {r.number} · {dateLabel(r.createdAt)}
                  </span>
                </button>
                <div className="card-footer">
                  <a
                    className="action-link"
                    href={municipalReportUrl(r.number)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: 'auto', padding: 0 }}
                  >
                    Portal Primărie <ExternalLink size={12} />
                  </a>
                </div>
              </article>
            );
          }

          const p = item.pin;
          const isSelected = selectedPinId === p.id;
          return (
            <article className={`pin-card ${isSelected ? 'is-selected' : ''}`} key={item.id}>
              <button type="button" className="card-main" onClick={() => onSelectPin(p.id)}>
                <div className="card-top">
                  <span className="type-label report">
                    <AlertTriangle size={12} /> Alertă Trafic Cetățean
                  </span>
                  <span className="category-chip">{p.category}</span>
                </div>
                <h3>{p.title}</h3>
                <p className="card-description">{p.description}</p>
                <span className="place">
                  <MapPin size={12} /> {p.place} · {dateLabel(p.createdAt)}
                </span>
              </button>
            </article>
          );
        })}

        {feedItems.length === 0 && (
          <div className="empty-state">
            <Newspaper size={28} />
            <h3>Nicio alertă în intervalul selectat</h3>
            <p>
              Comută filtrul temporal pe „Săptămânal (7z)” sau „Lunar (30z)” pentru a vedea mai multe anunțuri și intervenții.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
