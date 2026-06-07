import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { OrdersModule } from '../orders/orders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillsController } from './waybills.controller';
import { WaybillsService } from './waybills.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaybillEntity, WaybillSplitEntity, WaybillCashVoucherEntity, HubEntity, TripEntity, TruckEntity]),
    OrdersModule,
    VendorsModule,
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
