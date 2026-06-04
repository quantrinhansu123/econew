import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizePaginationLimit } from '../../common/pagination';
import { ManifestStatus } from './manifest.enums';

export class QueryManifestsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: ManifestStatus, description: 'Single status or comma-separated statuses' })
  @IsOptional()
  @Transform(({ value }) => Array.isArray(value) ? value.join(',') : value)
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  origin_hub_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dest_hub_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(normalizePaginationLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}


