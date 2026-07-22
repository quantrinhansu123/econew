import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../customers/customer.entity';
import { HubEntity } from '../hubs/hub.entity';
import { OrdersModule } from '../orders/orders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillsController } from './waybills.controller';
import { WaybillsService } from './waybills.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaybillEntity, WaybillSplitEntity, WaybillCashVoucherEntity, HubEntity, TripEntity, TruckEntity, ManifestEntity, ManifestWaybillEntity, CustomerEntity]),
    OrdersModule,
    VendorsModule,
    UploadsModule,
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
