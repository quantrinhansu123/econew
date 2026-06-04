import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertRouteDto {
  @ApiProperty({ example: 'HCM-Q7-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: 'Quận 7 — khu Nam Sài Gòn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
