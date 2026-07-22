import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReceiveWaybillDto {
  @ApiProperty({ description: 'Một đến bốn URL ảnh từ endpoint upload ảnh vận đơn' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  delivery_photo_url!: string;
}
