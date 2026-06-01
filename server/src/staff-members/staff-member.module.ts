import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffMemberController } from './staff-member.controller';
import { StaffMemberEntity } from './staff-member.entity';
import { StaffMemberService } from './staff-member.service';

@Module({
  imports: [TypeOrmModule.forFeature([StaffMemberEntity])],
  controllers: [StaffMemberController],
  providers: [StaffMemberService],
  exports: [StaffMemberService],
})
export class StaffMemberModule {}
