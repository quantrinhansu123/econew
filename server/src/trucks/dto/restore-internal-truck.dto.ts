import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RestoreInternalTruckDto {
  @ApiProperty({ description: 'Bưu cục HAN hoặc HCM sẽ quản lý xe nội bộ' })
  @IsString()
  @IsNotEmpty()
  hub_id: string;
}
