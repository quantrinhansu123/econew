import type { TruckComplianceResponse } from '../admin/trucks/types';

export type OperationalReminder = {
  id: string | number;
  title: string;
  note?: string | null;
  remind_date: string;
  category?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | string;
  truck_id?: string | number | null;
  hub_id?: string | number | null;
  is_due?: boolean;
  truck?: {
    id?: string | number;
    license_plate?: string | null;
    loai_xe?: string | null;
  } | null;
  hub?: {
    id?: string | number;
    code?: string | null;
    name?: string | null;
  } | null;
  created_by?: {
    id?: string | number;
    username?: string | null;
    full_name?: string | null;
  } | null;
};

export type OperationalReminderResponse = {
  as_of: string;
  items: OperationalReminder[];
  meta: {
    total: number;
    due: number;
    upcoming: number;
  };
};

export type HomepageAlerts = {
  compliance: TruckComplianceResponse | null;
  reminders: OperationalReminderResponse | null;
};
