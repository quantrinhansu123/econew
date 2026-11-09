export const DEFAULT_PRODUCTION_HRM_URL = '/hrm';
export const DEFAULT_DEV_HRM_URL = '/hrm';
const ECO_USER_PROFILE_KEY = 'eco_user_profile';

function encodeBase64Url(input: string): string {
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '1';
  }
}

export function buildEcoSsoToken(storage?: Pick<Storage, 'getItem'> | null): string {
  try {
    const raw =
      storage?.getItem(ECO_USER_PROFILE_KEY) ??
      (typeof window !== 'undefined'
        ? window.localStorage?.getItem(ECO_USER_PROFILE_KEY) ||
          window.sessionStorage?.getItem(ECO_USER_PROFILE_KEY)
        : null);
    if (!raw) return '1';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return '1';
    const compact = {
      id: parsed.id,
      username: parsed.username,
      email: parsed.email,
      full_name: parsed.full_name,
      phone: parsed.phone,
      role_mask: parsed.role_mask,
      hubs: parsed.hubs,
    };
    return encodeBase64Url(JSON.stringify(compact));
  } catch {
    return '1';
  }
}

export function getHrmBaseUrl(
  env: { DEV?: boolean; VITE_HRM_APP_URL?: string } = import.meta.env,
): string {
  const fromEnv = env.VITE_HRM_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return env.DEV ? DEFAULT_DEV_HRM_URL : DEFAULT_PRODUCTION_HRM_URL;
}

export function getHrmUrl(
  path = '/cham-cong-online',
  env: { DEV?: boolean; VITE_HRM_APP_URL?: string } = import.meta.env,
): string {
  const base = getHrmBaseUrl(env);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = `${base}${cleanPath === '/' ? '' : cleanPath}`;
  const ssoToken = buildEcoSsoToken();
  const separator = fullPath.includes('?') ? '&' : '?';
  return `${fullPath}${separator}eco_sso=${encodeURIComponent(ssoToken)}`;
}

export function isStandaloneAppNavigationPath(path?: string | null): boolean {
  if (!path) return false;
  return /^https?:\/\//i.test(path) || /^\/hrm(\/|$|\?)/i.test(path);
}
