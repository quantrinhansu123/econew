import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkWaybillPaymentItemDto {
  @ApiProperty({ type: String })
  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  waybill_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  waybill_code: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;
}

export class CreateBulkWaybillPaymentDto {
  @ApiPropertyOptional({ type: [BulkWaybillPaymentItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => BulkWaybillPaymentItemDto)
  items?: BulkWaybillPaymentItemDto[];

  @ApiPropertyOptional({ description: 'Mã khách hàng khi thanh toán công nợ tồn cũ' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customer_code?: string;

  @ApiPropertyOptional({ description: 'Số tiền thanh toán công nợ tồn cũ' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  opening_debt_amount?: number;

  @ApiProperty({ description: 'Sổ quỹ nhận tiền' })
  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  fund_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;

}
