import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { TruckStatus } from './truck.enums';

export class CreateTruckDto {
  @ApiProperty({ example: '29H-12345' })
  @IsString()
  @IsNotEmpty()
  license_plate: string;

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  payload: number;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @IsString()
  driver_id?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fuel_consumption_limit?: number = 0;

  @ApiPropertyOptional({ enum: TruckStatus, default: TruckStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(TruckStatus)
  status?: TruckStatus = TruckStatus.AVAILABLE;

  @ApiPropertyOptional({ enum: ['INTERNAL', 'VENDOR'], default: 'VENDOR' })
  @IsOptional()
  @IsIn(['INTERNAL', 'VENDOR'])
  ownership_type?: 'INTERNAL' | 'VENDOR';

  @ApiPropertyOptional({ description: 'Bưu cục đang quản lý xe nội bộ' })
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  ten_lai_xe?: string;

  @ApiPropertyOptional({ example: 'Nhà xe ABC' })
  @IsOptional()
  @IsString()
  nha_xe?: string;

  @ApiPropertyOptional({ example: '29H-12345' })
  @IsOptional()
  @IsString()
  bks?: string;

  @ApiPropertyOptional({ example: 'Xe tải 5 tấn' })
  @IsOptional()
  @IsString()
  loai_xe?: string;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @IsOptional()
  @IsString()
  khu_vuc?: string;

  @ApiPropertyOptional({ description: 'Nhà cung cấp (NCC), bắt buộc với BKS đối tác' })
  @IsOptional()
  @IsString()
  vendor_id?: string;

  @ApiPropertyOptional({ type: [String], description: 'Tối đa 10 ảnh giấy tờ xe nội bộ' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  document_image_urls?: string[];

  @ApiPropertyOptional({ example: '2027-08-28', description: 'Ngày hết hạn đăng kiểm xe nội bộ' })
  @IsOptional()
  @IsDateString()
  registration_expiry_date?: string | null;

  @ApiPropertyOptional({ example: '2027-08-28', description: 'Ngày hết hạn bảo hiểm xe nội bộ' })
  @IsOptional()
  @IsDateString()
  insurance_expiry_date?: string | null;
}
