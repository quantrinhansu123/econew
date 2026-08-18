import { PartialType } from '@nestjs/swagger';
import { CreateCashFundDto } from './create-cash-fund.dto';

export class UpdateCashFundDto extends PartialType(CreateCashFundDto) {}
