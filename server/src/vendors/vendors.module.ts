import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ExpenseEntity } from '../expenses/expense.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { VendorDebtEntryEntity } from './vendor-debt-entry.entity';
import { VendorPaymentAllocationEntity } from './vendor-payment-allocation.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorEntity } from './vendor.entity';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorSettlementEntity, VendorSettlementItemEntity } from './vendor-settlement.entity';
import { VendorSettlementsService } from './vendor-settlements.service';
import { VendorSettlementsController } from './vendor-settlements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VendorEntity, VendorDebtEntryEntity, VendorPaymentEntity, VendorPaymentAllocationEntity, VendorSettlementEntity, VendorSettlementItemEntity, TripEntity, ManifestWaybillEntity, ExpenseEntity, WaybillEntity, CashFundEntity])],
  controllers: [VendorsController, VendorSettlementsController],
  providers: [VendorsService, VendorSettlementsService],
  exports: [VendorsService],
})
export class VendorsModule {}
