import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../lib/api';
import { getStoredAuthUser } from '../../../lib/authUser';
import type { IncomingTrip, IncomingTripListResponse } from './types';
import { MANAGER_ROLES, POLLING_INTERVAL_MS } from './incomingTripUtils';

type HubCode = 'HAN' | 'HCM';

interface ActiveHub {
  id: string | number;
  code?: string | null;
}

const normalizeList = (response: IncomingTripListResponse | IncomingTrip[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trips || []
);

const normalizeTotal = (response: IncomingTripListResponse | IncomingTrip[], fallback: number) => (
  Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback
);

export function useIncomingTrips(options?: { queryHubCode?: HubCode }) {
  const user = useMemo(getStoredAuthUser, []);
  const userHubId = user?.hub_id;
  const isManagerPlus = Boolean(user && (user.role_mask & MANAGER_ROLES) !== 0);
  const [queryHubId, setQueryHubId] = useState<string | null>(null);
  const [trips, setTrips] = useState<IncomingTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!options?.queryHubCode) {
      setQueryHubId(userHubId != null ? String(userHubId) : null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const hubs = await apiRequest<ActiveHub[]>('/hubs/active');
        const hub = hubs.find((item) => item.code?.trim().toUpperCase() === options.queryHubCode);
        if (!cancelled) setQueryHubId(hub ? String(hub.id) : null);
      } catch {
        if (!cancelled) setQueryHubId(null);
      }
    })();

    return () => { cancelled = true; };
  }, [options?.queryHubCode, userHubId]);

  const hubId = options?.queryHubCode ? queryHubId : (userHubId != null ? String(userHubId) : null);
  const hubReady = !options?.queryHubCode || queryHubId != null;

  const fetchIncomingTrips = useCallback(async (showLoading = false) => {
    if (!hubReady) return;

    if (!hubId && !isManagerPlus) {
      setTrips([]);
      setError('Tài khoản chưa được gán bưu cục để xem chuyến xe.');
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const loadPage = async (page: number) => {
        const query = new URLSearchParams({ page: String(page), limit: '100' });
        if (hubId) query.set('end_hub_id', hubId);
        return apiRequest<IncomingTripListResponse | IncomingTrip[]>(`/trips/expected-arrivals?${query.toString()}`);
      };
      const firstResponse = await loadPage(1);
      const firstPage = normalizeList(firstResponse);
      const total = normalizeTotal(firstResponse, firstPage.length);
      const pageCount = Math.max(1, Math.ceil(total / 100));
      const remainingResponses = pageCount > 1
        ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => loadPage(index + 2)))
        : [];
      setTrips([
        ...firstPage,
        ...remainingResponses.flatMap(normalizeList),
      ]);
      setUpdatedAt(new Date());
    } catch (err) {
      setTrips([]);
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách chuyến xe.');
    } finally {
      setIsLoading(false);
    }
  }, [hubId, hubReady, isManagerPlus]);

  useEffect(() => {
    if (!hubReady) return undefined;
    void fetchIncomingTrips(true);
    const intervalId = window.setInterval(() => void fetchIncomingTrips(false), POLLING_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchIncomingTrips, hubReady]);

  return { trips, isLoading: isLoading || !hubReady, error, updatedAt, refresh: fetchIncomingTrips };
}
