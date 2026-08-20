import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateWaybillCashVoucherDto {
  @ApiProperty({ enum: ['Thu', 'Chi'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['Thu', 'Chi'])
  voucher_type: 'Thu' | 'Chi';

  @ApiPropertyOptional({ enum: ['MANUAL', 'CUSTOMER_PAYOUT'] })
  @IsOptional()
  @IsString()
  @IsIn(['MANUAL', 'CUSTOMER_PAYOUT'])
  source_type?: 'MANUAL' | 'CUSTOMER_PAYOUT';

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Sổ quỹ thu hoặc chi tiền' })
  @Transform(({ value }) => String(value))
  @IsString()
  @IsNotEmpty()
  fund_id: string;

  @ApiPropertyOptional({ description: 'Mã bill đang hiển thị tại thời điểm lập phiếu, dùng để chống ghi nhầm đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  waybill_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;

  @ApiPropertyOptional({ description: 'URL or base64 data URL of attachment image' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  image_url?: string;
}
