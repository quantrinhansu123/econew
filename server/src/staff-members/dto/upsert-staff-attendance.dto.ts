import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertStaffAttendanceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  work_days: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  overtime_hours: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
