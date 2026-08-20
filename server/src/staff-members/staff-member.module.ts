import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffMemberController } from './staff-member.controller';
import { StaffMemberEntity } from './staff-member.entity';
import { StaffMemberService } from './staff-member.service';
import { StaffAttendanceEntity } from './staff-attendance.entity';
import { StaffDepartmentEntity } from './staff-department.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StaffMemberEntity, StaffDepartmentEntity, StaffAttendanceEntity])],
  controllers: [StaffMemberController],
  providers: [StaffMemberService],
  exports: [StaffMemberService],
})
export class StaffMemberModule {}
