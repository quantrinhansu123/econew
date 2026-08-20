import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  trip_id: number;

  @ApiPropertyOptional({ description: 'Mã hoặc tên loại chi phí; cho phép nhập loại mới' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  hub_id?: number;

  @ApiPropertyOptional({ description: 'Nhà cung cấp phát sinh khoản chi' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vendor_id?: number;

  @ApiPropertyOptional({ description: 'Sổ quỹ đã chi tiền; để trống nếu mới ghi nhận công nợ' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fund_id?: number;

  @ApiPropertyOptional({ type: [String], description: 'Tối đa 6 ảnh chứng từ hoặc biên lai' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  receipt_urls?: string[];
}
