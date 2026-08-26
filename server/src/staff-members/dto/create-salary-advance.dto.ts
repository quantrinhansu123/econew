import { Transform, Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateSalaryAdvanceDto {
  @Transform(({ value }) => String(value)) @IsString() @IsNotEmpty() staff_member_id: string;
  @IsDateString() advance_date: string;
  @Type(() => Number) @IsNumber() @Min(1) amount: number;
  @Transform(({ value }) => String(value)) @IsString() @IsNotEmpty() fund_id: string;
  @IsOptional() @Transform(({ value }) => value == null || value === '' ? undefined : String(value)) @IsString() hub_id?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
