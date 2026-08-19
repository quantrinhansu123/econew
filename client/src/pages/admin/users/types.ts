export const ROLE_BITS = [
  { value: 1, label: 'WAREHOUSE' },
  { value: 2, label: 'PACKER' },
  { value: 4, label: 'DRIVER' },
  { value: 8, label: 'DISPATCHER' },
  { value: 16, label: 'ACCOUNTANT' },
  { value: 32, label: 'MANAGER' },
  { value: 64, label: 'DIRECTOR' },
] as const;

export type RoleBit = typeof ROLE_BITS[number]['value'];

export interface UserAccount {
  id: string | number;
  username: string;
  name: string;
  phone: string;
  role_mask: number;
  status?: string | boolean | null;
  hub_ids?: Array<string | number>;
  hubs?: HubSummary[] | null;
  hub?: HubSummary | null;
}

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

export interface UserListResponse {
  data?: UserAccount[];
  items?: UserAccount[];
  users?: UserAccount[];
  total?: number;
  page?: number;
  limit?: number;
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number; total_pages?: number };
}

export interface HubListResponse {
  data?: HubSummary[];
  items?: HubSummary[];
  hubs?: HubSummary[];
}

export interface UserFilters {
  keyword: string;
  role_mask: string[];
  status: string[];
  hub_id: string[];
  page: number;
  limit: number;
}

export interface UserFormState {
  username: string;
  name: string;
  phone: string;
  role_mask: string;
  password: string;
  hub_ids: string[];
}

export interface UserFieldErrors {
  username?: string;
  name?: string;
  phone?: string;
  role_mask?: string;
  password?: string;
  hub_ids?: string;
}
