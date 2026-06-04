import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min, ValidateNested } from 'class-validator';

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
}

export class UpdateLoadingSequenceDto {
  @ApiProperty({ type: [LoadingSequenceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoadingSequenceItemDto)
  items: LoadingSequenceItemDto[];
}
