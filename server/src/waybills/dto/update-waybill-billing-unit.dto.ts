import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateWaybillBillingUnitDto {
  @ApiProperty({ description: 'Đơn vị tính cước (Kg, Khối, Trọn gói, Chuyến, Lô)', example: 'Kg' })
  @IsString()
  @IsNotEmpty()
  billing_unit: string;
}
