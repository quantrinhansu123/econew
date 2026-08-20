import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../customers/customer.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { OrdersModule } from '../orders/orders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { WaybillChangeLogEntity } from './waybill-change-log.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillsController } from './waybills.controller';
import { WaybillsService } from './waybills.service';
import { GeminiWaybillRecognitionService } from './gemini-waybill-recognition.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaybillEntity, WaybillChangeLogEntity, WaybillSplitEntity, WaybillCashVoucherEntity, HubEntity, TripEntity, TruckEntity, UserEntity, VendorEntity, ManifestEntity, ManifestWaybillEntity, CustomerEntity, CashFundEntity]),
    OrdersModule,
    VendorsModule,
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService, GeminiWaybillRecognitionService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
