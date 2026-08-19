import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum WarehouseIntakeMethod {
  INTERNAL = 'INTERNAL',
  VENDOR = 'VENDOR',
  CUSTOMER_DROPOFF = 'CUSTOMER_DROPOFF',
}

export class ReceiveWaybillDto {
  @ApiProperty({ enum: WarehouseIntakeMethod })
  @IsEnum(WarehouseIntakeMethod)
  intake_method!: WarehouseIntakeMethod;

  @ApiPropertyOptional() @IsOptional() @IsString() delivery_photo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() truck_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendor_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driver_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) license_plate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) driver_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
