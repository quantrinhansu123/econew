import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReceiveWaybillDto {
  @ApiProperty() @IsString() @IsNotEmpty() delivery_photo_url!: string;
}
