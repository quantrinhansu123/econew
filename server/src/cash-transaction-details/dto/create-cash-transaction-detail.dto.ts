import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateCashTransactionDetailDto {
  @IsString()
  @IsNotEmpty()
  vehicle_cost_id: string;

  @IsString()
  @IsNotEmpty()
  voucher_type: string;

  @IsString()
  @IsNotEmpty()
  voucher_name: string;

  @IsString()
  @IsNotEmpty()
  service_type: string;

  @IsString()
  @IsNotEmpty()
  counterparty_unit: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  performed_by: string;

  @IsDateString()
  entry_date: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  entry_time: string;

  @IsOptional()
  @IsString()
  note?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

}
