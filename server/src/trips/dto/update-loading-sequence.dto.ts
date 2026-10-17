import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

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
  @ValidateNested({ each: true })
  @Type(() => LoadingSequenceItemDto)
  items: LoadingSequenceItemDto[];

  @ApiProperty({ required: false, description: 'Ghi chú chung của bảng kê' })
  @IsOptional()
  @IsString()
  note?: string;
}
