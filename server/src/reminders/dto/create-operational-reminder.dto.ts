import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOperationalReminderDto {
  @ApiProperty({ example: 'Gia hạn đăng kiểm xe' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-09-15' })
  @IsDateString()
  remind_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Xe nội bộ liên quan; có thể bỏ trống cho cảnh báo chung' })
  @IsOptional()
  @IsString()
  truck_id?: string;

  @ApiPropertyOptional({ description: 'Bưu cục liên quan; tự lấy theo xe nếu có truck_id' })
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional({ default: 'VEHICLE_DOCUMENT' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
}
