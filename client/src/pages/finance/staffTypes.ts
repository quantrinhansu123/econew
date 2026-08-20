export interface StaffDepartment {
  id: string | number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface StaffRecord {
  id: string | number;
  employee_code: string;
  full_name: string;
  department_id?: string | number | null;
  department?: string;
  department_record?: StaffDepartment | null;
  position: string;
  phone: string;
  email?: string | null;
  identity_number?: string | null;
  address?: string | null;
  hire_date?: string | null;
  employment_status: string;
  hub_id?: string | number | null;
  hub?: { id?: string | number; code?: string; name?: string } | null;
  user_id?: string | number | null;
  user?: { id?: string | number; username?: string; full_name?: string } | null;
  base_salary?: string | number;
  meal_allowance?: string | number;
  transport_allowance?: string | number;
  other_allowance?: string | number;
  overtime_hourly_rate?: string | number;
  standard_work_days?: string | number;
  note?: string | null;
}

export interface StaffPageResponse {
  data?: StaffRecord[];
  items?: StaffRecord[];
  total?: number;
}

export interface StaffAttendanceRecord {
  id: string | number;
  staff_member_id: string | number;
  work_date: string;
  work_days: string | number;
  overtime_hours: string | number;
  note?: string | null;
}

export interface StaffAttendanceResponse {
  staff: StaffRecord[];
  records: StaffAttendanceRecord[];
}
