import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Roles } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { OperationalReminderEntity } from './operational-reminder.entity';
import { RemindersService } from './reminders.service';

const repository = () => ({
  create: jest.fn((value) => ({ ...value })),
  save: jest.fn(async (value) => value),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const queryBuilder = (items: unknown[] = []) => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  setParameter: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(items),
});

describe('RemindersService', () => {
  let service: RemindersService;
  let remindersRepository: ReturnType<typeof repository>;
  let trucksRepository: ReturnType<typeof repository>;
  let hubsRepository: ReturnType<typeof repository>;
  const manager = { id: '1', role_mask: Roles.MANAGER } as any;

  beforeEach(async () => {
    remindersRepository = repository();
    trucksRepository = repository();
    hubsRepository = repository();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: getRepositoryToken(OperationalReminderEntity), useValue: remindersRepository },
        { provide: getRepositoryToken(TruckEntity), useValue: trucksRepository },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepository },
      ],
    }).compile();
    service = moduleRef.get(RemindersService);
  });

  it('creates a reminder linked to an internal truck and inherits its hub', async () => {
    trucksRepository.findOne.mockResolvedValue({ id: '10', ownership_type: 'INTERNAL', hub_id: '20' });

    const result = await service.create({ title: ' Gia hạn đăng kiểm ', remind_date: '2026-09-15', truck_id: '10' }, manager);

    expect(result).toMatchObject({ title: 'Gia hạn đăng kiểm', remind_date: '2026-09-15', truck_id: '10', hub_id: '20', status: 'ACTIVE', created_by_id: '1' });
  });

  it('rejects linking a reminder to a vendor truck', async () => {
    trucksRepository.findOne.mockResolvedValue(null);
    await expect(service.create({ title: 'Kiểm tra giấy tờ', remind_date: '2026-09-15', truck_id: '99' }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks due reminders and keeps upcoming reminders active', async () => {
    const items = [
      { id: '1', remind_date: '2020-01-01', status: 'ACTIVE' },
      { id: '2', remind_date: '2099-01-01', status: 'ACTIVE' },
    ];
    remindersRepository.createQueryBuilder.mockReturnValue(queryBuilder(items));

    const result = await service.findActive(manager);

    expect(result.meta).toEqual({ total: 2, due: 1, upcoming: 1 });
    expect(result.items[0]).toMatchObject({ id: '1', is_due: true });
    expect(result.items[1]).toMatchObject({ id: '2', is_due: false });
  });

  it('allows only managers to complete reminders', async () => {
    const warehouse = { id: '2', role_mask: Roles.WAREHOUSE } as any;
    await expect(service.complete('1', warehouse)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records who completed a reminder', async () => {
    remindersRepository.findOne.mockResolvedValue({ id: '1', status: 'ACTIVE', completed_by_id: null, completed_at: null });

    const result = await service.complete('1', manager);

    expect(result).toMatchObject({ status: 'COMPLETED', completed_by_id: '1' });
    expect(result.completed_at).toBeInstanceOf(Date);
  });
});
