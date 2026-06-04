import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateCashJournalEntryDto } from './dto/create-cash-journal-entry.dto';
import { QueryCashJournalEntryDto } from './dto/query-cash-journal-entry.dto';
import { UpdateCashJournalEntryDto } from './dto/update-cash-journal-entry.dto';
import { CashJournalEntryService } from './cash-journal-entry.service';

@ApiTags('Cash Journal Entries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cash-journal-entries')
export class CashJournalEntryController {
  constructor(private readonly cashJournalEntryService: CashJournalEntryService) {}

  @Get()
  @ApiOperation({ summary: 'List Cash Journal Entries' })
  list(@Query() query: QueryCashJournalEntryDto) { return this.cashJournalEntryService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Cash Journal Entries record' })
  findOne(@Param('id') id: string) { return this.cashJournalEntryService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Cash Journal Entries record' })
  create(@Body() dto: CreateCashJournalEntryDto) { return this.cashJournalEntryService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Cash Journal Entries record' })
  update(@Param('id') id: string, @Body() dto: UpdateCashJournalEntryDto) { return this.cashJournalEntryService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Cash Journal Entries record' })
  async remove(@Param('id') id: string) { await this.cashJournalEntryService.remove(id); return { success: true }; }
}
