import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripStatus, WaybillState } from '../common/enums';
import { Roles } from '../common/roles';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TruckStatus } from '../trucks/dto/truck.enums';
import { TruckEntity } from '../trucks/truck.entity';
import { VendorPaymentEntity } from '../vendors/vendor-payment.entity';
import { VendorsService } from '../vendors/vendors.service';
import { WaybillEntity } from '../waybills/waybill.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { WaybillsService } from '../waybills/waybills.service';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from './trip.entity';
import { TripsService } from './trips.service';

const dispatcher = { id: '1', role_mask: Roles.DISPATCHER, hub_id: '1' } as any;
const manager = { id: '2', role_mask: Roles.MANAGER, hub_id: null } as any;
const driver = { id: '3', role_mask: Roles.DRIVER, hub_id: '1' } as any;
const future = () => new Date(Date.now() + 60_000);

class MockQb {
  where = jest.fn().mockReturnThis();
  andWhere = jest.fn().mockReturnThis();
  leftJoinAndSelect = jest.fn().mockReturnThis();
  orderBy = jest.fn().mockReturnThis();
  addOrderBy = jest.fn().mockReturnThis();
  skip = jest.fn().mockReturnThis();
  take = jest.fn().mockReturnThis();
  getOne = jest.fn();
  getMany = jest.fn();
  getManyAndCount = jest.fn();
}

const repo = () => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('TripsService', () => {
  let service: TripsService;
  let trips: any;
  let trucks: any;
  let manifests: any;
  let manifestWaybills: any;
  let waybills: any;
  let hubs: any;
  let vendorsService: any;
  let waybillsService: any;

  beforeEach(async () => {
    vendorsService = {
      addPayableDebt: jest.fn(),
      findPaymentsByTripIds: jest.fn().mockResolvedValue([]),
    };
    waybillsService = {
      backfillInTransitTripsForHub: jest.fn().mockResolvedValue(0),
    };
    const module = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(TripEntity), useFactory: repo },
        { provide: getRepositoryToken(TruckEntity), useFactory: repo },
        { provide: getRepositoryToken(ManifestEntity), useFactory: repo },
        { provide: getRepositoryToken(ManifestWaybillEntity), useFactory: repo },
        { provide: getRepositoryToken(WaybillEntity), useFactory: repo },
        { provide: getRepositoryToken(HubEntity), useFactory: repo },
        { provide: getRepositoryToken(WaybillSplitEntity), useFactory: repo },
        { provide: getRepositoryToken(VendorPaymentEntity), useFactory: repo },
        { provide: VendorsService, useValue: vendorsService },
        { provide: WaybillsService, useValue: waybillsService },
      ],
    }).compile();

    service = module.get(TripsService);
    trips = module.get(getRepositoryToken(TripEntity));
    trucks = module.get(getRepositoryToken(TruckEntity));
    manifests = module.get(getRepositoryToken(ManifestEntity));
    manifestWaybills = module.get(getRepositoryToken(ManifestWaybillEntity));
    waybills = module.get(getRepositoryToken(WaybillEntity));
    hubs = module.get(getRepositoryToken(HubEntity));
  });

  const validCreate = () => ({ manifest_id: 10, truck_id: 5, start_hub_id: 1, end_hub_id: 2, departure_time: future(), arrival_time: new Date(Date.now() + 120_000) });
  const validRefs = () => {
    trucks.findOne.mockResolvedValue({ id: '5', status: TruckStatus.AVAILABLE });
    manifests.findOne.mockResolvedValue({ id: '10', status: ManifestStatus.CLOSED, origin_hub_id: '1', dest_hub_id: '2' });
    hubs.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const qb = new MockQb();
    qb.getOne.mockResolvedValue(null);
    trips.createQueryBuilder.mockReturnValue(qb);
  };

  describe('create', () => {
    it('tạo trip thành công với đủ dữ liệu hợp lệ', async () => {
      validRefs();
      const result = await service.create(validCreate(), dispatcher);
      expect(result.status).toBe(TripStatus.PLANNED);
      expect(manifests.save).toHaveBeenCalledWith(expect.objectContaining({ status: ManifestStatus.ASSIGNED_TO_TRIP }));
      expect(trucks.save).toHaveBeenCalledWith(expect.objectContaining({ status: TruckStatus.ASSIGNED }));
    });

    it('truck không tồn tại → NotFoundException', async () => {
      trucks.findOne.mockResolvedValue(null);
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('truck.status không phải AVAILABLE → BadRequestException', async () => {
      trucks.findOne.mockResolvedValue({ status: TruckStatus.IN_TRIP });
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('manifest không tồn tại → NotFoundException', async () => {
      trucks.findOne.mockResolvedValue({ status: TruckStatus.AVAILABLE });
      manifests.findOne.mockResolvedValue(null);
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('manifest.status không phải CLOSED → BadRequestException', async () => {
      trucks.findOne.mockResolvedValue({ status: TruckStatus.AVAILABLE });
      manifests.findOne.mockResolvedValue({ status: ManifestStatus.DRAFT });
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('manifest đã trong trip active → ConflictException', async () => {
      validRefs();
      trips.createQueryBuilder().getOne.mockResolvedValue({ id: '99' });
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(ConflictException);
    });

    it('start_hub_id không khớp manifest.origin_hub_id → BadRequestException', async () => {
      validRefs();
      manifests.findOne.mockResolvedValue({ id: '10', status: ManifestStatus.CLOSED, origin_hub_id: '9', dest_hub_id: '2' });
      await expect(service.create(validCreate(), dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('arrival_time ≤ departure_time → BadRequestException', async () => {
      validRefs();
      const departure = future();
      await expect(service.create({ ...validCreate(), departure_time: departure, arrival_time: departure }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('filter theo keyword, status, truck_id, hub, date range', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[{ id: '1' }], 1]);
      trips.createQueryBuilder.mockReturnValue(qb);
      const result = await service.findAll({ keyword: 'MF', status: TripStatus.PLANNED, truck_id: 5, start_hub_id: 1, end_hub_id: 2, departure_from: new Date(), departure_to: new Date(), page: 1, limit: 10 }, manager);
      expect(result.total).toBe(1);
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('user có hub_id chỉ thấy trip thuộc hub mình', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      trips.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({}, dispatcher);
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('MANAGER thấy tất cả trip', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      trips.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({}, manager);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('getAllocationBoard', () => {
    it('does not force the user hub as destination when end_hub_id is omitted and returns manifest_id', async () => {
      const qb = new MockQb();
      qb.getMany.mockResolvedValue([{
        id: 't1',
        manifest_id: 'm1',
        truck_id: 'truck-1',
        start_hub_id: '1',
        end_hub_id: '2',
        status: TripStatus.PLANNED,
        departure_time: new Date('2026-07-21T01:00:00Z'),
        expected_arrival_time: new Date('2026-07-21T12:00:00Z'),
        truck: { id: 'truck-1', license_plate: '29A-12345' },
        manifest: { id: 'm1', manifest_code: 'BK-HCM' },
        start_hub: { id: '1', code: 'HAN' },
        end_hub: { id: '2', code: 'HCM' },
      }]);
      trips.createQueryBuilder.mockReturnValue(qb);
      manifestWaybills.find.mockResolvedValue([]);

      const result = await service.getAllocationBoard({}, dispatcher);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'trip.end_hub_id = :endHubId',
        expect.anything(),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Object));
      expect(result.trips).toEqual([
        expect.objectContaining({
          trip_id: 't1',
          manifest_id: 'm1',
          manifest_code: 'BK-HCM',
        }),
      ]);
    });
  });

  const mockFindOne = (trip: any) => jest.spyOn(service, 'findOne').mockResolvedValue(trip);

  describe('startTrip', () => {
    it('chuyển trip PLANNED → IN_TRANSIT', async () => {
      mockFindOne({ id: '1', status: TripStatus.PLANNED, manifest_id: '10', truck_id: null, departure_time: future() });
      manifests.findOne.mockResolvedValue({ id: '10' });
      manifestWaybills.find.mockResolvedValue([]);
      const result = await service.startTrip('1', dispatcher);
      expect(result.status).toBe(TripStatus.IN_TRANSIT);
    });

    it('chuyển manifest → IN_TRANSIT', async () => {
      mockFindOne({ id: '1', status: TripStatus.PLANNED, manifest_id: '10', truck_id: null, departure_time: future() });
      manifests.findOne.mockResolvedValue({ id: '10', status: ManifestStatus.ASSIGNED_TO_TRIP });
      manifestWaybills.find.mockResolvedValue([]);
      await service.startTrip('1', dispatcher);
      expect(manifests.save).toHaveBeenCalledWith(expect.objectContaining({ status: ManifestStatus.IN_TRANSIT }));
    });

    it('chuyển toàn bộ waybill MANIFEST_CLOSED → IN_TRANSIT', async () => {
      mockFindOne({ id: '1', status: TripStatus.PLANNED, manifest_id: '10', truck_id: null, departure_time: future() });
      manifests.findOne.mockResolvedValue({ id: '10' });
      manifestWaybills.find.mockResolvedValue([{ waybill: { id: 'w1', current_state: WaybillState.MANIFEST_CLOSED } }]);
      await service.startTrip('1', dispatcher);
      expect(waybills.save).toHaveBeenCalledWith([expect.objectContaining({ current_state: WaybillState.IN_TRANSIT })]);
    });

    it('trip không phải PLANNED → BadRequestException', async () => {
      mockFindOne({ status: TripStatus.ARRIVED, manifest_id: '10' });
      await expect(service.startTrip('1', dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('chuyến không có manifest vẫn có thể khởi hành', async () => {
      mockFindOne({ status: TripStatus.PLANNED, manifest_id: null });
      await expect(service.startTrip('1', dispatcher))
        .resolves.toMatchObject({ status: TripStatus.IN_TRANSIT, manifest_id: null });
      expect(manifestWaybills.find).not.toHaveBeenCalled();
    });
  });

  describe('arriveTrip', () => {
    it('chuyển trip IN_TRANSIT → ARRIVED', async () => {
      mockFindOne({ status: TripStatus.IN_TRANSIT, manifest_id: '10' });
      manifestWaybills.find.mockResolvedValue([]);
      const result = await service.arriveTrip('1', {}, dispatcher);
      expect(result.status).toBe(TripStatus.ARRIVED);
    });

    it('chuyển toàn bộ waybill IN_TRANSIT → AT_DEST_HUB', async () => {
      mockFindOne({ status: TripStatus.IN_TRANSIT, manifest_id: '10' });
      manifestWaybills.find.mockResolvedValue([{ waybill: { current_state: WaybillState.IN_TRANSIT } }]);
      await service.arriveTrip('1', {}, dispatcher);
      expect(waybills.save).toHaveBeenCalledWith([expect.objectContaining({ current_state: WaybillState.AT_DEST_HUB })]);
    });

    it('trip không phải IN_TRANSIT → BadRequestException', async () => {
      mockFindOne({ status: TripStatus.PLANNED });
      await expect(service.arriveTrip('1', {}, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('completeTrip', () => {
    it('chuyển trip ARRIVED → COMPLETED', async () => {
      mockFindOne({ id: '1', status: TripStatus.ARRIVED, manifest_id: '10', truck_id: null });
      manifests.findOne.mockResolvedValue({ id: '10' });
      const result = await service.completeTrip('1', dispatcher);
      expect(result.status).toBe(TripStatus.COMPLETED);
    });

    it('truck về AVAILABLE nếu không còn trip active', async () => {
      mockFindOne({ id: '1', status: TripStatus.ARRIVED, manifest_id: '10', truck_id: '5' });
      manifests.findOne.mockResolvedValue({ id: '10' });
      trips.count.mockResolvedValue(0);
      trucks.findOne.mockResolvedValue({ id: '5', status: TruckStatus.IN_TRIP });
      await service.completeTrip('1', dispatcher);
      expect(trucks.save).toHaveBeenCalledWith(expect.objectContaining({ status: TruckStatus.AVAILABLE }));
    });

    it('trip không phải ARRIVED → BadRequestException', async () => {
      mockFindOne({ status: TripStatus.IN_TRANSIT });
      await expect(service.completeTrip('1', dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateCosts', () => {
    it('cập nhật fuel_actual, fuel_cost, other_costs thành công', async () => {
      mockFindOne({ id: '1', fuel_actual: null, fuel_cost: null, other_costs: null });
      const result = await service.updateCosts('1', { fuel_actual: 1, fuel_cost: 2, other_costs: 3 }, dispatcher);
      expect(result).toMatchObject({ fuel_actual: 1, fuel_cost: '2', other_costs: '3' });
    });

    it('giá trị âm → BadRequestException', async () => {
      await expect(service.updateCosts('1', { fuel_cost: -1 }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getTripProfit', () => {
    it('MANAGER tính được lãi/lỗ', async () => {
      mockFindOne({ manifest_id: '10', fuel_cost: '10', other_costs: '5' });
      manifestWaybills.find.mockResolvedValue([{ waybill: { cost_amount: '100' } }, { waybill: { cost_amount: '50' } }]);
      await expect(service.getTripProfit('1', manager)).resolves.toEqual({ revenue: 150, total_cost: 15, profit: 135, waybill_count: 2 });
    });

    it('DRIVER gọi → ForbiddenException', async () => {
      await expect(service.getTripProfit('1', driver)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
