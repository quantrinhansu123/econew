import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCashJournalEntryDto {
  @IsDateString()
  entry_date: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Thu', 'Chi'])
  voucher_type: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  fund_id: string;

  @IsOptional()
  @Transform(({ value }) => value == null ? undefined : String(value))
  @IsString()
  vendor_id?: string;

  @IsOptional()
  @Transform(({ value }) => value == null ? undefined : String(value))
  @IsString()
  hub_id?: string;

  @IsString()
  @IsNotEmpty()
  cost_category: string;

  @IsString()
  @IsNotEmpty()
  detail: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  attachment_urls?: string[];

}
