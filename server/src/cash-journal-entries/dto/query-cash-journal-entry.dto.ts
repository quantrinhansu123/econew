import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryCashJournalEntryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Thu', 'Chi'])
  voucher_type?: 'Thu' | 'Chi';

  @IsOptional()
  @IsString()
  fund_id?: string;

  @IsOptional()
  @IsString()
  vendor_id?: string;

  @IsOptional()
  @IsString()
  hub_id?: string;

  @IsOptional()
  @IsString()
  cost_category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
