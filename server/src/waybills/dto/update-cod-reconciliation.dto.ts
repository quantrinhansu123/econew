import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCodReconciliationDto {
  @ApiProperty({ description: 'Đánh dấu vận đơn COD đã được bưu cục xác nhận đối soát' })
  @IsBoolean()
  confirmed: boolean;
}
