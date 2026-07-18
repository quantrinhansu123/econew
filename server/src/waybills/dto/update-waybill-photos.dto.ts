import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWaybillPhotosDto {
  @ApiPropertyOptional({
    description: 'Tối đa 4 URL ảnh bill/hàng hóa, phân cách bằng dấu |',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  delivery_photo_url?: string | null;
}
