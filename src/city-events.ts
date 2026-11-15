import { useEffect, useState } from 'react';
import {
  filterAndSortActiveCityEvents,
  type OfficialCityEvent,
} from './city-events-utils';

export {
  compareCityEventsByDate,
  filterAndSortActiveCityEvents,
  formatCityEventDate,
  getBucharestDateKey,
  getCityEventEndDateKey,
  isCityEventExpired,
  type CityEventSortMode,
  type OfficialCityEvent,
} from './city-events-utils';

export const cityEventsPath = '/api/city-events';

export type CityEventsState = {
  events: OfficialCityEvent[];
  loading: boolean;
  error?: string;
  fetchedAt?: string;
};

export function useCityEvents(enabled: boolean): CityEventsState {
  const [state, setState] = useState<CityEventsState>({
    events: [],
    loading: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();

    async function load() {
      setState(prev => ({ ...prev, loading: prev.events.length === 0 }));
      try {
        const response = await fetch(cityEventsPath, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as {
          events?: OfficialCityEvent[];
          fetchedAt?: string;
        };
        if (!active) return;
        setState({
          events: Array.isArray(data.events) ? filterAndSortActiveCityEvents(data.events) : [],
          loading: false,
          fetchedAt: data.fetchedAt,
        });
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Evenimentele oficiale nu au putut fi încărcate.',
        }));
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled]);

  return state;
}
