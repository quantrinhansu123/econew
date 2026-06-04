import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizePaginationLimit } from '../../common/pagination';
import { TruckStatus } from './truck.enums';

export class QueryTrucksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: TruckStatus, isArray: true })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Nội bộ | Đường trục | Đối tác' })
  @IsOptional()
  @IsString()
  loai_xe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driver_id?: string;

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
