import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { AssignWaybillPriorityDto } from './dto/assign-waybill-priority.dto';
import { AssignWaybillRouteDto } from './dto/assign-waybill-route.dto';
import { CancelWaybillDto } from './dto/cancel-waybill.dto';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { CreateWaybillCashVoucherDto } from './dto/create-waybill-cash-voucher.dto';
import { QueryWaybillCashVouchersDto } from './dto/query-waybill-cash-vouchers.dto';
import { QueryReceiverContactsDto } from './dto/query-receiver-contacts.dto';
import { QueryWaybillsDto } from './dto/query-waybills.dto';
import { ReceiveWaybillDto } from './dto/receive-waybill.dto';
import { UpdateCodFeeDto } from './dto/update-cod-fee.dto';
import { CorrectWaybillStatusDto, UpdateLastMileCostDto, UpdateWaybillStatusDto } from './dto/update-waybill-status.dto';
import { UpdateWaybillDto } from './dto/update-waybill.dto';
import { BulkStackOntoTruckDto } from './dto/bulk-stack-onto-truck.dto';
import { BulkUpdateCustomerPaymentStatusDto } from './dto/bulk-update-customer-payment-status.dto';
import { SaveWaybillSplitsDto } from './dto/save-waybill-splits.dto';
import { QueryLoadPlanningBoardDto } from './dto/query-load-planning-board.dto';
import { UpdateSplitLoadStatusDto } from './dto/update-split-load-status.dto';
import { WaybillsService } from './waybills.service';
import { UpdateWaybillPhotosDto } from './dto/update-waybill-photos.dto';
import { UpdateDeliveryPreparationDto } from './dto/update-delivery-preparation.dto';
import { UpdateCodReconciliationDto } from './dto/update-cod-reconciliation.dto';

@ApiTags('Waybills')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('waybills')
export class WaybillsController {
  constructor(private readonly waybillsService: WaybillsService) {}

  @Post()
  @RequireRoles(Roles.WAREHOUSE, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create a new waybill' })
  create(@Body() dto: CreateWaybillDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.create(dto, currentUser);
  }

  @Get()
  @ApiOperation({ summary: 'List waybills' })
  findAll(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.findAll(query, currentUser);
  }

  @Get('delivery-tasks')
  @RequireRoles(Roles.WAREHOUSE, Roles.DRIVER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List last-mile tasks aggregated from all arrived trips' })
  getDeliveryTasks(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getDeliveryTasks(query, currentUser);
  }

  @Get('delivery-resources')
  @RequireRoles(Roles.WAREHOUSE, Roles.DRIVER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List drivers, internal trucks and partners available for last-mile assignment' })
  getDeliveryResources(@Query('hub_id') hubId: string | undefined, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getDeliveryResources(hubId, currentUser);
  }

  @Patch(':id/delivery-preparation')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Confirm customer and prepare a HUB waybill for delivery' })
  updateDeliveryPreparation(@Param('id') id: string, @Body() dto: UpdateDeliveryPreparationDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updateDeliveryPreparation(id, dto, currentUser);
  }

  @Patch(':id/last-mile-cost')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Cập nhật cước giao chặng cuối sau đối soát NCC' })
  updateLastMileCost(@Param('id') id: string, @Body() dto: UpdateLastMileCostDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updateLastMileCost(id, dto, currentUser);
  }

  @Get('load-planning/board')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Load planning board — waybill splits grouped by truck' })
  getLoadPlanningBoard(@Query() query: QueryLoadPlanningBoardDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getLoadPlanningBoard(query, currentUser);
  }

  @Get('inventory/trip-lines')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Inventory expanded by trip/truck split lines' })
  getInventoryTripLines(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getInventoryTripLines(query, currentUser);
  }

  @Post('inventory/stack-onto-truck')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Bulk stack selected inventory lines onto trucks (waybill_splits)' })
  bulkStackOntoTruck(@Body() dto: BulkStackOntoTruckDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.bulkStackOntoTruck(dto, currentUser);
  }

  @Patch('inventory/customer-payment-status')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Bulk update customer payment status for waybills' })
  bulkUpdateCustomerPaymentStatus(@Body() dto: BulkUpdateCustomerPaymentStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.bulkUpdateCustomerPaymentStatus(dto, currentUser);
  }

  @Get('inventory')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List inventory waybills' })
  getInventory(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getInventory(query, currentUser);
  }

  @Get('incoming')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List expected incoming waybills' })
  getIncoming(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getIncoming(query, currentUser);
  }

  @Get('overdue')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List overdue waybills' })
  getOverdue(@Query() query: QueryWaybillsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getOverdue(query, currentUser);
  }

  @Get('next-code')
  @RequireRoles(Roles.WAREHOUSE, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Preview next waybill code (before save)' })
  previewNextCode(@Query('origin_hub_id') originHubId: string | undefined, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.previewNextWaybillCode(originHubId, currentUser);
  }

  @Get('receiver-contacts')
  @ApiOperation({ summary: 'Suggest receiver addresses from previously saved waybills' })
  findReceiverContacts(@Query() query: QueryReceiverContactsDto) {
    return this.waybillsService.findReceiverContacts(query);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Find a waybill by code' })
  getByCode(@Param('code') code: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getByCode(code, currentUser);
  }

  @Get('cash-vouchers')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List cash vouchers by customer code (ma_kh)' })
  searchCashVouchers(@Query() query: QueryWaybillCashVouchersDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.searchCashVouchers(query, currentUser);
  }

  @Patch('splits/:splitId/load-status')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update load status for a split line (Chờ bốc → Đã tới)' })
  updateSplitLoadStatus(
    @Param('splitId') splitId: string,
    @Body() dto: UpdateSplitLoadStatusDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.waybillsService.updateSplitLoadStatus(splitId, dto, currentUser);
  }

  @Get(':id/splits')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get package splits for a waybill (same order, multiple trucks)' })
  getPackageSplits(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.getPackageSplits(id, currentUser);
  }

  @Put(':id/splits')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Save package splits — allocate kiện per truck/trip under one waybill' })
  savePackageSplits(@Param('id') id: string, @Body() dto: SaveWaybillSplitsDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.savePackageSplits(id, dto, currentUser);
  }

  @Get(':id/cash-vouchers')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List cash vouchers (phiếu thu/chi) for a waybill' })
  listCashVouchersForWaybill(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.listCashVouchersForWaybill(id, currentUser);
  }

  @Post(':id/cash-vouchers')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create cash voucher (phiếu thu/chi) for a waybill' })
  createCashVoucher(
    @Param('id') id: string,
    @Body() dto: CreateWaybillCashVoucherDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.waybillsService.createCashVoucher(id, dto, currentUser);
  }

  @Get(':id/history')
  @RequireRoles(Roles.WAREHOUSE, Roles.DRIVER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get field-level waybill edit history (manager only)' })
  findHistory(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.findHistory(id, currentUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get waybill detail' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.findOne(id, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.WAREHOUSE, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update waybill bill data (logistics fields locked after manifest/trip)' })
  update(@Param('id') id: string, @Body() dto: UpdateWaybillDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.update(id, dto, currentUser);
  }

  @Patch(':id/photos')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DRIVER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Replace up to 4 bill/goods photos without changing logistics state' })
  updatePhotos(@Param('id') id: string, @Body() dto: UpdateWaybillPhotosDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updatePhotos(id, dto, currentUser);
  }

  @Put(':id/receive')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Receive a waybill into warehouse' })
  receive(@Param('id') id: string, @Body() dto: ReceiveWaybillDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.receive(id, dto, currentUser);
  }

  @Patch(':id/status')
  @RequireRoles(Roles.DISPATCHER, Roles.DRIVER, Roles.WAREHOUSE, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update waybill status by state machine' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWaybillStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updateStatus(id, dto, currentUser);
  }

  @Patch(':id/status/correction')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Correct an accidentally finalized delivery status' })
  correctStatus(@Param('id') id: string, @Body() dto: CorrectWaybillStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.correctStatus(id, dto, currentUser);
  }

  @Patch(':id/priority')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Assign delivery priority' })
  assignPriority(@Param('id') id: string, @Body() dto: AssignWaybillPriorityDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.assignPriority(id, dto, currentUser);
  }

  @Patch(':id/route')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Assign route code' })
  assignRoute(@Param('id') id: string, @Body() dto: AssignWaybillRouteDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.assignRoute(id, dto, currentUser);
  }

  @Patch(':id/cod-fee')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update COD and fee amounts' })
  updateCodFee(@Param('id') id: string, @Body() dto: UpdateCodFeeDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updateCodFee(id, dto, currentUser);
  }

  @Patch(':id/cod-reconciliation')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Xác nhận hoặc bỏ xác nhận đối soát một vận đơn COD tại bưu cục' })
  updateCodReconciliation(@Param('id') id: string, @Body() dto: UpdateCodReconciliationDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.updateCodReconciliation(id, dto, currentUser);
  }

  @Patch(':id/cancel')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Cancel a waybill' })
  cancel(@Param('id') id: string, @Body() dto: CancelWaybillDto, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.cancel(id, dto, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.DIRECTOR)
  @ApiOperation({ summary: 'Soft delete a waybill (DIRECTOR only)' })
  softDelete(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.waybillsService.softDelete(id, currentUser);
  }
}
