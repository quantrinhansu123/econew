import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateNorthSouthShipmentDto {
  @IsString()
  @IsNotEmpty()
  bill: string;

  @IsString()
  @IsNotEmpty()
  goods_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  package_count: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight: number;

  @IsString()
  @IsNotEmpty()
  service_type: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transfer_fee: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_amount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cod_amount: number;

  @IsString()
  @IsNotEmpty()
  payment_method: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  pickup_vehicle_status?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  external_vehicle_cost: number;

  @IsOptional()
  @IsString()
  external_vehicle_payment_method?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customer_discount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  final_profit: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  carrier_holding_amount: number;

}
