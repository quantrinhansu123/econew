import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleCostEntity } from '../vehicle-costs/vehicle-cost.entity';
import { CashTransactionDetailController } from './cash-transaction-detail.controller';
import { CashTransactionDetailEntity } from './cash-transaction-detail.entity';
import { CashTransactionDetailService } from './cash-transaction-detail.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashTransactionDetailEntity, VehicleCostEntity])],
  controllers: [CashTransactionDetailController],
  providers: [CashTransactionDetailService],
  exports: [CashTransactionDetailService],
})
export class CashTransactionDetailModule {}
