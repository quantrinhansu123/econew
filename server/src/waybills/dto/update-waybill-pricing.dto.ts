import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';

export enum WaybillPricingField {
  UNIT_PRICE = 'unit_price',
  SURCHARGE = 'surcharge',
  TRANSIT_FEE = 'transit_fee',
  TOTAL_AMOUNT = 'total_amount',
  FREIGHT_AMOUNT = 'freight_amount',
  COD_AMOUNT = 'cod_amount',
}

export class UpdateWaybillPricingDto {
  @ApiProperty({ enum: WaybillPricingField })
  @IsEnum(WaybillPricingField)
  field: WaybillPricingField;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}
