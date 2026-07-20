import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDate, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class BulkStackOntoTruckLineDto {
  @ApiProperty() @IsString() waybill_id: string;
  @ApiProperty() @IsString() truck_id: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) loading_position?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) package_count?: number;
  @ApiPropertyOptional({ description: 'Cước trả NCC — tùy chọn, ghi công nợ khi có giá trị' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vendor_cost?: number;

  @ApiPropertyOptional({ description: 'Hướng dẫn phát / ghi chú cho dòng xếp hàng' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Thời gian dự kiến tới; mặc định 3 ngày sau lúc xếp hàng' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expected_arrival_at?: Date;
}

export class BulkStackOntoTruckDto {
  @ApiProperty({ type: [BulkStackOntoTruckLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkStackOntoTruckLineDto)
  items: BulkStackOntoTruckLineDto[];

  @ApiPropertyOptional({ description: 'Tên tài xế dùng chung cho các chuyến được tạo' })
  @IsOptional()
  @IsString()
  driver_name?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại tài xế dùng chung cho các chuyến được tạo' })
  @IsOptional()
  @IsString()
  driver_phone?: string;

  @ApiPropertyOptional({ description: 'NCC dùng chung cho xe/chuyến được tạo' })
  @IsOptional()
  @IsString()
  vendor_id?: string;

  @ApiPropertyOptional({ description: 'Tổng cước NCC dùng chung, được phân bổ theo số kiện của từng HUB' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vendor_cost?: number;
}
