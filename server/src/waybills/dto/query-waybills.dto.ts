import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizePaginationLimit } from '../../common/pagination';
import { WaybillPriority, WaybillStatus } from './waybill.enums';

export class QueryWaybillsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional({ enum: WaybillStatus, description: 'Single status or comma-separated statuses' }) @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() origin_hub_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dest_hub_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() current_hub_id?: string;
  @ApiPropertyOptional({ description: 'Alias for current_hub_id used by inventory filters' }) @IsOptional() @IsString() hub_id?: string;
  @ApiPropertyOptional({ enum: WaybillPriority, description: 'Single priority or comma-separated priorities' }) @IsOptional() @IsString() priority?: string;
  @ApiPropertyOptional({ description: 'Single payment type or comma-separated payment types' }) @IsOptional() @IsString() payment_type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() route_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to_date?: string;
  @ApiPropertyOptional({ description: 'Alias for from_date used by inventory filters' }) @IsOptional() @IsString() received_from?: string;
  @ApiPropertyOptional({ description: 'Alias for to_date used by inventory filters' }) @IsOptional() @IsString() received_to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Transform(normalizePaginationLimit) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
