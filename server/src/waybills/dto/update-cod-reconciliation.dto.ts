import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class UpdateCodReconciliationDto {
  @ApiProperty({ description: 'Đánh dấu khoản phải thu khi phát đã được bưu cục xác nhận' })
  @IsBoolean()
  confirmed: boolean;

  @ApiPropertyOptional({ description: 'Sổ quỹ nhận tiền; bắt buộc khi confirmed=true' })
  @ValidateIf((dto: UpdateCodReconciliationDto) => dto.confirmed)
  @IsString()
  @IsNotEmpty()
  fund_id?: string;
}
