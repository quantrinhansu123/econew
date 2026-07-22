import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { clampPaginationLimit } from '../common/pagination';
import { CustomerEntity } from './customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type CustomerListRow = ReturnType<CustomersService['sanitize']> & { waybill_count: number };

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntity) private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  async findAll(query: QueryCustomersDto) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 50);
    const qb = this.customersRepository.createQueryBuilder('customer').where('customer.deleted_at IS NULL');

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('customer.code ILIKE :keyword', { keyword })
            .orWhere('customer.name ILIKE :keyword', { keyword })
            .orWhere('customer.short_name ILIKE :keyword', { keyword })
            .orWhere('customer.mobile ILIKE :keyword', { keyword })
            .orWhere('customer.phone_landline ILIKE :keyword', { keyword })
            .orWhere('customer.phone_han ILIKE :keyword', { keyword })
            .orWhere('customer.phone_hcm ILIKE :keyword', { keyword })
            .orWhere('customer.address ILIKE :keyword', { keyword })
            .orWhere('customer.address_han ILIKE :keyword', { keyword })
            .orWhere('customer.address_hcm ILIKE :keyword', { keyword })
            .orWhere('customer.region ILIKE :keyword', { keyword })
            .orWhere('customer.destination_province ILIKE :keyword', { keyword })
            .orWhere('customer.email ILIKE :keyword', { keyword });
        }),
      );
    }

    if (typeof query.is_suspended === 'boolean') {
      qb.andWhere('customer.is_suspended = :is_suspended', { is_suspended: query.is_suspended });
    }

    const keywordRaw = query.keyword?.trim();
    if (keywordRaw) {
      qb.addOrderBy(
        `CASE
          WHEN UPPER(TRIM(customer.code)) = UPPER(:sortExact) THEN 0
          WHEN customer.code ILIKE :sortPrefix THEN 1
          WHEN customer.name ILIKE :sortPrefix THEN 2
          ELSE 3
        END`,
        'ASC',
      )
        .setParameter('sortExact', keywordRaw)
        .setParameter('sortPrefix', `${keywordRaw}%`);
    }

    const [customers, total] = await qb
      .addOrderBy('customer.code', 'ASC')
      .addOrderBy('customer.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const waybillCounts = await this.loadWaybillCounts(customers.map((c) => c.code));
    const items: CustomerListRow[] = customers.map((customer) => ({
      ...this.sanitize(customer),
      waybill_count: waybillCounts.get(customer.code.trim().toUpperCase()) ?? 0,
    }));

    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const customer = await this.customersRepository.findOne({ where: { id, deleted_at: IsNull() } });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }
    return this.sanitize(customer);
  }

  async create(dto: CreateCustomerDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.customersRepository.findOne({ where: { code, deleted_at: IsNull() } });
    if (existing) {
      throw new ConflictException('Mã khách hàng đã tồn tại');
    }

    const customer = this.customersRepository.create({
      ...dto,
      code,
      contract_code: dto.contract_code?.trim() || code,
      customer_type: dto.customer_type?.trim() || 'KHACH_HANG',
      discount_percent: dto.discount_percent ?? 0,
      status: dto.status?.trim() || 'ACTIVE',
    });
    const saved = await this.customersRepository.save(customer);
    return this.sanitize(saved);
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.customersRepository.findOne({ where: { id, deleted_at: IsNull() } });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }

    const { code, ...rest } = dto;
    if (code !== undefined) {
      const normalized = code.trim().toUpperCase();
      const existing = await this.customersRepository.findOne({ where: { code: normalized, deleted_at: IsNull() } });
      if (existing && existing.id !== id) {
        throw new ConflictException('Mã khách hàng đã tồn tại');
      }
      customer.code = normalized;
    }

    Object.assign(customer, rest);
    const saved = await this.customersRepository.save(customer);
    return this.sanitize(saved);
  }

  async remove(id: string) {
    const customer = await this.customersRepository.findOne({ where: { id, deleted_at: IsNull() } });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }
    await this.customersRepository.softRemove(customer);
  }

  private async loadWaybillCounts(codes: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (normalized.length === 0) return map;

    try {
      const rows: Array<{ code: string; cnt: string }> = await this.customersRepository.manager.query(
        `SELECT UPPER(TRIM(code)) AS code, COUNT(*)::int AS cnt
         FROM (
           SELECT ma_kh AS code
           FROM waybills
           WHERE deleted_at IS NULL
             AND ma_kh IS NOT NULL
             AND TRIM(ma_kh) <> ''
             AND UPPER(TRIM(ma_kh)) = ANY($1)
           UNION ALL
           SELECT (regexp_match(note, 'ma_kh=([^|]+)', 'i'))[1] AS code
           FROM waybills
           WHERE deleted_at IS NULL
             AND note ILIKE '%ma_kh=%'
             AND UPPER(TRIM((regexp_match(note, 'ma_kh=([^|]+)', 'i'))[1])) = ANY($1)
         ) matched
         WHERE code IS NOT NULL AND TRIM(code) <> ''
         GROUP BY UPPER(TRIM(code))`,
        [normalized],
      );
      for (const row of rows) {
        map.set(row.code, Number(row.cnt) || 0);
      }
    } catch {
      // ma_kh column or waybills table may be missing — list still works with count 0
    }

    return map;
  }

  private sanitize(customer: CustomerEntity) {
    const { portal_password: _password, ...rest } = customer;
    return {
      ...rest,
      discount_percent: Number(rest.discount_percent ?? 0),
    };
  }
}
