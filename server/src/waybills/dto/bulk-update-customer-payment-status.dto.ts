import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomerPaymentStatus } from '../../common/enums';

export class BulkUpdateCustomerPaymentStatusDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  waybill_ids: number[];

  @ApiPropertyOptional({ enum: CustomerPaymentStatus, nullable: true })
  @IsOptional()
  @IsEnum(CustomerPaymentStatus)
  status?: CustomerPaymentStatus | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
