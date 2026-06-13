import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { AttendanceCheckType } from '../attendance.enums';

export class AttendanceCheckDto {
  @ApiProperty({ enum: AttendanceCheckType })
  @IsEnum(AttendanceCheckType)
  type: AttendanceCheckType;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy: number;
}
