import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class BulkStackOntoTruckLineDto {
  @ApiProperty() @IsString() waybill_id: string;
  @ApiProperty() @IsString() truck_id: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) loading_position?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) package_count?: number;
  @ApiPropertyOptional({ description: 'Cước trả NCC — tùy chọn, ghi công nợ khi có giá trị' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  vendor_cost?: number;
}

export class BulkStackOntoTruckDto {
  @ApiProperty({ type: [BulkStackOntoTruckLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkStackOntoTruckLineDto)
  items: BulkStackOntoTruckLineDto[];
}
