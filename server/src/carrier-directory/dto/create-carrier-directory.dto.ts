import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateCarrierDirectoryDto {
  @IsString()
  @IsNotEmpty()
  region: string;

  @IsString()
  @IsNotEmpty()
  carrier_name: string;

  @IsString()
  @IsNotEmpty()
  license_plate: string;

}
