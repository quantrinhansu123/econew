import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AttendanceLocationEntity } from './attendance/attendance-location.entity';
import { AttendanceLogEntity } from './attendance/attendance-log.entity';
import { CarrierDirectoryEntity } from './carrier-directory/carrier-directory.entity';
import { CashJournalEntryEntity } from './cash-journal-entries/cash-journal-entry.entity';
import { CashTransactionDetailEntity } from './cash-transaction-details/cash-transaction-detail.entity';
import { ChanhShipmentEntity } from './chanh-shipments/chanh-shipment.entity';
import { CustomerDirectoryEntity } from './customer-directory/customer-directory.entity';
import { CustomerListViewEntity } from './customers/customer-list.view.entity';
import { CustomerEntity } from './customers/customer.entity';
import { DashboardKpiEntity } from './dashboard/dashboard-kpi.entity';
import { getDatabaseUrl } from './database-url';
import { ExpenseEntity } from './expenses/expense.entity';
import { ExpenseCategoryEntity } from './expenses/expense-category.entity';
import { CashFundEntity } from './finance/cash-fund.entity';
import { FinanceReconciliationEntity } from './finance/reconciliation.entity';
import { FundBalanceEntity } from './fund-balances/fund-balance.entity';
import { HubEntity } from './hubs/hub.entity';
import { ManifestEntity } from './manifests/manifest.entity';
import { ManifestWaybillEntity } from './manifests/manifest-waybill.entity';
import { NorthSouthShipmentEntity } from './north-south-shipments/north-south-shipment.entity';
import { OrderEntity } from './orders/order.entity';
import { ReconciliationEntity } from './reconciliations/reconciliation.entity';
import { DeliveryRouteEntity } from './routes/route.entity';
import { StaffMemberEntity } from './staff-members/staff-member.entity';
import { StaffDepartmentEntity } from './staff-members/staff-department.entity';
import { StaffAttendanceEntity } from './staff-members/staff-attendance.entity';
import { SalaryAdvanceEntity } from './staff-members/salary-advance.entity';
import { StaffPayrollAdjustmentEntity } from './staff-members/staff-payroll-adjustment.entity';
import { TripEntity } from './trips/trip.entity';
import { TruckEntity } from './trucks/truck.entity';
import { UserEntity } from './users/user.entity';
import { UserHubEntity } from './users/user-hub.entity';
import { VendorDebtEntryEntity } from './vendors/vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendors/vendor-payment.entity';
import { VendorEntity } from './vendors/vendor.entity';
import { VehicleCostEntity } from './vehicle-costs/vehicle-cost.entity';
import { VehicleDirectoryEntity } from './vehicle-directory/vehicle-directory.entity';
import { WarehouseEntity } from './warehouses/warehouse.entity';
import { WaybillCashVoucherEntity } from './waybills/waybill-cash-voucher.entity';
import { WaybillChangeLogEntity } from './waybills/waybill-change-log.entity';
import { WaybillSplitEntity } from './waybills/waybill-split.entity';
import { WaybillEntity } from './waybills/waybill.entity';
import { OperationalReminderEntity } from './reminders/operational-reminder.entity';

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export default new DataSource({
  type: 'postgres',
  url: getDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  extra: {
    max: getPositiveInteger(process.env.DB_MIGRATION_POOL_MAX ?? process.env.DB_POOL_MAX, 1),
    connectionTimeoutMillis: getPositiveInteger(process.env.DB_CONNECTION_TIMEOUT_MS, 10_000),
    idleTimeoutMillis: getPositiveInteger(process.env.DB_IDLE_TIMEOUT_MS, 10_000),
  },
  entities: [
    AttendanceLocationEntity,
    AttendanceLogEntity,
    CarrierDirectoryEntity,
    CashFundEntity,
    CashJournalEntryEntity,
    CashTransactionDetailEntity,
    ChanhShipmentEntity,
    CustomerDirectoryEntity,
    CustomerEntity,
    CustomerListViewEntity,
    DashboardKpiEntity,
    DeliveryRouteEntity,
    ExpenseEntity,
    ExpenseCategoryEntity,
    FinanceReconciliationEntity,
    FundBalanceEntity,
    HubEntity,
    ManifestEntity,
    ManifestWaybillEntity,
    NorthSouthShipmentEntity,
    OrderEntity,
    ReconciliationEntity,
    StaffMemberEntity,
    StaffDepartmentEntity,
    StaffAttendanceEntity,
    SalaryAdvanceEntity,
    StaffPayrollAdjustmentEntity,
    TripEntity,
    TruckEntity,
    UserEntity,
    UserHubEntity,
    VehicleCostEntity,
    VehicleDirectoryEntity,
    VendorDebtEntryEntity,
    VendorEntity,
    VendorPaymentEntity,
    WarehouseEntity,
    WaybillCashVoucherEntity,
    WaybillChangeLogEntity,
    WaybillEntity,
    WaybillSplitEntity,
    OperationalReminderEntity,
  ],
  migrations: [__filename.endsWith('.js') ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  synchronize: false,
});

