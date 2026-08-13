import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DELIVERY_PREPARATION_STATUSES = ['READY', 'SCHEDULED', 'HOLD'] as const;
export type DeliveryPreparationStatus = typeof DELIVERY_PREPARATION_STATUSES[number];
export const DELIVERY_READY_MODES = ['DISPATCH', 'CUSTOMER_PICKUP'] as const;
export type DeliveryReadyMode = typeof DELIVERY_READY_MODES[number];

export class UpdateDeliveryPreparationDto {
  @ApiProperty({ enum: DELIVERY_PREPARATION_STATUSES }) @IsIn(DELIVERY_PREPARATION_STATUSES) status: DeliveryPreparationStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() scheduled_at?: Date;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ description: 'Ghi chú cuộc gọi để điều phối giao hàng', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    enum: DELIVERY_READY_MODES,
    description: 'Cách hoàn tất đơn khi khách sẵn sàng: điều phối xe hoặc khách tới HUB lấy',
  })
  @IsOptional()
  @IsIn(DELIVERY_READY_MODES)
  ready_mode?: DeliveryReadyMode;
}
