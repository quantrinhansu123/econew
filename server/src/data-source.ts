import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { CarrierDirectoryEntity } from './carrier-directory/carrier-directory.entity';
import { CashJournalEntryEntity } from './cash-journal-entries/cash-journal-entry.entity';
import { CashTransactionDetailEntity } from './cash-transaction-details/cash-transaction-detail.entity';
import { ChanhShipmentEntity } from './chanh-shipments/chanh-shipment.entity';
import { CustomerDirectoryEntity } from './customer-directory/customer-directory.entity';
import { getDatabaseUrl } from './database-url';
import { ExpenseEntity } from './expenses/expense.entity';
import { HubEntity } from './hubs/hub.entity';
import { ManifestEntity } from './manifests/manifest.entity';
import { ManifestWaybillEntity } from './manifests/manifest-waybill.entity';
import { NorthSouthShipmentEntity } from './north-south-shipments/north-south-shipment.entity';
import { OrderEntity } from './orders/order.entity';
import { ReconciliationEntity } from './reconciliations/reconciliation.entity';
import { StaffMemberEntity } from './staff-members/staff-member.entity';
import { TripEntity } from './trips/trip.entity';
import { TruckEntity } from './trucks/truck.entity';
import { UserEntity } from './users/user.entity';
import { UserHubEntity } from './users/user-hub.entity';
import { VendorDebtEntryEntity } from './vendors/vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendors/vendor-payment.entity';
import { VendorEntity } from './vendors/vendor.entity';
import { VehicleCostEntity } from './vehicle-costs/vehicle-cost.entity';
import { VehicleDirectoryEntity } from './vehicle-directory/vehicle-directory.entity';
import { WaybillEntity } from './waybills/waybill.entity';
import { WarehouseEntity } from './warehouses/warehouse.entity';
import { AttendanceLocationEntity } from './attendance/attendance-location.entity';
import { AttendanceLogEntity } from './attendance/attendance-log.entity';

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
    HubEntity,
    UserEntity,
    UserHubEntity,
    WaybillEntity,
    ManifestEntity,
    ManifestWaybillEntity,
    TruckEntity,
    TripEntity,
    ExpenseEntity,
    ReconciliationEntity,
    VehicleDirectoryEntity,
    VehicleCostEntity,
    CashTransactionDetailEntity,
    NorthSouthShipmentEntity,
    OrderEntity,
    StaffMemberEntity,
    CarrierDirectoryEntity,
    ChanhShipmentEntity,
    CustomerDirectoryEntity,
    CashJournalEntryEntity,
    WarehouseEntity,
    VendorEntity,
    VendorDebtEntryEntity,
    VendorPaymentEntity,
    AttendanceLocationEntity,
    AttendanceLogEntity,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

