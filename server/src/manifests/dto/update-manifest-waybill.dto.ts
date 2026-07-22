import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateManifestWaybillDto {
  @ApiProperty({ example: 5, description: 'Số kiện của vận đơn trên bảng kê này' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  package_count: number;
}
