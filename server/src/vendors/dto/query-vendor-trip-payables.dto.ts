import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { VendorTripPaymentStatus } from '../../common/enums';

export class QueryVendorTripPayablesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vendor_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  to?: Date;

  @ApiPropertyOptional({ enum: VendorTripPaymentStatus })
  @IsOptional()
  @IsEnum(VendorTripPaymentStatus)
  payment_status?: VendorTripPaymentStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
