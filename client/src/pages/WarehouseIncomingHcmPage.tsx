import { useMemo } from 'react';
import { IncomingTripTable } from './warehouse/incoming/IncomingTripTable';
import { IncomingTripsPageLayout } from './warehouse/incoming/IncomingTripsPageLayout';
import {
  filterArrivedTripsByOrigin,
  isArrivedTrip,
} from './warehouse/incoming/incomingTripUtils';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';

export default function WarehouseIncomingHcmPage() {
  const { trips, isLoading, error, updatedAt } = useIncomingTrips({ queryHubCode: 'HCM' });
  const arrivedTrips = useMemo(() => trips.filter(isArrivedTrip), [trips]);
  const tripsFromHcm = useMemo(() => filterArrivedTripsByOrigin(arrivedTrips, 'HCM'), [arrivedTrips]);

  return (
    <IncomingTripsPageLayout
      title="incoming_hcm"
      subtitle="Xe đã đến tại bưu cục TP.HCM, xuất phát từ TP.HCM."
      isLoading={isLoading}
      error={error}
      updatedAt={updatedAt}
    >
      <IncomingTripTable
        title="Đã đến từ TP.HCM"
        count={tripsFromHcm.length}
        tone="border-orange-200 bg-orange-50 text-orange-700"
        emptyText="Chưa có xe đã đến từ TP.HCM."
        trips={tripsFromHcm}
      />
    </IncomingTripsPageLayout>
  );
}
