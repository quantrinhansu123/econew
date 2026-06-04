import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ExpenseCategory } from './expense.enums';

const CATEGORIES = Object.values(ExpenseCategory);

export class CreateExpenseDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  trip_id: number;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsString()
  @IsIn(CATEGORIES)
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
}
