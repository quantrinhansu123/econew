import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export interface DeliveryRouteOption {
  id: string | number;
  code: string;
  name: string;
  hub_id?: string | null;
  province?: string | null;
  district?: string | null;
}

export function useDeliveryRoutes(activeOnly = true, hubId?: string | null) {
  const [routes, setRoutes] = useState<DeliveryRouteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const params = hubId ? `?hub_id=${encodeURIComponent(String(hubId))}` : '';
    const path = activeOnly ? `/routes/active${params}` : `/routes?status=ACTIVE&limit=200`;

    apiRequest<DeliveryRouteOption[] | { items?: DeliveryRouteOption[] }>(path)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res.items ?? [];
        setRoutes(list);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOnly, hubId]);

  return { routes, isLoading };
}
