import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class AssignUserHubDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  hub_id?: string | null;

  @ApiPropertyOptional({ example: ['1', '2'], description: 'Danh sách bưu cục được phép thao tác; phần tử đầu là bưu cục mặc định' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  hub_ids?: string[];
}
