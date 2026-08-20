import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { TripEntity } from '../trips/trip.entity';
import { VendorsModule } from '../vendors/vendors.module';
import { ExpenseEntity } from './expense.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExpenseEntity, TripEntity, CashFundEntity]), VendorsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
