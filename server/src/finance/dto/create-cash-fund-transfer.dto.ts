import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCashFundTransferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  from_fund_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  to_fund_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  transfer_date?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

