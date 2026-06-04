import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RemittanceStatus } from '../../common/enums';
import { normalizePaginationLimit } from '../../common/pagination';

export class QueryReconciliationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  reconciliation_date?: string;

  @ApiPropertyOptional({ enum: RemittanceStatus })
  @IsOptional()
  @IsEnum(RemittanceStatus)
  remittance_status?: RemittanceStatus;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Transform(normalizePaginationLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
