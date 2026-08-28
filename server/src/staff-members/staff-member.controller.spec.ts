import { REQUIRED_ROLES_KEY } from '../auth/decorators/require-roles.decorator';
import { Roles } from '../common/roles';
import { StaffMemberController } from './staff-member.controller';

const requiredRoles = (method: keyof StaffMemberController) => (
  Reflect.getMetadata(REQUIRED_ROLES_KEY, StaffMemberController.prototype[method]) as number[] | undefined
);

describe('StaffMemberController role permissions', () => {
  it.each([
    'payroll',
    'listSalaryAdvances',
    'getSalaryAdvanceSummary',
    'createSalaryAdvance',
    'updateSalaryAdvance',
    'listSalaryAdvanceHistory',
    'upsertPayrollAdjustment',
  ] as Array<keyof StaffMemberController>)('restricts %s to directors', (method) => {
    expect(requiredRoles(method)).toEqual([Roles.DIRECTOR]);
  });

  it('still lets accountants update non-salary staff information', () => {
    expect(requiredRoles('update')).toEqual([Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR]);
  });
});
