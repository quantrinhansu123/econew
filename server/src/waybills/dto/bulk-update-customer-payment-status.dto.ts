import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomerPaymentStatus } from '../../common/enums';

export class BulkUpdateCustomerPaymentStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) => Array.isArray(value) ? value.map((id) => String(id)) : value)
  @IsString({ each: true })
  waybill_ids: string[];

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
