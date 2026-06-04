import { PartialType } from '@nestjs/swagger';
import { CreateCashTransactionDetailDto } from './create-cash-transaction-detail.dto';

export class UpdateCashTransactionDetailDto extends PartialType(CreateCashTransactionDetailDto) {}
