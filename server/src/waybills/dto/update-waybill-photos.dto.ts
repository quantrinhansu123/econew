import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateWaybillPhotosDto {
  @ApiProperty({
    description: 'Tối đa 4 URL ảnh đã upload, phân cách bằng dấu |; dùng null để xóa ảnh khi trạng thái cho phép',
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(12000)
  delivery_photo_url!: string | null;
}
