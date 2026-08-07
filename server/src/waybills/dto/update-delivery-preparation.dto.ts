import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DELIVERY_PREPARATION_STATUSES = ['READY', 'SCHEDULED', 'HOLD'] as const;
export type DeliveryPreparationStatus = typeof DELIVERY_PREPARATION_STATUSES[number];

export class UpdateDeliveryPreparationDto {
  @ApiProperty({ enum: DELIVERY_PREPARATION_STATUSES }) @IsIn(DELIVERY_PREPARATION_STATUSES) status: DeliveryPreparationStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() scheduled_at?: Date;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
