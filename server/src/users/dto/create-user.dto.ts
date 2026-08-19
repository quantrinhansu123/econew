import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'staff@eco.test' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsPhoneNumber('VN')
  phone?: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_name: string;

  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  role_mask: number;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  hub_id?: string;

  @ApiPropertyOptional({ example: ['1', '2'], description: 'Danh sách bưu cục được phép thao tác; phần tử đầu là bưu cục mặc định' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  hub_ids?: string[];
}
