import type { UserAccount } from '../pages/admin/users/types';

type ApiUser = {
  id?: string | number;
  username?: string;
  email?: string;
  full_name?: string;
  name?: string;
  phone?: string;
  role_mask?: number;
  is_active?: boolean;
  status?: string | boolean | null;
  hub_ids?: Array<string | number>;
  hub?: UserAccount['hub'];
  hubs?: UserAccount['hubs'];
};

export const normalizeUserAccount = (raw: ApiUser): UserAccount => {
  const hub = raw.hub ?? null;
  return {
    id: raw.id as string | number,
    username: String(raw.username ?? raw.email ?? ''),
    name: String(raw.name ?? raw.full_name ?? ''),
    phone: String(raw.phone ?? ''),
    role_mask: Number(raw.role_mask ?? 0),
    status: raw.status !== undefined && raw.status !== null ? raw.status : raw.is_active,
    hub_ids: raw.hub_ids,
    hub,
    hubs: raw.hubs?.length ? raw.hubs : hub ? [hub] : null,
  };
};

export const normalizeUserList = (
  payload: unknown,
): { users: UserAccount[]; total: number } => {
  const body = payload as {
    items?: ApiUser[];
    data?: ApiUser[];
    users?: ApiUser[];
    total?: number;
    meta?: { total?: number };
  };
  const raw = body.items ?? body.data ?? body.users ?? [];
  const users = Array.isArray(raw) ? raw.map(normalizeUserAccount) : [];
  const total = body.meta?.total ?? body.total ?? users.length;
  return { users, total };
};

export const hasManagerRole = (roleMask: unknown = 0) => (Number(roleMask) & (32 | 64)) !== 0;
