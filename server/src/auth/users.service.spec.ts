import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let repository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  const user = {
    id: '1',
    email: 'user@eco.test',
    username: 'user01',
    full_name: 'User One',
    phone: '+84901234567',
    password_hash: 'hashed-old',
    role_mask: Roles.WAREHOUSE,
    hub_id: '1',
    is_active: true,
    refresh_token: 'refresh-token',
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as UserEntity;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn((input) => input as UserEntity),
      save: jest.fn((input) => Promise.resolve(input as UserEntity)),
    };
    service = new UsersService(repository as never);
    jest.clearAllMocks();
  });

  it('createUser creates a hashed active user', async () => {
    repository.findOne.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new');

    const result = await service.createUser({ email: 'new@eco.test', username: 'newuser', full_name: 'New User', phone: '+84901234567', password: 'password123' });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ password_hash: 'hashed-new', role_mask: Roles.WAREHOUSE, is_active: true }));
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('refresh_token');
  });

  it('createUser rejects duplicate email', async () => {
    repository.findOne.mockResolvedValue(user);
    await expect(service.createUser({ email: 'user@eco.test', username: 'newuser', full_name: 'New User', phone: '+84901234567', password: 'password123' })).rejects.toThrow(ConflictException);
  });

  it('findByEmail returns user for login', async () => {
    repository.findOne.mockResolvedValue(user);
    await expect(service.findByEmail('user@eco.test')).resolves.toBe(user);
  });

  it('findByLogin accepts either a normalized email or username', async () => {
    repository.findOne.mockResolvedValue(user);
    await expect(service.findByLogin(' USER01 ')).resolves.toBe(user);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: [{ email: 'user01' }, { username: 'user01' }],
    });
  });

  it('findById returns safe profile', async () => {
    repository.findOne.mockResolvedValue(user);
    const result = await service.findById('1');
    expect(result.email).toBe('user@eco.test');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('findById rejects missing user', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findById('404')).rejects.toThrow(NotFoundException);
  });

  it('updateProfile updates current user profile', async () => {
    repository.findOne.mockResolvedValue(user);
    const result = await service.updateProfile('1', { full_name: 'Updated User' });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Updated User' }));
    expect(result.full_name).toBe('Updated User');
  });

  it('changePassword succeeds with valid old password', async () => {
    repository.findOne.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new');

    await service.changePassword('1', { old_password: 'oldpass123', new_password: 'newpass123' });

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ password_hash: 'hashed-new', refresh_token: null }));
  });

  it('changePassword rejects wrong old password', async () => {
    repository.findOne.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.changePassword('1', { old_password: 'wrongpass', new_password: 'newpass123' })).rejects.toThrow(BadRequestException);
  });

  it('changePassword rejects unchanged new password', async () => {
    await expect(service.changePassword('1', { old_password: 'samepass123', new_password: 'samepass123' })).rejects.toThrow(BadRequestException);
  });

  it('assignRole allows manager to assign regular role', async () => {
    repository.findOne.mockResolvedValue(user);
    const actor = { ...user, id: '2', role_mask: Roles.MANAGER } as UserEntity;
    const result = await service.assignRole('1', Roles.DRIVER, actor);
    expect(result.role_mask).toBe(Roles.DRIVER);
  });

  it('assignRole rejects insufficient role', async () => {
    const actor = { ...user, id: '2', role_mask: Roles.WAREHOUSE } as UserEntity;
    await expect(service.assignRole('1', Roles.DRIVER, actor)).rejects.toThrow(ForbiddenException);
  });

  it('assignRole lets director assign manager role', async () => {
    repository.findOne.mockResolvedValue(user);
    const actor = { ...user, id: '2', role_mask: Roles.DIRECTOR } as UserEntity;
    await expect(service.assignRole('1', Roles.MANAGER, actor)).resolves.toMatchObject({ role_mask: Roles.MANAGER });
  });

  it('deactivateUser locks account and revokes refresh token', async () => {
    repository.findOne.mockResolvedValue(user);
    const actor = { ...user, id: '2', role_mask: Roles.MANAGER } as UserEntity;
    const result = await service.deactivateUser('1', actor);
    expect(result.is_active).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: null }));
  });

  it('setRefreshToken stores current refresh token', async () => {
    repository.findOne.mockResolvedValue(user);
    await service.setRefreshToken('1', 'next-token');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: 'next-token' }));
  });

  it('setLastLogin stores login timestamp', async () => {
    repository.findOne.mockResolvedValue(user);
    await service.setLastLogin('1');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ last_login_at: expect.any(Date) }));
  });
});
