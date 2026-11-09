import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashJournalEntryEntity } from '../cash-journal-entries/cash-journal-entry.entity';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { CashFundTransferEntity } from './cash-fund-transfer.entity';
import { CashFundEntity } from './cash-fund.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PaymentRequestEntity } from './payment-request.entity';
import { FinanceReconciliationEntity } from './reconciliation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceReconciliationEntity,
      CashFundEntity,
      CashFundTransferEntity,
      PaymentRequestEntity,
      CashJournalEntryEntity,
      VendorEntity,
      HubEntity,
      TripEntity,
      WaybillEntity,
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
