import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/upsert-expense-category.dto';
import { ExpenseCategoryEntity } from './expense-category.entity';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategoryEntity)
    private readonly repository: Repository<ExpenseCategoryEntity>,
  ) {}

  list(includeInactive = false) {
    const qb = this.repository.createQueryBuilder('category')
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.name', 'ASC');
    if (!includeInactive) qb.where('category.is_active = true');
    return qb.getMany();
  }

  async create(dto: CreateExpenseCategoryDto, currentUser: UserEntity) {
    const name = this.normalizeName(dto.name);
    await this.assertUniqueName(name);
    return this.repository.save(this.repository.create({
      name,
      description: dto.description?.trim() || null,
      is_active: dto.is_active ?? true,
      sort_order: dto.sort_order ?? 0,
      created_by: currentUser.id,
    }));
  }

  async update(id: string, dto: UpdateExpenseCategoryDto) {
    const category = await this.findOne(id);
    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      await this.assertUniqueName(name, id);
      category.name = name;
    }
    if (dto.description !== undefined) category.description = dto.description.trim() || null;
    if (dto.is_active !== undefined) category.is_active = dto.is_active;
    if (dto.sort_order !== undefined) category.sort_order = dto.sort_order;
    return this.repository.save(category);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    category.is_active = false;
    return this.repository.save(category);
  }

  private async findOne(id: string) {
    const category = await this.repository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Không tìm thấy loại chi phí');
    return category;
  }

  private normalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private async assertUniqueName(name: string, ignoreId?: string) {
    const qb = this.repository.createQueryBuilder('category')
      .where('LOWER(category.name) = LOWER(:name)', { name });
    if (ignoreId) qb.andWhere('category.id != :ignoreId', { ignoreId });
    if (await qb.getOne()) throw new ConflictException('Loại chi phí đã tồn tại');
  }
}
