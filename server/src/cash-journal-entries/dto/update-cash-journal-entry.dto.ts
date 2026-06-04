import { PartialType } from '@nestjs/swagger';
import { CreateCashJournalEntryDto } from './create-cash-journal-entry.dto';

export class UpdateCashJournalEntryDto extends PartialType(CreateCashJournalEntryDto) {}
