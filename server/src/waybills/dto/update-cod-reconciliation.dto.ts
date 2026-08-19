import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCodReconciliationDto {
  @ApiProperty({ description: 'Đánh dấu khoản phải thu khi phát đã được bưu cục xác nhận' })
  @IsBoolean()
  confirmed: boolean;

  @ApiPropertyOptional({ description: 'Sổ quỹ nhận tiền; bắt buộc khi confirmed=true' })
  @ValidateIf((dto: UpdateCodReconciliationDto) => dto.confirmed)
  @IsString()
  @IsNotEmpty()
  fund_id?: string;

  @ApiPropertyOptional({ description: 'Ghi chú cho lần xác nhận tiền về sổ quỹ', maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;
}
