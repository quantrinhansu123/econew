import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateChanhShipmentDto {
  @IsString()
  @IsNotEmpty()
  province_code: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  bill_count: number;

  @IsString()
  @IsNotEmpty()
  company_name: string;

  @IsString()
  @IsNotEmpty()
  goods_name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  goods_type: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price: number;

  @IsString()
  @IsNotEmpty()
  cost_type: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @IsNotEmpty()
  carrier_name: string;

  @IsString()
  @IsNotEmpty()
  license_plate: string;

  @IsDateString()
  shipment_date: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bo_fee: number;

  @IsString()
  @IsNotEmpty()
  bill: string;

}
