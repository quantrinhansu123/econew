import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';

export interface DomainQueryDto {
  page?: number;
  limit?: number;
  q?: string;
}

export interface DomainCrudConfig {
  alias: string;
  searchColumns: string[];
  uniqueColumns?: string[];
  nullableStrings?: string[];
}

export interface DomainPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export abstract class DomainCrudService<Entity extends object, CreateDto extends object, UpdateDto extends object, Response = Entity> {
  protected constructor(
    protected readonly repository: Repository<Entity>,
    protected readonly config: DomainCrudConfig,
  ) {}

  async list(query: DomainQueryDto): Promise<DomainPage<Response>> {
    const page = this.toInt(query.page, 1, 1, 100000);
    const limit = this.toInt(query.limit, 20, 1, 100);
    const qb = this.repository.createQueryBuilder(this.config.alias).orderBy(`${this.config.alias}.created_at`, 'DESC').skip((page - 1) * limit).take(limit);

    if (query.q?.trim()) {
      const keyword = `%${query.q.trim()}%`;
      qb.andWhere(new Brackets((builder) => this.config.searchColumns.forEach((column, index) => {
        const condition = `${this.config.alias}.${column} ILIKE :keyword`;
        if (index === 0) builder.where(condition, { keyword });
        else builder.orWhere(condition, { keyword });
      })));
    }

    const [data, total] = await qb.getManyAndCount();
    return { data: data.map((entity) => this.toResponse(entity)), total, page, limit };
  }

  async findOne(id: string): Promise<Response> {
    return this.toResponse(await this.findEntity(id));
  }

  async create(dto: CreateDto): Promise<Response> {
    const payload = await this.prepareCreate(dto);
    await this.assertUnique(payload);
    const entity = this.repository.create(payload as any);
    return this.toResponse(await this.repository.save(entity as any));
  }

  async update(id: string, dto: UpdateDto): Promise<Response> {
    const entity = await this.findEntity(id);
    const payload = await this.prepareUpdate(dto, entity);
    await this.assertUnique(payload, id);
    Object.assign(entity, payload);
    return this.toResponse(await this.repository.save(entity as any));
  }

  async remove(id: string): Promise<void> {
    await this.findEntity(id);
    await this.repository.delete(id);
  }

  protected async prepareCreate(dto: CreateDto): Promise<Partial<Entity>> {
    return this.normalize(dto as Record<string, unknown>) as Partial<Entity>;
  }

  protected async prepareUpdate(dto: UpdateDto, _entity: Entity): Promise<Partial<Entity>> {
    return this.normalize(dto as Record<string, unknown>) as Partial<Entity>;
  }

  protected toResponse(entity: Entity): Response {
    return entity as unknown as Response;
  }

  protected normalize(dto: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    Object.entries(dto).forEach(([key, value]) => {
      if (value === undefined) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        payload[key] = this.config.nullableStrings?.includes(key) ? trimmed || null : trimmed;
        return;
      }
      payload[key] = value;
    });
    return payload;
  }

  protected async findEntity(id: string): Promise<Entity> {
    const entity = await this.repository.findOne({ where: { id } as any });
    if (!entity) throw new NotFoundException('Record not found');
    return entity;
  }

  protected async assertUnique(payload: Partial<Entity>, ignoreId?: string): Promise<void> {
    for (const column of this.config.uniqueColumns ?? []) {
      const value = (payload as any)[column];
      if (value === undefined || value === null || `${value}`.trim() === '') continue;
      const qb = this.repository.createQueryBuilder(this.config.alias).where(`${this.config.alias}.${column} = :value`, { value });
      if (ignoreId) qb.andWhere(`${this.config.alias}.id != :ignoreId`, { ignoreId });
      if (await qb.getOne()) throw new ConflictException(`${column} already exists`);
    }
  }

  protected assertReference(entity: unknown, message: string): void {
    if (!entity) throw new BadRequestException(message);
  }

  private toInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }
}
