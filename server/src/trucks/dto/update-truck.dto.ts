import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
}
