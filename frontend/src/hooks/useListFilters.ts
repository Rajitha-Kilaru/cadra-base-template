import { useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { OrderStatus } from '../api/types';

const DEBOUNCE_MS = 300;

export interface ListFilters {
  status: string;
  q: string;
  page: number;
  page_size: number;
}

export function useListFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = searchParams.get('status') || '';
  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const page_size = parseInt(searchParams.get('page_size') || '20', 10);

  // Debounced update for a single param
  const updateOne = useCallback((key: string, value: string, resetPage = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      // Changing q or status resets page to 1
      if (resetPage) next.set('page', '1');
      return next;
    });
  }, [setSearchParams]);

  const setStatus = useCallback((s: string) => {
    updateOne('status', s, true);
  }, [updateOne]);

  const setQRaw = useCallback((value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      updateOne('q', value, true);
    }, DEBOUNCE_MS);
  }, [updateOne]);

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  const setPage = useCallback((p: number) => {
    updateOne('page', String(p));
  }, [updateOne]);

  const clearFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return {
    filters: { status, q, page, page_size } as ListFilters,
    setStatus,
    setQ: setQRaw,
    setPage,
    clearFilters,
  };
}