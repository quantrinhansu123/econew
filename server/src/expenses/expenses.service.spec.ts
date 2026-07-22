import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { ExpenseEntity } from './expense.entity';
import { ExpensesService } from './expenses.service';

const accountant = { id: '1', role_mask: Roles.ACCOUNTANT, hub_id: null } as any;
const manager = { id: '2', role_mask: Roles.MANAGER, hub_id: null } as any;
const dispatcher = { id: '3', role_mask: Roles.DISPATCHER, hub_id: '10' } as any;
const driver = { id: '4', role_mask: Roles.DRIVER, hub_id: '10' } as any;

class MockQb {
  where = jest.fn().mockReturnThis();
  andWhere = jest.fn().mockReturnThis();
  leftJoinAndSelect = jest.fn().mockReturnThis();
  orderBy = jest.fn().mockReturnThis();
  skip = jest.fn().mockReturnThis();
  take = jest.fn().mockReturnThis();
  getOne = jest.fn();
  getMany = jest.fn();
  getManyAndCount = jest.fn();
}

const repo = () => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  remove: jest.fn(async (value) => value),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('ExpensesService', () => {
  let service: ExpensesService;
  let expenses: any;
  let trips: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(ExpenseEntity), useFactory: repo },
        { provide: getRepositoryToken(TripEntity), useFactory: repo },
      ],
    }).compile();

    service = module.get(ExpensesService);
    expenses = module.get(getRepositoryToken(ExpenseEntity));
    trips = module.get(getRepositoryToken(TripEntity));
  });

  describe('create', () => {
    it('tạo expense thành công với trip IN_TRANSIT', async () => {
      trips.findOne.mockResolvedValue({ id: '1', status: TripStatus.IN_TRANSIT });
      await expect(service.create({ trip_id: 1 }, accountant)).resolves.toMatchObject({ trip_id: '1' });
    });

    it('tạo expense thành công với trip ARRIVED', async () => {
      trips.findOne.mockResolvedValue({ id: '1', status: TripStatus.ARRIVED });
      await expect(service.create({ trip_id: 1 }, accountant)).resolves.toMatchObject({ trip_id: '1' });
    });

    it('tạo expense thành công với trip COMPLETED', async () => {
      trips.findOne.mockResolvedValue({ id: '1', status: TripStatus.COMPLETED });
      await expect(service.create({ trip_id: 1 }, accountant)).resolves.toMatchObject({ trip_id: '1' });
    });

    it('trip không tồn tại → NotFoundException', async () => {
      trips.findOne.mockResolvedValue(null);
      await expect(service.create({ trip_id: 1 }, accountant)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tạo expense thành công khi trip đã được lên kế hoạch', async () => {
      trips.findOne.mockResolvedValue({ id: '1', status: TripStatus.PLANNED });
      await expect(service.create({ trip_id: 1 }, accountant)).resolves.toMatchObject({ trip_id: '1' });
    });

    it('DRIVER tạo expense → ForbiddenException', async () => {
      await expect(service.create({ trip_id: 1 }, driver)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('filter theo trip_id', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[{ id: '1' }], 1]);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({ trip_id: 7 }, accountant);
      expect(qb.andWhere).toHaveBeenCalledWith('expense.trip_id = :tripId', { tripId: '7' });
    });

    it('MANAGER thấy tất cả', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({}, manager);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('ACCOUNTANT thấy tất cả', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({}, accountant);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('DISPATCHER chỉ thấy expense thuộc hub mình', async () => {
      const qb = new MockQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({}, dispatcher);
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('findByTrip', () => {
    it('trả về đúng expense của trip', async () => {
      trips.findOne.mockResolvedValue({ id: '1', status: TripStatus.IN_TRANSIT });
      const qb = new MockQb();
      qb.getMany.mockResolvedValue([{ id: 'e1', trip_id: '1' }]);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await expect(service.findByTrip('1', accountant)).resolves.toEqual([{ id: 'e1', trip_id: '1' }]);
    });

    it('trip không tồn tại → NotFoundException', async () => {
      trips.findOne.mockResolvedValue(null);
      await expect(service.findByTrip('1', accountant)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('trả về expense kèm trip relation', async () => {
      const qb = new MockQb();
      qb.getOne.mockResolvedValue({ id: '1', trip: { id: 't1' } });
      expenses.createQueryBuilder.mockReturnValue(qb);
      await expect(service.findOne('1', accountant)).resolves.toMatchObject({ id: '1', trip: { id: 't1' } });
    });

    it('không tìm thấy → NotFoundException', async () => {
      const qb = new MockQb();
      qb.getOne.mockResolvedValue(null);
      expenses.createQueryBuilder.mockReturnValue(qb);
      await expect(service.findOne('1', accountant)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('update thành công khi trip chưa COMPLETED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', trip_id: '1', trip: { status: TripStatus.IN_TRANSIT } } as any);
      trips.findOne.mockResolvedValue({ id: '2', status: TripStatus.ARRIVED });
      await expect(service.update('1', { trip_id: 2 }, accountant)).resolves.toMatchObject({ trip_id: '2' });
    });

    it('vẫn sửa được chi phí sau khi trip COMPLETED để chốt lãi lỗ', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', trip: { status: TripStatus.COMPLETED } } as any);
      await expect(service.update('1', { amount: 25 }, accountant)).resolves.toMatchObject({ amount: '25' });
    });

    it('DRIVER update → ForbiddenException', async () => {
      await expect(service.update('1', {}, driver)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('xóa thành công khi trip chưa COMPLETED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', trip: { status: TripStatus.ARRIVED } } as any);
      await service.remove('1', manager);
      expect(expenses.remove).toHaveBeenCalled();
    });

    it('MANAGER vẫn xóa được chi phí sau khi trip COMPLETED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', trip: { status: TripStatus.COMPLETED } } as any);
      await service.remove('1', manager);
      expect(expenses.remove).toHaveBeenCalled();
    });

    it('ACCOUNTANT xóa → ForbiddenException', async () => {
      await expect(service.remove('1', accountant)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
