import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { PaymentType } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { UserEntity } from '../users/user.entity';
import { CreateWaybillDto } from '../waybills/dto/create-waybill.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrderEntity } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity) private readonly ordersRepository: Repository<OrderEntity>,
  ) {}

  async createFromWaybillEntry(dto: CreateWaybillDto, currentUser: UserEntity): Promise<OrderEntity> {
    const orderCode = await this.generateUniqueCode();
    const paymentType = dto.cc_amount && dto.cc_amount > 0 ? PaymentType.CC : PaymentType.PP;
    const order = this.ordersRepository.create({
      order_code: orderCode,
      sender_name: dto.sender_name,
      sender_phone: dto.sender_phone,
      sender_address: dto.sender_address,
      receiver_company_name: dto.receiver_company_name?.trim() || null,
      receiver_name: dto.receiver_name,
      receiver_phone: dto.receiver_phone,
      receiver_address: dto.receiver_address,
      origin_hub_id: dto.origin_hub_id,
      dest_hub_id: dto.dest_hub_id,
      package_count: dto.package_count ?? 1,
      weight: dto.weight,
      payment_type: paymentType,
      freight_amount: String(dto.freight_amount ?? 0),
      cod_amount: String(dto.cod_amount ?? 0),
      cc_amount: String(dto.cc_amount ?? 0),
      status: 'CONFIRMED',
      note: dto.note ?? null,
      created_by: currentUser.id,
    });

    try {
      return await this.ordersRepository.save(order);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Order code already exists');
      throw error;
    }
  }

  async findAll(query: QueryOrdersDto) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.ordersRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.origin_hub', 'origin_hub')
      .leftJoinAndSelect('order.dest_hub', 'dest_hub');

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(
        '(order.order_code ILIKE :keyword OR order.ma_kh ILIKE :keyword OR order.receiver_name ILIKE :keyword OR order.sender_name ILIKE :keyword)',
        { keyword },
      );
    }

    const [items, total] = await qb
      .orderBy('order.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string): Promise<OrderEntity> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['origin_hub', 'dest_hub', 'waybills'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async syncRoutingFromWaybill(
    id: string,
    route: { origin_hub_id?: string; dest_hub_id?: string },
  ): Promise<void> {
    const patch: Partial<Pick<OrderEntity, 'origin_hub_id' | 'dest_hub_id'>> = {};
    if (route.origin_hub_id !== undefined) patch.origin_hub_id = String(route.origin_hub_id);
    if (route.dest_hub_id !== undefined) patch.dest_hub_id = String(route.dest_hub_id);
    if (!Object.keys(patch).length) return;
    await this.ordersRepository.update({ id }, patch);
  }

  private async generateUniqueCode(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `DH${year}${month}${day}-`;
    let sequence = await this.ordersRepository.count({ where: { order_code: Like(`${prefix}%`) } }) + 1;

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = `${prefix}${String(sequence).padStart(3, '0')}`;
      const existing = await this.ordersRepository.findOne({ where: { order_code: code } });
      if (!existing) return code;
      sequence += 1;
    }
    throw new ConflictException('Unable to generate unique order code');
  }
}
