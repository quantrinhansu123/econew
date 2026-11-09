import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class SalaryTierItemDto {
  @IsString()
  @MaxLength(120)
  label: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  base_salary: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  rate_percent: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(31)
  work_days: number;
}

export class UpsertPayrollAdjustmentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reward_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  base_salary_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowance_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(31)
  standard_days_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(31)
  probation_days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  probation_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(31)
  official_days_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overtime_hours_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overtime_pay_override?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  insurance_deduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  advance_override?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryTierItemDto)
  salary_tiers?: SalaryTierItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
