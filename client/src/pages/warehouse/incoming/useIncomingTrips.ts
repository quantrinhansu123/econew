import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../lib/api';
import { getStoredAuthUser } from '../../../lib/authUser';
import type { IncomingTrip, IncomingTripListResponse } from './types';
import { isInTransitTrip, MANAGER_ROLES, POLLING_INTERVAL_MS } from './incomingTripUtils';

export type IncomingTripsSource = 'overview' | 'expected-arrivals';

const normalizeList = (response: IncomingTripListResponse | IncomingTrip[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trips || []
);

const normalizeTotal = (response: IncomingTripListResponse | IncomingTrip[], fallback: number) => (
  Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback
);

export function useIncomingTrips(options?: { source?: IncomingTripsSource }) {
  const source = options?.source ?? 'expected-arrivals';
  const user = useMemo(() => getStoredAuthUser(), []);
  const userHubId = user?.hub_id != null ? String(user.hub_id) : null;
  const isManagerPlus = Boolean(user && (user.role_mask & MANAGER_ROLES) !== 0);
  const [trips, setTrips] = useState<IncomingTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchOverview = useCallback(async () => {
    const loadPage = (page: number) => apiRequest<IncomingTripListResponse | IncomingTrip[]>(
      `/trips/incoming-overview?page=${page}&limit=100`,
    );
    const firstResponse = await loadPage(1);
    const firstPage = normalizeList(firstResponse);
    const total = normalizeTotal(firstResponse, firstPage.length);
    const pageCount = Math.max(1, Math.ceil(total / 100));
    const remainingResponses = pageCount > 1
      ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => loadPage(index + 2)))
      : [];
    return [
      ...firstPage,
      ...remainingResponses.flatMap(normalizeList),
    ];
  }, []);

  const fetchExpectedArrivals = useCallback(async () => {
    const query = new URLSearchParams({ limit: '100' });
    if (userHubId) query.set('end_hub_id', userHubId);
    const response = await apiRequest<IncomingTripListResponse | IncomingTrip[]>(
      `/trips/expected-arrivals?${query.toString()}`,
    );
    return normalizeList(response).filter(isInTransitTrip);
  }, [userHubId]);

  const fetchIncomingTrips = useCallback(async (showLoading = false) => {
    if (!userHubId && !isManagerPlus) {
      setTrips([]);
      setError('Tài khoản chưa được gán bưu cục để xem chuyến xe.');
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const data = source === 'overview'
        ? await fetchOverview()
        : await fetchExpectedArrivals();
      setTrips(data);
      setUpdatedAt(new Date());
    } catch (err) {
      setTrips([]);
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách chuyến xe.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchExpectedArrivals, fetchOverview, isManagerPlus, source, userHubId]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void fetchIncomingTrips(true), 0);
    const intervalId = window.setInterval(() => void fetchIncomingTrips(false), POLLING_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [fetchIncomingTrips]);

  return { trips, isLoading, error, updatedAt, refresh: fetchIncomingTrips };
}
