import { useMemo } from 'react';
import { IncomingTripTable } from './warehouse/incoming/IncomingTripTable';
import { IncomingTripsPageLayout } from './warehouse/incoming/IncomingTripsPageLayout';
import {
  filterArrivedTripsByOrigin,
  isArrivedTrip,
} from './warehouse/incoming/incomingTripUtils';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';

export default function WarehouseIncomingPage() {
  const { trips, isLoading, error, updatedAt } = useIncomingTrips();
  const arrivedTrips = useMemo(() => trips.filter(isArrivedTrip), [trips]);
  const tripsFromHan = useMemo(() => filterArrivedTripsByOrigin(arrivedTrips, 'HAN'), [arrivedTrips]);
  const tripsFromHcm = useMemo(() => filterArrivedTripsByOrigin(arrivedTrips, 'HCM'), [arrivedTrips]);

  return (
    <IncomingTripsPageLayout
      title="Hàng đã tới bưu cục"
      subtitle="Xe đã đến (ARRIVED/COMPLETED), tách theo bưu cục xuất phát Hà Nội và TP.HCM."
      isLoading={isLoading}
      error={error}
      updatedAt={updatedAt}
    >
      <div className="grid min-h-full grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <IncomingTripTable
          title="Đã đến từ Hà Nội"
          count={tripsFromHan.length}
          tone="border-blue-200 bg-blue-50 text-blue-700"
          emptyText="Chưa có xe đã đến từ Hà Nội."
          trips={tripsFromHan}
        />
        <IncomingTripTable
          title="Đã đến từ TP.HCM"
          count={tripsFromHcm.length}
          tone="border-orange-200 bg-orange-50 text-orange-700"
          emptyText="Chưa có xe đã đến từ TP.HCM."
          trips={tripsFromHcm}
        />
      </div>
    </IncomingTripsPageLayout>
  );
}
