import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { BulkDeleteVendorPaymentsDto } from './dto/bulk-delete-vendor-payments.dto';
import { BulkUpdateTripVendorPaymentDto } from './dto/bulk-update-trip-vendor-payment.dto';
import { QueryVendorDebtDto } from './dto/query-vendor-debt.dto';
import { QueryVendorTripPayablesDto } from './dto/query-vendor-trip-payables.dto';
import { QueryVendorPaymentsDto } from './dto/query-vendor-payments.dto';
import { QueryVendorsDto } from './dto/query-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpsertVendorDto } from './dto/upsert-vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('Vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create vendor configuration' })
  create(@Body() dto: UpsertVendorDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.create(dto, currentUser);
  }

  @Get()
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List vendor configurations' })
  findAll(@Query() query: QueryVendorsDto) {
    return this.vendorsService.findAll(query);
  }

  @Get('active')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List active vendors' })
  findActive(@Query() query: QueryVendorsDto) {
    return this.vendorsService.findActive(query);
  }

  @Get('debt-report')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Công nợ phải trả theo nhà cung cấp' })
  debtReport(@Query() query: QueryVendorDebtDto) {
    return this.vendorsService.getDebtReport(query);
  }

  @Get('trip-payables')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Sổ phải trả NCC theo chuyến xe đã khởi hành' })
  tripPayables(@Query() query: QueryVendorTripPayablesDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.getTripPayablesLedger(query, currentUser);
  }

  @Patch('trip-payables/payment-status')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Cập nhật trạng thái thanh toán nhiều chuyến NCC' })
  bulkUpdateTripPaymentStatus(@Body() dto: BulkUpdateTripVendorPaymentDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.bulkUpdateTripVendorPayment(dto, currentUser);
  }

  @Get('payments')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Danh sách phiếu chi NCC (toàn hệ thống)' })
  listAllPayments(@Query() query: QueryVendorPaymentsDto) {
    return this.vendorsService.listAllPayments(query);
  }

  @Post('payments/bulk-delete')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Xóa nhiều phiếu chi NCC' })
  bulkDeletePayments(@Body() dto: BulkDeleteVendorPaymentsDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.deletePayments(dto.ids, currentUser);
  }

  @Delete('payments/:paymentId')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Xóa một phiếu chi NCC' })
  deletePayment(@Param('paymentId') paymentId: string, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.deletePayments([paymentId], currentUser);
  }

  @Get(':id/debt-dashboard')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Bảng kê chuyến xe & tổng cước theo NCC trong kỳ' })
  debtDashboard(@Param('id') id: string, @Query() query: QueryVendorDebtDto) {
    return this.vendorsService.getDebtDashboard(id, query);
  }

  @Get(':id/ledger')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Sổ cái công nợ — phát sinh chuyến & phiếu chi kèm dư nợ' })
  ledger(@Param('id') id: string, @Query() query: QueryVendorDebtDto) {
    return this.vendorsService.getLedger(id, query);
  }

  @Get(':id/payments')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Danh sách phiếu chi NCC' })
  listPayments(@Param('id') id: string) {
    return this.vendorsService.listPayments(id);
  }

  @Post(':id/payments')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Ghi nhận thanh toán cho NCC (có thể nhiều đợt)' })
  recordPayment(@Param('id') id: string, @Body() dto: CreateVendorPaymentDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.recordPayment(id, dto, currentUser);
  }

  @Get(':id')
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get vendor detail' })
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update vendor information' })
  update(@Param('id') id: string, @Body() dto: UpsertVendorDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.update(id, dto, currentUser);
  }

  @Patch(':id/status')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Enable or disable vendor' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateVendorStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.updateStatus(id, dto, currentUser);
  }

  @Patch(':id/routes')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update vendor service routes' })
  updateRoutes(@Param('id') id: string, @Body() body: Record<string, unknown> | unknown[], @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.updateRoutes(id, body, currentUser);
  }

  @Patch(':id/pricing')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update vendor reference pricing' })
  updatePricing(@Param('id') id: string, @Body() body: Record<string, unknown> | unknown[], @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.updatePricing(id, body, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete vendor configuration' })
  delete(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.vendorsService.delete(id, currentUser);
  }
}
