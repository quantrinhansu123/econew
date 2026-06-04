import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { clampPaginationLimit } from '../common/pagination';
import { HubEntity } from '../hubs/hub.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { UpdateRouteStatusDto } from './dto/update-route-status.dto';
import { UpsertRouteDto } from './dto/upsert-route.dto';
import { DeliveryRouteEntity } from './route.entity';

@Injectable()
export class RoutesService {
  constructor(
    @InjectRepository(DeliveryRouteEntity)
    private readonly routesRepository: Repository<DeliveryRouteEntity>,
    @InjectRepository(HubEntity)
    private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(WaybillEntity)
    private readonly waybillsRepository: Repository<WaybillEntity>,
  ) {}

  async findAll(query: QueryRoutesDto) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 50);
    const qb = this.routesRepository
      .createQueryBuilder('route')
      .leftJoinAndSelect('route.hub', 'hub');

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(
        new Brackets((inner) => {
          inner
            .where('route.code ILIKE :keyword', { keyword })
            .orWhere('route.name ILIKE :keyword', { keyword })
            .orWhere('route.province ILIKE :keyword', { keyword })
            .orWhere('route.district ILIKE :keyword', { keyword });
        }),
      );
    }

    if (query.status?.trim()) {
      qb.andWhere('route.status = :status', { status: query.status.trim().toUpperCase() });
    }

    if (query.hub_id?.trim()) {
      qb.andWhere('route.hub_id = :hubId', { hubId: query.hub_id.trim() });
    }

    const [items, total] = await qb
      .orderBy('route.sort_order', 'ASC')
      .addOrderBy('route.code', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((route) => this.toListItem(route)),
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async findActive(hubId?: string) {
    const qb = this.routesRepository
      .createQueryBuilder('route')
      .leftJoinAndSelect('route.hub', 'hub')
      .where('route.status = :status', { status: 'ACTIVE' });

    if (hubId?.trim()) {
      qb.andWhere('(route.hub_id IS NULL OR route.hub_id = :hubId)', { hubId: hubId.trim() });
    }

    const items = await qb
      .orderBy('route.sort_order', 'ASC')
      .addOrderBy('route.code', 'ASC')
      .getMany();

    return items.map((route) => this.toListItem(route));
  }

  async findOne(id: string) {
    const route = await this.routesRepository.findOne({
      where: { id },
      relations: ['hub'],
    });
    if (!route) throw new NotFoundException('Route not found');
    return this.toListItem(route);
  }

  async create(dto: UpsertRouteDto) {
    const code = this.normalizeCode(dto.code);
    await this.assertUniqueCode(code);
    await this.assertHubExists(dto.hub_id);

    const route = this.routesRepository.create({
      code,
      name: dto.name.trim(),
      hub_id: dto.hub_id?.trim() || null,
      province: dto.province?.trim() || null,
      district: dto.district?.trim() || null,
      description: dto.description?.trim() || null,
      sort_order: dto.sort_order ?? 0,
      status: (dto.status || 'ACTIVE').toUpperCase(),
    });

    const saved = await this.routesRepository.save(route);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpsertRouteDto) {
    const route = await this.getEntity(id);
    const code = this.normalizeCode(dto.code);
    if (code !== route.code) await this.assertUniqueCode(code, id);
    await this.assertHubExists(dto.hub_id);

    route.code = code;
    route.name = dto.name.trim();
    route.hub_id = dto.hub_id?.trim() || null;
    route.province = dto.province?.trim() || null;
    route.district = dto.district?.trim() || null;
    route.description = dto.description?.trim() || null;
    route.sort_order = dto.sort_order ?? route.sort_order;
    if (dto.status) route.status = dto.status.toUpperCase();

    await this.routesRepository.save(route);
    return this.findOne(id);
  }

  async updateStatus(id: string, dto: UpdateRouteStatusDto) {
    const route = await this.getEntity(id);
    route.status = dto.status.toUpperCase();
    await this.routesRepository.save(route);
    return this.findOne(id);
  }

  async remove(id: string) {
    const route = await this.getEntity(id);
    const inUse = await this.waybillsRepository.count({
      where: { route_code: route.code },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `Không thể xóa tuyến ${route.code} — đang có ${inUse} vận đơn sử dụng.`,
      );
    }
    await this.routesRepository.delete(id);
  }

  private async getEntity(id: string) {
    const route = await this.routesRepository.findOne({ where: { id } });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private async assertUniqueCode(code: string, currentId?: string) {
    const existing = await this.routesRepository.findOne({ where: { code } });
    if (existing && existing.id !== currentId) {
      throw new ConflictException('Route code already exists');
    }
  }

  private async assertHubExists(hubId?: string) {
    if (!hubId?.trim()) return;
    const hub = await this.hubsRepository.findOne({ where: { id: hubId.trim() } });
    if (!hub) throw new BadRequestException('Hub not found');
  }

  private toListItem(route: DeliveryRouteEntity) {
    return {
      id: route.id,
      code: route.code,
      name: route.name,
      hub_id: route.hub_id,
      hub: route.hub
        ? {
            id: route.hub.id,
            code: route.hub.code,
            name: route.hub.name,
          }
        : null,
      province: route.province,
      district: route.district,
      description: route.description,
      status: route.status,
      sort_order: route.sort_order,
    };
  }
}
