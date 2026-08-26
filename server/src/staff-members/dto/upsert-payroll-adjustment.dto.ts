import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertPayrollAdjustmentDto {
  @Type(() => Number) @IsNumber() @Min(0) reward_amount: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
