import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsDate, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

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
  truck_id?: number;

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
