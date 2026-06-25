import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { VendorTripPaymentStatus } from '../../common/enums';

export class BulkUpdateTripVendorPaymentDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  trip_ids!: number[];

  @ApiProperty({ enum: VendorTripPaymentStatus })
  @IsEnum(VendorTripPaymentStatus)
  payment_status!: VendorTripPaymentStatus;

  @ApiPropertyOptional({ description: 'Số tiền đã chi (VNĐ) — dùng khi cập nhật PARTIAL/PAID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paid_amount?: number;
}
