import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { TruckStatus } from './truck.enums';

export class UpdateTruckDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  license_plate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  payload?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driver_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fuel_consumption_limit?: number;

  @ApiPropertyOptional({ enum: TruckStatus })
  @IsOptional()
  @IsEnum(TruckStatus)
  status?: TruckStatus;

  @ApiPropertyOptional({ enum: ['INTERNAL', 'VENDOR'] })
  @IsOptional()
  @IsIn(['INTERNAL', 'VENDOR'])
  ownership_type?: 'INTERNAL' | 'VENDOR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hub_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ten_lai_xe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nha_xe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loai_xe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  khu_vuc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendor_id?: string;

  @ApiPropertyOptional({ type: [String], description: 'Tối đa 10 ảnh giấy tờ xe nội bộ' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  document_image_urls?: string[];
}
