import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { TripEntity } from '../trips/trip.entity';
import { VendorsModule } from '../vendors/vendors.module';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoryEntity } from './expense-category.entity';
import { ExpenseEntity } from './expense.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExpenseEntity, ExpenseCategoryEntity, TripEntity, CashFundEntity]), VendorsModule],
  controllers: [ExpensesController, ExpenseCategoriesController],
  providers: [ExpensesService, ExpenseCategoriesService],
  exports: [ExpensesService, ExpenseCategoriesService],
})
export class ExpensesModule {}
