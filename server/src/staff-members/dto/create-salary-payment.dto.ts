import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSalaryPaymentDto {
  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  fund_id: string;
}
