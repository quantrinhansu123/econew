import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class CreateWaybillDto {
  @ApiProperty({ description: 'Số bill nhập tay' }) @IsString() @IsNotEmpty() waybill_code: string;
  @ApiProperty() @IsString() @IsNotEmpty() sender_name: string;
  @ApiProperty() @IsString() @IsNotEmpty() sender_phone: string;
  @ApiProperty() @IsString() @IsNotEmpty() sender_address: string;
  @ApiPropertyOptional({ description: 'Tên công ty nhận, nhập tay trên bill' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  receiver_company_name?: string;
  @ApiProperty() @IsString() @IsNotEmpty() receiver_name: string;
  @ApiProperty() @IsString() @IsNotEmpty() receiver_phone: string;
  @ApiProperty() @IsString() @IsNotEmpty() receiver_address: string;
  @ApiProperty() @IsString() @IsNotEmpty() origin_hub_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() dest_hub_id: string;
  @ApiProperty() @IsNumber() @IsPositive() weight: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) length?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) width?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) height?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) volumetric_weight?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) the_tich_m3?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber() @Min(1) package_count?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) cod_amount?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) freight_amount?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) cc_amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ description: 'Tối đa 4 URL ảnh bill/hàng hóa, phân cách bằng dấu |' })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  delivery_photo_url?: string;
  @ApiPropertyOptional({ description: 'Tỉnh đến của địa chỉ nhận' }) @IsOptional() @IsString() noi_den?: string;
  @ApiPropertyOptional({ description: 'Nội dung hàng / mặt hàng' }) @IsOptional() @IsString() noi_dung?: string;
  @ApiPropertyOptional({ description: 'Biển số xe lấy hàng — nhiều xe cách nhau bởi dấu phẩy' })
  @IsOptional()
  @IsString()
  xe_lay?: string;
  @ApiPropertyOptional({ description: 'Biển số xe phát hàng — nhiều xe cách nhau bởi dấu phẩy' })
  @IsOptional()
  @IsString()
  xe_phat?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expected_delivery_at?: string;
}
