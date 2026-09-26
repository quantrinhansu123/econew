import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class SyncWaybillCashVoucherDto {
  @ApiProperty({ description: 'Số tiền phiếu thu đã xem trước' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expected_current_amount: number;

  @ApiProperty({ description: 'Số tiền đích đã xem trước; từ chối nếu vận đơn đổi trước khi xác nhận' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expected_amount: number;
}
