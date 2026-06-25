import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthSessionGuard from './components/AuthSessionGuard';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import ModulePage from './pages/ModulePage';
import { moduleRoutes } from './data/moduleData';

const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));
const AdminHubsPage = lazy(() => import('./pages/admin/AdminHubsPage'));
const AdminTrucksPage = lazy(() => import('./pages/admin/AdminTrucksPage'));
const AdminVendorsPage = lazy(() => import('./pages/admin/AdminVendorsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminRoutesPage = lazy(() => import('./pages/admin/AdminRoutesPage'));
const WarehouseOrderNewPage = lazy(() => import('./pages/WarehouseOrderNewPage'));
const WarehouseOrderReceivePage = lazy(() => import('./pages/WarehouseOrderReceivePage'));
const WarehouseInventoryPage = lazy(() => import('./pages/WarehouseInventoryPage'));
const WarehouseOrderListPage = lazy(() => import('./pages/WarehouseOrderListPage'));
const WarehouseIncomingPage = lazy(() => import('./pages/WarehouseIncomingPage'));
const WarehousePriorityPage = lazy(() => import('./pages/WarehousePriorityPage'));
const WarehouseLoadPlanningPage = lazy(() => import('./pages/WarehouseLoadPlanningPage'));
const WarehouseManifestsPage = lazy(() => import('./pages/WarehouseManifestsPage'));
const WarehouseManifestDetailPage = lazy(() => import('./pages/WarehouseManifestDetailPage'));
const WarehouseCustomersPage = lazy(() => import('./pages/WarehouseCustomersPage'));
const DeliveryHandoverPage = lazy(() => import('./pages/DeliveryHandoverPage'));
const DeliveryEnRoutePage = lazy(() => import('./pages/DeliveryEnRoutePage'));
const DeliveryHubDropoffPage = lazy(() => import('./pages/DeliveryHubDropoffPage'));
const DeliveryLastMilePage = lazy(() => import('./pages/DeliveryLastMilePage'));
const NhiemVuGiaoHangPage = lazy(() => import('./pages/NhiemVuGiaoHangPage'));
const DeliveryCodPage = lazy(() => import('./pages/DeliveryCodPage'));
const TripsPage = lazy(() => import('./pages/TripsPage'));
const TripDetailPage = lazy(() => import('./pages/TripDetailPage'));
const TripLoadingSequencePage = lazy(() => import('./pages/TripLoadingSequencePage'));
const ExpectedArrivalsPage = lazy(() => import('./pages/ExpectedArrivalsPage'));
const TripExpensesPage = lazy(() => import('./pages/TripExpensesPage'));
const TripProfitPage = lazy(() => import('./pages/TripProfitPage'));
const TrucksPage = lazy(() => import('./pages/TrucksPage'));
const DriverPerformancePage = lazy(() => import('./pages/DriverPerformancePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SearchWaybillsPage = lazy(() => import('./pages/SearchWaybillsPage'));
const SearchTripsPage = lazy(() => import('./pages/SearchTripsPage'));
const FinanceCodReconciliationPage = lazy(() => import('./pages/FinanceCodReconciliationPage'));
const FinanceHubReconciliationPage = lazy(() => import('./pages/FinanceHubReconciliationPage'));
const FinanceApproveInternalPage = lazy(() => import('./pages/FinanceApproveInternalPage'));
const FinanceApproveVendorPage = lazy(() => import('./pages/FinanceApproveVendorPage'));
const FinanceVendorDebtPage = lazy(() => import('./pages/FinanceVendorDebtPage'));
const FinanceVendorTripLedgerPage = lazy(() => import('./pages/FinanceVendorTripLedgerPage'));
const FinanceCashJournalPage = lazy(() => import('./pages/FinanceCashJournalPage'));
const FinanceCashflowDashboardPage = lazy(() => import('./pages/FinanceCashflowDashboardPage'));
const DashboardKpiPage = lazy(() => import('./pages/DashboardKpiPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HrStaffListPage = lazy(() => import('./pages/hr/HrStaffListPage'));
const HrAttendancePage = lazy(() => import('./pages/hr/HrAttendancePage'));
const AdminAttendanceLocationsPage = lazy(() => import('./pages/hr/AdminAttendanceLocationsPage'));
const PrintWaybillPage = lazy(() => import('./pages/print/PrintWaybillPage'));
const PrintInventoryStockPage = lazy(() => import('./pages/print/PrintInventoryStockPage'));
const PrintLoadPlanningPage = lazy(() => import('./pages/print/PrintLoadPlanningPage'));
const PrintManifestPage = lazy(() => import('./pages/print/PrintManifestPage'));
const BusinessCrudPage = lazy(() => import('./pages/business/BusinessCrudPage'));

const businessRouteConfigs = {
  '/fleet/vehicles': 'vehicleDirectory',
  '/fleet/vehicle-costs': 'vehicleCosts',
  '/finance/cash-vouchers': 'cashVouchers',
  '/finance/fund-balances': 'fundBalances',
  '/transport/north-south': 'northSouthShipments',
  '/admin/carriers': 'carrierDirectory',
  '/transport/chanh': 'chanhShipments',
  '/customers/directory': 'customerDirectory',
  '/warehouse/warehouses': 'warehouses',
} as const;

const ecoRoutes = [
  '/orders/new',
  '/orders/customers',
  '/warehouse/inventory',
  '/warehouse/orders',
  '/warehouse/warehouses',
  '/warehouse/hubs',
  '/warehouse/orders/:id/receive',
  '/warehouse/incoming',
  '/warehouse/priority',
  '/warehouse/load-planning',
  '/warehouse/manifests',
  '/warehouse/manifests/:id',
  '/delivery/expected-arrivals',
  '/delivery/handover',
  '/delivery/en-route',
  '/delivery/hub-dropoff',
  '/delivery/last-mile',
  '/delivery/cod',
  '/nhiem-vu-giao-hang',
  '/trips/list',
  '/trips/expenses',
  '/trips/profit',
  '/trips/:id',
  '/trips/:id/loading-sequence',
  '/trips/:id/expenses',
  '/trips/:id/profit',
  '/trips/trunk-vehicles',
  '/trucks',
  '/drivers/performance',
  '/search/general',
  '/search/waybills',
  '/search/trips',
  '/finance/cod-reconciliation',
  '/finance/approve/internal',
  '/finance/approve/vendor',
  '/finance/vendor-debt',
  '/finance/vendor-trip-ledger',
  '/finance/hub-reconciliation',
  '/finance/cash-vouchers',
  '/finance/fund-balances',
  '/finance/cash-journal',
  '/finance/cashflow-dashboard',
  '/fleet/vehicles',
  '/fleet/vehicle-costs',
  '/transport/north-south',
  '/transport/chanh',
  '/customers/directory',
  '/dashboard/kpi',
  '/dashboard/overdue',
  '/reports/revenue',
  '/hr/staff',
  '/hr/attendance',
  '/hr/attendance-admin',
  '/admin/users',
  '/admin/hubs',
  '/admin/trucks',
  '/admin/vendors',
  '/admin/routes',
  '/admin/carriers',
  '/profile',
  '/settings',
];

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/print/waybill/:id"
          element={(
            <Suspense fallback={null}>
              <PrintWaybillPage />
            </Suspense>
          )}
        />
        <Route
          path="/print/inventory-stock"
          element={(
            <Suspense fallback={null}>
              <PrintInventoryStockPage />
            </Suspense>
          )}
        />
        <Route
          path="/print/load-planning-board"
          element={(
            <Suspense fallback={null}>
              <PrintLoadPlanningPage />
            </Suspense>
          )}
        />
        <Route
          path="/print/manifest/:id"
          element={(
            <Suspense fallback={null}>
              <PrintManifestPage />
            </Suspense>
          )}
        />
        <Route
          element={(
            <AuthSessionGuard>
              <MainLayout />
            </AuthSessionGuard>
          )}
        >
          <Route path="/" element={<Dashboard />} />
          {moduleRoutes.map((path) => (
            <Route key={path} path={path} element={<ModulePage />} />
          ))}
          {ecoRoutes.map((path) => (
            <Route
              key={path}
              path={path}
              element={(
                <Suspense fallback={null}>
                  {path in businessRouteConfigs ? <BusinessCrudPage configKey={businessRouteConfigs[path as keyof typeof businessRouteConfigs]} /> : path === '/hr/staff' ? <HrStaffListPage /> : path === '/hr/attendance' ? <HrAttendancePage /> : path === '/hr/attendance-admin' ? <AdminAttendanceLocationsPage /> : path === '/admin/users' ? <AdminUsersPage /> : path === '/admin/hubs' || path === '/warehouse/hubs' ? <AdminHubsPage /> : path === '/admin/trucks' ? <AdminTrucksPage /> : path === '/admin/vendors' ? <AdminVendorsPage /> : path === '/admin/routes' ? <AdminRoutesPage /> : path === '/orders/new' ? <WarehouseOrderNewPage /> : path === '/orders/customers' ? <WarehouseCustomersPage /> : path === '/warehouse/orders/:id/receive' ? <WarehouseOrderReceivePage /> : path === '/warehouse/orders' ? <WarehouseOrderListPage /> : path === '/warehouse/inventory' ? <WarehouseInventoryPage /> : path === '/warehouse/incoming' ? <WarehouseIncomingPage /> : path === '/warehouse/priority' ? <WarehousePriorityPage /> : path === '/warehouse/load-planning' ? <WarehouseLoadPlanningPage /> : path === '/warehouse/manifests' ? <WarehouseManifestsPage /> : path === '/warehouse/manifests/:id' ? <WarehouseManifestDetailPage /> : path === '/delivery/expected-arrivals' ? <ExpectedArrivalsPage /> : path === '/delivery/handover' ? <DeliveryHandoverPage /> : path === '/delivery/en-route' ? <DeliveryEnRoutePage /> : path === '/delivery/hub-dropoff' ? <DeliveryHubDropoffPage /> : path === '/delivery/last-mile' ? <DeliveryLastMilePage /> : path === '/nhiem-vu-giao-hang' ? <NhiemVuGiaoHangPage /> : path === '/delivery/cod' ? <DeliveryCodPage /> : path === '/trips/list' ? <TripsPage /> : path === '/trips/expenses' ? <TripExpensesPage /> : path === '/trips/profit' ? <TripProfitPage /> : path === '/trips/:id' ? <TripDetailPage /> : path === '/trips/:id/loading-sequence' ? <TripLoadingSequencePage /> : path === '/trips/:id/expenses' ? <TripExpensesPage /> : path === '/trips/:id/profit' ? <TripProfitPage /> : path === '/trips/trunk-vehicles' ? <TrucksPage /> : path === '/trucks' ? <TrucksPage /> : path === '/drivers/performance' ? <DriverPerformancePage /> : path === '/search/general' ? <SearchPage /> : path === '/search/waybills' ? <SearchWaybillsPage /> : path === '/search/trips' ? <SearchTripsPage /> : path === '/finance/cod-reconciliation' ? <FinanceCodReconciliationPage /> : path === '/finance/hub-reconciliation' ? <FinanceHubReconciliationPage /> : path === '/finance/approve/internal' ? <FinanceApproveInternalPage /> : path === '/finance/approve/vendor' ? <FinanceApproveVendorPage /> : path === '/finance/vendor-debt' ? <FinanceVendorDebtPage /> : path === '/finance/vendor-trip-ledger' ? <FinanceVendorTripLedgerPage /> : path === '/finance/cash-journal' ? <FinanceCashJournalPage /> : path === '/finance/cashflow-dashboard' ? <FinanceCashflowDashboardPage /> : path === '/dashboard/kpi' ? <DashboardKpiPage /> : path === '/settings' ? <SettingsPage /> : <PlaceholderPage /> }
                </Suspense>
              )}
            />
          ))}
          <Route path="/warehouse/orders/new" element={<Navigate to="/orders/new" replace />} />
          <Route path="/warehouse/customers" element={<Navigate to="/orders/customers" replace />} />
          <Route path="/warehouse/expected-arrivals" element={<Navigate to="/delivery/expected-arrivals" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;





















