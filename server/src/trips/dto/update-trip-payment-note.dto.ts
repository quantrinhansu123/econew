import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTripPaymentNoteDto {
  @ApiPropertyOptional({ description: 'Ghi chú thanh toán NCC hiển thị trên sổ chuyến', nullable: true })
  @IsOptional()
  @Transform(({ value }) => value == null ? null : String(value).trim())
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
