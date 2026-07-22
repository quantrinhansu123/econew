import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCustomerDto {
  @ApiPropertyOptional({ default: 'KHACH_HANG' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customer_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_suspended?: boolean;

  @ApiProperty({ example: 'AQUAN48' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: 'A Quân' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(255) short_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) english_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) tax_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phone_landline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) id_number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) mobile?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) bank_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) bank_account?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) bank_account_holder?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) manager_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) delivery_handler?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) contact_person?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) mechanism?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) portal_password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) credit_type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) contract_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) price_table?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) contact_address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) receiver_han?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address_han?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phone_han?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) receiver_hcm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address_hcm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phone_hcm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) receiver_dng?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address_dng?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phone_dng?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) destination_province?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) discount_percent?: number;
  @ApiPropertyOptional({ default: 'ACTIVE' }) @IsOptional() @IsString() @MaxLength(32) status?: string;
}
