import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { WaybillSplitLoadStatus } from './waybill-split-load-status.enum';

export class WaybillSplitLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trip_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() truck_id?: string;
  @ApiProperty() @IsInt() @Min(1) package_count: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) loading_position?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() carrier_label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ enum: WaybillSplitLoadStatus }) @IsOptional() @IsEnum(WaybillSplitLoadStatus) load_status?: WaybillSplitLoadStatus;
  @ApiPropertyOptional() @IsOptional() expected_arrival_at?: Date | string;
}

export class SaveWaybillSplitsDto {
  @ApiProperty({ type: [WaybillSplitLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WaybillSplitLineDto)
  splits: WaybillSplitLineDto[];
}
