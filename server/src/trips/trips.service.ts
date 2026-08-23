import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { PaymentType, TripStatus, VendorTripPaymentStatus, WaybillState } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TruckStatus } from '../trucks/dto/truck.enums';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { VendorsService } from '../vendors/vendors.service';
import { VendorDebtEntryEntity } from '../vendors/vendor-debt-entry.entity';
import { VendorPaymentEntity } from '../vendors/vendor-payment.entity';
import { WaybillsService } from '../waybills/waybills.service';
import { WaybillEntity } from '../waybills/waybill.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { WaybillSplitLoadStatus } from '../waybills/dto/waybill-split-load-status.enum';
import { ArriveTripDto } from './dto/arrive-trip.dto';
import { AssignManifestDto } from './dto/assign-manifest.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { QueryTripsDto } from './dto/query-trips.dto';
import { QueryExpectedArrivalsDto } from './dto/query-expected-arrivals.dto';
import { QueryAllocationBoardDto } from './dto/query-allocation-board.dto';
import { UpdateLoadingSequenceDto } from './dto/update-loading-sequence.dto';
import { UpdateTripCargoTotalsDto } from './dto/update-trip-cargo-totals.dto';
import { UpdateTripCostsDto } from './dto/update-trip-costs.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripEntity } from './trip.entity';
import { resolveTripArrivalSchedule } from './trip-arrival-schedule';

const ACTIVE_TRIP_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT];
const LOADING_SEQUENCE_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED];
const ALLOCATION_BOARD_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED];

type Money = string | number | null | undefined;

interface IncomingTripFinancialAllocation {
  waybill_count: number;
  planned_total_weight: number;
  planned_total_volume: number;
  total_collect: number;
  total_revenue: number;
}

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
    @InjectRepository(ManifestWaybillEntity) private readonly manifestWaybillsRepository: Repository<ManifestWaybillEntity>,
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(WaybillSplitEntity) private readonly waybillSplitsRepository: Repository<WaybillSplitEntity>,
    @InjectRepository(VendorDebtEntryEntity) private readonly vendorDebtEntriesRepository: Repository<VendorDebtEntryEntity>,
    @InjectRepository(VendorPaymentEntity) private readonly vendorPaymentsRepository: Repository<VendorPaymentEntity>,
    private readonly vendorsService: VendorsService,
    private readonly waybillsService: WaybillsService,
  ) {}

  async create(dto: CreateTripDto, currentUser: UserEntity): Promise<TripEntity> {
    const truck = await this.validateTruck(dto.truck_id);
    const manifestId = this.normalizeOptionalId(dto.manifest_id, 'manifest_id');
    const manifest = manifestId == null ? null : await this.validateManifestForAssignment(manifestId);
    await this.validateHubs(String(dto.start_hub_id), String(dto.end_hub_id), manifest);
    if (manifestId != null) await this.assertManifestNotInActiveTrip(manifestId);
    const departureTime = this.normalizeDate(dto.departure_time, 'departure_time');
    const arrivalTime = this.normalizeOptionalDate(dto.arrival_time, 'arrival_time');
    this.validateTripTimes(departureTime, arrivalTime, false);

    const tripCostAmount = this.resolveTripCost(dto);
    const trip = this.tripsRepository.create({
      truck_id: dto.truck_id == null ? null : String(dto.truck_id),
      manifest_id: manifestId,
      start_hub_id: String(dto.start_hub_id),
      end_hub_id: String(dto.end_hub_id),
      departure_time: departureTime,
      arrival_time: arrivalTime,
      expected_arrival_time: arrivalTime,
      status: TripStatus.PLANNED,
      trip_cost: tripCostAmount > 0 ? String(tripCostAmount) : null,
      other_costs: tripCostAmount > 0 ? String(tripCostAmount) : null,
      driver_name: dto.driver_name?.trim() || truck?.ten_lai_xe?.trim() || null,
      driver_phone: dto.driver_phone?.trim() || null,
      vendor_id: truck?.vendor_id ?? null,
    });

    const savedTrip = await this.tripsRepository.save(trip);
    if (truck?.vendor_id && tripCostAmount > 0) {
      await this.vendorsService.addPayableDebt(
        truck.vendor_id,
        tripCostAmount,
        savedTrip.id,
        `Chi phí chuyến #${savedTrip.id}`,
      );
    }
    if (manifest) {
      manifest.status = ManifestStatus.ASSIGNED_TO_TRIP;
      await this.manifestsRepository.save(manifest);
    }
    if (truck) {
      truck.status = TruckStatus.ASSIGNED;
      await this.trucksRepository.save(truck);
    }
    return savedTrip;
  }

  async findAll(query: QueryTripsDto, currentUser: UserEntity) {
    await this.processScheduledArrivals();
    const assignedHubIds = getAssignedHubIds(currentUser);
    const hubScopeId =
      query.end_hub_id != null
        ? String(query.end_hub_id)
        : query.start_hub_id != null
          ? String(query.start_hub_id)
          : isManager(currentUser.role_mask)
            ? undefined
            : assignedHubIds.length === 1 ? assignedHubIds[0] : undefined;

    const backfillStatuses = new Set<string>([
      TripStatus.IN_TRANSIT,
      TripStatus.ARRIVED,
      TripStatus.COMPLETED,
    ]);
    if (!query.status || backfillStatuses.has(String(query.status))) {
      await this.waybillsService.backfillInTransitTripsForHub(hubScopeId);
    }

    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 10);
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .orderBy('trip.departure_time', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.keyword) {
      qb.andWhere(new Brackets((inner) => {
        inner.where('manifest.manifest_code ILIKE :keyword', { keyword: `%${query.keyword}%` })
          .orWhere('truck.license_plate ILIKE :keyword', { keyword: `%${query.keyword}%` });
      }));
    }
    if (query.status) qb.andWhere('trip.status = :status', { status: query.status });
    if (query.truck_id) qb.andWhere('trip.truck_id = :truckId', { truckId: String(query.truck_id) });
    if (query.start_hub_id) qb.andWhere('trip.start_hub_id = :startHubId', { startHubId: String(query.start_hub_id) });
    if (query.end_hub_id) qb.andWhere('trip.end_hub_id = :endHubId', { endHubId: String(query.end_hub_id) });
    if (query.departure_from) qb.andWhere('trip.departure_time >= :departureFrom', { departureFrom: query.departure_from });
    if (query.departure_to) qb.andWhere('trip.departure_time <= :departureTo', { departureTo: query.departure_to });
    this.applyHubScope(qb, currentUser);

    const [data, total] = await qb.getManyAndCount();
    await this.waybillsService.reconcileTransportStatesForTrips(
      data
        .filter((trip) => [TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED].includes(trip.status))
        .map((trip) => trip.id),
    );
    await this.enrichRouteLabels(data);
    await this.enrichDeliverySummaries(data);
    return { data, total, page, limit };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<TripEntity> {
    await this.processScheduledArrivals();
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const trip = await qb.getOne();
    if (!trip) throw new NotFoundException('Trip not found');
    if ([TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED].includes(trip.status)) {
      await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
    }
    await this.enrichRouteLabels([trip]);
    await this.enrichDeliverySummaries([trip]);
    return trip;
  }

  async update(id: string, dto: UpdateTripDto, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    const isCancelledTrip = String(trip.status) === 'CANCELLED';
    if (isCancelledTrip && (dto.departure_time !== undefined || dto.arrival_time !== undefined || dto.route_stops !== undefined)) {
      throw new BadRequestException('Chuyến đã hủy chỉ được sửa BKS, NCC, tài xế và cước xe');
    }
    const previousVendorId = this.resolveTripVendorId(trip);
    if (dto.truck_id !== undefined) {
      const nextTruckId = dto.truck_id == null ? null : String(dto.truck_id);
      const truckChanged = trip.truck_id !== nextTruckId;
      const truck = nextTruckId == null
        ? null
        : !truckChanged
        ? trip.truck
        : await this.validateTruckForTripUpdate(dto.truck_id as number, trip.status);
      const isHistoricalCorrection = !ACTIVE_TRIP_STATUSES.includes(trip.status);
      if (trip.truck_id && truckChanged && !isHistoricalCorrection) {
        const oldTruck = await this.trucksRepository.findOne({ where: { id: trip.truck_id } });
        if (oldTruck) {
          const otherActiveTrips = await this.tripsRepository.count({
            where: {
              truck_id: trip.truck_id,
              status: In(ACTIVE_TRIP_STATUSES),
              id: Not(trip.id),
            } as any,
          });
          if (otherActiveTrips === 0) {
            oldTruck.status = TruckStatus.AVAILABLE;
            await this.trucksRepository.save(oldTruck);
          }
        }
      }
      trip.truck_id = nextTruckId;
      trip.truck = truck;
      if (truck && truckChanged) {
        trip.driver_name = truck.ten_lai_xe ?? truck.driver?.full_name ?? null;
        trip.driver_phone = truck.driver?.phone ?? null;
        if (!isHistoricalCorrection) {
          truck.status = trip.status === TripStatus.PLANNED ? TruckStatus.ASSIGNED : TruckStatus.IN_TRIP;
          await this.trucksRepository.save(truck);
        }
      }
      if (truck && dto.vendor_id === undefined) {
        trip.vendor_id = truck.vendor_id ?? null;
        trip.vendor = truck.vendor ?? null;
      }
    }
    if (dto.manual_license_plate !== undefined) {
      trip.manual_license_plate = dto.manual_license_plate?.trim().toUpperCase() || null;
    }
    if (dto.driver_name !== undefined) {
      trip.driver_name = dto.driver_name?.trim() || null;
    }
    if (dto.driver_phone !== undefined) {
      trip.driver_phone = dto.driver_phone?.trim() || null;
    }
    if (dto.vendor_id !== undefined) {
      const paidAmount = this.toNumber(trip.vendor_paid_amount);
      const nextVendorId = dto.vendor_id == null || dto.vendor_id === '' ? null : String(dto.vendor_id);
      if (paidAmount > 0 && previousVendorId !== nextVendorId) {
        throw new BadRequestException('Không thể đổi NCC khi chuyến đã phát sinh thanh toán');
      }
      const vendor = nextVendorId ? await this.vendorsService.findOne(nextVendorId) : null;
      trip.vendor_id = vendor ? String(vendor.id) : null;
      trip.vendor = vendor;
    }
    if (dto.trip_cost !== undefined) {
      const paidAmount = this.toNumber(trip.vendor_paid_amount);
      const nextTripCost = dto.trip_cost == null ? null : dto.trip_cost;
      if (nextTripCost != null) this.assertNonNegative(nextTripCost);
      if (paidAmount > (nextTripCost ?? 0)) {
        throw new BadRequestException('Cước xe không được thấp hơn số tiền đã thanh toán');
      }
      const previousTripCost = this.toNumber(trip.trip_cost);
      if (previousTripCost > 0 && this.toNumber(trip.other_costs) === previousTripCost) {
        trip.other_costs = null;
      }
      trip.trip_cost = nextTripCost == null ? null : String(nextTripCost);
    }
    const departureTime = dto.departure_time !== undefined ? this.normalizeDate(dto.departure_time, 'departure_time') : trip.departure_time;
    const arrivalTime = dto.arrival_time !== undefined ? this.normalizeOptionalDate(dto.arrival_time, 'arrival_time') : trip.arrival_time;
    if (dto.departure_time !== undefined || dto.arrival_time !== undefined) this.validateTripTimes(departureTime, arrivalTime, false);
    if (dto.departure_time !== undefined) trip.departure_time = departureTime;
    if (dto.arrival_time !== undefined) {
      trip.arrival_time = arrivalTime;
      trip.expected_arrival_time = arrivalTime;
    }
    if (dto.route_stops !== undefined) {
      const tripSplits = (await this.waybillSplitsRepository.find({
        where: { trip_id: String(trip.id) } as any,
        relations: ['waybill'],
      })) ?? [];
      const splitHubIds = new Set(tripSplits
        .map((split) => String(split.waybill?.dest_hub_id || '').trim())
        .filter(Boolean));
      const submittedHubIds = new Set(dto.route_stops.map((stop) => String(stop.hub_id)));
      const allowedHubIds = splitHubIds.size ? splitHubIds : new Set([String(trip.end_hub_id)]);
      if ([...submittedHubIds].some((hubId) => !allowedHubIds.has(hubId))) {
        throw new BadRequestException('HUB dự kiến đến không thuộc chuyến xe này');
      }
      if ([...allowedHubIds].some((hubId) => !submittedHubIds.has(hubId))) {
        throw new BadRequestException('Cần nhập ngày dự kiến đến cho tất cả HUB trên chuyến');
      }

      const expectedByHub = new Map<string, Date>();
      dto.route_stops.forEach((stop) => {
        const expectedArrival = this.normalizeDate(stop.expected_arrival_at, 'expected_arrival_at');
        this.validateTripTimes(departureTime, expectedArrival, false);
        expectedByHub.set(String(stop.hub_id), expectedArrival);
      });
      tripSplits.forEach((split) => {
        const hubId = String(split.waybill?.dest_hub_id || '').trim();
        const expectedArrival = expectedByHub.get(hubId);
        if (expectedArrival) split.expected_arrival_at = expectedArrival;
      });
      if (tripSplits.length) await this.waybillSplitsRepository.save(tripSplits);
      if (trip.manifest_id && tripSplits.length) {
        const manifestRows = await this.manifestWaybillsRepository.find({
          where: { manifest_id: String(trip.manifest_id) },
        });
        const expectedByWaybill = new Map(tripSplits
          .filter((split) => split.expected_arrival_at)
          .map((split) => [String(split.waybill_id), new Date(split.expected_arrival_at as Date).toISOString()]));
        const changedRows = manifestRows.filter((row) => expectedByWaybill.has(String(row.waybill_id)));
        changedRows.forEach((row) => {
          row.dispatch_fields = {
            ...(row.dispatch_fields ?? {}),
            expected_arrival_at: expectedByWaybill.get(String(row.waybill_id)),
          };
        });
        if (changedRows.length) await this.manifestWaybillsRepository.save(changedRows);
      }

      const finalExpectedArrival = new Date(Math.max(...[...expectedByHub.values()].map((date) => date.getTime())));
      trip.expected_arrival_time = finalExpectedArrival;
      if ([TripStatus.PLANNED, TripStatus.IN_TRANSIT].includes(trip.status)) {
        trip.arrival_time = finalExpectedArrival;
      }
    }
    const savedTrip = await this.tripsRepository.save(trip);
    if (dto.vendor_id !== undefined || dto.trip_cost !== undefined || dto.truck_id !== undefined) {
      const affectedVendorIds = [...new Set([
        previousVendorId,
        this.resolveTripVendorId(savedTrip),
      ].filter((vendorId): vendorId is string => Boolean(vendorId)))];
      await Promise.all(affectedVendorIds.map((vendorId) => this.vendorsService.refreshPayableBalance(vendorId)));
    }
    return savedTrip;
  }

  async assignManifest(id: string, dto: AssignManifestDto, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.PLANNED) throw new BadRequestException('Only PLANNED trips can receive a manifest');
    const manifest = await this.validateManifestForAssignment(String(dto.manifest_id));
    await this.assertManifestNotInActiveTrip(String(dto.manifest_id), id);
    await this.validateHubs(trip.start_hub_id, trip.end_hub_id, manifest);
    trip.manifest_id = String(dto.manifest_id);
    manifest.status = ManifestStatus.ASSIGNED_TO_TRIP;
    await this.manifestsRepository.save(manifest);
    return this.tripsRepository.save(trip);
  }

  async startTrip(id: string, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.PLANNED) throw new BadRequestException('Only PLANNED trips can start');
    const manifest = trip.manifest_id ? await this.manifestsRepository.findOne({ where: { id: trip.manifest_id } }) : null;
    if (trip.manifest_id && !manifest) throw new NotFoundException('Manifest not found');

    trip.status = TripStatus.IN_TRANSIT;
    trip.departure_time = trip.departure_time ?? new Date();
    trip.expected_arrival_time = trip.expected_arrival_time ?? trip.arrival_time ?? null;
    if (trip.truck_id) {
      const truck = await this.trucksRepository.findOne({ where: { id: trip.truck_id }, relations: ['driver'] });
      if (truck) {
        trip.driver_name = trip.driver_name?.trim() || truck.ten_lai_xe || truck.driver?.full_name || null;
        trip.driver_phone = trip.driver_phone?.trim() || truck.driver?.phone || null;
      }
    }
    if (manifest) {
      manifest.status = ManifestStatus.IN_TRANSIT;
      await this.manifestsRepository.save(manifest);
    }
    await this.setTruckStatus(trip.truck_id, TruckStatus.IN_TRIP);
    if (trip.manifest_id) {
      await this.moveManifestWaybills(trip.manifest_id, WaybillState.LOADED, WaybillState.IN_TRANSIT);
      await this.moveManifestWaybills(trip.manifest_id, WaybillState.MANIFEST_CLOSED, WaybillState.IN_TRANSIT);
    }
    await this.waybillSplitsRepository.update(
      {
        trip_id: String(trip.id),
        load_status: In([
          WaybillSplitLoadStatus.LOADED,
          WaybillSplitLoadStatus.DEPARTED,
        ]),
      } as any,
      { load_status: WaybillSplitLoadStatus.IN_TRANSIT },
    );
    await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
    return this.tripsRepository.save(trip);
  }

  async arriveTrip(id: string, dto: ArriveTripDto, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.IN_TRANSIT) throw new BadRequestException('Only IN_TRANSIT trips can arrive');
    const arrivalTime = dto.arrival_time ?? new Date();
    const tripSplits = (await this.waybillSplitsRepository.find({
      where: { trip_id: String(trip.id) } as any,
      relations: ['waybill'],
    })) ?? [];
    const arrivalSchedule = resolveTripArrivalSchedule(tripSplits, trip.expected_arrival_time);
    if (arrivalSchedule.isMultiHub) {
      if (!arrivalSchedule.hasCompleteHubSchedule || !arrivalSchedule.finalExpectedArrival) {
        throw new BadRequestException('Cần nhập ngày dự kiến đến cho tất cả HUB trước khi xác nhận Xe đã đến');
      }
      if (arrivalTime < arrivalSchedule.finalExpectedArrival) {
        throw new BadRequestException('Chuyến nhiều HUB chỉ được xác nhận Xe đã đến tại bưu cục cuối cùng');
      }
    }

    trip.status = TripStatus.ARRIVED;
    trip.arrival_time = arrivalTime;
    if (trip.manifest_id) await this.moveManifestWaybills(trip.manifest_id, WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB);
    await this.waybillSplitsRepository.update(
      {
        trip_id: String(trip.id),
        load_status: In([
          WaybillSplitLoadStatus.LOADED,
          WaybillSplitLoadStatus.DEPARTED,
          WaybillSplitLoadStatus.IN_TRANSIT,
        ]),
      } as any,
      { load_status: WaybillSplitLoadStatus.ARRIVED },
    );
    await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
    return this.tripsRepository.save(trip);
  }

  async completeTrip(id: string, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status === TripStatus.COMPLETED) return trip;
    if (trip.status !== TripStatus.ARRIVED) throw new BadRequestException('Only ARRIVED trips can be completed');
    return this.finalizeTrip(trip);
  }

  private async finalizeTrip(trip: TripEntity): Promise<TripEntity> {
    trip.status = TripStatus.COMPLETED;
    const manifest = trip.manifest_id ? await this.manifestsRepository.findOne({ where: { id: trip.manifest_id } }) : null;
    if (manifest) {
      manifest.status = ManifestStatus.COMPLETED;
      await this.manifestsRepository.save(manifest);
    }
    if (trip.truck_id) {
      const activeTrips = await this.tripsRepository.count({
        where: {
          truck_id: trip.truck_id,
          status: In([...ACTIVE_TRIP_STATUSES, TripStatus.ARRIVED]),
          id: Not(trip.id),
        } as any,
      });
      if (activeTrips === 0) await this.setTruckStatus(trip.truck_id, TruckStatus.AVAILABLE);
    }
    return this.tripsRepository.save(trip);
  }

  async remove(id: string, currentUser: UserEntity): Promise<void> {
    if (!isManager(currentUser.role_mask)) {
      throw new ForbiddenException('Chỉ quản lý mới được xóa chuyến');
    }

    const trip = await this.findOne(id, currentUser);
    if (
      this.toNumber(trip.vendor_paid_amount) > 0
      || (trip.vendor_payment_status && trip.vendor_payment_status !== VendorTripPaymentStatus.UNPAID)
    ) {
      throw new BadRequestException('Chuyến đã phát sinh thanh toán NCC, không thể xóa');
    }

    const [manifestWaybillCount, tripSplitCount] = await Promise.all([
      trip.manifest_id
        ? this.manifestWaybillsRepository.count({ where: { manifest_id: String(trip.manifest_id) } })
        : Promise.resolve(0),
      this.waybillSplitsRepository.count({ where: { trip_id: String(trip.id) } as any }),
    ]);
    if (manifestWaybillCount > 0 || tripSplitCount > 0) {
      throw new BadRequestException('Chỉ được xóa chuyến sau khi đã nhả hết đơn và kiện về tồn kho');
    }

    const vendorId = trip.vendor_id ? String(trip.vendor_id) : null;
    await this.vendorDebtEntriesRepository.delete({ trip_id: String(trip.id) } as any);
    await this.tripsRepository.delete(String(trip.id));

    if (trip.manifest_id) {
      const remainingTrips = await this.tripsRepository.count({
        where: { manifest_id: String(trip.manifest_id) },
      });
      if (remainingTrips === 0) {
        await this.manifestsRepository.delete(String(trip.manifest_id));
      }
    }

    if (trip.truck_id) {
      const activeTrips = await this.tripsRepository.count({
        where: { truck_id: String(trip.truck_id), status: In(ACTIVE_TRIP_STATUSES) } as any,
      });
      if (activeTrips === 0) await this.setTruckStatus(String(trip.truck_id), TruckStatus.AVAILABLE);
    }
    if (vendorId) await this.vendorsService.refreshPayableBalance(vendorId);
  }

  async cancelTrip(id: string, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.PLANNED) {
      throw new BadRequestException('Chỉ được hủy chuyến đang chờ khởi hành');
    }

    const manifest = trip.manifest_id
      ? await this.manifestsRepository.findOne({ where: { id: trip.manifest_id } })
      : null;
    const [manifestLinks, tripSplits] = await Promise.all([
      trip.manifest_id
        ? this.manifestWaybillsRepository.find({
          where: { manifest_id: trip.manifest_id },
          relations: ['waybill', 'waybill.order'],
        })
        : Promise.resolve([]),
      this.waybillSplitsRepository.find({
        where: { trip_id: String(trip.id) } as any,
        relations: ['waybill', 'waybill.order'],
      }),
    ]);
    const releasedWaybills = new Map<string, WaybillEntity>();
    manifestLinks.forEach((link) => {
      if (link.waybill) releasedWaybills.set(String(link.waybill.id), link.waybill);
    });
    tripSplits.forEach((split) => {
      if (split.waybill) releasedWaybills.set(String(split.waybill.id), split.waybill);
    });

    await this.waybillSplitsRepository.delete({ trip_id: String(trip.id) } as any);
    if (trip.manifest_id) {
      await this.manifestWaybillsRepository.delete({ manifest_id: trip.manifest_id } as any);
    }

    const releasedAt = new Date();
    const waybillsToSave: WaybillEntity[] = [];
    for (const waybill of releasedWaybills.values()) {
      const remainingSplits = await this.waybillSplitsRepository.find({
        where: { waybill_id: String(waybill.id) },
      });
      const allocatedPackages = remainingSplits.reduce(
        (sum, split) => sum + Number(split.package_count ?? 0),
        0,
      );
      const orderPackages = Number(waybill.order?.package_count ?? 0);
      const totalPackages = Math.max(1, Number(waybill.package_count ?? 0), orderPackages);
      if (allocatedPackages >= totalPackages) continue;

      waybill.current_state = WaybillState.IN_WAREHOUSE;
      waybill.current_hub_id = String(trip.start_hub_id || waybill.origin_hub_id);
      if (allocatedPackages === 0) waybill.loaded_at = null;
      waybill.updated_by = currentUser.id;
      waybill.last_audit_action = 'TRIP_CANCEL_RELEASE_TO_INVENTORY';
      waybill.last_audit_user_id = currentUser.id;
      waybill.last_audit_at = releasedAt;
      waybillsToSave.push(waybill);
    }
    if (waybillsToSave.length) await this.waybillsRepository.save(waybillsToSave);

    if (manifest) {
      manifest.status = ManifestStatus.CANCELLED;
      await this.manifestsRepository.save(manifest);
    }
    if (trip.truck_id) {
      const activeTrips = await this.tripsRepository.count({
        where: {
          truck_id: trip.truck_id,
          status: In(ACTIVE_TRIP_STATUSES),
          id: Not(trip.id),
        } as any,
      });
      if (activeTrips === 0) await this.setTruckStatus(trip.truck_id, TruckStatus.AVAILABLE);
    }

    trip.status = TripStatus.CANCELLED;
    return this.tripsRepository.save(trip);
  }

  async updateCosts(id: string, dto: UpdateTripCostsDto, currentUser: UserEntity): Promise<TripEntity> {
    this.assertNonNegative(dto.fuel_actual, dto.fuel_cost, dto.other_costs);
    const trip = await this.findOne(id, currentUser);
    if (dto.fuel_actual !== undefined) trip.fuel_actual = dto.fuel_actual;
    if (dto.fuel_cost !== undefined) trip.fuel_cost = String(dto.fuel_cost);
    if (dto.other_costs !== undefined) trip.other_costs = String(dto.other_costs);
    return this.tripsRepository.save(trip);
  }

  async getExpectedArrivals(query: QueryExpectedArrivalsDto, currentUser: UserEntity) {
    const limit = clampPaginationLimit(query.limit, 100);
    const managerPlus = isManager(currentUser.role_mask);
    const requestedHubId = query.end_hub_id != null ? String(query.end_hub_id) : undefined;
    const assignedHubIds = getAssignedHubIds(currentUser);
    const scopedHubIds = managerPlus
      ? requestedHubId ? [requestedHubId] : []
      : requestedHubId && assignedHubIds.includes(requestedHubId) ? [requestedHubId] : assignedHubIds;

    if (!managerPlus && !scopedHubIds.length) {
      throw new ForbiddenException('Tài khoản chưa được gán bưu cục');
    }

    await Promise.all(scopedHubIds.map((hubId) => this.waybillsService.backfillInTransitTripsForHub(hubId)));

    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('manifest.origin_hub', 'manifest_origin_hub')
      .leftJoinAndSelect('manifest.dest_hub', 'manifest_dest_hub')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .leftJoinAndSelect('trip.expenses', 'trip_expenses')
      .where('trip.status = :status', { status: TripStatus.IN_TRANSIT });

    if (scopedHubIds.length === 1) {
      qb.andWhere('trip.end_hub_id = :endHubId', { endHubId: scopedHubIds[0] });
    } else if (scopedHubIds.length > 1) {
      qb.andWhere('trip.end_hub_id IN (:...endHubIds)', { endHubIds: scopedHubIds });
    }

    this.applyHubScope(qb, currentUser);

    const trips = (await qb.getMany()).sort((left, right) => {
      const leftTime = new Date(left.arrival_time || left.expected_arrival_time || left.departure_time || 0).getTime();
      const rightTime = new Date(right.arrival_time || right.expected_arrival_time || right.departure_time || 0).getTime();
      return rightTime - leftTime;
    }).slice(0, limit);
    await this.enrichRouteLabels(trips);
    await this.enrichDeliverySummaries(trips);
    const financialAllocations = await this.buildIncomingTripFinancialAllocations(trips);
    const data = await Promise.all(trips.map((trip) => (
      this.toIncomingTripSummary(trip, financialAllocations.get(String(trip.id)))
    )));
    return { data, total: data.length };
  }

  async getIncomingOverview(query: QueryTripsDto, currentUser: UserEntity) {
    const managerPlus = isManager(currentUser.role_mask);
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (!managerPlus && !assignedHubIds.length) {
      throw new ForbiddenException('Tài khoản chưa được gán bưu cục');
    }

    if (managerPlus) await this.waybillsService.backfillInTransitTripsForHub(undefined);
    else await Promise.all(assignedHubIds.map((hubId) => this.waybillsService.backfillInTransitTripsForHub(hubId)));

    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 100);
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('manifest.origin_hub', 'manifest_origin_hub')
      .leftJoinAndSelect('manifest.dest_hub', 'manifest_dest_hub')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .leftJoinAndSelect('trip.expenses', 'trip_expenses')
      .orderBy('trip.departure_time', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.keyword) {
      qb.andWhere(new Brackets((inner) => {
        inner.where('manifest.manifest_code ILIKE :keyword', { keyword: `%${query.keyword}%` })
          .orWhere('truck.license_plate ILIKE :keyword', { keyword: `%${query.keyword}%` });
      }));
    }
    if (query.status) qb.andWhere('trip.status = :status', { status: query.status });
    if (query.truck_id) qb.andWhere('trip.truck_id = :truckId', { truckId: String(query.truck_id) });
    if (query.start_hub_id) qb.andWhere('trip.start_hub_id = :startHubId', { startHubId: String(query.start_hub_id) });
    if (query.end_hub_id) qb.andWhere('trip.end_hub_id = :endHubId', { endHubId: String(query.end_hub_id) });
    if (query.departure_from) qb.andWhere('trip.departure_time >= :departureFrom', { departureFrom: query.departure_from });
    if (query.departure_to) qb.andWhere('trip.departure_time <= :departureTo', { departureTo: query.departure_to });
    this.applyHubScope(qb, currentUser);

    const [trips, total] = await qb.getManyAndCount();
    const financialAllocations = await this.buildIncomingTripFinancialAllocations(trips);
    const data = await Promise.all(trips.map((trip) => (
      this.toIncomingTripSummary(trip, financialAllocations.get(String(trip.id)))
    )));
    return { data, total, page, limit };
  }

  async getIncomingTripDetail(id: string, currentUser: UserEntity) {
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('manifest.origin_hub', 'manifest_origin_hub')
      .leftJoinAndSelect('manifest.dest_hub', 'manifest_dest_hub')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const trip = await qb.getOne();
    if (!trip) throw new NotFoundException('Trip not found');
    const allocation = (await this.buildIncomingTripFinancialAllocations([trip])).get(String(trip.id));
    const waybills = allocation ? [] : await this.getManifestWaybills(trip.manifest_id);
    const weight = allocation?.planned_total_weight
      ?? waybills.reduce((sum, wb) => sum + Number(wb.weight ?? 0), 0);
    const volume = allocation?.planned_total_volume
      ?? waybills.reduce((sum, wb) => sum + Number(wb.the_tich_m3 ?? 0), 0);
    const total_collect = allocation?.total_collect
      ?? waybills.reduce((sum, wb) => sum + this.calcWaybillCollectAmount(wb), 0);
    const payable = Number(trip.trip_cost ?? trip.other_costs ?? 0) || 0;
    const paid = Number(trip.vendor_paid_amount ?? 0) || 0;

    const payments = await this.vendorPaymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.creator', 'creator')
      .leftJoinAndSelect('payment.vendor', 'vendor')
      .innerJoin('payment.trips', 'linked_trip')
      .where('linked_trip.id = :tripId', { tripId: id })
      .orderBy('payment.payment_date', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .getMany();

    const payment_history = [
      ...(paid > 0 || trip.vendor_payment_proof_url || trip.vendor_payment_status !== VendorTripPaymentStatus.UNPAID
        ? [{
          id: `trip-${trip.id}`,
          type: 'TRIP_STATUS' as const,
          amount: paid,
          payment_date: trip.created_at,
          description: trip.vendor_payment_note?.trim() || `Ghi nhận thanh toán chuyến · ${trip.vendor_payment_status}`,
          proof_image_url: trip.vendor_payment_proof_url,
          created_by_name: null,
          vendor_name: trip.vendor?.name?.trim() || trip.truck?.vendor?.name?.trim() || trip.truck?.nha_xe?.trim() || null,
        }]
        : []),
      ...payments.map((payment) => ({
      id: payment.id,
      type: 'VENDOR_PAYMENT' as const,
      amount: Number(payment.amount ?? 0),
      payment_date: payment.payment_date,
      description: payment.description,
      proof_image_url: null,
      created_by_name: payment.creator?.full_name?.trim() || payment.creator?.username?.trim() || null,
      vendor_name: payment.vendor?.name?.trim() || null,
    })),
    ];

    return {
      id: trip.id,
      manifest_id: trip.manifest_id,
      manifest_code: trip.manifest?.manifest_code ?? null,
      seal_code: trip.manifest?.seal_code ?? null,
      status: trip.status,
      departure_time: trip.departure_time,
      arrival_time: trip.arrival_time,
      expected_arrival_time: trip.expected_arrival_time,
      start_hub: trip.start_hub ? { id: trip.start_hub.id, code: trip.start_hub.code, name: trip.start_hub.name } : null,
      end_hub: trip.end_hub ? { id: trip.end_hub.id, code: trip.end_hub.code, name: trip.end_hub.name } : null,
      origin_hub: trip.manifest?.origin_hub
        ? { id: trip.manifest.origin_hub.id, code: trip.manifest.origin_hub.code, name: trip.manifest.origin_hub.name }
        : null,
      dest_hub: trip.manifest?.dest_hub
        ? { id: trip.manifest.dest_hub.id, code: trip.manifest.dest_hub.code, name: trip.manifest.dest_hub.name }
        : null,
      license_plate: trip.manual_license_plate ?? trip.truck?.license_plate ?? trip.truck?.bks ?? null,
      driver_name: trip.driver_name?.trim()
        || trip.truck?.ten_lai_xe?.trim()
        || trip.truck?.driver?.full_name?.trim()
        || null,
      driver_phone: trip.driver_phone?.trim()
        || trip.truck?.driver?.phone?.trim()
        || null,
      vendor_name: trip.vendor?.name?.trim()
        || trip.truck?.vendor?.name?.trim()
        || trip.truck?.nha_xe?.trim()
        || null,
      vendor_id: trip.vendor?.id ?? trip.vendor_id ?? trip.truck?.vendor?.id ?? trip.truck?.vendor_id ?? null,
      vendor_code: trip.vendor?.code?.trim() || trip.truck?.vendor?.code?.trim() || null,
      vehicle_type: trip.truck?.loai_xe?.trim() || null,
      waybill_count: allocation?.waybill_count ?? waybills.length,
      planned_total_weight: weight,
      planned_total_volume: volume,
      total_collect,
      trip_cost: payable,
      fuel_cost: Number(trip.fuel_cost ?? 0) || 0,
      other_costs: Number(trip.other_costs ?? 0) || 0,
      payment_summary: {
        status: trip.vendor_payment_status,
        paid_amount: paid,
        payable_amount: payable,
        proof_image_url: trip.vendor_payment_proof_url,
        payment_note: trip.vendor_payment_note,
        vendor_paid_amount: trip.vendor_paid_amount,
      },
      payment_history,
    };
  }

  async getAllocationBoard(query: QueryAllocationBoardDto, currentUser: UserEntity) {
    const limit = clampPaginationLimit(query.limit, 50);
    const highlightWaybillId = query.waybill_id?.trim() ? String(query.waybill_id).trim() : null;
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.vendor', 'trip_vendor')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.status IN (:...statuses)', { statuses: ALLOCATION_BOARD_STATUSES })
      .andWhere('trip.manifest_id IS NOT NULL')
      .orderBy('trip.expected_arrival_time', 'ASC')
      .addOrderBy('trip.departure_time', 'ASC')
      .take(limit);

    const endHubId = query.end_hub_id != null ? String(query.end_hub_id) : null;
    if (endHubId) qb.andWhere('trip.end_hub_id = :endHubId', { endHubId });
    this.applyHubScope(qb, currentUser);

    const trips = await qb.getMany();
    const manifestRows = await Promise.all(trips.map(async (trip) => {
      if (!trip.manifest_id) return [] as ManifestWaybillEntity[];
      return this.manifestWaybillsRepository.find({
        where: { manifest_id: String(trip.manifest_id) },
        relations: ['waybill'],
        order: { loading_position: 'ASC' },
      });
    }));
    const waybillIds = [...new Set(manifestRows.flat().map((row) => row.waybill_id))];
    const splitRows = waybillIds.length
      ? await this.waybillSplitsRepository.find({
        where: { waybill_id: In(waybillIds) },
        relations: ['trip', 'truck', 'trip.truck'],
      })
      : [];
    const splitsByWaybill = splitRows.reduce<Map<string, WaybillSplitEntity[]>>((map, row) => {
      const list = map.get(row.waybill_id) ?? [];
      list.push(row);
      map.set(row.waybill_id, list);
      return map;
    }, new Map());

    const board = await Promise.all(trips.map(async (trip, tripIndex) => {
      const rows = manifestRows[tripIndex] ?? [];

      const items = rows
        .filter((row) => row.waybill)
        .flatMap((row, idx) => {
          const tripSplits = (splitsByWaybill.get(String(row.waybill_id)) ?? [])
            .filter((split) =>
              split.trip_id === String(trip.id)
              || (!split.trip_id && split.truck_id && trip.truck_id && split.truck_id === String(trip.truck_id)),
            );
          if (tripSplits.length) {
            return tripSplits.map((split, splitIdx) => this.mapAllocationDispatchRow(
              row,
              idx + splitIdx,
              trip.end_hub,
              trip.truck,
              highlightWaybillId,
              split,
            ));
          }
          return [this.mapAllocationDispatchRow(row, idx, trip.end_hub, trip.truck, highlightWaybillId)];
        });

      return {
        trip_id: trip.id,
        manifest_id: trip.manifest_id,
        status: trip.status,
        license_plate: trip.manual_license_plate ?? trip.truck?.license_plate ?? trip.truck?.bks ?? null,
        nha_xe: trip.vendor?.name ?? trip.truck?.nha_xe ?? trip.truck?.vendor?.name ?? null,
        driver_name: trip.driver_name ?? trip.truck?.ten_lai_xe ?? null,
        driver_phone: trip.driver_phone,
        expected_arrival_time: trip.expected_arrival_time ?? trip.arrival_time,
        departure_time: trip.departure_time,
        start_hub: trip.start_hub,
        end_hub: trip.end_hub,
        manifest_code: trip.manifest?.manifest_code ?? null,
        items,
        contains_highlight: items.some((item) => item.is_highlighted),
      };
    }));

    const hostTrip = board.find((trip) => trip.contains_highlight) ?? null;
    const hostItem = hostTrip?.items.find((item) => item.is_highlighted) ?? null;

    return {
      trips: board,
      total: board.length,
      waybill_placement: hostTrip && hostItem
        ? {
            trip_id: hostTrip.trip_id,
            license_plate: hostTrip.license_plate,
            loading_position: hostItem.loading_position,
            manifest_code: hostTrip.manifest_code,
            status: hostTrip.status,
          }
        : null,
    };
  }

  async getLoadingSequence(id: string, currentUser: UserEntity) {
    const trip = await this.findOne(id, currentUser);
    if (!LOADING_SEQUENCE_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Loading sequence is unavailable for this trip status');
    }
    const rows = trip.manifest_id
      ? await this.manifestWaybillsRepository.find({
        where: { manifest_id: trip.manifest_id },
        relations: ['waybill'],
        order: { loading_position: 'ASC' },
      })
      : [];
    const items = rows
      .filter((row) => row.waybill)
      .map((row) => ({
        waybill_id: row.waybill_id,
        loading_position: row.loading_position,
        loaded_at: row.loaded_at,
        waybill: row.waybill,
      }))
      .sort((a, b) => {
        if (a.loading_position == null && b.loading_position == null) return 0;
        if (a.loading_position == null) return 1;
        if (b.loading_position == null) return -1;
        return a.loading_position - b.loading_position;
      });

    const plannedWeight = items.reduce((sum, item) => sum + Number(item.waybill.weight ?? 0), 0);
    const plannedVolume = items.reduce((sum, item) => sum + Number(item.waybill.the_tich_m3 ?? 0), 0);

    return {
      trip: {
        id: trip.id,
        status: trip.status,
        manifest_id: trip.manifest_id,
        actual_total_weight: trip.actual_total_weight,
        actual_total_volume: trip.actual_total_volume,
        expected_arrival_time: trip.expected_arrival_time ?? trip.arrival_time,
        driver_name: trip.driver_name,
        driver_phone: trip.driver_phone,
        truck: trip.truck,
      },
      items,
      totals: {
        planned_weight: plannedWeight,
        planned_volume: plannedVolume,
        actual_weight: trip.actual_total_weight,
        actual_volume: trip.actual_total_volume,
      },
    };
  }

  async updateLoadingSequence(id: string, dto: UpdateLoadingSequenceDto, currentUser: UserEntity) {
    const trip = await this.findOne(id, currentUser);
    if (!LOADING_SEQUENCE_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Loading sequence cannot be updated for this trip status');
    }
    if (!trip.manifest_id) return this.getLoadingSequence(id, currentUser);
    const rows = await this.manifestWaybillsRepository.find({ where: { manifest_id: trip.manifest_id } });
    const rowByWaybill = new Map(rows.map((row) => [row.waybill_id, row]));
    const positions = dto.items.map((item) => item.loading_position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Loading positions must be unique');
    }

    const now = new Date();
    for (const item of dto.items) {
      const row = rowByWaybill.get(String(item.waybill_id));
      if (!row) throw new NotFoundException(`Waybill ${item.waybill_id} is not on this trip manifest`);
      row.loading_position = item.loading_position;
      row.loaded_at = row.loaded_at ?? now;

      if (item.package_count !== undefined) {
        const waybill = await this.waybillsRepository.findOne({ where: { id: String(item.waybill_id) } });
        if (!waybill) throw new NotFoundException(`Waybill ${item.waybill_id} not found`);
        const splits = await this.waybillSplitsRepository.find({ where: { waybill_id: String(item.waybill_id) } });
        const tripSplits = splits.filter((split) => String(split.trip_id) === String(trip.id));
        if (!tripSplits.length) throw new NotFoundException(`Waybill ${item.waybill_id} has no allocation on this trip`);
        const allocatedElsewhere = splits
          .filter((split) => String(split.trip_id) !== String(trip.id))
          .reduce((sum, split) => sum + Number(split.package_count ?? 0), 0);
        const totalPackages = Math.max(1, Number(waybill.package_count ?? 1));
        const maxForTrip = totalPackages - allocatedElsewhere;
        if (item.package_count > maxForTrip) {
          throw new BadRequestException(`Waybill ${item.waybill_id} can carry at most ${maxForTrip} packages on this trip`);
        }

        tripSplits[0].package_count = item.package_count;
        tripSplits[0].loading_position = item.loading_position;
        await this.waybillSplitsRepository.save(tripSplits[0]);
        if (tripSplits.length > 1) {
          await this.waybillSplitsRepository.delete({ id: In(tripSplits.slice(1).map((split) => split.id)) });
        }

        row.dispatch_fields = { ...(row.dispatch_fields ?? {}), so_luong: String(item.package_count) };
        const totalAllocated = allocatedElsewhere + item.package_count;
        if (totalAllocated < totalPackages) {
          waybill.current_state = WaybillState.IN_WAREHOUSE;
          waybill.current_hub_id = String(trip.start_hub_id ?? waybill.origin_hub_id);
        }
        await this.waybillsRepository.save(waybill);
      }
    }
    await this.manifestWaybillsRepository.save([...rowByWaybill.values()]);
    return this.getLoadingSequence(id, currentUser);
  }

  async updateCargoTotals(id: string, dto: UpdateTripCargoTotalsDto, currentUser: UserEntity) {
    const trip = await this.findOne(id, currentUser);
    if (!LOADING_SEQUENCE_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Cargo totals can only be set after trip departure');
    }
    if (dto.actual_total_weight !== undefined) trip.actual_total_weight = dto.actual_total_weight;
    if (dto.actual_total_volume !== undefined) trip.actual_total_volume = dto.actual_total_volume;
    if (dto.expected_arrival_time !== undefined) trip.expected_arrival_time = dto.expected_arrival_time;
    await this.tripsRepository.save(trip);
    return this.getLoadingSequence(id, currentUser);
  }

  async getTripProfit(id: string, currentUser: UserEntity) {
    if (!isManager(currentUser.role_mask)) throw new ForbiddenException('Manager or Director role required');
    const trip = await this.findOne(id, currentUser);
    const waybills = await this.getManifestWaybills(trip.manifest_id);
    const revenue = waybills.reduce((sum, waybill) => sum + Number(waybill.cost_amount ?? 0), 0);
    const tripCost = this.toNumber(trip.trip_cost);
    const rawOtherCosts = this.toNumber(trip.other_costs);
    // Older trip creation stored the NCC cost in both fields because other_costs
    // was the legacy alias. Count equal values once, but preserve genuine extras.
    const otherCosts = tripCost > 0 && rawOtherCosts === tripCost ? 0 : rawOtherCosts;
    const total_cost = this.toNumber(trip.fuel_cost) + tripCost + otherCosts;
    return { revenue, total_cost, profit: revenue - total_cost, waybill_count: waybills.length };
  }

  private async validateTruck(truckId?: number | null): Promise<TruckEntity | null> {
    if (truckId == null) return null;
    const truck = await this.trucksRepository.findOne({ where: { id: String(truckId) }, relations: ['vendor'] });
    if (!truck) throw new NotFoundException('Truck not found');
    if (truck.status !== TruckStatus.AVAILABLE) throw new BadRequestException('Truck must be AVAILABLE');
    return truck;
  }

  private async validateTruckForTripUpdate(truckId: number, tripStatus: TripStatus): Promise<TruckEntity> {
    const truck = await this.trucksRepository.findOne({
      where: { id: String(truckId) },
      relations: ['vendor', 'driver'],
    });
    if (!truck) throw new NotFoundException('Truck not found');
    if (ACTIVE_TRIP_STATUSES.includes(tripStatus) && truck.status !== TruckStatus.AVAILABLE) {
      throw new BadRequestException('Truck must be AVAILABLE');
    }
    return truck;
  }

  private normalizeOptionalId(value: unknown, fieldName: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value);
    if (!/^\d+$/.test(text)) throw new BadRequestException(`${fieldName} must be an integer number`);
    return text;
  }

  private normalizeDate(value: unknown, fieldName: string): Date {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${fieldName} must be a valid date-time`);
    return date;
  }

  private normalizeOptionalDate(value: unknown, fieldName: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return this.normalizeDate(value, fieldName);
  }

  private async validateManifestForAssignment(manifestId: string): Promise<ManifestEntity> {
    const manifest = await this.manifestsRepository.findOne({ where: { id: manifestId } });
    if (!manifest) throw new NotFoundException('Manifest not found');
    if (manifest.status !== ManifestStatus.CLOSED) throw new BadRequestException('Manifest must be CLOSED');
    return manifest;
  }

  private async validateHubs(startHubId: string, endHubId: string, manifest: ManifestEntity | null): Promise<void> {
    const hubs = await this.hubsRepository.find({ where: { id: In([startHubId, endHubId]) } });
    if (hubs.length !== new Set([startHubId, endHubId]).size) throw new NotFoundException('Hub not found');
    if (manifest?.origin_hub_id && manifest.origin_hub_id !== startHubId) throw new BadRequestException('Start hub must match manifest origin hub');
    if (manifest?.dest_hub_id && manifest.dest_hub_id !== endHubId) throw new BadRequestException('End hub must match manifest destination hub');
  }

  private async assertManifestNotInActiveTrip(manifestId: string, excludeTripId?: string): Promise<void> {
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .where('trip.manifest_id = :manifestId', { manifestId })
      .andWhere('trip.status IN (:...statuses)', { statuses: ACTIVE_TRIP_STATUSES });
    if (excludeTripId) qb.andWhere('trip.id != :excludeTripId', { excludeTripId });
    if (await qb.getOne()) throw new ConflictException('Manifest is already assigned to an active trip');
  }

  private validateTripTimes(departureTime: Date, arrivalTime?: Date | null, requireFuture = true): void {
    if (requireFuture && departureTime.getTime() < Date.now() - 1000) throw new BadRequestException('Departure time must be now or in the future');
    if (arrivalTime && arrivalTime.getTime() <= departureTime.getTime()) throw new BadRequestException('Arrival time must be after departure time');
  }

  private applyHubScope(qb: any, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask)) return;
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (!assignedHubIds.length) return;
    qb.andWhere(new Brackets((inner) => {
      inner.where('trip.start_hub_id IN (:...userHubIds)', { userHubIds: assignedHubIds })
        .orWhere('trip.end_hub_id IN (:...userHubIds)', { userHubIds: assignedHubIds });
    }));
  }

  private async moveManifestWaybills(manifestId: string, from: WaybillState, to: WaybillState): Promise<void> {
    const waybills = await this.getManifestWaybills(manifestId);
    const changed = waybills.filter((waybill) => waybill.current_state === from);
    changed.forEach((waybill) => { waybill.current_state = to; });
    if (changed.length) await this.waybillsRepository.save(changed);
  }

  private async buildIncomingTripFinancialAllocations(
    trips: TripEntity[],
  ): Promise<Map<string, IncomingTripFinancialAllocation>> {
    const tripIds = trips.map((trip) => String(trip.id));
    if (!tripIds.length) return new Map();

    const requestedSplits = (await this.waybillSplitsRepository.find({
      where: { trip_id: In(tripIds) } as any,
      relations: ['waybill'],
    })) ?? [];
    const waybillIds = [...new Set(requestedSplits.map((split) => String(split.waybill_id)).filter(Boolean))];
    if (!waybillIds.length) return new Map();

    const relatedSplits = (await this.waybillSplitsRepository.find({
      where: { waybill_id: In(waybillIds) } as any,
      relations: ['waybill'],
    })) ?? [];
    const splitRows = [...requestedSplits, ...relatedSplits].reduce<Map<string, WaybillSplitEntity>>((map, split) => {
      map.set(String(split.id), split);
      return map;
    }, new Map());
    const splitsByWaybill = [...splitRows.values()].reduce<Map<string, WaybillSplitEntity[]>>((map, split) => {
      const waybillId = String(split.waybill_id);
      const rows = map.get(waybillId) ?? [];
      rows.push(split);
      map.set(waybillId, rows);
      return map;
    }, new Map());

    const allocationBySplitId = new Map<string, Omit<IncomingTripFinancialAllocation, 'waybill_count'>>();
    for (const splits of splitsByWaybill.values()) {
      const assignedSplits = splits
        .filter((split) => Boolean(split.trip_id))
        .sort((left, right) => String(left.id).localeCompare(String(right.id), 'en', { numeric: true }));
      const waybill = assignedSplits.find((split) => split.waybill)?.waybill;
      if (!waybill || !assignedSplits.length) continue;

      const assignedPackages = assignedSplits.reduce((sum, split) => sum + Math.max(0, Number(split.package_count ?? 0)), 0);
      const declaredPackages = Math.max(1, Number(waybill.package_count ?? 0) || assignedPackages || 1);
      const allocationDenominator = Math.max(declaredPackages, assignedPackages, 1);
      const allocateInteger = (total: number, packageCount: number, isLast: boolean, allocatedBefore: number) => (
        isLast && assignedPackages >= declaredPackages
          ? Math.max(0, total - allocatedBefore)
          : Math.floor((total * packageCount) / allocationDenominator)
      );
      const totalRevenue = Math.max(0, Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0);
      const totalCollect = Math.max(0, this.calcWaybillCollectAmount(waybill));
      const totalWeight = Math.max(0, Number(waybill.weight ?? 0) || 0);
      const totalVolume = Math.max(0, Number(waybill.the_tich_m3 ?? 0) || 0);
      let allocatedRevenue = 0;
      let allocatedCollect = 0;

      assignedSplits.forEach((split, index) => {
        const packageCount = Math.max(0, Number(split.package_count ?? 0));
        const isLast = index === assignedSplits.length - 1;
        const revenue = allocateInteger(totalRevenue, packageCount, isLast, allocatedRevenue);
        const collect = allocateInteger(totalCollect, packageCount, isLast, allocatedCollect);
        allocatedRevenue += revenue;
        allocatedCollect += collect;
        allocationBySplitId.set(String(split.id), {
          planned_total_weight: (totalWeight * packageCount) / allocationDenominator,
          planned_total_volume: (totalVolume * packageCount) / allocationDenominator,
          total_collect: collect,
          total_revenue: revenue,
        });
      });
    }

    const resultWithIds = new Map<string, IncomingTripFinancialAllocation & { waybill_ids: Set<string> }>();
    requestedSplits.forEach((split) => {
      const tripId = String(split.trip_id || '');
      const allocation = allocationBySplitId.get(String(split.id));
      if (!tripId || !allocation) return;
      const current = resultWithIds.get(tripId) ?? {
        waybill_count: 0,
        waybill_ids: new Set<string>(),
        planned_total_weight: 0,
        planned_total_volume: 0,
        total_collect: 0,
        total_revenue: 0,
      };
      current.waybill_ids.add(String(split.waybill_id));
      current.waybill_count = current.waybill_ids.size;
      current.planned_total_weight += allocation.planned_total_weight;
      current.planned_total_volume += allocation.planned_total_volume;
      current.total_collect += allocation.total_collect;
      current.total_revenue += allocation.total_revenue;
      resultWithIds.set(tripId, current);
    });

    return new Map([...resultWithIds.entries()].map(([tripId, value]) => [tripId, {
      waybill_count: value.waybill_count,
      planned_total_weight: value.planned_total_weight,
      planned_total_volume: value.planned_total_volume,
      total_collect: value.total_collect,
      total_revenue: value.total_revenue,
    }]));
  }

  private async getManifestWaybills(manifestId: string | null): Promise<WaybillEntity[]> {
    if (!manifestId) return [];
    const rows = await this.manifestWaybillsRepository.find({ where: { manifest_id: manifestId }, relations: ['waybill'] });
    return rows.map((row) => row.waybill).filter(Boolean);
  }

  private async toIncomingTripSummary(trip: TripEntity, allocation?: IncomingTripFinancialAllocation) {
    const waybills = allocation ? [] : await this.getManifestWaybills(trip.manifest_id);
    const weight = allocation?.planned_total_weight
      ?? waybills.reduce((sum, waybill) => sum + Number(waybill.weight ?? 0), 0);
    const volume = allocation?.planned_total_volume
      ?? waybills.reduce((sum, waybill) => sum + Number(waybill.the_tich_m3 ?? 0), 0);
    const total_collect = allocation?.total_collect
      ?? waybills.reduce((sum, waybill) => sum + this.calcWaybillCollectAmount(waybill), 0);
    const total_revenue = allocation?.total_revenue
      ?? waybills.reduce((sum, waybill) => sum + Number(waybill.freight_amount ?? waybill.cost_amount ?? 0), 0);
    const expense_total = (trip.expenses ?? []).reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
    return {
      ...trip,
      manifest_code: trip.manifest?.manifest_code ?? null,
      seal_code: trip.manifest?.seal_code ?? null,
      waybill_count: allocation?.waybill_count ?? waybills.length,
      planned_total_weight: weight,
      planned_total_volume: volume,
      total_collect,
      total_revenue,
      expense_total,
      license_plate: trip.manual_license_plate ?? trip.truck?.license_plate ?? trip.truck?.bks ?? null,
      driver_name: trip.driver_name?.trim()
        || trip.truck?.ten_lai_xe?.trim()
        || trip.truck?.driver?.full_name?.trim()
        || null,
      driver_phone: trip.driver_phone?.trim()
        || trip.truck?.driver?.phone?.trim()
        || null,
      vendor_name: trip.vendor?.name?.trim()
        || trip.truck?.vendor?.name?.trim()
        || trip.truck?.nha_xe?.trim()
        || null,
      vendor_id: trip.vendor?.id ?? trip.vendor_id ?? trip.truck?.vendor?.id ?? trip.truck?.vendor_id ?? null,
      vendor_code: trip.vendor?.code?.trim() || trip.truck?.vendor?.code?.trim() || null,
      vehicle_type: trip.truck?.loai_xe?.trim() || null,
    };
  }

  private calcWaybillCollectAmount(waybill: WaybillEntity): number {
    const cod = Number(waybill.cod_amount ?? 0) || 0;
    const cc = Number((waybill as WaybillEntity & { cc_amount?: string | number | null }).cc_amount ?? 0) || 0;
    if (cc || cod) return cc + cod;
    if (waybill.payment_type === PaymentType.CC) {
      return Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
    }
    return cod;
  }

  private async setTruckStatus(truckId: string | null, status: TruckStatus): Promise<void> {
    if (!truckId) return;
    const truck = await this.trucksRepository.findOne({ where: { id: truckId } });
    if (!truck) return;
    truck.status = status;
    await this.trucksRepository.save(truck);
  }

  private async enrichRouteLabels(trips: TripEntity[]): Promise<void> {
    if (!trips.length) return;
    const ids = trips.map((trip) => String(trip.id));
    const splits = (await this.waybillSplitsRepository.find({
      where: { trip_id: In(ids) } as any,
      relations: ['waybill', 'waybill.dest_hub'],
    })) ?? [];
    for (const trip of trips) {
      const stopsByHub = new Map<string, NonNullable<TripEntity['route_stops']>[number]>();
      splits
        .filter((split) => String(split.trip_id) === String(trip.id))
        .forEach((split) => {
          const hubId = String(split.waybill?.dest_hub_id || split.waybill?.dest_hub?.id || '').trim();
          if (!hubId) return;
          const expectedArrival = split.expected_arrival_at ? new Date(split.expected_arrival_at) : null;
          const validExpectedArrival = expectedArrival && !Number.isNaN(expectedArrival.getTime())
            ? expectedArrival
            : null;
          const current = stopsByHub.get(hubId);
          if (!current) {
            stopsByHub.set(hubId, {
              hub_id: hubId,
              hub_code: split.waybill?.dest_hub?.code?.trim() || null,
              hub_name: split.waybill?.dest_hub?.name?.trim() || null,
              transit_days: split.waybill?.dest_hub?.transit_days ?? null,
              expected_arrival_at: validExpectedArrival,
            });
            return;
          }
          if (validExpectedArrival && (!current.expected_arrival_at || validExpectedArrival < current.expected_arrival_at)) {
            current.expected_arrival_at = validExpectedArrival;
          }
        });
      trip.route_stops = [...stopsByHub.values()].sort((left, right) => {
        const leftTime = left.expected_arrival_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightTime = right.expected_arrival_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.hub_id.localeCompare(right.hub_id, 'en', { numeric: true });
      });
      const destinations = trip.route_stops.map((stop) => stop.hub_code || stop.hub_name || stop.hub_id);
      const origin = trip.start_hub?.code || trip.start_hub?.name || String(trip.start_hub_id);
      trip.route_label = destinations.length
        ? [origin, ...destinations].join(' → ')
        : `${origin} → ${trip.end_hub?.code || trip.end_hub_id}`;
    }
  }

  private async enrichDeliverySummaries(trips: TripEntity[]): Promise<void> {
    if (!trips.length) return;
    const manifestIds = [...new Set(trips.map((trip) => String(trip.manifest_id || '')).filter(Boolean))];
    const links = manifestIds.length
      ? (await this.manifestWaybillsRepository.find({
        where: { manifest_id: In(manifestIds) },
        relations: ['waybill'],
      })) ?? []
      : [];
    const waybillsByManifest = links.reduce((map, link) => {
      if (!link.waybill) return map;
      const manifestId = String(link.manifest_id);
      const current = map.get(manifestId) ?? new Map<string, WaybillEntity>();
      current.set(String(link.waybill.id), link.waybill);
      map.set(manifestId, current);
      return map;
    }, new Map<string, Map<string, WaybillEntity>>());

    for (const trip of trips) {
      const waybills = [...(waybillsByManifest.get(String(trip.manifest_id || ''))?.values() ?? [])];
      const delivered = waybills.filter((waybill) => String(waybill.current_state || '').toUpperCase() === WaybillState.DELIVERED).length;
      const processed = waybills.filter((waybill) => {
        const state = String(waybill.current_state || '').toUpperCase();
        const preparationStatus = String(waybill.delivery_preparation_status || '').toUpperCase();
        return [WaybillState.OUT_FOR_DELIVERY, WaybillState.DELIVERED, WaybillState.RETURNED].includes(state as WaybillState)
          || (Boolean(preparationStatus) && preparationStatus !== 'PENDING_CONFIRMATION');
      }).length;
      if (trip.status === TripStatus.ARRIVED && waybills.length > 0 && delivered === waybills.length) {
        await this.finalizeTrip(trip);
      }
      trip.delivery_summary = {
        total_waybills: waybills.length,
        processed_waybills: processed,
        delivered_waybills: delivered,
        pending_delivery_waybills: Math.max(0, waybills.length - delivered),
        completed_waybills: trip.status === TripStatus.COMPLETED ? waybills.length : delivered,
      };
    }
  }

  /** Chốt chuyến đã quá giờ dự kiến; nút Đến hub chỉ còn dùng cho xe đến sớm. */
  private async processScheduledArrivals(): Promise<void> {
    const now = new Date();
    const trips = (await this.tripsRepository.find({
      where: { status: In([TripStatus.IN_TRANSIT, TripStatus.ARRIVED]) } as any,
    })) ?? [];
    if (!trips.length) return;

    // Chuyến nhiều HUB chỉ được xem là đã đến khi qua thời gian của điểm dừng cuối.
    // Dữ liệu cũ có thể vẫn giữ expected_arrival_time của HUB đầu tiên trên bản ghi trip,
    // nên luôn ưu tiên mốc lớn nhất đã lưu trên các split của chuyến.
    const tripIds = trips.map((trip) => String(trip.id));
    const splits = (await this.waybillSplitsRepository.find({
      where: { trip_id: In(tripIds) } as any,
      relations: ['waybill'],
    })) ?? [];
    const splitsByTrip = splits.reduce<Map<string, WaybillSplitEntity[]>>((map, split) => {
      const tripId = String(split.trip_id || '');
      const tripSplits = map.get(tripId) ?? [];
      tripSplits.push(split);
      map.set(tripId, tripSplits);
      return map;
    }, new Map());

    for (const trip of trips) {
      const arrivalSchedule = resolveTripArrivalSchedule(
        splitsByTrip.get(String(trip.id)) ?? [],
        trip.expected_arrival_time,
      );
      const finalStopExpected = arrivalSchedule.splitExpectedArrival;
      const expected = arrivalSchedule.finalExpectedArrival;
      if (!expected || Number.isNaN(expected.getTime())) continue;

      const storedExpected = trip.expected_arrival_time ? new Date(trip.expected_arrival_time) : null;
      const shouldSyncFinalStop = Boolean(finalStopExpected)
        && arrivalSchedule.hasCompleteHubSchedule
        && (!storedExpected || Number.isNaN(storedExpected.getTime()) || storedExpected.getTime() !== expected.getTime());
      if (shouldSyncFinalStop) trip.expected_arrival_time = expected;
      if (arrivalSchedule.isMultiHub && !arrivalSchedule.hasCompleteHubSchedule) {
        if (trip.status === TripStatus.ARRIVED) {
          trip.status = TripStatus.IN_TRANSIT;
          trip.arrival_time = null;
          if (trip.manifest_id) {
            await this.moveManifestWaybills(String(trip.manifest_id), WaybillState.AT_DEST_HUB, WaybillState.IN_TRANSIT);
          }
          await this.waybillSplitsRepository.update(
            { trip_id: String(trip.id), load_status: WaybillSplitLoadStatus.ARRIVED } as any,
            { load_status: WaybillSplitLoadStatus.IN_TRANSIT },
          );
          await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
          await this.tripsRepository.save(trip);
        }
        continue;
      }
      if (expected > now) {
        let restoredIntermediateArrival = false;
        // Chuyến nhiều HUB luôn giữ trạng thái đang chạy cho tới mốc HUB cuối,
        // kể cả dữ liệu cũ đã bị chốt thủ công tại một HUB trung gian.
        if (trip.status === TripStatus.ARRIVED && (shouldSyncFinalStop || arrivalSchedule.isMultiHub)) {
          trip.status = TripStatus.IN_TRANSIT;
          trip.arrival_time = expected;
          restoredIntermediateArrival = true;
          if (trip.manifest_id) {
            await this.moveManifestWaybills(String(trip.manifest_id), WaybillState.AT_DEST_HUB, WaybillState.IN_TRANSIT);
          }
          await this.waybillSplitsRepository.update(
            { trip_id: String(trip.id), load_status: WaybillSplitLoadStatus.ARRIVED } as any,
            { load_status: WaybillSplitLoadStatus.IN_TRANSIT },
          );
          await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
        }
        if (shouldSyncFinalStop || restoredIntermediateArrival) {
          await this.tripsRepository.save(trip);
        }
        continue;
      }
      if (trip.status === TripStatus.ARRIVED) {
        if (shouldSyncFinalStop) await this.tripsRepository.save(trip);
        continue;
      }
      trip.status = TripStatus.ARRIVED;
      trip.arrival_time = trip.arrival_time ?? now;
      if (trip.manifest_id) {
        await this.moveManifestWaybills(String(trip.manifest_id), WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB);
      }
      await this.waybillSplitsRepository.update(
        {
          trip_id: String(trip.id),
          load_status: In([
            WaybillSplitLoadStatus.LOADED,
            WaybillSplitLoadStatus.DEPARTED,
            WaybillSplitLoadStatus.IN_TRANSIT,
          ]),
        } as any,
        { load_status: WaybillSplitLoadStatus.ARRIVED },
      );
      await this.waybillsService.reconcileTransportStatesForTrips([trip.id]);
      await this.tripsRepository.save(trip);
    }
  }

  private assertNonNegative(...values: Array<number | undefined>): void {
    if (values.some((value) => value !== undefined && value < 0)) throw new BadRequestException('Costs must not be negative');
  }

  private toNumber(value: Money): number {
    return Number(value ?? 0);
  }

  private resolveTripVendorId(trip: TripEntity): string | null {
    return trip.vendor_id
      ?? trip.vendor?.id
      ?? trip.truck?.vendor_id
      ?? trip.truck?.vendor?.id
      ?? null;
  }

  private resolveTripCost(dto: CreateTripDto): number {
    const cost = dto.trip_cost ?? dto.other_costs ?? 0;
    return Number(cost) > 0 ? Number(cost) : 0;
  }

  private mapAllocationDispatchRow(
    row: ManifestWaybillEntity,
    index: number,
    endHub: HubEntity | null | undefined,
    truck: TruckEntity | null | undefined,
    highlightWaybillId: string | null,
    split?: WaybillSplitEntity,
  ) {
    const wb = row.waybill!;
    const wbExtra = wb as WaybillEntity & Record<string, unknown>;
    const position = split?.loading_position ?? row.loading_position ?? index + 1;
    const loadedAt = row.loaded_at ?? wb.loaded_at ?? null;
    const hubCode = (endHub?.code ?? wb.noi_den ?? 'HCM').toUpperCase();
    const companyName = wb.ma_kh?.trim()
      || this.parseContactName(wb.sender_info)
      || wb.waybill_code;
    const routeCode = wb.route_code?.trim();
    const dv = routeCode && routeCode.length <= 4
      ? routeCode.toUpperCase()
      : String(wbExtra.dich_vu ?? wbExtra.loai_bp ?? 'TC').slice(0, 4).toUpperCase() || 'TC';
    const note = split?.note?.trim() ?? wb.note?.trim() ?? '';
    const parenthetical = note.match(/\([^)]+\)/)?.[0] ?? null;
    const goodsBody = String(wbExtra.noi_dung ?? '').trim() || wb.waybill_code;
    const matHang = goodsBody;
    const matHangNote = parenthetical
      ?? (note && /xe|kiện|lô/i.test(note) ? note : null);
    const deliveryType = String(wbExtra.loai_giao_hang ?? '').trim() || 'Giao tận nơi';
    const noiTra = `Kho ${hubCode} ${deliveryType}`;
    const quantity = Number(split?.package_count ?? wb.package_count ?? 1);
    const unitRaw = String(wbExtra.don_gia_don_vi ?? '').toLowerCase();
    const loai = unitRaw.includes('pallet') ? 'pallet' : 'kiện';
    const address = wb.receiver_address?.trim() || this.parseContactAddress(wb.receiver_info);
    const splitTruck = split?.truck ?? split?.trip?.truck ?? null;
    const truckLabel = String(split?.carrier_label ?? wbExtra.xe_phat ?? splitTruck?.nha_xe ?? truck?.nha_xe ?? truck?.ten_lai_xe ?? '').trim();

    return {
      waybill_id: row.waybill_id,
      split_id: split?.id ?? null,
      waybill_code: wb.waybill_code,
      loading_position: position,
      vi_tri_hang: position,
      ngay_boc: this.formatDispatchDate(loadedAt),
      ma_tinh: hubCode,
      ten_cty: companyName,
      dv,
      mat_hang: matHang,
      mat_hang_note: matHangNote,
      noi_tra: noiTra,
      so_luong: quantity,
      loai,
      dia_chi: address,
      noi_den: wb.noi_den,
      weight: wb.weight,
      the_tich_m3: wb.the_tich_m3,
      xe_phat: truckLabel || null,
      is_highlighted: highlightWaybillId === String(row.waybill_id),
    };
  }

  private formatDispatchDate(value: Date | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }

  private parseContactName(info?: string | null): string {
    if (!info?.trim()) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[0] || parts[1] || '';
  }

  private parseContactAddress(info?: string | null): string {
    if (!info?.trim()) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[2] || parts[parts.length - 1] || '';
  }
}
