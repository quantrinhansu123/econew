import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateCashJournalEntryDto } from './dto/create-cash-journal-entry.dto';
import { UpdateCashJournalEntryDto } from './dto/update-cash-journal-entry.dto';
import { CashJournalEntryEntity } from './cash-journal-entry.entity';

@Injectable()
export class CashJournalEntryService extends DomainCrudService<CashJournalEntryEntity, CreateCashJournalEntryDto, UpdateCashJournalEntryDto, CashJournalEntryEntity> {
  constructor(
    @InjectRepository(CashJournalEntryEntity) private readonly cashJournalEntryRepository: Repository<CashJournalEntryEntity>,
  ) {
    super(cashJournalEntryRepository, { alias: 'cashJournalEntry', searchColumns: ["voucher_type","source","cost_category","detail","note","content"], uniqueColumns: [], nullableStrings: ["note"] });
  }
}
