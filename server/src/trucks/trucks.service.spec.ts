import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Roles } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { VendorsService } from '../vendors/vendors.service';
import { TruckStatus } from './dto/truck.enums';
import { TruckEntity } from './truck.entity';
import { TrucksService } from './trucks.service';

const makeRepo = () => ({
  create: jest.fn((value) => ({ ...value })),
  save: jest.fn(async (value) => value),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: undefined as any,
});

const manager = { id: 'm1', role_mask: Roles.MANAGER } as any;
const director = { id: 'd1', role_mask: Roles.DIRECTOR } as any;
const truck = (overrides: Record<string, any> = {}) => ({ id: '10', license_plate: '29H-12345', payload: 2500, driver_id: null, fuel_consumption_limit: 12, status: TruckStatus.AVAILABLE, ownership_type: 'VENDOR', vendor_id: 'vendor-1', ...overrides });


describe('TrucksService canonical schema', () => {
  let service: TrucksService;
  let trucksRepo: ReturnType<typeof makeRepo>;
  let usersRepo: ReturnType<typeof makeRepo>;
  let tripsRepo: ReturnType<typeof makeRepo>;
  let hubsRepo: ReturnType<typeof makeRepo>;
  let vendorsService: { resolveDefaultVendorId: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    trucksRepo = makeRepo();
    usersRepo = makeRepo();
    tripsRepo = makeRepo();
    hubsRepo = makeRepo();
    trucksRepo.manager = {
      transaction: jest.fn(async (callback) => callback({
        getRepository: (entity: unknown) => entity === TruckEntity ? trucksRepo : tripsRepo,
      })),
    };
    vendorsService = {
      resolveDefaultVendorId: jest.fn().mockResolvedValue('vendor-1'),
      findOne: jest.fn().mockResolvedValue({ id: 'vendor-1', code: 'NCC1', name: 'NCC 1' }),
    };
    usersRepo.findOne.mockResolvedValue({ id: '7', role_mask: Roles.DRIVER });
    tripsRepo.count.mockResolvedValue(0);
    hubsRepo.findOne.mockResolvedValue({ id: 'hub-1', code: 'HAN', is_active: true, deleted_at: null });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: getRepositoryToken(TruckEntity), useValue: trucksRepo },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepo },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepo },
        { provide: VendorsService, useValue: vendorsService },
      ],
    }).compile();

    service = moduleRef.get(TrucksService);
  });

  it('create lưu đúng 6 field schema TRUCKS', async () => {
    mockUniquePlate(null);
    const result = await service.create({ license_plate: ' 29h-12345 ', payload: 2500, driver_id: '7', fuel_consumption_limit: 11, status: TruckStatus.AVAILABLE, vendor_id: 'vendor-1' }, manager);
    expect(result).toMatchObject({ license_plate: '29H-12345', payload: 2500, driver_id: null, fuel_consumption_limit: 11, status: TruckStatus.AVAILABLE });
    expect(result).not.toHaveProperty('plate_number');
    expect(result).not.toHaveProperty('capacity_kg');
  });

  it('dispatcher được thêm BKS mới gắn với NCC để điều phối chuyến', async () => {
    mockUniquePlate(null);
    const dispatcher = { id: 'dp1', role_mask: Roles.DISPATCHER } as any;

    const result = await service.create({
      license_plate: '98H-052.18',
      bks: '98H-052.18',
      payload: 1,
      vendor_id: 'vendor-1',
      nha_xe: 'XE Chiến Hưng Yên',
    }, dispatcher);

    expect(result).toMatchObject({
      license_plate: '98H-052.18',
      bks: '98H-052.18',
      vendor_id: 'vendor-1',
    });
  });

  it('xe nội bộ thuộc HAN không lưu NCC hoặc tài xế cố định', async () => {
    mockUniquePlate(null);

    const result = await service.create({
      license_plate: '29H-88888',
      payload: 2500,
      ownership_type: 'INTERNAL',
      hub_id: 'hub-1',
      driver_id: '7',
      vendor_id: 'vendor-1',
      ten_lai_xe: 'Tài xế cũ',
      nha_xe: 'NCC cũ',
    }, manager);

    expect(result).toMatchObject({
      ownership_type: 'INTERNAL',
      hub_id: 'hub-1',
      driver_id: null,
      vendor_id: null,
      ten_lai_xe: null,
      nha_xe: null,
    });
    expect(vendorsService.resolveDefaultVendorId).not.toHaveBeenCalled();
  });

  it('xe nội bộ lưu tối đa 10 ảnh giấy tờ và loại URL trùng', async () => {
    mockUniquePlate(null);
    const urls = Array.from({ length: 11 }, (_, index) => `https://example.com/vehicle-${index}.jpg`);
    const result = await service.create({
      license_plate: '29H-88889',
      payload: 2500,
      ownership_type: 'INTERNAL',
      hub_id: 'hub-1',
      document_image_urls: [urls[0], urls[0], ...urls.slice(1)],
    }, manager);

    expect(result.document_image_urls).toHaveLength(10);
    expect(new Set(result.document_image_urls).size).toBe(10);
  });

  it('BKS đối tác không lưu ảnh giấy tờ xe nội bộ', async () => {
    mockUniquePlate(null);
    const result = await service.create({
      license_plate: '29H-88890',
      payload: 2500,
      ownership_type: 'VENDOR',
      vendor_id: 'vendor-1',
      document_image_urls: ['https://example.com/vehicle.jpg'],
    }, manager);

    expect(result.document_image_urls).toEqual([]);
  });

  it('xe nội bộ không được gán ngoài HAN và HCM', async () => {
    mockUniquePlate(null);
    hubsRepo.findOne.mockResolvedValue({ id: 'hub-3', code: 'DNG', is_active: true, deleted_at: null });

    await expect(service.create({
      license_plate: '43C-12345',
      payload: 2500,
      ownership_type: 'INTERNAL',
      hub_id: 'hub-3',
    }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BKS đối tác bắt buộc gắn NCC', async () => {
    mockUniquePlate(null);

    await expect(service.create({
      license_plate: '29H-99999',
      payload: 2500,
      ownership_type: 'VENDOR',
    }, manager)).rejects.toThrow('BKS đối tác phải được gán nhà cung cấp (NCC)');
  });

  it('create trùng license_plate bị chặn', async () => {
    mockUniquePlate(truck());
    await expect(service.create({ license_plate: '29H-12345', payload: 2500 }, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('BKS đối tác không lưu tài xế cố định vì tài xế nhập theo chuyến', async () => {
    mockUniquePlate(null);
    usersRepo.findOne.mockResolvedValue(null);
    const result = await service.create({ license_plate: '29H-12345', payload: 2500, driver_id: '7', ten_lai_xe: 'Tài xế tạm', vendor_id: 'vendor-1' }, manager);
    expect(result).toMatchObject({ driver_id: null, ten_lai_xe: null });
    expect(usersRepo.findOne).not.toHaveBeenCalled();
  });

  it('findAll lọc trực tiếp theo NCC để danh sách chọn BKS không bị mất do phân trang', async () => {
    const qb = mockQb();
    trucksRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[truck()], 1]);
    await service.findAll({ keyword: '29H', status: TruckStatus.AVAILABLE, driver_id: '7', vendor_id: 'vendor-1', page: 1, limit: 10 }, manager);
    const whereSql = qb.andWhere.mock.calls.map((call: any[]) => String(call[0])).join(' ');
    expect(qb.andWhere).toHaveBeenCalledTimes(4);
    expect(whereSql).toContain('truck.status');
    expect(whereSql).toContain('truck.driver_id');
    expect(qb.andWhere).toHaveBeenCalledWith('truck.vendor_id = :vendorId', { vendorId: 'vendor-1' });
    expect(whereSql).not.toContain('truck_type');
    expect(whereSql).not.toContain('hub_id');
  });

  it('tìm được xe cũ bị ẩn do chưa phân loại hoặc chưa gán HUB', async () => {
    const qb = mockQb();
    trucksRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[truck({ ownership_type: 'INTERNAL', hub_id: null })], 1]);

    const result = await service.findLegacy({ keyword: '29H-12345', page: 1, limit: 20 }, manager);

    expect(result.meta.total).toBe(1);
    expect(qb.andWhere).toHaveBeenCalledTimes(2);
  });

  it('update chuẩn hóa license_plate và cập nhật schema fields', async () => {
    mockUniquePlate(null);
    trucksRepo.findOne.mockResolvedValue(truck());
    const result = await service.update('10', { license_plate: ' hcm-999 ', payload: 3000, fuel_consumption_limit: 13, status: TruckStatus.IN_USE }, manager);
    expect(result).toMatchObject({ license_plate: 'HCM-999', payload: 3000, fuel_consumption_limit: 13, status: TruckStatus.IN_USE });
  });

  it('update thay danh sách ảnh giấy tờ của xe nội bộ', async () => {
    mockUniquePlate(null);
    trucksRepo.findOne.mockResolvedValue(truck({ ownership_type: 'INTERNAL', hub_id: 'hub-1', document_image_urls: [] }));
    const result = await service.update('10', { document_image_urls: ['https://example.com/registration.jpg'] }, manager);
    expect(result.document_image_urls).toEqual(['https://example.com/registration.jpg']);
  });

  it('khôi phục xe cũ và giữ thông tin NCC, tài xế trong chuyến lịch sử', async () => {
    const legacyTruck = truck({
      ownership_type: 'VENDOR',
      hub_id: null,
      vendor_id: 'vendor-1',
      ten_lai_xe: 'Tài xế cũ',
      driver: { phone: '0901000000' },
      bks: '29H-12345',
    });
    const historicalTrip = { id: 'trip-1', truck_id: '10', vendor_id: null, driver_name: null, driver_phone: null };
    trucksRepo.findOne.mockResolvedValue(legacyTruck);
    tripsRepo.find.mockResolvedValue([historicalTrip]);

    const result = await service.restoreInternal('10', { hub_id: 'hub-1' }, manager);

    expect(tripsRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ vendor_id: 'vendor-1', driver_name: 'Tài xế cũ', driver_phone: '0901000000' }),
    ]);
    expect(result).toMatchObject({
      ownership_type: 'INTERNAL',
      hub_id: 'hub-1',
      vendor_id: null,
      driver_id: null,
      ten_lai_xe: null,
    });
  });

  it('không khôi phục xe cũ đang có chuyến hoạt động', async () => {
    trucksRepo.findOne.mockResolvedValue(truck({ ownership_type: 'VENDOR' }));
    tripsRepo.count.mockResolvedValue(1);

    await expect(service.restoreInternal('10', { hub_id: 'hub-1' }, manager)).rejects.toBeInstanceOf(BadRequestException);
    expect(trucksRepo.save).not.toHaveBeenCalled();
  });

  it('không cho gọi API khôi phục với xe nội bộ đang hoạt động bình thường', async () => {
    trucksRepo.findOne.mockResolvedValue(truck({
      ownership_type: 'INTERNAL',
      hub_id: 'hub-1',
      hub: { id: 'hub-1', code: 'HAN' },
    }));

    await expect(service.restoreInternal('10', { hub_id: 'hub-1' }, manager)).rejects.toBeInstanceOf(BadRequestException);
    expect(trucksRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it('updateStatus sang INACTIVE khi xe đang có trip active bị chặn', async () => {
    trucksRepo.findOne.mockResolvedValue(truck());
    tripsRepo.count.mockResolvedValue(1);
    await expect(service.updateStatus('10', { status: TruckStatus.INACTIVE }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delete truck có trip active bị chặn', async () => {
    trucksRepo.findOne.mockResolvedValue(truck());
    tripsRepo.count.mockResolvedValue(1);
    await expect(service.softDelete('10', director)).rejects.toBeInstanceOf(BadRequestException);
  });

  function mockUniquePlate(existing: any) {
    const qb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(existing) };
    trucksRepo.createQueryBuilder.mockReturnValue(qb);
  }
});

function mockQb() {
  return { leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn() } as any;
}
