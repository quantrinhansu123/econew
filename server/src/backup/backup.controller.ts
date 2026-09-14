import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { BackupService } from './backup.service';
import { ExportBackupDto } from './dto/export-backup.dto';
import { ImportBackupDto } from './dto/import-backup.dto';

@ApiTags('Backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.DIRECTOR)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('tables')
  @ApiOperation({ summary: 'Danh sách bảng public (Supabase schema) để backup' })
  listTables() {
    return this.backupService.listTables();
  }

  @Post('export')
  @ApiOperation({ summary: 'Xuất backup JSON định dạng supabase-table-backup' })
  async export(@Body() dto: ExportBackupDto, @Res({ passthrough: true }) res: Response) {
    const backup = await this.backupService.exportTables(dto.tables);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="eco-backup-${stamp}.json"`);
    return backup;
  }

  @Post('import')
  @ApiOperation({ summary: 'Khôi phục dữ liệu từ file backup JSON' })
  import(@Body() dto: ImportBackupDto) {
    return this.backupService.importBackup(dto);
  }
}
