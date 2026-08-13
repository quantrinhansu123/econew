import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsDate, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class UpdateTripRouteStopDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => value == null ? value : String(value))
  @IsString()
  hub_id: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  expected_arrival_at: Date;
}

export class UpdateTripDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  truck_id?: number | null;

  @ApiPropertyOptional({ description: 'BKS nhập thủ công khi chuyến không gắn xe trong danh mục', nullable: true })
  @IsOptional()
  @Transform(({ value }) => value == null ? value : String(value).trim().toUpperCase())
  @IsString()
  @MaxLength(32)
  manual_license_plate?: string | null;

  @ApiPropertyOptional({ description: 'Tên tài xế thực hiện chuyến', nullable: true })
  @IsOptional()
  @Transform(({ value }) => value == null ? value : String(value).trim())
  @IsString()
  @MaxLength(255)
  driver_name?: string | null;

  @ApiPropertyOptional({ description: 'Số điện thoại tài xế thực hiện chuyến', nullable: true })
  @IsOptional()
  @Transform(({ value }) => value == null ? value : String(value).trim())
  @IsString()
  @MaxLength(32)
  driver_phone?: string | null;

  @ApiPropertyOptional({ description: 'Nhà cung cấp thực hiện chuyến' })
  @IsOptional()
  @Transform(({ value }) => value == null ? value : String(value))
  @IsString()
  vendor_id?: string | null;

  @ApiPropertyOptional({ description: 'Cước xe phải trả NCC', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  trip_cost?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  departure_time?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  arrival_time?: Date;

  @ApiPropertyOptional({ type: [UpdateTripRouteStopDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((stop: UpdateTripRouteStopDto) => String(stop.hub_id))
  @ValidateNested({ each: true })
  @Type(() => UpdateTripRouteStopDto)
  route_stops?: UpdateTripRouteStopDto[];
}
