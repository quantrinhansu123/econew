import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Roles, isDirector, isManager } from '../common/roles';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserEntity } from '../users/user.entity';

export type SafeUserProfile = Omit<UserEntity, 'password_hash' | 'refresh_token'>;

@Injectable()
export class UsersService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async createUser(dto: RegisterUserDto): Promise<SafeUserProfile> {
    await this.ensureUniqueUser(dto.email, dto.username);
    const password_hash = await bcrypt.hash(dto.password, this.saltRounds);
    const user = this.usersRepository.create({
      email: dto.email,
      username: dto.username,
      full_name: dto.full_name,
      phone: dto.phone,
      password_hash,
      role_mask: dto.role_mask ?? Roles.WAREHOUSE,
      hub_id: dto.hub_id ?? null,
      is_active: true,
      refresh_token: null,
      last_login_at: null,
    });
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByLogin(identifier: string): Promise<UserEntity | null> {
    const normalized = identifier.trim().toLowerCase();
    return this.usersRepository.findOne({
      where: [
        { email: normalized },
        { username: normalized },
      ] as FindOptionsWhere<UserEntity>[],
    });
  }

  async findById(id: string): Promise<SafeUserProfile> {
    return this.toSafeUser(await this.getUserOrThrow({ id }));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUserProfile> {
    const user = await this.getUserOrThrow({ id: userId });
    Object.assign(user, dto);
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.old_password === dto.new_password) {
      throw new BadRequestException('New password must be different from old password');
    }

    const user = await this.getUserOrThrow({ id: userId });
    const isOldPasswordValid = await bcrypt.compare(dto.old_password, user.password_hash);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Old password is invalid');
    }

    user.password_hash = await bcrypt.hash(dto.new_password, this.saltRounds);
    user.refresh_token = null;
    await this.usersRepository.save(user);
  }

  async assignRole(userId: string, role_mask: number, actor?: UserEntity): Promise<SafeUserProfile> {
    if (actor && !isManager(actor.role_mask)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    if (actor && !isDirector(actor.role_mask) && (role_mask & (Roles.MANAGER | Roles.DIRECTOR)) !== 0) {
      throw new ForbiddenException('Only directors can assign manager or director roles');
    }

    const user = await this.getUserOrThrow({ id: userId });
    user.role_mask = role_mask;
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async deactivateUser(userId: string, actor?: UserEntity): Promise<SafeUserProfile> {
    if (actor && !isManager(actor.role_mask)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    const user = await this.getUserOrThrow({ id: userId });
    user.is_active = false;
    user.refresh_token = null;
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async setRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const user = await this.getUserOrThrow({ id: userId });
    user.refresh_token = refreshToken;
    await this.usersRepository.save(user);
  }

  async setLastLogin(userId: string): Promise<void> {
    const user = await this.getUserOrThrow({ id: userId });
    user.last_login_at = new Date();
    await this.usersRepository.save(user);
  }

  toSafeUser(user: UserEntity): SafeUserProfile {
    const { password_hash: _passwordHash, refresh_token: _refreshToken, ...safeUser } = user;
    return safeUser;
  }

  private async ensureUniqueUser(email: string, username: string): Promise<void> {
    const existing = await this.usersRepository.findOne({
      where: [{ email }, { username }] as FindOptionsWhere<UserEntity>[],
    });

    if (existing?.email === email) {
      throw new ConflictException('Email already exists');
    }

    if (existing?.username === username) {
      throw new ConflictException('Username already exists');
    }
  }

  private async getUserOrThrow(where: FindOptionsWhere<UserEntity>): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}

