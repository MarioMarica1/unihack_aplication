import { useEffect, useMemo, useState } from 'react';
import { municipalReportRanges, municipalReportsArchiveMs, municipalReportsPath, municipalReportsPollMs } from './municipal-reports';
import type { MunicipalReport } from './municipal-reports';

type Snapshot = { reports: MunicipalReport[]; fetchedAt: string };
type Feed = { recent?: Snapshot; archive?: Record<string, Snapshot>; archiveLoading: boolean; recentError: boolean; archiveError: boolean };
type Range = { start: string; end: string };

async function fetchRange(range: Range, signal: AbortSignal): Promise<Snapshot> {
  const params = new URLSearchParams(range);
  const response = await fetch(`${municipalReportsPath}?${params}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  });
  if (!response.ok) throw new Error('Sursa Primăriei este indisponibilă');
  const snapshot: Snapshot = await response.json();
  if (!Array.isArray(snapshot.reports) || !Number.isFinite(Date.parse(snapshot.fetchedAt))) {
    throw new Error('Răspuns invalid de la sursa Primăriei');
  }
  return snapshot;
}

export function useMunicipalReports(enabled: boolean) {
  const [feed, setFeed] = useState<Feed>({ archiveLoading: true, recentError: false, archiveError: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    let recentTimer: ReturnType<typeof setTimeout>;
    let archiveTimer: ReturnType<typeof setTimeout>;
    async function refreshRecent() {
      try {
        const recent = await fetchRange(municipalReportRanges().recent, signal);
        if (!signal.aborted) setFeed(state => ({ ...state, recent, recentError: false }));
      } catch {
        if (!signal.aborted) setFeed(state => ({ ...state, recentError: true }));
      } finally {
        if (!signal.aborted) recentTimer = setTimeout(() => void refreshRecent(), municipalReportsPollMs);
      }
    }
    async function refreshArchive() {
      const pending = municipalReportRanges().archive;
      const snapshots: Record<string, Snapshot> = {};
      const missing: string[] = [];
      setFeed(state => ({ ...state, archiveLoading: true }));
      for (let i = 0; i < pending.length && !signal.aborted; i += 3) {
        const batch = pending.slice(i, i + 3);
        const results = await Promise.allSettled(batch.map(range => fetchRange(range, signal)));
        results.forEach((result, index) => {
          const { start, end } = batch[index];
          const key = `${start}/${end}`;
          if (result.status === 'fulfilled') snapshots[key] = result.value;
          else missing.push(key);
        });
      }
      if (signal.aborted) return;
      const failed = missing.length > 0;
      setFeed(state => ({
        ...state,
        archive: { ...Object.fromEntries(missing.flatMap(key => state.archive?.[key] ? [[key, state.archive[key]]] : [])), ...snapshots },
        archiveLoading: false,
        archiveError: failed,
      }));
      archiveTimer = setTimeout(() => void refreshArchive(), failed ? municipalReportsPollMs : municipalReportsArchiveMs);
    }
    void refreshRecent();
    void refreshArchive();
    return () => { controller.abort(); clearTimeout(recentTimer); clearTimeout(archiveTimer); };
  }, [enabled, attempt]);

  const reports = useMemo(() => {
    const byNumber = new Map<string, MunicipalReport>();
    for (const snapshot of [...Object.values(feed.archive ?? {}), feed.recent]) {
      for (const report of snapshot?.reports ?? []) byNumber.set(report.number, report);
    }
    return [...byNumber.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [feed.archive, feed.recent]);

  return { ...feed, reports, retry: () => setAttempt(value => value + 1) };
}
