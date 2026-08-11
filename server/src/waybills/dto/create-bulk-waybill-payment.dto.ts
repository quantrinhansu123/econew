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
  @ApiProperty({ type: [BulkWaybillPaymentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkWaybillPaymentItemDto)
  items: BulkWaybillPaymentItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;

}
