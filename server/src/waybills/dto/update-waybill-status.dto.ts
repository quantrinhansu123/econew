import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DeliveryReturnAction } from './delivery-return-action.enum';
import { WaybillStatus } from './waybill.enums';

export class UpdateWaybillStatusDto {
  @ApiProperty({ enum: WaybillStatus }) @IsEnum(WaybillStatus) status: WaybillStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() delivery_photo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;

  @ApiPropertyOptional({ description: 'Lý do giao không thành công; bắt buộc khi hoàn hàng' })
  @ValidateIf((dto: UpdateWaybillStatusDto) => dto.status === WaybillStatus.RETURNED)
  @IsString()
  @MaxLength(500)
  return_reason?: string;

  @ApiPropertyOptional({ enum: DeliveryReturnAction, description: 'Hướng xử lý sau khi hoàn hàng' })
  @ValidateIf((dto: UpdateWaybillStatusDto) => dto.status === WaybillStatus.RETURNED)
  @IsEnum(DeliveryReturnAction)
  return_action?: DeliveryReturnAction;

  @ApiPropertyOptional({ description: 'Địa chỉ phát lại; bắt buộc khi chọn giao lại địa chỉ khác' })
  @ValidateIf((dto: UpdateWaybillStatusDto) => dto.return_action === DeliveryReturnAction.REDIRECT_ADDRESS)
  @IsString()
  @MaxLength(500)
  redelivery_address?: string;

  @ApiPropertyOptional({ description: 'Xe/BKS thực hiện giao chặng cuối' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  delivery_vehicle?: string;
}
