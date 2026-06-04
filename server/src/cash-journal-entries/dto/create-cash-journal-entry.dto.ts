import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateCashJournalEntryDto {
  @IsDateString()
  entry_date: string;

  @IsString()
  @IsNotEmpty()
  voucher_type: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  cost_category: string;

  @IsString()
  @IsNotEmpty()
  detail: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  income_amount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expense_amount: number;

}
