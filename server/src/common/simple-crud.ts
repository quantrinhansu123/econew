import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';

export interface SimpleQueryDto {
  page?: number;
  limit?: number;
  q?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function toPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function listRecords<T extends object>(repository: Repository<T>, alias: string, query: SimpleQueryDto, searchColumns: string[]): Promise<PaginatedResponse<T>> {
  const page = toPositiveInt(query.page, 1, 1, 100000);
  const limit = toPositiveInt(query.limit, 20, 1, 100);
  const qb = repository.createQueryBuilder(alias).orderBy(`${alias}.created_at`, 'DESC').skip((page - 1) * limit).take(limit);

  if (query.q?.trim() && searchColumns.length > 0) {
    const keyword = `%${query.q.trim()}%`;
    qb.andWhere(
      new Brackets((builder) => {
        searchColumns.forEach((column, index) => {
          const condition = `${alias}.${column} ILIKE :keyword`;
          if (index === 0) builder.where(condition, { keyword });
          else builder.orWhere(condition, { keyword });
        });
      }),
    );
  }

  const [data, total] = await qb.getManyAndCount();
  return { data, total, page, limit };
}

export async function findRecordOrThrow<T extends object>(repository: Repository<T>, id: string, message = 'Record not found'): Promise<T> {
  const entity = await repository.findOne({ where: { id } as any });
  if (!entity) throw new NotFoundException(message);
  return entity;
}

export async function assertUniqueField<T extends object>(repository: Repository<T>, alias: string, field: string, value: unknown, ignoreId?: string): Promise<void> {
  if (value === undefined || value === null || `${value}`.trim() === '') return;
  const qb = repository.createQueryBuilder(alias).where(`${alias}.${field} = :value`, { value });
  if (ignoreId) qb.andWhere(`${alias}.id != :ignoreId`, { ignoreId });
  if (await qb.getOne()) throw new ConflictException(`${field} already exists`);
}

export function assignDefined<T extends object>(entity: T, dto: Partial<T>): T {
  Object.entries(dto).forEach(([key, value]) => {
    if (value !== undefined) (entity as any)[key] = value;
  });
  return entity;
}

export function normalizeOptionalString(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

export function assertEntityId(value: string | undefined, field: string): string {
  if (!value || !`${value}`.trim()) throw new BadRequestException(`${field} is required`);
  return `${value}`.trim();
}
