import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class BackupTableDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  primary_key!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  columns!: string[];

  @ApiProperty({ type: [Object] })
  @IsArray()
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

export class ImportBackupDto {
  @ApiProperty({ example: 'supabase-table-backup' })
  @IsIn(['supabase-table-backup'])
  format!: 'supabase-table-backup';

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsIn([1])
  version!: 1;

  @ApiPropertyOptional({ example: 'public' })
  @IsOptional()
  @IsIn(['public'])
  schema?: 'public';

  @ApiProperty({ type: [BackupTableDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupTableDto)
  tables!: BackupTableDto[];

  @ApiPropertyOptional({ enum: ['upsert', 'insert_only', 'replace'], default: 'upsert' })
  @IsOptional()
  @IsIn(['upsert', 'insert_only', 'replace'])
  mode?: 'upsert' | 'insert_only' | 'replace';
}
