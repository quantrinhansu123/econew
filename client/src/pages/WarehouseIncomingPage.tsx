import { useMemo } from 'react';
import { IncomingTripTable } from './warehouse/incoming/IncomingTripTable';
import { IncomingTripsPageLayout } from './warehouse/incoming/IncomingTripsPageLayout';
import { filterTripsByOrigin } from './warehouse/incoming/incomingTripUtils';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';

export default function WarehouseIncomingPage() {
  const { trips, isLoading, error, updatedAt } = useIncomingTrips();
  const tripsFromHan = useMemo(() => filterTripsByOrigin(trips, 'HAN'), [trips]);
  const tripsFromHcm = useMemo(() => filterTripsByOrigin(trips, 'HCM'), [trips]);

  return (
    <IncomingTripsPageLayout
      title="Tất cả chuyến xe"
      subtitle="Tất cả chuyến xe liên quan bưu cục, tách theo xuất phát Hà Nội và TP.HCM."
      isLoading={isLoading}
      error={error}
      updatedAt={updatedAt}
    >
      <div className="grid min-h-full grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <IncomingTripTable
          title="Chuyến từ Hà Nội"
          count={tripsFromHan.length}
          tone="border-blue-200 bg-blue-50 text-blue-700"
          emptyText="Chưa có chuyến xe từ Hà Nội."
          trips={tripsFromHan}
        />
        <IncomingTripTable
          title="Chuyến từ TP.HCM"
          count={tripsFromHcm.length}
          tone="border-orange-200 bg-orange-50 text-orange-700"
          emptyText="Chưa có chuyến xe từ TP.HCM."
          trips={tripsFromHcm}
        />
      </div>
    </IncomingTripsPageLayout>
  );
}
