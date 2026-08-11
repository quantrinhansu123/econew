import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ProofOfDeliveryDto {
  @ApiProperty({ description: 'Mã vận đơn đọc được từ barcode/QR trên ảnh phiếu có chữ ký' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  waybill_code!: string;

  @ApiProperty({ description: 'URL ảnh phiếu vận đơn có chữ ký đã upload' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  photo_url!: string;
}
