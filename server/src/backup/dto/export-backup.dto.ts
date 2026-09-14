import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ExportBackupDto {
  @ApiProperty({ type: [String], example: ['hubs', 'users'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tables!: string[];
}
