import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsDate, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVendorPaymentDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  payment_date: Date;

  @ApiProperty({ example: 25000000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  fund_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cost_category: string;

  @ApiPropertyOptional({ example: 'Thanh toán cước xe tháng 5 cho nhà xe Chiến' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [Number], description: 'Gắn phiếu chi với các chuyến xe cụ thể' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  trip_ids?: number[];
}
