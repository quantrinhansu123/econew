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

  @ApiPropertyOptional({ description: 'Lọc xe thuộc đúng nhà cung cấp (NCC)' })
  @IsOptional()
  @IsString()
  vendor_id?: string;

  @ApiPropertyOptional({ enum: ['INTERNAL', 'VENDOR'] })
  @IsOptional()
  @IsString()
  ownership_type?: 'INTERNAL' | 'VENDOR';

  @ApiPropertyOptional({ description: 'Lọc xe theo bưu cục quản lý' })
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional({ description: 'Lọc theo danh sách mã bưu cục, phân cách bằng dấu phẩy' })
  @IsOptional()
  @IsString()
  hub_codes?: string;

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
