import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { ApiError } from '@/lib/api';

/**
 * Loads data for a screen.
 *
 * Deliberately small — no cache, no dedupe. Every screen in this app reads
 * numbers that must be current, and a stale-while-revalidate cache showing
 * yesterday's balance while today's loads is the wrong trade for a ledger.
 *
 * Pass a `useCallback`-wrapped fetcher: the hook reloads whenever that identity
 * changes, which is how filters drive a refetch.
 */
export interface QueryState<T> {
  data: T | null;
  error: string | null;
  /** First load only, so a refresh does not blank out the screen. */
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  reload: () => void;
}

export function useQuery<T>(fetcher: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Distinguishes the first load, which shows a spinner, from every reload
  // after it, which must not blank out data the user is already reading.
  const loaded = useRef(false);

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      try {
        const result = await fetcher();
        setData(result);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : 'Something went wrong loading this screen.'
        );
      } finally {
        loaded.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetcher]
  );

  /**
   * The only trigger. It fires on mount, whenever the fetcher changes, and
   * whenever the screen comes back into view — recording an income elsewhere
   * changes the dashboard, the lists and every report, so rather than have each
   * writer know who to notify, each reader re-reads when the user looks at it.
   */
  useFocusEffect(
    useCallback(() => {
      void run(loaded.current ? 'refresh' : 'initial');
    }, [run])
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => void run('refresh'),
    reload: () => void run('initial'),
  };
}
