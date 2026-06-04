import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { getDatabaseUrl, getDatabaseUrlHelp, isSupabaseDirectDatabaseUrl } from './database-url';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FinanceModule } from './finance/finance.module';
import { CustomersModule } from './customers/customers.module';
import { HubsModule } from './hubs/hubs.module';
import { ManifestsModule } from './manifests/manifests.module';
import { ReconciliationsModule } from './reconciliations/reconciliations.module';
import { RoutesModule } from './routes/routes.module';
import { SearchModule } from './search/search.module';
import { TripsModule } from './trips/trips.module';
import { TrucksModule } from './trucks/trucks.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { WaybillsModule } from './waybills/waybills.module';

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

        return {
          type: 'postgres',
          url: databaseUrl,
          ssl: { rejectUnauthorized: false },
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
        };
      },
    }),
    HubsModule,
    RoutesModule,
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
  ],
  controllers: [AppController],
})
export class AppModule {}



