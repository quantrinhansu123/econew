import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffMemberController } from './staff-member.controller';
import { StaffMemberEntity } from './staff-member.entity';
import { StaffMemberService } from './staff-member.service';
import { StaffAttendanceEntity } from './staff-attendance.entity';
import { StaffDepartmentEntity } from './staff-department.entity';
import { CashJournalEntryEntity } from '../cash-journal-entries/cash-journal-entry.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { SalaryAdvanceEntity } from './salary-advance.entity';
import { SalaryAdvanceChangeLogEntity } from './salary-advance-change-log.entity';
import { StaffPayrollAdjustmentEntity } from './staff-payroll-adjustment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StaffMemberEntity, StaffDepartmentEntity, StaffAttendanceEntity, SalaryAdvanceEntity, SalaryAdvanceChangeLogEntity, StaffPayrollAdjustmentEntity, CashJournalEntryEntity, CashFundEntity])],
  controllers: [StaffMemberController],
  providers: [StaffMemberService],
  exports: [StaffMemberService],
})
export class StaffMemberModule {}
