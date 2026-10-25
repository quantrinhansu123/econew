import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { UpdateWaybillStatusDto } from './update-waybill-status.dto';

export class UpdateDeliveryDispatchDto extends PickType(UpdateWaybillStatusDto, [
  'driver_id', 'truck_id', 'vendor_id', 'route_code', 'driver_name', 'license_plate', 'delivery_cost', 'trip_id', 'split_id',
] as const) {
  @ApiProperty({ enum: ['INTERNAL', 'PARTNER', 'TECHNOLOGY'] })
  @IsIn(['INTERNAL', 'PARTNER', 'TECHNOLOGY'])
  assignment_type: 'INTERNAL' | 'PARTNER' | 'TECHNOLOGY';

  @ApiProperty({ description: 'Version đang xem; dùng 0 khi chưa có kế hoạch' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expected_version: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
