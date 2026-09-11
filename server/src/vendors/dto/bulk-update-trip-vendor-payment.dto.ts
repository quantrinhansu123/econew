import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min, ValidateNested } from 'class-validator';
import { VendorTripPaymentStatus } from '../../common/enums';
import { VendorPaymentAllocationDto } from './create-vendor-payment.dto';

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

  @ApiPropertyOptional({ description: 'Số tiền đã chi (VNĐ) — bắt buộc khi PAID; tùy chọn khi PARTIAL' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paid_amount?: number;

  @ApiPropertyOptional({ description: 'Số tiền của lần chi; khi có allocations, tổng allocations là số tiền lần chi' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payment_amount?: number;

  @ApiPropertyOptional({ type: [VendorPaymentAllocationDto], description: 'Phân bổ số tiền lần chi theo từng chuyến' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorPaymentAllocationDto)
  allocations?: VendorPaymentAllocationDto[];

  @ApiPropertyOptional({ description: 'Sổ quỹ chi tiền; bắt buộc khi số tiền đã chi tăng' })
  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? undefined : String(value))
  @IsString()
  fund_id?: string;

  @ApiPropertyOptional({ description: 'Loại chi phí để phân bổ trong nhật ký thu chi' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cost_category?: string;

  @ApiPropertyOptional({ description: 'URL ảnh chứng từ — bắt buộc khi PAID' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ require_protocol: true })
  proof_image_url?: string;

  @ApiPropertyOptional({ description: 'Ghi chú thanh toán NCC (vd: đã CK ngày ...)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  payment_note?: string;
}
