import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, Matches, Min } from 'class-validator';

export class CreateVendorSettlementDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from_date: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to_date: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expected_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expected_trip_count?: number;
}

export class AllocateVendorSettlementPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;
}
