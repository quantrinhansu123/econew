import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export enum HubType {
  WAREHOUSE = 'WAREHOUSE',
  HUB = 'HUB',
  POST_OFFICE = 'POST_OFFICE',
}

export class CreateHubDto {
  @ApiProperty({ example: 'HAN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'Bưu cục Hà Nội' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: HubType, example: HubType.HUB })
  @IsEnum(HubType)
  type: HubType;

  @ApiProperty({ example: 'Hà Nội' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  province: string;

  @ApiProperty({ example: 'Cầu Giấy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  district: string;

  @ApiPropertyOptional({ example: 'Dịch Vọng' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ward?: string;

  @ApiProperty({ example: '123 Xuân Thủy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ example: '+842412345678' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  manager_name?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  manager_phone?: string;

  @ApiPropertyOptional({ example: '21.0278,105.8342' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  coordinates?: string;

  @ApiPropertyOptional({ example: 21.0278 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 105.8342 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 3, description: 'Số ngày từ lúc chuyến khởi hành đến bưu cục' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  transit_days?: number;
}
