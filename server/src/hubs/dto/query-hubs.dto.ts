import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizePaginationLimit } from '../../common/pagination';
import { HubType } from './create-hub.dto';

export class QueryHubsDto {
  @ApiPropertyOptional({ example: 'HAN' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: 'Cầu Giấy' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ enum: HubType, example: HubType.HUB })
  @IsOptional()
  @IsEnum(HubType)
  type?: HubType;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Transform(normalizePaginationLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
