import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WaybillStatus } from './waybill.enums';

export class UpdateWaybillStatusDto {
  @ApiProperty({ enum: WaybillStatus }) @IsEnum(WaybillStatus) status: WaybillStatus;
  @ApiPropertyOptional({ description: 'URL ảnh từ endpoint upload ảnh vận đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  delivery_photo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
