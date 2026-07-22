import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Roles } from '../common/roles';
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
  count: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const manager = { id: 'm1', role_mask: Roles.MANAGER } as any;
const director = { id: 'd1', role_mask: Roles.DIRECTOR } as any;
const truck = (overrides: Record<string, any> = {}) => ({ id: '10', license_plate: '29H-12345', payload: 2500, driver_id: null, fuel_consumption_limit: 12, status: TruckStatus.AVAILABLE, ...overrides });

describe('TrucksService canonical schema', () => {
  let service: TrucksService;
  let trucksRepo: ReturnType<typeof makeRepo>;
  let usersRepo: ReturnType<typeof makeRepo>;
  let tripsRepo: ReturnType<typeof makeRepo>;
  let vendorsService: { resolveDefaultVendorId: jest.Mock };

  beforeEach(async () => {
    trucksRepo = makeRepo();
    usersRepo = makeRepo();
    tripsRepo = makeRepo();
    vendorsService = { resolveDefaultVendorId: jest.fn().mockResolvedValue('vendor-1') };
    usersRepo.findOne.mockResolvedValue({ id: '7', role_mask: Roles.DRIVER });
    tripsRepo.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: getRepositoryToken(TruckEntity), useValue: trucksRepo },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepo },
        { provide: VendorsService, useValue: vendorsService },
      ],
    }).compile();

    service = moduleRef.get(TrucksService);
  });

  it('create lưu đúng 6 field schema TRUCKS', async () => {
    mockUniquePlate(null);
    const result = await service.create({ license_plate: ' 29h-12345 ', payload: 2500, driver_id: '7', fuel_consumption_limit: 11, status: TruckStatus.AVAILABLE }, manager);
    expect(result).toMatchObject({ license_plate: '29H-12345', payload: 2500, driver_id: '7', fuel_consumption_limit: 11, status: TruckStatus.AVAILABLE });
    expect(result).not.toHaveProperty('plate_number');
    expect(result).not.toHaveProperty('capacity_kg');
  });

  it('create trùng license_plate bị chặn', async () => {
    mockUniquePlate(truck());
    await expect(service.create({ license_plate: '29H-12345', payload: 2500 }, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('create với driver không tồn tại bị chặn', async () => {
    mockUniquePlate(null);
    usersRepo.findOne.mockResolvedValue(null);
    await expect(service.create({ license_plate: '29H-12345', payload: 2500, driver_id: '7' }, manager)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create với user không có DRIVER role bị chặn', async () => {
    mockUniquePlate(null);
    usersRepo.findOne.mockResolvedValue({ id: '7', role_mask: Roles.WAREHOUSE });
    await expect(service.create({ license_plate: '29H-12345', payload: 2500, driver_id: '7' }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAll chỉ filter theo license_plate/status/driver_id', async () => {
    const qb = mockQb();
    trucksRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[truck()], 1]);
    await service.findAll({ keyword: '29H', status: TruckStatus.AVAILABLE, driver_id: '7', page: 1, limit: 10 }, manager);
    const whereSql = qb.andWhere.mock.calls.map((call: any[]) => String(call[0])).join(' ');
    expect(qb.andWhere).toHaveBeenCalledTimes(3);
    expect(whereSql).toContain('truck.status');
    expect(whereSql).toContain('truck.driver_id');
    expect(whereSql).not.toContain('truck_type');
    expect(whereSql).not.toContain('hub_id');
  });

  it('update chuẩn hóa license_plate và cập nhật schema fields', async () => {
    mockUniquePlate(null);
    trucksRepo.findOne.mockResolvedValue(truck());
    const result = await service.update('10', { license_plate: ' hcm-999 ', payload: 3000, fuel_consumption_limit: 13, status: TruckStatus.IN_USE }, manager);
    expect(result).toMatchObject({ license_plate: 'HCM-999', payload: 3000, fuel_consumption_limit: 13, status: TruckStatus.IN_USE });
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
