export interface LoginFormState {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthUserProfile {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone: string;
  role_mask: number;
  hub_id: string | null;
  hub_ids?: string[];
  hubs?: Array<{ id: string | number; code?: string | null; name?: string | null }>;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUserProfile;
}

export type LoginFieldErrors = Partial<Record<keyof Pick<LoginFormState, 'identifier' | 'password'>, string>>;
