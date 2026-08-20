import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateStaffMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  employee_code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_name: string;

  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  department_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  position: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  identity_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsDateString()
  hire_date?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  employment_status?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? null : value == null ? value : String(value))
  @IsString()
  hub_id?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === '' ? null : value == null ? value : String(value))
  @IsString()
  user_id?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  base_salary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  meal_allowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transport_allowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  other_allowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overtime_hourly_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  standard_work_days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

}
