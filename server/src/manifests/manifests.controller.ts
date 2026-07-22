import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { AddWaybillsToManifestDto } from './dto/add-waybills-to-manifest.dto';
import { AssignManifestTripDto } from './dto/assign-manifest-trip.dto';
import { CloseManifestDto } from './dto/close-manifest.dto';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { QueryManifestsDto } from './dto/query-manifests.dto';
import { UpdateManifestDto } from './dto/update-manifest.dto';
import { UpdateManifestKanbanDto } from './dto/update-manifest-kanban.dto';
import { UpdateManifestWaybillDto } from './dto/update-manifest-waybill.dto';
import { ManifestsService } from './manifests.service';

@ApiTags('Manifests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('manifests')
export class ManifestsController {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Post()
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create a draft manifest' })
  create(@Body() dto: CreateManifestDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.create(dto, currentUser);
  }

  @Get()
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List manifests' })
  findAll(@Query() query: QueryManifestsDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.findAll(query, currentUser);
  }

  @Get(':id')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get manifest detail with waybills' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.findOne(id, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update a draft manifest' })
  update(@Param('id') id: string, @Body() dto: UpdateManifestDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.update(id, dto, currentUser);
  }

  @Patch(':id/kanban')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.DRIVER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update manifest kanban status (Đang chạy / Đã tới) and editable fields' })
  updateKanban(@Param('id') id: string, @Body() dto: UpdateManifestKanbanDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.updateKanban(id, dto, currentUser);
  }

  @Patch(':id/expected-arrival')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update expected arrival for a manifest transport summary' })
  updateExpectedArrival(@Param('id') id: string, @Body() dto: { expected_arrival_time?: Date | string | null }, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.updateExpectedArrival(id, dto, currentUser);
  }

  @Post(':id/waybills')
  @RequireRoles(Roles.DISPATCHER, Roles.PACKER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Add waybills to a draft manifest' })
  addWaybills(@Param('id') id: string, @Body() dto: AddWaybillsToManifestDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.addWaybills(id, dto, currentUser);
  }

  @Patch(':id/waybills/:waybillId')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update package quantity for a waybill on an editable manifest trip' })
  updateWaybill(
    @Param('id') id: string,
    @Param('waybillId') waybillId: string,
    @Body() dto: UpdateManifestWaybillDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.manifestsService.updateWaybillPackageCount(id, waybillId, dto, currentUser);
  }

  @Delete(':id/waybills/:waybillId')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Remove a waybill from a draft manifest' })
  removeWaybill(@Param('id') id: string, @Param('waybillId') waybillId: string, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.removeWaybill(id, waybillId, currentUser);
  }

  @Patch(':id/close')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Close a manifest and move waybills to MANIFEST_CLOSED' })
  closeManifest(@Param('id') id: string, @Body() dto: CloseManifestDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.closeManifest(id, dto, currentUser);
  }

  @Patch(':id/assign-trip')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Assign a closed manifest to a trip' })
  assignTrip(@Param('id') id: string, @Body() dto: AssignManifestTripDto, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.assignTrip(id, dto, currentUser);
  }

  @Patch(':id/dispatch-rows')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Save editable dispatch sheet fields for manifest rows' })
  updateDispatchRows(@Param('id') id: string, @Body() dto: { rows?: Array<{ waybill_id?: string | number; fields?: Record<string, unknown> }> }, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.updateDispatchRows(id, dto, currentUser);
  }

  @Get(':id/print')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get printable manifest data without hidden financial fields' })
  getPrintableManifest(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.getPrintableManifest(id, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Soft delete a draft manifest' })
  softDelete(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.manifestsService.softDelete(id, currentUser);
  }
}
