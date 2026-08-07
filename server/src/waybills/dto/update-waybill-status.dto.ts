import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WaybillStatus } from './waybill.enums';

export class UpdateWaybillStatusDto {
  @ApiProperty({ enum: WaybillStatus }) @IsEnum(WaybillStatus) status: WaybillStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() delivery_photo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ description: 'Chuyến chứa phần kiện đang được giao' })
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional({ description: 'Dòng tách kiện cụ thể trong chuyến' })
  @IsOptional()
  @IsString()
  split_id?: string;
}

export class CorrectWaybillStatusDto {
  @ApiProperty({ enum: [WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY] })
  @IsEnum(WaybillStatus)
  status: WaybillStatus.AT_DEST_HUB | WaybillStatus.OUT_FOR_DELIVERY;

  @ApiPropertyOptional({ description: 'Chuyến cần mở lại khi sửa nhầm trạng thái giao' })
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
