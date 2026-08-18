import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { CashFundEntity } from './cash-fund.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceReconciliationEntity } from './reconciliation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FinanceReconciliationEntity, CashFundEntity, HubEntity, TripEntity, WaybillEntity])],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
