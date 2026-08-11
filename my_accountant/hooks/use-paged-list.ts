import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { ApiError, type Page } from '@/lib/api';

/**
 * A list that grows a page at a time.
 *
 * Reloading resets to page one rather than re-fetching everything already
 * loaded: the user has just come back from recording a transaction, and what
 * they want to see is the top of the list, not the same three screens of
 * history they had scrolled through before.
 */
export interface PagedList<T> {
  items: T[];
  total: number;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  reload: () => void;
}

export function usePagedList<T>(fetchPage: (page: number) => Promise<Page<T>>): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loaded = useRef(false);
  // Guards against `onEndReached` firing repeatedly while a page is in flight,
  // which FlatList does on fast scrolls and which would skip pages.
  const inFlight = useRef(false);

  const load = useCallback(
    async (target: number, mode: 'initial' | 'refresh' | 'more') => {
      if (inFlight.current) return;
      inFlight.current = true;

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);

      try {
        const result = await fetchPage(target);
        setItems((current) => (target === 1 ? result.data : [...current, ...result.data]));
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
        setPage(target);
        setError(null);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'Could not load this list.');
      } finally {
        loaded.current = true;
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [fetchPage]
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, loaded.current ? 'refresh' : 'initial');
    }, [load])
  );

  return {
    items,
    total,
    error,
    loading,
    refreshing,
    loadingMore,
    hasMore: page < totalPages,
    loadMore: () => {
      if (page < totalPages) void load(page + 1, 'more');
    },
    refresh: () => void load(1, 'refresh'),
    reload: () => void load(1, 'initial'),
  };
}
