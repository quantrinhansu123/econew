import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Roles } from '../common/roles';
import { HubType } from '../hubs/dto/create-hub.dto';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from './user.entity';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

const createRepositoryMock = () => ({
  findOne: jest.fn(),
  create: jest.fn((input) => input as UserEntity),
  save: jest.fn((input) => Promise.resolve(input as UserEntity)),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: ReturnType<typeof createRepositoryMock>;
  let hubsRepository: ReturnType<typeof createRepositoryMock>;
  let tripsRepository: ReturnType<typeof createRepositoryMock>;
  let trucksRepository: ReturnType<typeof createRepositoryMock>;
  let manifestsRepository: ReturnType<typeof createRepositoryMock>;
  let reconciliationsRepository: ReturnType<typeof createRepositoryMock>;
  let waybillsRepository: ReturnType<typeof createRepositoryMock>;

  const user = {
    id: '1',
    email: 'staff@eco.test',
    username: 'staff@eco.test',
    phone: '+84901234567',
    full_name: 'Staff One',
    password_hash: 'hashed-password',
    role_mask: Roles.WAREHOUSE,
    hub_id: '1',
    is_active: true,
    refresh_token: 'refresh-token',
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as UserEntity;

  const hub = { id: '1', code: 'HAN', name: 'Hà Nội', type: HubType.HUB, is_active: true } as HubEntity;

  beforeEach(() => {
    usersRepository = createRepositoryMock();
    hubsRepository = createRepositoryMock();
    tripsRepository = createRepositoryMock();
    trucksRepository = createRepositoryMock();
    manifestsRepository = createRepositoryMock();
    reconciliationsRepository = createRepositoryMock();
    waybillsRepository = createRepositoryMock();
    service = new UsersService(usersRepository as never, hubsRepository as never, tripsRepository as never, trucksRepository as never, manifestsRepository as never, reconciliationsRepository as never, waybillsRepository as never);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new');
  });

  it('create creates an active safe user with normalized email and hashed password', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    hubsRepository.findOne.mockResolvedValue(hub);

    const result = await service.create({ email: ' STAFF@ECO.TEST ', phone: '+84901234567', full_name: 'Staff One', password: 'password123', role_mask: Roles.WAREHOUSE, hub_id: '1' });

    expect(usersRepository.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'staff@eco.test', username: 'staff@eco.test', password_hash: 'hashed-new', is_active: true }));
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('refresh_token');
  });

  it('create rejects duplicate email', async () => {
    usersRepository.findOne.mockResolvedValue(user);

    await expect(service.create({ email: 'staff@eco.test', full_name: 'Staff One', password: 'password123', role_mask: Roles.WAREHOUSE })).rejects.toThrow(ConflictException);
  });

  it('create rejects invalid role_mask', async () => {
    await expect(service.create({ email: 'new@eco.test', full_name: 'New User', password: 'password123', role_mask: 128 })).rejects.toThrow(BadRequestException);
  });

  it('findAll filters by keyword, role_mask, hub_id, and is_active', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[user], 1]),
    };
    usersRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({ keyword: 'staff', role_mask: Roles.WAREHOUSE, hub_id: '1', is_active: true, page: 2, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(4);
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(result.items[0]).not.toHaveProperty('password_hash');
  });

  it('findOne returns safe user details', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    const result = await service.findOne('1', user);
    expect(result.email).toBe('staff@eco.test');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('findOne blocks another non-manager user', async () => {
    await expect(service.findOne('2', user)).rejects.toThrow(ForbiddenException);
  });

  it('update rejects missing user', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    await expect(service.update('404', { full_name: 'Missing' })).rejects.toThrow(NotFoundException);
  });

  it('update saves changed safe user', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    const result = await service.update('1', { full_name: 'Updated Staff' });
    expect(usersRepository.save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Updated Staff' }));
    expect(result).not.toHaveProperty('password_hash');
  });

  it('assignRole succeeds for manager assigning non-director roles', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    const actor = { ...user, id: '2', role_mask: Roles.MANAGER } as UserEntity;

    const result = await service.assignRole('1', { role_mask: Roles.DRIVER }, actor);

    expect(result.role_mask).toBe(Roles.DRIVER);
  });

  it('assignRole rejects insufficient actor role', async () => {
    await expect(service.assignRole('1', { role_mask: Roles.DRIVER }, user)).rejects.toThrow(ForbiddenException);
  });

  it('MANAGER cannot assign DIRECTOR role', async () => {
    const actor = { ...user, id: '2', role_mask: Roles.MANAGER } as UserEntity;
    await expect(service.assignRole('1', { role_mask: Roles.DIRECTOR }, actor)).rejects.toThrow(ForbiddenException);
  });

  it('assignHub rejects missing hub', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    hubsRepository.findOne.mockResolvedValue(null);
    await expect(service.assignHub('1', { hub_id: '404' })).rejects.toThrow(NotFoundException);
  });

  it('updateStatus blocks deactivating current account', async () => {
    await expect(service.updateStatus('1', { is_active: false }, user)).rejects.toThrow(BadRequestException);
  });

  it('remove blocks user with active tasks', async () => {
    const driver = { ...user, role_mask: Roles.DRIVER } as UserEntity;
    usersRepository.findOne.mockResolvedValue(driver);
    tripsRepository.count.mockResolvedValue(1);
    waybillsRepository.count.mockResolvedValue(0);

    await expect(service.remove('1', { ...user, id: '2', role_mask: Roles.DIRECTOR } as UserEntity)).rejects.toThrow(BadRequestException);
  });

  it('remove deactivates user when no active tasks remain', async () => {
    usersRepository.findOne.mockResolvedValue({ ...user });
    waybillsRepository.count.mockResolvedValue(0);

    await service.remove('1', { ...user, id: '2', role_mask: Roles.DIRECTOR } as UserEntity);

    expect(usersRepository.save).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, refresh_token: null }));
  });

  it('findByEmail uses normalized email', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    await service.findByEmail(' STAFF@ECO.TEST ');
    expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { email: 'staff@eco.test' } });
  });

  it('findActiveUsersByRole returns only safe active users for role', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([user]),
    };
    usersRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findActiveUsersByRole(Roles.WAREHOUSE);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('(users.role_mask & :roleMask) <> 0', { roleMask: Roles.WAREHOUSE });
    expect(result[0]).not.toHaveProperty('password_hash');
  });

  it('response sanitizer removes password_hash', () => {
    expect(service.toSafeUser(user)).not.toHaveProperty('password_hash');
  });
});
