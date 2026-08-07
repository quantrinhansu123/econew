import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class LoadingSequenceItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  waybill_id: number;

  @ApiProperty({ description: '1 = sâu trong xe (dỡ cuối)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loading_position: number;

  @ApiProperty({ required: false, description: 'Số kiện thực đi trên chuyến' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  package_count?: number;
}

export class UpdateLoadingSequenceDto {
  @ApiProperty({ type: [LoadingSequenceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoadingSequenceItemDto)
  items: LoadingSequenceItemDto[];
}
