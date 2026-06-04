import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTripDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  truck_id?: number | null;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  manifest_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  start_hub_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  end_hub_id: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  departure_time: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  arrival_time?: Date;

  @ApiPropertyOptional({ description: 'Chi phí chuyến xe — cộng vào công nợ NCC' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  trip_cost?: number;

  @ApiPropertyOptional({ description: 'Alias trip_cost (legacy)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  other_costs?: number;
}
