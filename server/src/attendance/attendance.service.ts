import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { AttendanceCheckDto } from './dto/attendance-check.dto';
import { CreateAttendanceLocationDto } from './dto/create-attendance-location.dto';
import { QueryAttendanceLogsDto } from './dto/query-attendance-logs.dto';
import { UpdateAttendanceLocationDto } from './dto/update-attendance-location.dto';
import { AttendanceCheckType, AttendanceLogStatus, AttendanceVerificationMethod } from './attendance.enums';
import { AttendanceLocationEntity } from './attendance-location.entity';
import { AttendanceLogEntity } from './attendance-log.entity';
import { isPublicIp, matchesNetwork, normalizeIp, normalizeNetwork } from './attendance-network';

const EARTH_RADIUS_METERS = 6_371_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const GPS_ACCURACY_WARNING_METERS = 50;

type LocationDistance = {
  location: AttendanceLocationEntity;
  distance: number | null;
};

type AttendanceContext = { sourceIp: string | null; deviceInfo?: string; workDate: string };

const workDateNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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

  async listActiveLocations() {
    return (await this.findActiveLocations()).map((location) => this.publicLocation(location));
  }

  async getNetworkStatus(sourceIp?: string) {
    const ip = normalizeIp(sourceIp);
    const locations = await this.findActiveLocations();
    const location = locations.find((item) => this.matchesIpLocation(item, ip));
    return {
      ip,
      is_public: isPublicIp(ip),
      matched_location: location ? { id: location.id, name: location.name } : null,
      gps_available: locations.some((item) => item.verification_method === AttendanceVerificationMethod.GPS),
    };
  }

  async updateLocation(id: string, dto: UpdateAttendanceLocationDto) {
    const location = await this.getLocation(id);
    Object.assign(location, this.normalizeLocationDto({ ...location, ...dto }));
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
    if (query.date_from || query.date_to) {
      const from = query.date_from ?? query.date_to!;
      const to = query.date_to ?? query.date_from!;
      const range = this.getDateRange(from, to);
      qb.andWhere('log.work_date BETWEEN :fromDate AND :toDate', { fromDate: range.dateFrom, toDate: range.dateTo });
    } else if (query.date) {
      const range = this.getDateRange(query.date);
      qb.andWhere('log.work_date = :date', { date: range.date });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((log) => this.publicLog(log)), meta: { page, limit, total } };
  }

  async findMyLogs(user: UserEntity, query: QueryAttendanceLogsDto) {
    return this.findLogs({ ...query, userId: user.id });
  }

  async getTodayStatus(user: UserEntity) {
    const date = workDateNow();
    const logs = await this.logsRepository.find({
      where: {
        user_id: user.id,
        status: AttendanceLogStatus.SUCCESS,
        work_date: date,
      },
      relations: ['location'],
      order: { created_at: 'ASC' },
    });

    return {
      date,
      check_in: this.publicLog(logs.find((log) => log.type === AttendanceCheckType.CHECK_IN)),
      check_out: this.publicLog(logs.find((log) => log.type === AttendanceCheckType.CHECK_OUT)),
    };
  }

  async checkAttendance(user: UserEntity, dto: AttendanceCheckDto, deviceInfo?: string, sourceIp?: string) {
    this.enforceRateLimit(user.id);
    const context: AttendanceContext = { sourceIp: normalizeIp(sourceIp), deviceInfo, workDate: workDateNow() };
    const activeLocations = await this.findActiveLocations();
    const hasGps = dto.latitude != null && dto.longitude != null && dto.accuracy != null;
    const ipLocation = activeLocations.find((location) => this.matchesIpLocation(location, context.sourceIp));
    const rankedLocations = activeLocations
      .filter((location) => hasGps && location.verification_method === AttendanceVerificationMethod.GPS && location.latitude != null && location.longitude != null)
      .map((location) => ({ location, distance: this.haversineMeters(dto.latitude!, dto.longitude!, location.latitude!, location.longitude!) }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = rankedLocations[0];
    const matched: LocationDistance | undefined = ipLocation
      ? { location: ipLocation, distance: null }
      : rankedLocations.find((item) => item.distance <= item.location.radius_meters);
    const accuracyWarning = !ipLocation && hasGps && dto.accuracy! > GPS_ACCURACY_WARNING_METERS;

    if (!matched) {
      const gpsAvailable = activeLocations.some((location) => location.verification_method === AttendanceVerificationMethod.GPS);
      const reason = !activeLocations.length ? 'NO_ACTIVE_LOCATION' : gpsAvailable ? (hasGps ? 'OUT_OF_RADIUS' : 'GPS_REQUIRED') : 'NETWORK_NOT_ALLOWED';
      const messages: Record<string, string> = {
        NO_ACTIVE_LOCATION: 'Chưa có điểm chấm công đang hoạt động.',
        OUT_OF_RADIUS: 'Vị trí hiện tại nằm ngoài bán kính chấm công.',
        GPS_REQUIRED: 'Mạng hiện tại chưa được đăng ký. Cần lấy vị trí để chấm công tại điểm GPS.',
        NETWORK_NOT_ALLOWED: 'Mạng hiện tại không được phép chấm công. Hãy kết nối mạng văn phòng; nếu IP đã đổi, liên hệ quản lý cập nhật.',
      };
      const log = await this.writeLog(user, dto, AttendanceLogStatus.FAILED, null, context, accuracyWarning, reason);
      throw new UnprocessableEntityException({
        message: messages[reason],
        reason,
        nearestLocation: nearest?.location?.name ?? null,
        nearestDistanceMeters: nearest ? Math.round(nearest.distance) : null,
        logId: log.id,
      });
    }

    await this.validateDailyFlow(user.id, dto, matched, context, accuracyWarning);
    let log: AttendanceLogEntity;
    try {
      log = await this.writeLog(user, dto, AttendanceLogStatus.SUCCESS, matched, context, accuracyWarning);
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code !== '23505') throw error;
      await this.writeLog(user, dto, AttendanceLogStatus.FAILED, matched, context, accuracyWarning, 'DUPLICATE_CHECK');
      throw new BadRequestException('Bạn đã chấm công bước này hôm nay. Vui lòng làm mới trạng thái.');
    }

    return {
      success: true,
      accuracy_warning: accuracyWarning,
      message: accuracyWarning ? 'Chấm công thành công. GPS có độ chính xác thấp, vui lòng kiểm tra lại nếu cần.' : 'Chấm công thành công.',
      location: this.publicLocation(matched.location),
      verification_method: matched.location.verification_method,
      distance_meters: matched.distance == null ? null : Math.round(matched.distance),
      log,
    };
  }

  private async validateDailyFlow(userId: string, dto: AttendanceCheckDto, matched: LocationDistance, context: AttendanceContext, accuracyWarning = false) {
    const successLogs = await this.logsRepository.find({
      where: { user_id: userId, status: AttendanceLogStatus.SUCCESS, work_date: context.workDate },
      order: { created_at: 'ASC' },
    });
    const hasCheckIn = successLogs.some((log) => log.type === AttendanceCheckType.CHECK_IN);
    const hasCheckOut = successLogs.some((log) => log.type === AttendanceCheckType.CHECK_OUT);

    if (dto.type === AttendanceCheckType.CHECK_IN && hasCheckIn) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched, context, accuracyWarning, 'DUPLICATE_CHECK_IN');
      throw new BadRequestException('Hôm nay bạn đã check-in rồi.');
    }

    if (dto.type === AttendanceCheckType.CHECK_OUT && !hasCheckIn) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched, context, accuracyWarning, 'CHECK_OUT_BEFORE_CHECK_IN');
      throw new BadRequestException('Bạn cần check-in trước khi check-out.');
    }

    if (dto.type === AttendanceCheckType.CHECK_OUT && hasCheckOut) {
      await this.writeLog({ id: userId } as UserEntity, dto, AttendanceLogStatus.FAILED, matched, context, accuracyWarning, 'DUPLICATE_CHECK_OUT');
      throw new BadRequestException('Hôm nay bạn đã check-out rồi.');
    }
  }

  private writeLog(user: UserEntity, dto: AttendanceCheckDto, status: AttendanceLogStatus, matched: LocationDistance | null, context: AttendanceContext, accuracyWarning = false, failureReason: string | null = null) {
    return this.logsRepository.save(this.logsRepository.create({
      user_id: user.id,
      location_id: matched?.location.id ?? null,
      type: dto.type,
      user_latitude: dto.latitude ?? null,
      user_longitude: dto.longitude ?? null,
      accuracy: dto.accuracy ?? null,
      distance_meters: matched?.distance ?? null,
      source_ip: context.sourceIp,
      verification_method: matched?.location.verification_method ?? null,
      status,
      work_date: context.workDate,
      accuracy_warning: accuracyWarning,
      failure_reason: failureReason,
      device_info: context.deviceInfo?.slice(0, 1000) ?? null,
    }));
  }

  private async getLocation(id: string) {
    const location = await this.locationsRepository.findOne({ where: { id } });
    if (!location) throw new NotFoundException('Không tìm thấy điểm chấm công.');
    return location;
  }

  private normalizeLocationDto(dto: { [Key in keyof CreateAttendanceLocationDto]?: CreateAttendanceLocationDto[Key] | null }) {
    const method = dto.verification_method ?? AttendanceVerificationMethod.GPS;
    const allowedIps = [...new Set((dto.allowed_ips ?? []).map((value) => normalizeNetwork(value)))];
    if (!dto.name?.trim()) throw new BadRequestException('Tên điểm chấm công không được để trống.');
    if (allowedIps.some((value) => !value)) throw new BadRequestException('Chỉ đăng ký IP public hợp lệ hoặc dải IPv6 văn phòng từ /48 đến /128.');
    if (method === AttendanceVerificationMethod.IP && !allowedIps.length) throw new BadRequestException('Cần đăng ký ít nhất một IP mạng văn phòng.');
    if (method === AttendanceVerificationMethod.GPS && (dto.latitude == null || dto.longitude == null)) throw new BadRequestException('Điểm GPS cần có tọa độ.');
    return {
      name: dto.name.trim(),
      address: dto.address?.trim() || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      verification_method: method,
      allowed_ips: method === AttendanceVerificationMethod.IP ? allowedIps as string[] : [],
      radius_meters: dto.radius_meters ?? 100,
      is_active: dto.is_active ?? true,
    };
  }

  private publicLocation(location: AttendanceLocationEntity) {
    const { allowed_ips: _allowedIps, ...publicFields } = location;
    return publicFields;
  }

  private publicLog(log?: AttendanceLogEntity) {
    return log ? { ...log, location: log.location ? this.publicLocation(log.location) : null } : null;
  }

  private matchesIpLocation(location: AttendanceLocationEntity, ip: string | null) {
    return location.verification_method === AttendanceVerificationMethod.IP && location.allowed_ips.some((network) => matchesNetwork(ip, network));
  }

  private getDateRange(date: string, endDate = date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Ngày lọc không hợp lệ.');
    }
    return { start, end, date, dateFrom: date, dateTo: endDate };
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
