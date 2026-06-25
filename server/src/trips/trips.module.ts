import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { VendorDebtEntryEntity } from '../vendors/vendor-debt-entry.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { ExpensesModule } from '../expenses/expenses.module';
import { VendorsModule } from '../vendors/vendors.module';
import { WaybillsModule } from '../waybills/waybills.module';
import { WaybillEntity } from '../waybills/waybill.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { TripEntity } from './trip.entity';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TripEntity, TruckEntity, ManifestEntity, ManifestWaybillEntity, WaybillEntity, WaybillSplitEntity, HubEntity, VendorEntity, VendorDebtEntryEntity]),
    VendorsModule,
    ExpensesModule,
    WaybillsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
