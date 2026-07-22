import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WaybillStatus } from './waybill.enums';

export class UpdateWaybillStatusDto {
  @ApiProperty({ enum: WaybillStatus }) @IsEnum(WaybillStatus) status: WaybillStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() delivery_photo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
