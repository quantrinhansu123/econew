import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { HubEntity } from '../hubs/hub.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { CreateOperationalReminderDto } from './dto/create-operational-reminder.dto';
import { UpdateOperationalReminderDto } from './dto/update-operational-reminder.dto';
import { OperationalReminderEntity } from './operational-reminder.entity';

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(OperationalReminderEntity) private readonly remindersRepository: Repository<OperationalReminderEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
  ) {}

  async findActive(currentUser: UserEntity) {
    const today = this.getVietnamDateKey();
    const qb = this.remindersRepository.createQueryBuilder('reminder')
      .leftJoinAndSelect('reminder.truck', 'truck')
      .leftJoinAndSelect('reminder.hub', 'hub')
      .leftJoin('reminder.created_by', 'created_by')
      .addSelect(['created_by.id', 'created_by.username', 'created_by.full_name'])
      .where('reminder.status = :status', { status: 'ACTIVE' });

    const assignedHubIds = getAssignedHubIds(currentUser);
    if (!isManager(currentUser.role_mask) && assignedHubIds.length) {
      qb.andWhere(new Brackets((builder) => builder
        .where('reminder.hub_id IN (:...assignedHubIds)', { assignedHubIds })
        .orWhere('reminder.hub_id IS NULL')));
    }

    const items = await qb
      .orderBy("CASE WHEN reminder.remind_date <= :today THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('reminder.remind_date', 'ASC')
      .addOrderBy('reminder.id', 'DESC')
      .setParameter('today', today)
      .getMany();

    return {
      as_of: today,
      items: items.map((item) => ({ ...item, is_due: item.remind_date <= today })),
      meta: {
        total: items.length,
        due: items.filter((item) => item.remind_date <= today).length,
        upcoming: items.filter((item) => item.remind_date > today).length,
      },
    };
  }

  async create(dto: CreateOperationalReminderDto, currentUser: UserEntity) {
    this.assertManager(currentUser);
    const context = await this.resolveContext(dto.truck_id, dto.hub_id);
    const reminder = this.remindersRepository.create({
      title: dto.title.trim(),
      note: dto.note?.trim() || null,
      remind_date: dto.remind_date,
      category: dto.category?.trim().toUpperCase() || 'VEHICLE_DOCUMENT',
      status: 'ACTIVE',
      truck_id: context.truckId,
      hub_id: context.hubId,
      created_by_id: String(currentUser.id),
      completed_by_id: null,
      completed_at: null,
    });
    return this.remindersRepository.save(reminder);
  }

  async update(id: string, dto: UpdateOperationalReminderDto, currentUser: UserEntity) {
    this.assertManager(currentUser);
    const reminder = await this.findOne(id);
    const context = dto.truck_id !== undefined || dto.hub_id !== undefined
      ? await this.resolveContext(dto.truck_id, dto.hub_id)
      : { truckId: reminder.truck_id, hubId: reminder.hub_id };
    if (dto.title !== undefined) reminder.title = dto.title.trim();
    if (dto.note !== undefined) reminder.note = dto.note.trim() || null;
    if (dto.remind_date !== undefined) reminder.remind_date = dto.remind_date;
    if (dto.category !== undefined) reminder.category = dto.category.trim().toUpperCase() || reminder.category;
    reminder.truck_id = context.truckId;
    reminder.hub_id = context.hubId;
    return this.remindersRepository.save(reminder);
  }

  async complete(id: string, currentUser: UserEntity) {
    this.assertManager(currentUser);
    const reminder = await this.findOne(id);
    if (reminder.status === 'COMPLETED') return reminder;
    reminder.status = 'COMPLETED';
    reminder.completed_by_id = String(currentUser.id);
    reminder.completed_at = new Date();
    return this.remindersRepository.save(reminder);
  }

  private async findOne(id: string) {
    const reminder = await this.remindersRepository.findOne({ where: { id } as any });
    if (!reminder) throw new NotFoundException('Không tìm thấy cảnh báo');
    return reminder;
  }

  private async resolveContext(rawTruckId?: string, rawHubId?: string) {
    const truckId = rawTruckId?.trim() || null;
    const requestedHubId = rawHubId?.trim() || null;
    if (truckId) {
      const truck = await this.trucksRepository.findOne({
        where: { id: truckId, ownership_type: 'INTERNAL' } as any,
      });
      if (!truck) throw new BadRequestException('Xe được chọn không thuộc danh sách xe nội bộ');
      return { truckId: String(truck.id), hubId: truck.hub_id ? String(truck.hub_id) : requestedHubId };
    }
    if (requestedHubId) {
      const hub = await this.hubsRepository.findOne({ where: { id: requestedHubId, deleted_at: IsNull() } as any });
      if (!hub) throw new BadRequestException('Bưu cục không tồn tại');
    }
    return { truckId: null, hubId: requestedHubId };
  }

  private assertManager(currentUser: UserEntity) {
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.DIRECTOR)) return;
    throw new ForbiddenException('Chỉ quản lý được tạo và xử lý cảnh báo');
  }

  private getVietnamDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
