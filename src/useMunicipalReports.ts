import { useEffect, useMemo, useState } from 'react';
import { municipalReportDetailPath, municipalReportsPath, municipalReportsPollMs, municipalReportsWindowMs } from './municipal-reports';
import type { MunicipalReport, MunicipalReportDetail } from './municipal-reports';

type Snapshot = { reports: MunicipalReport[]; allReports?: MunicipalReport[]; fetchedAt: string };

export function useMunicipalReports(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      setNow(Date.now());
      try {
        const response = await fetch(municipalReportsPath, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (!response.ok) throw new Error('Sursa Primăriei este indisponibilă');
        const data: Snapshot = await response.json();
        if (!Array.isArray(data.reports) || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('Răspuns invalid');
        if (!controller.signal.aborted) { setSnapshot(data); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), municipalReportsPollMs);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, attempt]);

  const reports = useMemo(() => (snapshot?.reports ?? []).filter(report =>
    Date.parse(report.createdAt) >= now - municipalReportsWindowMs), [now, snapshot]);
  const allReports = useMemo(() => (snapshot?.allReports ?? snapshot?.reports ?? []).filter(report =>
    Date.parse(report.createdAt) >= now - municipalReportsWindowMs), [now, snapshot]);
  return {
    reports,
    allReports,
    fetchedAt: snapshot?.fetchedAt,
    loading: !snapshot && !error,
    error,
    retry: () => setAttempt(value => value + 1),
  };
}

export function useMunicipalReportDetail(number?: string) {
  const [detail, setDetail] = useState<MunicipalReportDetail>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!number) { setDetail(undefined); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`${municipalReportDetailPath}?number=${encodeURIComponent(number)}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    })
      .then(res => res.ok ? res.json() : undefined)
      .then((data: MunicipalReportDetail | undefined) => {
        if (!controller.signal.aborted && data?.number === number) setDetail(data);
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [number]);

  return { detail, loading };
}
