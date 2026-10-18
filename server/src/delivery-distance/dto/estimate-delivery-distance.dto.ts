import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class EstimateDeliveryDistanceDto {
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  dest_hub_id: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((dto: EstimateDeliveryDistanceDto) => !dto.receiver_coordinates || Boolean(dto.receiver_address))
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  receiver_address?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/)
  receiver_coordinates?: string;
}
