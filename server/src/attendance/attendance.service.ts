import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { AttendanceCheckDto } from './dto/attendance-check.dto';
import { CreateAttendanceLocationDto } from './dto/create-attendance-location.dto';
import { QueryAttendanceLogsDto } from './dto/query-attendance-logs.dto';
import { UpdateAttendanceLocationDto } from './dto/update-attendance-location.dto';
import { AttendanceCheckType, AttendanceLogStatus } from './attendance.enums';
import { AttendanceLocationEntity } from './attendance-location.entity';
import { AttendanceLogEntity } from './attendance-log.entity';

const EARTH_RADIUS_METERS = 6_371_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const GPS_ACCURACY_WARNING_METERS = 50;

type LocationDistance = {
  location: AttendanceLocationEntity;
  distance: number;
};

@Injectable()
export class AttendanceService {
  private readonly checkAttempts = new Map<string, number[]>();

  constructor(
    @InjectRepository(AttendanceLocationEntity)
    private readonly locationsRepository: Repository<AttendanceLocationEntity>,
    @InjectRepository(AttendanceLogEntity)
    private readonly logsRepository: Repository<AttendanceLogEntity>,
  ) {}

  async createLocation(dto: CreateAttendanceLocationDto, actor: UserEntity) {
    const location = this.locationsRepository.create({
      ...this.normalizeLocationDto(dto),
      created_by: actor.id,
    });
    return this.locationsRepository.save(location);
  }

  async findLocations() {
    return this.locationsRepository.find({ order: { created_at: 'DESC' } });
  }

  async findActiveLocations() {
    return this.locationsRepository.find({ where: { is_active: true }, order: { name: 'ASC' } });
  }

  async updateLocation(id: string, dto: UpdateAttendanceLocationDto) {
    const location = await this.getLocation(id);
    Object.assign(location, this.normalizeLocationDto(dto));
    return this.locationsRepository.save(location);
  }

  async removeLocation(id: string) {
    const location = await this.getLocation(id);
    await this.locationsRepository.remove(location);
  }

  async toggleLocation(id: string) {
    const location = await this.getLocation(id);
    location.is_active = !location.is_active;
    return this.locationsRepository.save(location);
  }

  async findLogs(query: QueryAttendanceLogsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const qb = this.logsRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.location', 'location')
      .leftJoin('log.user', 'user')
      .addSelect(['user.id', 'user.username', 'user.full_name'])
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.userId) qb.andWhere('log.user_id = :userId', { userId: query.userId });
    if (query.locationId) qb.andWhere('log.location_id = :locationId', { locationId: query.locationId });
    if (query.date) {
      const range = this.getDateRange(query.date);
      qb.andWhere('log.created_at BETWEEN :start AND :end', range);
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: { page, limit, total } };
  }

  async findMyLogs(user: UserEntity, query: QueryAttendanceLogsDto) {
    return this.findLogs({ ...query, userId: user.id });
  }

  async getTodayStatus(user: UserEntity) {
    const range = this.getDateRange(new Date().toISOString().slice(0, 10));
    const logs = await this.logsRepository.find({
      where: {
        user_id: user.id,
        status: AttendanceLogStatus.SUCCESS,
        work_date: range.date,
      },
      relations: ['location'],
      order: { created_at: 'ASC' },
    });

    return {
      date: new Date().toISOString().slice(0, 10),
      check_in: logs.find((log) => log.type === AttendanceCheckType.CHECK_IN) ?? null,
      check_out: logs.find((log) => log.type === AttendanceCheckType.CHECK_OUT) ?? null,
    };
  }

  async checkAttendance(user: UserEntity, dto: AttendanceCheckDto, deviceInfo?: string) {
    this.enforceRateLimit(user.id);
    const activeLocations = await this.findActiveLocations();
    const rankedLocations = activeLocations
      .map((location) => ({ location, distance: this.haversineMeters(dto.latitude, dto.longitude, location.latitude, location.longitude) }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = rankedLocations[0];
    const matched = rankedLocations.find((item) => item.distance <= item.location.radius_meters);
    const accuracyWarning = dto.accuracy > GPS_ACCURACY_WARNING_METERS;

    if (!matched) {
      const log = await this.writeLog(user, dto, AttendanceLogStatus.FAILED, null, nearest?.distance ?? null, deviceInfo, accuracyWarning, 'OUT_OF_RADIUS');
      throw new UnprocessableEntityException({
        message: 'Vị trí hiện tại nằm ngoài bán kính chấm công.',
        nearestLocation: nearest?.location?.name ?? null,
        nearestDistanceMeters: nearest ? Math.round(nearest.distance) : null,
        logId: log.id,
      });
    }

    await this.validateDailyFlow(user.id, dto, matched, deviceInfo, accuracyWarning);
    const log = await this.writeLog(user, dto, AttendanceLogStatus.SUCCESS, matched.location, matched.distance, deviceInfo, accuracyWarning, null);

    return {
      success: true,
      accuracy_warning: accuracyWarning,
      message: accuracyWarning ? 'Chấm công thành công. GPS có độ chính xác thấp, vui lòng kiểm tra lại nếu cần.' : 'Chấm công thành công.',
      location: matched.location,
      distance_meters: Math.round(matched.distance),
      log,
    };
  }

  private async validateDailyFlow(userId: string, dto: AttendanceCheckDto, matched: LocationDistance, deviceInfo?: string, accuracyWarning = false) {
    const range = this.getDateRange(new Date().toISOString().slice(0, 10));
    const successLogs = await this.logsRepository.find({
      where: { user_id: userId, status: AttendanceLogStatus.SUCCESS, work_date: range.date },
      order: { created_at: 'ASC' },
    });
    const hasCheckIn = successLogs.some((log) => log.type === AttendanceCheckType.CHECK_IN);
    const hasCheckOut = successLogs.some((log) => log.type === AttendanceCheckType.CHECK_OUT);

    if (dto.type === AttendanceCheckType.CHECK_IN && hasCheckIn) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched.location, matched.distance, deviceInfo, accuracyWarning, 'DUPLICATE_CHECK_IN');
      throw new BadRequestException('Hôm nay bạn đã check-in rồi.');
    }

    if (dto.type === AttendanceCheckType.CHECK_OUT && !hasCheckIn) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched.location, matched.distance, deviceInfo, accuracyWarning, 'CHECK_OUT_BEFORE_CHECK_IN');
      throw new BadRequestException('Bạn cần check-in trước khi check-out.');
    }

    if (dto.type === AttendanceCheckType.CHECK_OUT && hasCheckOut) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched.location, matched.distance, deviceInfo, accuracyWarning, 'DUPLICATE_CHECK_OUT');
      throw new BadRequestException('Hôm nay bạn đã check-out rồi.');
    }
  }

  private writeLog(user: UserEntity, dto: AttendanceCheckDto, status: AttendanceLogStatus, location: AttendanceLocationEntity | null, distance: number | null, deviceInfo?: string, accuracyWarning = false, failureReason: string | null = null) {
    return this.logsRepository.save(this.logsRepository.create({
      user_id: user.id,
      location_id: location?.id ?? null,
      type: dto.type,
      user_latitude: dto.latitude,
      user_longitude: dto.longitude,
      accuracy: dto.accuracy,
      distance_meters: distance,
      status,
      work_date: new Date().toISOString().slice(0, 10),
      accuracy_warning: accuracyWarning,
      failure_reason: failureReason,
      device_info: deviceInfo?.slice(0, 1000) ?? null,
    }));
  }

  private async getLocation(id: string) {
    const location = await this.locationsRepository.findOne({ where: { id } });
    if (!location) throw new NotFoundException('Không tìm thấy điểm chấm công.');
    return location;
  }

  private normalizeLocationDto(dto: Partial<CreateAttendanceLocationDto>) {
    return {
      ...dto,
      name: dto.name?.trim(),
      address: dto.address?.trim() || null,
      radius_meters: dto.radius_meters ?? 100,
      is_active: dto.is_active ?? true,
    };
  }

  private getDateRange(date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Ngày lọc không hợp lệ.');
    }
    return { start, end, date };
  }

  private enforceRateLimit(userId: string) {
    const now = Date.now();
    const recentAttempts = (this.checkAttempts.get(userId) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
    if (recentAttempts.length >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException('Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recentAttempts.push(now);
    this.checkAttempts.set(userId, recentAttempts);
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
