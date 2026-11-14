import { useState } from 'react';
import { municipalReportsPortal, municipalReportUrl, municipalStatuses } from './municipal-reports';
import type { MunicipalStatus } from './municipal-reports';
import type { useMunicipalReports } from './useMunicipalReports';

const pageSize = 10;

export default function MunicipalReportsPanel({ feed }: { feed: ReturnType<typeof useMunicipalReports> }) {
  const [status, setStatus] = useState<MunicipalStatus | ''>('');
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const matching = feed.reports.filter(report => (!status || report.status === status)
    && report.number.includes(query.trim().toUpperCase()));
  const lastPage = Math.max(0, Math.ceil(matching.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);

  return <>
    {!feed.recent && !feed.recentError && <p className="layer-status" role="status">Se încarcă sesizările recente…</p>}
    {feed.archiveLoading && !feed.archive && <p className="layer-status" role="status">Se încarcă istoricul…</p>}
    {(feed.recentError || feed.archiveError) && <div className="form-error" role="status">
      Actualizarea {feed.recentError && feed.archiveError ? 'sesizărilor' : feed.recentError ? 'sesizărilor recente' : 'istoricului'} a eșuat. <button type="button" onClick={feed.retry}>Reîncearcă</button>
    </div>}
    {(feed.recent || feed.archive) && <>
      <p className="layer-status">{feed.reports.length.toLocaleString('ro-RO')} sesizări încărcate.
        {feed.recent && <> Ultima verificare a sesizărilor recente: {new Date(feed.recent.fetchedAt).toLocaleTimeString('ro-RO')}.</>}
      </p>
      <details className="data-notes">
        <summary>Vezi lista sesizărilor</summary>
        <div className="municipal-reports-list">
          <label className="field">Stadiu
            <select value={status} onChange={event => { setStatus(event.target.value as MunicipalStatus | ''); setPage(0); }}>
              <option value="">Toate</option>
              <option value="Inregistrata">Depusă</option>
              <option value="In lucru">În lucru</option>
            </select>
          </label>
          <label className="field">Număr sesizare
            <input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
          </label>
          {matching.length ? <ul>{matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(report => <li key={report.number}>
            <a href={municipalReportUrl(report.number)} target="_blank" rel="noreferrer">{report.number}</a>
            <span>{municipalStatuses[report.status].label}{report.category && ` · ${report.category}`}</span>
          </li>)}</ul> : <p>Nu sunt sesizări pentru acest filtru.</p>}
          {lastPage > 0 && <div className="municipal-reports-pages">
            <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Înapoi</button>
            <span>{currentPage + 1} / {lastPage + 1}</span>
            <button type="button" className="secondary" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Înainte</button>
          </div>}
        </div>
      </details>
    </>}
    <div className="active-layer-legend" aria-label="Legendă sesizări Primărie">
      {Object.values(municipalStatuses).map(({ label, color }) => <span key={label}><i style={{ background: color }} />{label}</span>)}
      <small>Recente: la 1 minut. Istoric: la 1 oră. <a href={municipalReportsPortal} target="_blank" rel="noreferrer">Portalul Primăriei</a></small>
    </div>
  </>;
}
