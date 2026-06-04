import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Roles } from '../common/roles';
import { AuthService } from './auth.service';
import { SafeUserProfile, UsersService } from './users.service';
import { UserEntity } from '../users/user.entity';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'createUser' | 'findByEmail' | 'setRefreshToken' | 'setLastLogin' | 'toSafeUser'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get' | 'getOrThrow'>>;

  const user = {
    id: '1',
    email: 'driver@eco.test',
    username: 'driver01',
    full_name: 'Driver One',
    phone: '+84901234567',
    password_hash: 'hashed-password',
    role_mask: Roles.DRIVER,
    hub_id: '1',
    is_active: true,
    refresh_token: 'valid-refresh-token',
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as UserEntity;

  const safeUser = {
    id: '1',
    email: 'driver@eco.test',
    username: 'driver01',
    full_name: 'Driver One',
    phone: '+84901234567',
    role_mask: Roles.DRIVER,
    hub_id: '1',
    is_active: true,
    last_login_at: null,
    created_at: expect.any(Date),
    updated_at: expect.any(Date),
  } as UserEntity;

  beforeEach(() => {
    usersService = {
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      setRefreshToken: jest.fn(),
      setLastLogin: jest.fn(),
      toSafeUser: jest.fn().mockReturnValue(safeUser),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
      getOrThrow: jest.fn().mockImplementation((key: string) => key),
    };
    service = new AuthService(usersService as unknown as UsersService, jwtService as unknown as JwtService, configService as unknown as ConfigService);
    jest.clearAllMocks();
  });

  it('register creates a user with default role when role is omitted', async () => {
    usersService.createUser.mockResolvedValue(safeUser);
    await expect(service.register({ email: 'a@eco.test', username: 'auser', full_name: 'A User', phone: '+84901234567', password: 'password123' })).resolves.toBe(safeUser);
    expect(usersService.createUser).toHaveBeenCalledWith(expect.objectContaining({ role_mask: Roles.WAREHOUSE }));
  });

  it('login succeeds with valid password and active user', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    await expect(service.login({ email: 'driver@eco.test', password: 'password123' })).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: safeUser,
    });
    expect(usersService.setRefreshToken).toHaveBeenCalledWith('1', JSON.stringify(['valid-refresh-token', 'refresh-token']));
    expect(usersService.setLastLogin).toHaveBeenCalledWith('1');
  });

  it('login rejects wrong password', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login({ email: 'driver@eco.test', password: 'badpass123' })).rejects.toThrow(UnauthorizedException);
  });

  it('login rejects inactive user', async () => {
    usersService.findByEmail.mockResolvedValue({ ...user, is_active: false });
    await expect(service.login({ email: 'driver@eco.test', password: 'password123' })).rejects.toThrow(UnauthorizedException);
  });

  it('refreshToken returns access token for valid stored refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: '1', email: 'driver@eco.test', role_mask: Roles.DRIVER });
    usersService.findByEmail.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await expect(service.refreshToken({ refresh_token: 'valid-refresh-token' })).resolves.toEqual({ access_token: 'new-access-token' });
  });

  it('refreshToken accepts a refresh token from another active session', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: '1', email: 'driver@eco.test', role_mask: Roles.DRIVER });
    usersService.findByEmail.mockResolvedValue({ ...user, refresh_token: JSON.stringify(['older-refresh-token', 'newer-refresh-token']) });
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await expect(service.refreshToken({ refresh_token: 'older-refresh-token' })).resolves.toEqual({ access_token: 'new-access-token' });
  });

  it('refreshToken rejects invalid refresh token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
    await expect(service.refreshToken({ refresh_token: 'invalid-refresh-token' })).rejects.toThrow(UnauthorizedException);
  });

  it('validateJwtPayload rejects inactive or mismatched users', async () => {
    usersService.findByEmail.mockResolvedValue({ ...user, id: '2' });
    await expect(service.validateJwtPayload({ sub: '1', email: 'driver@eco.test', role_mask: Roles.DRIVER })).rejects.toThrow(UnauthorizedException);
  });

  it('logout revokes refresh token', async () => {
    await service.logout('1');
    expect(usersService.setRefreshToken).toHaveBeenCalledWith('1', null);
  });
});


