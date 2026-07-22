import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Not, Repository } from 'typeorm';
import { PaymentType, TripStatus, VendorTripPaymentStatus, WaybillState } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, isManager } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TruckStatus } from '../trucks/dto/truck.enums';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { VendorsService } from '../vendors/vendors.service';
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

const ACTIVE_TRIP_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT];
const LOADING_SEQUENCE_STATUSES = [TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED];
const ALLOCATION_BOARD_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED];

type Money = string | number | null | undefined;

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
      await this.bindUnassignedManifestSplits(String(manifest.id), savedTrip);
    }
    if (truck) {
      truck.status = TruckStatus.ASSIGNED;
      await this.trucksRepository.save(truck);
    }
    return savedTrip;
  }

  async findAll(query: QueryTripsDto, currentUser: UserEntity) {
    const hubScopeId =
      query.end_hub_id != null
        ? String(query.end_hub_id)
        : query.start_hub_id != null
          ? String(query.start_hub_id)
          : isManager(currentUser.role_mask)
            ? undefined
            : currentUser.hub_id ?? undefined;

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
    return { data, total, page, limit };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<TripEntity> {
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const trip = await qb.getOne();
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async update(id: string, dto: UpdateTripDto, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.PLANNED) throw new BadRequestException('Only PLANNED trips can be updated');
    if (dto.truck_id !== undefined) {
      const truck = await this.validateTruck(dto.truck_id);
      if (trip.truck_id && trip.truck_id !== String(dto.truck_id)) {
        const oldTruck = await this.trucksRepository.findOne({ where: { id: trip.truck_id } });
        if (oldTruck) {
          oldTruck.status = TruckStatus.AVAILABLE;
          await this.trucksRepository.save(oldTruck);
        }
      }
      trip.truck_id = dto.truck_id == null ? null : String(dto.truck_id);
      if (truck) {
        truck.status = TruckStatus.ASSIGNED;
        await this.trucksRepository.save(truck);
      }
    }
    const departureTime = dto.departure_time !== undefined ? this.normalizeDate(dto.departure_time, 'departure_time') : trip.departure_time;
    const arrivalTime = dto.arrival_time !== undefined ? this.normalizeOptionalDate(dto.arrival_time, 'arrival_time') : trip.arrival_time;
    if (dto.departure_time !== undefined || dto.arrival_time !== undefined) this.validateTripTimes(departureTime, arrivalTime, false);
    if (dto.departure_time !== undefined) trip.departure_time = departureTime;
    if (dto.arrival_time !== undefined) {
      trip.arrival_time = arrivalTime;
      trip.expected_arrival_time = arrivalTime;
    }
    return this.tripsRepository.save(trip);
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
    await this.bindUnassignedManifestSplits(String(dto.manifest_id), trip);
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
        trip.driver_name = truck.ten_lai_xe ?? truck.driver?.full_name ?? null;
        trip.driver_phone = truck.driver?.phone ?? null;
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
      const links = await this.manifestWaybillsRepository.find({ where: { manifest_id: trip.manifest_id } }) ?? [];
      const waybillIds = links.map((link) => String(link.waybill_id));
      if (waybillIds.length) {
        await this.waybillSplitsRepository.update(
          { waybill_id: In(waybillIds), trip_id: String(trip.id) },
          { load_status: WaybillSplitLoadStatus.IN_TRANSIT },
        );
      }
    }
    return this.tripsRepository.save(trip);
  }

  async arriveTrip(id: string, dto: ArriveTripDto, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.IN_TRANSIT) throw new BadRequestException('Only IN_TRANSIT trips can arrive');
    trip.status = TripStatus.ARRIVED;
    trip.arrival_time = dto.arrival_time ?? new Date();
    if (trip.manifest_id) await this.moveManifestWaybills(trip.manifest_id, WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB, trip.end_hub_id);
    return this.tripsRepository.save(trip);
  }

  async completeTrip(id: string, currentUser: UserEntity): Promise<TripEntity> {
    const trip = await this.findOne(id, currentUser);
    if (trip.status !== TripStatus.ARRIVED) throw new BadRequestException('Only ARRIVED trips can be completed');
    trip.status = TripStatus.COMPLETED;
    const manifest = trip.manifest_id ? await this.manifestsRepository.findOne({ where: { id: trip.manifest_id } }) : null;
    if (manifest) {
      manifest.status = ManifestStatus.COMPLETED;
      await this.manifestsRepository.save(manifest);
    }
    if (trip.truck_id) {
      const activeTrips = await this.tripsRepository.count({ where: { truck_id: trip.truck_id, status: In(ACTIVE_TRIP_STATUSES), id: Not(trip.id) } as any });
      if (activeTrips === 0) await this.setTruckStatus(trip.truck_id, TruckStatus.AVAILABLE);
    }
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
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 100);
    const hubId = query.end_hub_id != null ? String(query.end_hub_id) : currentUser.hub_id;
    if (hubId) {
      await this.waybillsService.backfillInTransitTripsForHub(hubId);
    }

    const activeStatuses = [TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED];
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('manifest.origin_hub', 'manifest_origin_hub')
      .leftJoinAndSelect('manifest.dest_hub', 'manifest_dest_hub')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.status IN (:...statuses)', { statuses: activeStatuses });

    if (hubId) {
      qb.andWhere(new Brackets((inner) => {
        inner
          .where('trip.start_hub_id = :hubId', { hubId })
          .orWhere('trip.end_hub_id = :hubId', { hubId });
      }));
    }

    this.applyHubScope(qb, currentUser);

    const statusRank: Record<string, number> = {
      [TripStatus.ARRIVED]: 0,
      [TripStatus.IN_TRANSIT]: 1,
      [TripStatus.PLANNED]: 2,
      [TripStatus.COMPLETED]: 3,
    };

    const allTrips = (await qb.getMany()).sort((left, right) => {
      const rankDiff = (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      const leftTime = new Date(left.arrival_time || left.expected_arrival_time || left.departure_time || 0).getTime();
      const rightTime = new Date(right.arrival_time || right.expected_arrival_time || right.departure_time || 0).getTime();
      return rightTime - leftTime;
    });
    const total = allTrips.length;
    const trips = allTrips.slice((page - 1) * limit, page * limit);
    const data = await Promise.all(trips.map(async (trip) => {
      const waybills = await this.getManifestWaybills(trip.manifest_id);
      const weight = waybills.reduce((sum, wb) => sum + Number(wb.weight ?? 0), 0);
      const volume = waybills.reduce((sum, wb) => sum + Number(wb.the_tich_m3 ?? 0), 0);
      const total_collect = waybills.reduce((sum, wb) => sum + this.calcWaybillCollectAmount(wb), 0);
      return {
        ...trip,
        manifest_code: trip.manifest?.manifest_code ?? null,
        seal_code: trip.manifest?.seal_code ?? null,
        waybill_count: waybills.length,
        planned_total_weight: weight,
        planned_total_volume: volume,
        total_collect,
        license_plate: trip.truck?.license_plate ?? trip.truck?.bks ?? null,
        driver_name: trip.driver_name?.trim()
          || trip.truck?.ten_lai_xe?.trim()
          || trip.truck?.driver?.full_name?.trim()
          || null,
        driver_phone: trip.driver_phone?.trim()
          || trip.truck?.driver?.phone?.trim()
          || null,
        vendor_name: trip.truck?.vendor?.name?.trim()
          || trip.truck?.nha_xe?.trim()
          || null,
        vehicle_type: trip.truck?.loai_xe?.trim() || null,
      };
    }));
    return { data, total, page, limit };
  }

  async getIncomingTripDetail(id: string, currentUser: UserEntity) {
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('truck.vendor', 'vendor')
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
    const waybills = await this.getManifestWaybills(trip.manifest_id);
    const weight = waybills.reduce((sum, wb) => sum + Number(wb.weight ?? 0), 0);
    const volume = waybills.reduce((sum, wb) => sum + Number(wb.the_tich_m3 ?? 0), 0);
    const total_collect = waybills.reduce((sum, wb) => sum + this.calcWaybillCollectAmount(wb), 0);
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
          vendor_name: trip.truck?.vendor?.name?.trim() || trip.truck?.nha_xe?.trim() || null,
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
      license_plate: trip.truck?.license_plate ?? trip.truck?.bks ?? null,
      driver_name: trip.driver_name?.trim()
        || trip.truck?.ten_lai_xe?.trim()
        || trip.truck?.driver?.full_name?.trim()
        || null,
      driver_phone: trip.driver_phone?.trim()
        || trip.truck?.driver?.phone?.trim()
        || null,
      vendor_name: trip.truck?.vendor?.name?.trim()
        || trip.truck?.nha_xe?.trim()
        || null,
      vehicle_type: trip.truck?.loai_xe?.trim() || null,
      waybill_count: waybills.length,
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
        license_plate: trip.truck?.license_plate ?? trip.truck?.bks ?? null,
        nha_xe: trip.truck?.nha_xe ?? trip.truck?.vendor?.name ?? null,
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
      throw new BadRequestException('Loading sequence is available after trip departure');
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
      throw new BadRequestException('Loading sequence can only be updated after trip departure');
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
    if (!currentUser.hub_id) return;
    qb.andWhere(new Brackets((inner) => {
      inner.where('trip.start_hub_id = :userHubId', { userHubId: currentUser.hub_id })
        .orWhere('trip.end_hub_id = :userHubId', { userHubId: currentUser.hub_id });
    }));
  }

  private async moveManifestWaybills(manifestId: string, from: WaybillState, to: WaybillState, currentHubId?: string | null): Promise<void> {
    const waybills = await this.getManifestWaybills(manifestId);
    const changed = waybills.filter((waybill) => waybill.current_state === from);
    changed.forEach((waybill) => {
      waybill.current_state = to;
      if (currentHubId) waybill.current_hub_id = String(currentHubId);
    });
    if (changed.length) await this.waybillsRepository.save(changed);
  }

  private async getManifestWaybills(manifestId: string | null): Promise<WaybillEntity[]> {
    if (!manifestId) return [];
    const rows = await this.manifestWaybillsRepository.find({ where: { manifest_id: manifestId }, relations: ['waybill'] });
    return rows.map((row) => row.waybill).filter(Boolean);
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

  private assertNonNegative(...values: Array<number | undefined>): void {
    if (values.some((value) => value !== undefined && value < 0)) throw new BadRequestException('Costs must not be negative');
  }

  private toNumber(value: Money): number {
    return Number(value ?? 0);
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

  private async bindUnassignedManifestSplits(manifestId: string, trip: TripEntity): Promise<void> {
    const links = await this.manifestWaybillsRepository.find({ where: { manifest_id: manifestId } }) ?? [];
    const waybillIds = links.map((link) => String(link.waybill_id));
    if (!waybillIds.length) return;
    await this.waybillSplitsRepository.update(
      { waybill_id: In(waybillIds), trip_id: IsNull() },
      {
        trip_id: String(trip.id),
        truck_id: trip.truck_id ? String(trip.truck_id) : null,
        load_status: WaybillSplitLoadStatus.LOADED,
      },
    );
  }
}
