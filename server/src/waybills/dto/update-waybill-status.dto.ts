import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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

  @ApiPropertyOptional({ enum: ['INTERNAL', 'PARTNER', 'TECHNOLOGY'] })
  @IsOptional()
  @IsIn(['INTERNAL', 'PARTNER', 'TECHNOLOGY'])
  assignment_type?: 'INTERNAL' | 'PARTNER' | 'TECHNOLOGY';

  @ApiPropertyOptional({ description: 'Tài xế nội bộ nhận giao' })
  @IsOptional()
  @IsString()
  driver_id?: string;

  @ApiPropertyOptional({ description: 'Xe nội bộ dùng giao chặng cuối' })
  @IsOptional()
  @IsString()
  truck_id?: string;

  @ApiPropertyOptional({ description: 'Đối tác giao chặng cuối' })
  @IsOptional()
  @IsString()
  vendor_id?: string;

  @ApiPropertyOptional({ description: 'Tên tài xế giao chặng cuối nhập tay' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  driver_name?: string;

  @ApiPropertyOptional({ description: 'Biển kiểm soát giao chặng cuối nhập tay' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  license_plate?: string;

  @ApiPropertyOptional({ description: 'Cước giao chặng cuối; có thể để 0 và đối soát sau' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  delivery_cost?: number;

  @ApiPropertyOptional({ description: 'Mã tuyến giao chặng cuối' })
  @IsOptional()
  @IsString()
  route_code?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi giao thất bại/hoàn hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failure_reason?: string;
}

export class UpdateLastMileCostDto {
  @ApiPropertyOptional({ description: 'Cước giao chặng cuối sau đối soát' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
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
