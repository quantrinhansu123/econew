export const DEFAULT_PRODUCTION_HRM_URL = 'https://hrmspeego.vercel.app';
export const DEFAULT_DEV_HRM_URL = 'http://localhost:3000';

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
  return `${base}${cleanPath === '/' ? '' : cleanPath}`;
}

