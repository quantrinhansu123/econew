import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { StaffMemberEntity } from './staff-member.entity';

export type SafeStaffMember = Omit<StaffMemberEntity, 'password_hash'>;

@Injectable()
export class StaffMemberService extends DomainCrudService<StaffMemberEntity, CreateStaffMemberDto, UpdateStaffMemberDto, SafeStaffMember> {
  private readonly saltRounds = 10;
  constructor(
    @InjectRepository(StaffMemberEntity) private readonly staffMemberRepository: Repository<StaffMemberEntity>,
  ) {
    super(staffMemberRepository, { alias: 'staffMember', searchColumns: ["full_name","department","position","phone"], uniqueColumns: ["phone"], nullableStrings: [] });
  }

  protected override async prepareCreate(dto: CreateStaffMemberDto): Promise<Partial<StaffMemberEntity>> {
    const { password, ...rest } = dto;
    return { ...this.normalize(rest), password_hash: await bcrypt.hash(password.trim(), this.saltRounds) } as Partial<StaffMemberEntity>;
  }

  protected override async prepareUpdate(dto: UpdateStaffMemberDto, entity: StaffMemberEntity): Promise<Partial<StaffMemberEntity>> {
    const { password, ...rest } = dto;
    const payload = this.normalize(rest) as Partial<StaffMemberEntity>;
    if (password?.trim()) payload.password_hash = await bcrypt.hash(password.trim(), this.saltRounds);
    return payload;
  }

  protected override toResponse(entity: StaffMemberEntity): SafeStaffMember {
    const { password_hash: _passwordHash, ...safe } = entity;
    return safe;
  }
}
