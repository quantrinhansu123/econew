import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseUrl, getDatabaseUrlHelp, isSupabaseDirectDatabaseUrl } from './database-url';
import { AuthModule } from './auth/auth.module';
import { CarrierDirectoryModule } from './carrier-directory/carrier-directory.module';
import { CashJournalEntryModule } from './cash-journal-entries/cash-journal-entry.module';
import { CashTransactionDetailModule } from './cash-transaction-details/cash-transaction-detail.module';
import { ChanhShipmentModule } from './chanh-shipments/chanh-shipment.module';
import { CustomerDirectoryModule } from './customer-directory/customer-directory.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FinanceModule } from './finance/finance.module';
import { CustomersModule } from './customers/customers.module';
import { HubsModule } from './hubs/hubs.module';
import { ManifestsModule } from './manifests/manifests.module';
import { NorthSouthShipmentModule } from './north-south-shipments/north-south-shipment.module';
import { ReconciliationsModule } from './reconciliations/reconciliations.module';
import { SearchModule } from './search/search.module';
import { StaffMemberModule } from './staff-members/staff-member.module';
import { TripsModule } from './trips/trips.module';
import { TrucksModule } from './trucks/trucks.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { VehicleCostModule } from './vehicle-costs/vehicle-cost.module';
import { VehicleDirectoryModule } from './vehicle-directory/vehicle-directory.module';
import { WaybillsModule } from './waybills/waybills.module';
import { WarehouseModule } from './warehouses/warehouse.module';

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = getDatabaseUrl({
          ...process.env,
          DATABASE_URL: configService.get<string>('DATABASE_URL'),
          DATABASE_POOLER_URL: configService.get<string>('DATABASE_POOLER_URL'),
          SUPABASE_POOLER_DATABASE_URL: configService.get<string>('SUPABASE_POOLER_DATABASE_URL'),
        });

        if (!databaseUrl) {
          throw new Error(`Missing DATABASE_URL. ${getDatabaseUrlHelp()}`);
        }

        if (isSupabaseDirectDatabaseUrl(databaseUrl) && !configService.get<string>('SUPABASE_POOLER_DATABASE_URL') && !configService.get<string>('DATABASE_POOLER_URL')) {
          console.warn(`DATABASE_URL is using a Supabase direct host. ${getDatabaseUrlHelp()}`);
        }

        const poolMax = getPositiveInteger(configService.get<string>('DB_POOL_MAX'), 5);
        const connectionTimeoutMillis = getPositiveInteger(configService.get<string>('DB_CONNECTION_TIMEOUT_MS'), 10_000);
        const idleTimeoutMillis = getPositiveInteger(configService.get<string>('DB_IDLE_TIMEOUT_MS'), 10_000);

        return {
          type: 'postgres',
          url: databaseUrl,
          ssl: { rejectUnauthorized: false },
          extra: {
            max: poolMax,
            connectionTimeoutMillis,
            idleTimeoutMillis,
          },
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
        };
      },
    }),
    HubsModule,
    CustomersModule,
    UsersModule,
    WaybillsModule,
    ManifestsModule,
    TrucksModule,
    VendorsModule,
    TripsModule,
    ExpensesModule,
    ReconciliationsModule,
    AuthModule,
    DashboardModule,
    SearchModule,
    FinanceModule,
    VehicleDirectoryModule,
    VehicleCostModule,
    CashTransactionDetailModule,
    NorthSouthShipmentModule,
    StaffMemberModule,
    CarrierDirectoryModule,
    ChanhShipmentModule,
    CustomerDirectoryModule,
    CashJournalEntryModule,
    WarehouseModule,
  ],
})
export class AppModule {}



