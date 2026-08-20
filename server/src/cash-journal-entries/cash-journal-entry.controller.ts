import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
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
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List Cash Journal Entries' })
  list(@Query() query: QueryCashJournalEntryDto, @CurrentUser() currentUser: UserEntity) { return this.cashJournalEntryService.list(query, currentUser); }

  @Get(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get Cash Journal Entries record' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) { return this.cashJournalEntryService.findOne(id, currentUser); }

  @Post()
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Cash Journal Entries record' })
  create(@Body() dto: CreateCashJournalEntryDto, @CurrentUser() currentUser: UserEntity) { return this.cashJournalEntryService.create(dto, currentUser); }

  @Patch(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Cash Journal Entries record' })
  update(@Param('id') id: string, @Body() dto: UpdateCashJournalEntryDto, @CurrentUser() currentUser: UserEntity) { return this.cashJournalEntryService.update(id, dto, currentUser); }

  @Delete(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Cash Journal Entries record' })
  async remove(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) { await this.cashJournalEntryService.remove(id, currentUser); return { success: true }; }
}
