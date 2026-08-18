import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { ApproveInternalCostDto } from './dto/approve-internal-cost.dto';
import { ApproveVendorCostDto } from './dto/approve-vendor-cost.dto';
import { CodReconciliationQueryDto } from './dto/cod-reconciliation-query.dto';
import { CreateCashFundDto } from './dto/create-cash-fund.dto';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { HubReconciliationQueryDto } from './dto/hub-reconciliation-query.dto';
import { QueryCashFundsDto } from './dto/query-cash-funds.dto';
import { QueryHubCodWaybillsDto } from './dto/query-hub-cod-waybills.dto';
import { QueryReconciliationsDto } from './dto/query-reconciliations.dto';
import { UpdateCashFundDto } from './dto/update-cash-fund.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';
import { UpdateRemittanceStatusDto } from './dto/update-remittance-status.dto';
import { FinanceService } from './finance.service';

const FINANCE_ROLES = [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR];

@ApiTags('Finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('cash-funds')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'List cash funds and current confirmed COD balances' })
  findCashFunds(@Query() query: QueryCashFundsDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.findCashFunds(query, currentUser);
  }

  @Post('cash-funds')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Create a cash fund' })
  createCashFund(@Body() dto: CreateCashFundDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.createCashFund(dto, currentUser);
  }

  @Patch('cash-funds/:id')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Update a cash fund' })
  updateCashFund(@Param('id') id: string, @Body() dto: UpdateCashFundDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.updateCashFund(id, dto, currentUser);
  }

  @Get('hub-cod-waybills')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'List bills with money to collect on delivery' })
  getHubCodWaybills(@Query() query: QueryHubCodWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.getHubCodWaybills(query, currentUser);
  }

  @Post('reconciliations')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Create hub cash reconciliation' })
  createReconciliation(@Body() dto: CreateReconciliationDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.createReconciliation(dto, currentUser);
  }

  @Get('reconciliations')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'List reconciliations with filters and pagination' })
  findReconciliations(@Query() query: QueryReconciliationsDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.findReconciliations(query, currentUser);
  }

  @Get('reconciliations/:id')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Get reconciliation detail' })
  findReconciliationById(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.findReconciliationById(id, currentUser);
  }

  @Patch('reconciliations/:id')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Update pending reconciliation amounts' })
  updateReconciliation(@Param('id') id: string, @Body() dto: UpdateReconciliationDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.updateReconciliation(id, dto, currentUser);
  }

  @Patch('reconciliations/:id/remittance-status')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Update reconciliation remittance status' })
  updateRemittanceStatus(@Param('id') id: string, @Body() dto: UpdateRemittanceStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.updateRemittanceStatus(id, dto, currentUser);
  }

  @Get('cod-reconciliation')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Get COD reconciliation aggregate' })
  getCodReconciliation(@Query() query: CodReconciliationQueryDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.getCodReconciliation(query, currentUser);
  }

  @Get('hub-reconciliation')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Get hub cash reconciliation aggregate' })
  getHubReconciliation(@Query() query: HubReconciliationQueryDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.getHubReconciliation(query, currentUser);
  }

  @Get('approve/internal')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'List pending internal trip costs' })
  getPendingInternalCosts(@Query() query: QueryReconciliationsDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.getPendingInternalCosts(query, currentUser);
  }

  @Patch('approve/internal/:tripId')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Approve internal trip cost' })
  approveInternalTripCost(@Param('tripId') tripId: string, @Body() dto: ApproveInternalCostDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.approveInternalTripCost(tripId, dto, currentUser);
  }

  @Get('approve/vendor')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'List pending vendor trip costs' })
  getPendingVendorCosts(@Query() query: QueryReconciliationsDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.getPendingVendorCosts(query, currentUser);
  }

  @Patch('approve/vendor/:tripId')
  @RequireRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Approve vendor trip cost' })
  approveVendorTripCost(@Param('tripId') tripId: string, @Body() dto: ApproveVendorCostDto, @CurrentUser() currentUser: UserEntity) {
    return this.financeService.approveVendorTripCost(tripId, dto, currentUser);
  }
}
