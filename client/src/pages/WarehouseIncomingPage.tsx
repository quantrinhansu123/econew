import { useMemo, useState } from 'react';
import { IncomingTripTable } from './warehouse/incoming/IncomingTripTable';
import { IncomingTripsPageLayout } from './warehouse/incoming/IncomingTripsPageLayout';
import {
  filterTripsByDate,
  filterTripsByOrigin,
  summarizeIncomingTrips,
} from './warehouse/incoming/incomingTripUtils';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';

export default function WarehouseIncomingPage() {
  const { trips, isLoading, error, updatedAt } = useIncomingTrips();
  const [filterDate, setFilterDate] = useState('');

  const filteredTrips = useMemo(() => filterTripsByDate(trips, filterDate), [trips, filterDate]);
  const summary = useMemo(() => summarizeIncomingTrips(filteredTrips), [filteredTrips]);
  const tripsFromHan = useMemo(() => filterTripsByOrigin(filteredTrips, 'HAN'), [filteredTrips]);
  const tripsFromHcm = useMemo(() => filterTripsByOrigin(filteredTrips, 'HCM'), [filteredTrips]);

  return (
    <IncomingTripsPageLayout
      title="Tất cả chuyến xe"
      subtitle="Theo dõi chuyến xe, ngày đến, BKS, tài xế và nhà cung cấp."
      isLoading={isLoading}
      error={error}
      updatedAt={updatedAt}
      filterDate={filterDate}
      onFilterDateChange={setFilterDate}
      summary={summary}
    >
      <div className="grid min-h-full grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        <IncomingTripTable
          title="Chuyến từ Hà Nội"
          count={tripsFromHan.length}
          tone="border-blue-200 bg-blue-50 text-blue-700"
          emptyText={filterDate ? 'Không có chuyến từ Hà Nội trong ngày đã chọn.' : 'Chưa có chuyến xe từ Hà Nội.'}
          trips={tripsFromHan}
        />
        <IncomingTripTable
          title="Chuyến từ TP.HCM"
          count={tripsFromHcm.length}
          tone="border-orange-200 bg-orange-50 text-orange-700"
          emptyText={filterDate ? 'Không có chuyến từ TP.HCM trong ngày đã chọn.' : 'Chưa có chuyến xe từ TP.HCM.'}
          trips={tripsFromHcm}
        />
      </div>
    </IncomingTripsPageLayout>
  );
}
