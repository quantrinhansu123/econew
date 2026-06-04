import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Nhà cung cấp (NCC); mặc định Công lẻ nếu bỏ trống' })
  @IsOptional()
  @IsString()
  vendor_id?: string;
}
