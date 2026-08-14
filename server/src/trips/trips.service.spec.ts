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
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('TripsService', () => {
  let service: TripsService;
  let trips: any;
  let trucks: any;
  let manifests: any;
  let manifestWaybills: any;
  let waybills: any;
  let waybillSplits: any;
  let hubs: any;
  let vendorsService: any;
  let waybillsService: any;

  beforeEach(async () => {
    vendorsService = {
      addPayableDebt: jest.fn(),
      findPaymentsByTripIds: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      refreshPayableBalance: jest.fn(),
    };
    waybillsService = {
      backfillInTransitTripsForHub: jest.fn().mockResolvedValue(0),
      reconcileTransportStatesForTrips: jest.fn().mockResolvedValue(0),
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
    waybillSplits = module.get(getRepositoryToken(WaybillSplitEntity));
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
    it('returns one ordered route with the expected arrival time of every HUB stop', async () => {
      const qb = new MockQb();
      const trip = { id: '41', start_hub_id: '1', start_hub: { id: '1', code: 'HAN' } };
      qb.getManyAndCount.mockResolvedValue([[trip], 1]);
      trips.createQueryBuilder.mockReturnValue(qb);
      waybillSplits.find.mockResolvedValue([
        { trip_id: '41', expected_arrival_at: new Date('2026-08-10T12:00:00Z'), waybill: { dest_hub_id: '3', dest_hub: { id: '3', code: 'HCM', name: 'Hồ Chí Minh' } } },
        { trip_id: '41', expected_arrival_at: new Date('2026-08-09T12:00:00Z'), waybill: { dest_hub_id: '2', dest_hub: { id: '2', code: 'KHANHHOA', name: 'Khánh Hòa' } } },
      ]);

      const result = await service.findAll({ status: TripStatus.PLANNED }, manager);

      expect(result.data[0].route_label).toBe('HAN → KHANHHOA → HCM');
      expect(result.data[0].route_stops).toEqual([
        expect.objectContaining({ hub_id: '2', hub_code: 'KHANHHOA', expected_arrival_at: new Date('2026-08-09T12:00:00Z') }),
        expect.objectContaining({ hub_id: '3', hub_code: 'HCM', expected_arrival_at: new Date('2026-08-10T12:00:00Z') }),
      ]);
    });

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

  describe('getExpectedArrivals', () => {
    it('only queries in-transit trips whose destination is the selected hub', async () => {
      const qb = new MockQb();
      qb.getMany.mockResolvedValue([
        { id: 'transit', status: TripStatus.IN_TRANSIT, manifest_id: null, departure_time: new Date('2026-07-20T03:00:00Z') },
      ]);
      trips.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getExpectedArrivals({ end_hub_id: 2 }, manager);

      expect(qb.where).toHaveBeenCalledWith('trip.status = :status', { status: TripStatus.IN_TRANSIT });
      expect(qb.andWhere).toHaveBeenCalledWith('trip.end_hub_id = :endHubId', { endHubId: '2' });
      expect(result.data.map((trip) => trip.id)).toEqual(['transit']);
      expect(result.total).toBe(1);
    });

    it('uses the assigned hub for branch staff even when another hub is requested', async () => {
      const qb = new MockQb();
      qb.getMany.mockResolvedValue([]);
      trips.createQueryBuilder.mockReturnValue(qb);

      await service.getExpectedArrivals({ end_hub_id: 2 }, dispatcher);

      expect(waybillsService.backfillInTransitTripsForHub).toHaveBeenCalledWith('1');
      expect(qb.andWhere).toHaveBeenCalledWith('trip.end_hub_id = :endHubId', { endHubId: '1' });
    });
  });

  describe('getIncomingOverview', () => {
    it('returns all trip statuses for the all-trips screen', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[
        { id: 'planned', status: TripStatus.PLANNED, manifest_id: null },
        { id: 'arrived', status: TripStatus.ARRIVED, manifest_id: null },
      ], 2]);
      trips.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getIncomingOverview({ page: 1, limit: 100 }, manager);

      expect(qb.where).not.toHaveBeenCalledWith('trip.status = :status', expect.anything());
      expect(result.data.map((trip) => trip.id)).toEqual(['planned', 'arrived']);
      expect(result.total).toBe(2);
    });

    it('scopes branch staff to trips related to their assigned hub', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      trips.createQueryBuilder.mockReturnValue(qb);

      await service.getIncomingOverview({}, dispatcher);

      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  const mockFindOne = (trip: any) => jest.spyOn(service, 'findOne').mockResolvedValue(trip);

  describe('update', () => {
    it.each([TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED])(
      'cho phép sửa ngày quá khứ khi chuyến ở trạng thái %s',
      async (status) => {
        const departure = new Date('2025-08-07T01:00:00Z');
        const arrival = new Date('2025-08-08T01:00:00Z');
        mockFindOne({
          id: '1',
          status,
          departure_time: new Date('2026-08-06T01:00:00Z'),
          arrival_time: new Date('2026-08-06T12:00:00Z'),
        });

        const result = await service.update('1', { departure_time: departure, arrival_time: arrival }, manager);

        expect(result.departure_time).toEqual(departure);
        expect(result.arrival_time).toEqual(arrival);
        expect(result.expected_arrival_time).toEqual(arrival);
        expect(trips.save).toHaveBeenCalledWith(expect.objectContaining({ status }));
      },
    );

    it('cho đổi xe khi chuyến đang chạy và đồng bộ trạng thái xe cũ/mới', async () => {
      mockFindOne({ id: '1', status: TripStatus.IN_TRANSIT, truck_id: '5' });
      const newTruck = { id: '7', status: TruckStatus.AVAILABLE, ten_lai_xe: 'Tài xế mới', driver: { phone: '0909000000' } };
      const oldTruck = { id: '5', status: TruckStatus.IN_TRIP };
      trucks.findOne.mockResolvedValueOnce(newTruck).mockResolvedValueOnce(oldTruck);
      trips.count.mockResolvedValue(0);

      const result = await service.update('1', { truck_id: 7 }, manager);

      expect(result).toMatchObject({ truck_id: '7', driver_name: 'Tài xế mới', driver_phone: '0909000000' });
      expect(trucks.save).toHaveBeenCalledWith(expect.objectContaining({ id: '5', status: TruckStatus.AVAILABLE }));
      expect(trucks.save).toHaveBeenCalledWith(expect.objectContaining({ id: '7', status: TruckStatus.IN_TRIP }));
    });

    it('cho sửa BKS chuyến đã hoàn tất mà không làm thay đổi trạng thái xe hiện tại', async () => {
      mockFindOne({ id: '1', status: TripStatus.COMPLETED, truck_id: '5' });
      const historicalTruck = { id: '7', status: TruckStatus.IN_TRIP, ten_lai_xe: 'Tài xế lịch sử', driver: null };
      trucks.findOne.mockResolvedValue(historicalTruck);

      const result = await service.update('1', { truck_id: 7 }, manager);

      expect(result).toMatchObject({ truck_id: '7', driver_name: 'Tài xế lịch sử' });
      expect(trucks.save).not.toHaveBeenCalled();
    });

    it.each([TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED, TripStatus.CANCELLED])(
      'cập nhật NCC và cước xe ở trạng thái %s rồi làm mới công nợ hai NCC',
      async (status) => {
      const trip = {
        id: '1',
        status,
        truck_id: '5',
        vendor_id: '10',
        vendor: { id: '10' },
        trip_cost: '1000000',
        other_costs: '1000000',
        vendor_paid_amount: '0',
        departure_time: new Date('2026-08-12T01:00:00Z'),
        arrival_time: new Date('2026-08-13T01:00:00Z'),
      };
      mockFindOne(trip);
      vendorsService.findOne.mockResolvedValue({ id: '11', name: 'NCC mới' });

      const result = await service.update('1', { vendor_id: '11', trip_cost: 2500000 }, manager);

      expect(result).toMatchObject({ vendor_id: '11', trip_cost: '2500000', other_costs: null });
      expect(vendorsService.refreshPayableBalance).toHaveBeenCalledTimes(2);
      expect(vendorsService.refreshPayableBalance).toHaveBeenCalledWith('10');
      expect(vendorsService.refreshPayableBalance).toHaveBeenCalledWith('11');
      },
    );

    it.each([TripStatus.ARRIVED, TripStatus.COMPLETED, TripStatus.CANCELLED])(
      'cho sửa xe lịch sử ở trạng thái %s mà không thay đổi trạng thái hoạt động của xe',
      async (status) => {
        mockFindOne({ id: '1', status, truck_id: '5', vendor_paid_amount: '0' });
        const historicalTruck = { id: '7', status: TruckStatus.IN_TRIP, ten_lai_xe: 'Tài xế lịch sử', driver: null };
        trucks.findOne.mockResolvedValue(historicalTruck);

        const result = await service.update('1', { truck_id: 7 }, manager);

        expect(result).toMatchObject({ truck_id: '7', driver_name: 'Tài xế lịch sử' });
        expect(trucks.save).not.toHaveBeenCalled();
      },
    );

    it('cho lưu BKS thủ công hoặc bỏ trống mà không tác động xe trong danh mục', async () => {
      mockFindOne({
        id: '1',
        status: TripStatus.COMPLETED,
        truck_id: '5',
        manual_license_plate: null,
        vendor_paid_amount: '0',
      });

      const result = await service.update('1', { truck_id: null, manual_license_plate: '51h-123.45' }, manager);

      expect(result).toMatchObject({ truck_id: null, manual_license_plate: '51H-123.45' });
      expect(trucks.findOne).not.toHaveBeenCalled();
      expect(trucks.save).not.toHaveBeenCalled();
    });

    it('returns delivery processing totals for each trip manifest', async () => {
      const qb = new MockQb();
      const trip = { id: '42', manifest_id: '10', status: TripStatus.ARRIVED, start_hub_id: '1', start_hub: { id: '1', code: 'HAN' }, end_hub_id: '2', end_hub: { id: '2', code: 'HCM' } };
      qb.getManyAndCount.mockResolvedValue([[trip], 1]);
      trips.createQueryBuilder.mockReturnValue(qb);
      waybillSplits.find.mockResolvedValue([]);
      manifestWaybills.find.mockResolvedValue([
        { manifest_id: '10', waybill: { id: '100', current_state: WaybillState.DELIVERED, delivery_preparation_status: 'READY' } },
        { manifest_id: '10', waybill: { id: '101', current_state: WaybillState.AT_DEST_HUB, delivery_preparation_status: 'SCHEDULED' } },
        { manifest_id: '10', waybill: { id: '102', current_state: WaybillState.AT_DEST_HUB, delivery_preparation_status: 'PENDING_CONFIRMATION' } },
      ]);

      const result = await service.findAll({ status: TripStatus.ARRIVED }, manager);

      expect(result.data[0].delivery_summary).toEqual({
        total_waybills: 3,
        processed_waybills: 2,
        delivered_waybills: 1,
        pending_delivery_waybills: 2,
        completed_waybills: 1,
      });
    });

    it('cho cập nhật thông tin tài xế trực tiếp trên chuyến', async () => {
      mockFindOne({
        id: '1',
        status: TripStatus.IN_TRANSIT,
        driver_name: 'Tài xế cũ',
        driver_phone: '0901000000',
        vendor_paid_amount: '0',
      });

      const result = await service.update('1', {
        driver_name: '  Nguyễn Văn Mới  ',
        driver_phone: ' 0912345678 ',
      }, manager);

      expect(result).toMatchObject({
        driver_name: 'Nguyễn Văn Mới',
        driver_phone: '0912345678',
      });
    });

    it('cho để trống NCC và cước xe khi chưa phát sinh thanh toán', async () => {
      mockFindOne({
        id: '1',
        status: TripStatus.CANCELLED,
        vendor_id: '10',
        vendor: { id: '10' },
        trip_cost: '1000000',
        other_costs: null,
        vendor_paid_amount: '0',
      });

      const result = await service.update('1', { vendor_id: null, trip_cost: null }, manager);

      expect(result).toMatchObject({ vendor_id: null, vendor: null, trip_cost: null });
    });

    it('không cho đổi NCC khi chuyến đã phát sinh thanh toán', async () => {
      mockFindOne({
        id: '1',
        status: TripStatus.PLANNED,
        vendor_id: '10',
        vendor_paid_amount: '500000',
        departure_time: new Date('2026-08-12T01:00:00Z'),
        arrival_time: new Date('2026-08-13T01:00:00Z'),
      });
      vendorsService.findOne.mockResolvedValue({ id: '11', name: 'NCC mới' });

      await expect(service.update('1', { vendor_id: '11' }, manager)).rejects.toThrow('Không thể đổi NCC');
      expect(trips.save).not.toHaveBeenCalled();
    });

    it('lưu ngày dự kiến riêng cho tất cả HUB và lấy HUB cuối làm dự kiến đến của chuyến', async () => {
      const trip = {
        id: '44',
        status: TripStatus.PLANNED,
        end_hub_id: '3',
        departure_time: new Date('2026-08-05T09:48:00Z'),
        arrival_time: new Date('2026-08-08T09:48:00Z'),
      };
      const splitKhanhHoa = { id: 's1', waybill: { dest_hub_id: '2' }, expected_arrival_at: null };
      const splitHcm = { id: 's2', waybill: { dest_hub_id: '3' }, expected_arrival_at: null };
      mockFindOne(trip);
      waybillSplits.find.mockResolvedValue([splitKhanhHoa, splitHcm]);

      const result = await service.update('44', {
        route_stops: [
          { hub_id: '2', expected_arrival_at: new Date('2026-08-07T09:48:00Z') },
          { hub_id: '3', expected_arrival_at: new Date('2026-08-08T09:48:00Z') },
        ],
      }, manager);

      expect(splitKhanhHoa.expected_arrival_at).toEqual(new Date('2026-08-07T09:48:00Z'));
      expect(splitHcm.expected_arrival_at).toEqual(new Date('2026-08-08T09:48:00Z'));
      expect(waybillSplits.save).toHaveBeenCalledWith([splitKhanhHoa, splitHcm]);
      expect(result.expected_arrival_time).toEqual(new Date('2026-08-08T09:48:00Z'));
      expect(result.arrival_time).toEqual(new Date('2026-08-08T09:48:00Z'));
    });

    it('không cho sửa lịch chạy của chuyến đã hủy', async () => {
      mockFindOne({ id: '1', status: 'CANCELLED', departure_time: new Date() });

      await expect(
        service.update('1', { departure_time: new Date('2025-08-07T01:00:00Z') }, manager),
      ).rejects.toThrow('Chuyến đã hủy chỉ được sửa BKS, NCC, tài xế và cước xe');
      expect(trips.save).not.toHaveBeenCalled();
    });
  });

  describe('startTrip', () => {
    it('chuyển trip PLANNED → IN_TRANSIT', async () => {
      mockFindOne({ id: '1', status: TripStatus.PLANNED, manifest_id: '10', truck_id: null, departure_time: future() });
      manifests.findOne.mockResolvedValue({ id: '10' });
      manifestWaybills.find.mockResolvedValue([]);
      const result = await service.startTrip('1', dispatcher);
      expect(result.status).toBe(TripStatus.IN_TRANSIT);
      expect(waybillsService.reconcileTransportStatesForTrips).toHaveBeenCalledWith(['1']);
    });

    it('chuyển manifest → IN_TRANSIT', async () => {
      mockFindOne({ id: '1', status: TripStatus.PLANNED, manifest_id: '10', truck_id: null, departure_time: future() });
      manifests.findOne.mockResolvedValue({ id: '10', status: ManifestStatus.ASSIGNED_TO_TRIP });
      manifestWaybills.find.mockResolvedValue([]);
      await service.startTrip('1', dispatcher);
      expect(manifests.save).toHaveBeenCalledWith(expect.objectContaining({ status: ManifestStatus.IN_TRANSIT }));
    });

    it('giữ thông tin tài xế đã sửa tay khi khởi hành', async () => {
      mockFindOne({
        id: '1',
        status: TripStatus.PLANNED,
        manifest_id: null,
        truck_id: '5',
        driver_name: 'Tài xế chuyến',
        driver_phone: '0901234567',
      });
      trucks.findOne.mockResolvedValue({
        id: '5',
        ten_lai_xe: 'Tài xế mặc định',
        driver: { full_name: 'Tài xế xe', phone: '0987654321' },
      });

      const result = await service.startTrip('1', dispatcher);

      expect(result).toMatchObject({
        driver_name: 'Tài xế chuyến',
        driver_phone: '0901234567',
      });
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
      mockFindOne({ id: '1', status: TripStatus.IN_TRANSIT, manifest_id: '10' });
      manifestWaybills.find.mockResolvedValue([]);
      const result = await service.arriveTrip('1', {}, dispatcher);
      expect(result.status).toBe(TripStatus.ARRIVED);
      expect(waybillsService.reconcileTransportStatesForTrips).toHaveBeenCalledWith(['1']);
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

  describe('cancelTrip', () => {
    it('hủy chuyến chờ khởi hành và trả toàn bộ kiện về tồn kho', async () => {
      mockFindOne({
        id: '44',
        status: TripStatus.PLANNED,
        manifest_id: '10',
        truck_id: '5',
        start_hub_id: '1',
      });
      const waybill = {
        id: '100',
        package_count: 3,
        current_state: WaybillState.MANIFEST_CLOSED,
        current_hub_id: null,
        loaded_at: new Date(),
        origin_hub_id: '1',
        order: null,
      };
      manifests.findOne.mockResolvedValue({ id: '10', status: ManifestStatus.ASSIGNED_TO_TRIP });
      manifestWaybills.find.mockResolvedValue([{ manifest_id: '10', waybill_id: '100', waybill }]);
      waybillSplits.find
        .mockResolvedValueOnce([{ trip_id: '44', waybill_id: '100', package_count: 3, waybill }])
        .mockResolvedValueOnce([]);
      trips.count.mockResolvedValue(0);
      trucks.findOne.mockResolvedValue({ id: '5', status: TruckStatus.ASSIGNED });

      const result = await service.cancelTrip('44', dispatcher);

      expect(result.status).toBe(TripStatus.CANCELLED);
      expect(waybillSplits.delete).toHaveBeenCalledWith({ trip_id: '44' });
      expect(manifestWaybills.delete).toHaveBeenCalledWith({ manifest_id: '10' });
      expect(waybills.save).toHaveBeenCalledWith([
        expect.objectContaining({
          current_state: WaybillState.IN_WAREHOUSE,
          current_hub_id: '1',
          loaded_at: null,
          last_audit_action: 'TRIP_CANCEL_RELEASE_TO_INVENTORY',
        }),
      ]);
      expect(manifests.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ManifestStatus.CANCELLED }),
      );
      expect(trucks.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TruckStatus.AVAILABLE }),
      );
    });

    it('không cho hủy chuyến đã khởi hành', async () => {
      mockFindOne({ id: '44', status: TripStatus.IN_TRANSIT });

      await expect(service.cancelTrip('44', dispatcher)).rejects.toThrow(
        'Chỉ được hủy chuyến đang chờ khởi hành',
      );
      expect(waybillSplits.delete).not.toHaveBeenCalled();
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

    it('tính cước NCC từ trip_cost đúng một lần cho chuyến vừa xếp hàng', async () => {
      mockFindOne({ manifest_id: '10', fuel_cost: '10', trip_cost: '100', other_costs: null });
      manifestWaybills.find.mockResolvedValue([{ waybill: { cost_amount: '200' } }]);

      await expect(service.getTripProfit('1', manager)).resolves.toEqual({
        revenue: 200,
        total_cost: 110,
        profit: 90,
        waybill_count: 1,
      });
    });

    it('không tính đôi cước NCC cũ từng lưu ở cả trip_cost và other_costs', async () => {
      mockFindOne({ manifest_id: '10', fuel_cost: '10', trip_cost: '100', other_costs: '100' });
      manifestWaybills.find.mockResolvedValue([{ waybill: { cost_amount: '200' } }]);

      await expect(service.getTripProfit('1', manager)).resolves.toEqual({
        revenue: 200,
        total_cost: 110,
        profit: 90,
        waybill_count: 1,
      });
    });

    it('DRIVER gọi → ForbiddenException', async () => {
      await expect(service.getTripProfit('1', driver)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
