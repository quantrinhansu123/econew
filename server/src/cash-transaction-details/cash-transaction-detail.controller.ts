import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateCashTransactionDetailDto } from './dto/create-cash-transaction-detail.dto';
import { QueryCashTransactionDetailDto } from './dto/query-cash-transaction-detail.dto';
import { UpdateCashTransactionDetailDto } from './dto/update-cash-transaction-detail.dto';
import { CashTransactionDetailService } from './cash-transaction-detail.service';

@ApiTags('Cash Transaction Details')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cash-transaction-details')
export class CashTransactionDetailController {
  constructor(private readonly cashTransactionDetailService: CashTransactionDetailService) {}

  @Get()
  @ApiOperation({ summary: 'List Cash Transaction Details' })
  list(@Query() query: QueryCashTransactionDetailDto) { return this.cashTransactionDetailService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Cash Transaction Details record' })
  findOne(@Param('id') id: string) { return this.cashTransactionDetailService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Cash Transaction Details record' })
  create(@Body() dto: CreateCashTransactionDetailDto) { return this.cashTransactionDetailService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Cash Transaction Details record' })
  update(@Param('id') id: string, @Body() dto: UpdateCashTransactionDetailDto) { return this.cashTransactionDetailService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Cash Transaction Details record' })
  async remove(@Param('id') id: string) { await this.cashTransactionDetailService.remove(id); return { success: true }; }
}
