import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashJournalEntryController } from './cash-journal-entry.controller';
import { CashJournalEntryEntity } from './cash-journal-entry.entity';
import { CashJournalEntryService } from './cash-journal-entry.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashJournalEntryEntity])],
  controllers: [CashJournalEntryController],
  providers: [CashJournalEntryService],
  exports: [CashJournalEntryService],
})
export class CashJournalEntryModule {}
