import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { CashJournalEntryController } from './cash-journal-entry.controller';
import { CashJournalEntryEntity } from './cash-journal-entry.entity';
import { CashJournalEntryService } from './cash-journal-entry.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashJournalEntryEntity, CashFundEntity, VendorEntity, UserEntity])],
  controllers: [CashJournalEntryController],
  providers: [CashJournalEntryService],
  exports: [CashJournalEntryService],
})
export class CashJournalEntryModule {}
