import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Roles } from '../common/roles';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { JwtPayload } from './jwt-payload.interface';
import { SafeUserProfile, UsersService } from './users.service';
import { UserEntity } from '../users/user.entity';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: SafeUserProfile;
}

const MAX_REFRESH_SESSIONS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterUserDto): Promise<SafeUserProfile> {
    return this.usersService.createUser({
      ...dto,
      role_mask: dto.role_mask ?? Roles.WAREHOUSE,
    });
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.usersService.findByLogin(dto.email);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user);
    await this.usersService.setRefreshToken(user.id, this.appendRefreshToken(user.refresh_token, tokens.refresh_token));
    await this.usersService.setLastLogin(user.id);

    return {
      ...tokens,
      user: this.usersService.toSafeUser({ ...user, refresh_token: tokens.refresh_token, last_login_at: new Date() }),
    };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<{ access_token: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refresh_token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.is_active || !this.hasRefreshToken(user.refresh_token, dto.refresh_token)) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return { access_token: await this.signAccessToken(user) };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateJwtPayload(payload: JwtPayload): Promise<SafeUserProfile> {
    const user = await this.usersService.findByEmail(payload.email);
    if (!user || !user.is_active || user.id !== payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    return this.usersService.toSafeUser(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshToken(userId, null);
  }

  private async issueTokens(user: UserEntity): Promise<Omit<AuthTokens, 'user'>> {
    const [access_token, refresh_token] = await Promise.all([
      this.signAccessToken(user),
      this.jwtService.signAsync(this.buildPayload(user), {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.getExpiresIn('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { access_token, refresh_token };
  }

  private async signAccessToken(user: UserEntity): Promise<string> {
    return this.jwtService.signAsync(this.buildPayload(user), {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.getExpiresIn('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  private getExpiresIn(key: string, fallback: JwtSignOptions['expiresIn']): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>(key) ?? fallback) as JwtSignOptions['expiresIn'];
  }

  private buildPayload(user: UserEntity): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role_mask: user.role_mask,
    };
  }

  private appendRefreshToken(storedToken: string | null, nextToken: string): string {
    const tokens = this.parseRefreshTokens(storedToken).filter((token) => token !== nextToken);
    return JSON.stringify([...tokens, nextToken].slice(-MAX_REFRESH_SESSIONS));
  }

  private hasRefreshToken(storedToken: string | null, token: string): boolean {
    return this.parseRefreshTokens(storedToken).includes(token);
  }

  private parseRefreshTokens(storedToken: string | null): string[] {
    if (!storedToken) return [];
    try {
      const parsed = JSON.parse(storedToken) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((token): token is string => typeof token === 'string' && token.length > 0);
    } catch {
      return [storedToken];
    }
    return [];
  }
}
