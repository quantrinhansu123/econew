import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class QueryVendorDebtDto {
  @ApiPropertyOptional({ description: 'Lọc theo vendor_id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vendor_id?: number;

  @ApiPropertyOptional({ description: 'Tìm theo tên/mã NCC' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  to?: Date;
}
