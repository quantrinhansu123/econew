import { connectionErrorMessage, DEV_API_ORIGIN, DEV_API_PORT, resolveApiBaseUrl } from './apiBaseUrl';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string | null;
};

type RefreshResponse = {
  access_token: string;
};

type RefreshResult = {
  token: string | null;
  sessionCleared: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const CONNECTION_ERROR = connectionErrorMessage();

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Phiên đăng nhập hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy API. Kiểm tra backend NestJS đang chạy (npm run dev trong thư mục server).',
  502: 'Không kết nối được backend. Chạy `cd server && npm run dev`, đợi dòng "API listening..." rồi thử lại.',
  503: 'Backend tạm thời không khả dụng.',
};

export const API_BASE_URL = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = 'eco_access_token';
const REFRESH_TOKEN_KEY = 'eco_refresh_token';
const USER_PROFILE_KEY = 'eco_user_profile';
const ACTIVE_HUBS_PATH = '/hubs/active';
const ACTIVE_HUBS_CACHE_TTL_MS = 5 * 60 * 1000;

let refreshPromise: Promise<RefreshResult> | null = null;
const responseCache = new Map<string, { expiresAt: number; payload: unknown }>();
const pendingCachedRequests = new Map<string, Promise<unknown>>();

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = new URL('/login', window.location.origin);
  loginUrl.searchParams.set('redirect', returnTo);
  window.location.replace(`${loginUrl.pathname}${loginUrl.search}`);
};

const dispatchAuthCleared = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eco-auth-cleared'));
  }
};

/** Storage đang giữ refresh token (ưu tiên), tránh ghi nhầm local/session. */
const getAuthStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  if (sessionStorage.getItem(REFRESH_TOKEN_KEY)) return sessionStorage;
  if (localStorage.getItem(REFRESH_TOKEN_KEY)) return localStorage;
  if (sessionStorage.getItem(ACCESS_TOKEN_KEY)) return sessionStorage;
  if (localStorage.getItem(ACCESS_TOKEN_KEY)) return localStorage;
  return null;
};

export const hasAuthSession = () => Boolean(getStoredAccessToken() || getStoredRefreshToken());

const getStoredAccessToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(ACCESS_TOKEN_KEY);
};

const getStoredRefreshToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY);
};

export const clearAuthSession = () => {
  if (typeof window === 'undefined') return;
  [localStorage, sessionStorage].forEach((storage) => {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_PROFILE_KEY);
  });
  responseCache.clear();
  pendingCachedRequests.clear();
  dispatchAuthCleared();
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
  }

  return fallback;
};

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
      const message =
        'API trả về HTML thay vì JSON — request không tới NestJS eco-webapp. ' +
        `Thường do cổng 3000 bị app khác chiếm; eco-webapp dùng cổng ${DEV_API_PORT}. ` +
        `Chạy: cd server && npm run dev, rồi restart client. Kiểm tra ${DEV_API_ORIGIN}/api/v1/health. ` +
        `URL hiện tại: ${API_BASE_URL}`;
      throw new ApiError(response.ok ? 502 : response.status, message, null);
    }
    const plain = enrichPlainTextApiError(response.status, text);
    return { message: plain ?? text.slice(0, 280) };
  }
}

function enrichPlainTextApiError(status: number, text: string): string | null {
  const trimmed = text.trim();
  if (!/^Cannot (GET|POST|PUT|PATCH|DELETE)\s/i.test(trimmed)) return null;
  if (status === 404) {
    return (
      `${trimmed} — Request không tới NestJS hoặc route chưa có. ` +
      'Kiểm tra: (1) cd server && npm run dev, log có Mapped .../vendors/active; ' +
      `(2) mở ${DEV_API_ORIGIN}/api/v1/health phải trả JSON ok:true; ` +
      `(3) client chạy npm run dev cổng 6060 (proxy /api → ${DEV_API_PORT}).`
    );
  }
  return trimmed;
}

const normalizeRequestPath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

const getCacheTtl = (requestPath: string, options: RequestOptions) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') return 0;
  return requestPath === ACTIVE_HUBS_PATH ? ACTIVE_HUBS_CACHE_TTL_MS : 0;
};

const invalidateRelatedCache = (requestPath: string, options: RequestOptions) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && requestPath.startsWith('/hubs')) {
    responseCache.delete(ACTIVE_HUBS_PATH);
    pendingCachedRequests.delete(ACTIVE_HUBS_PATH);
  }
};

async function performApiRequest<T>(requestPath: string, options: RequestOptions): Promise<T> {
  const { body, headers, token, ...requestOptions } = options;
  const buildRequest = (accessToken: string | null) => ({
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${requestPath}`, buildRequest(token ?? getStoredAccessToken()));
  } catch {
    throw new ApiError(0, CONNECTION_ERROR, null);
  }

  if (response.status === 401 && requestPath !== '/auth/login' && requestPath !== '/auth/refresh') {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.token) {
      try {
        response = await fetch(`${API_BASE_URL}${requestPath}`, buildRequest(refreshResult.token));
      } catch {
        throw new ApiError(0, 'Không kết nối được server sau khi làm mới phiên.', null);
      }
    } else if (!refreshResult.sessionCleared) {
      throw new ApiError(0, 'Không kết nối được server để làm mới phiên. Vui lòng thử lại khi mạng ổn định.', null);
    }
  }

  if (response.status === 401 && requestPath !== '/auth/login' && requestPath !== '/auth/refresh') {
    clearAuthSession();
    redirectToLogin();
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    const fallback = STATUS_MESSAGES[response.status] ?? 'Yêu cầu thất bại. Vui lòng thử lại.';
    throw new ApiError(response.status, getErrorMessage(payload, fallback), payload);
  }

  invalidateRelatedCache(requestPath, options);
  return payload as T;
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestPath = normalizeRequestPath(path);
  const cacheTtl = getCacheTtl(requestPath, options);
  if (!cacheTtl) return performApiRequest<T>(requestPath, options);

  const cached = responseCache.get(requestPath);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.payload as T);
  }
  if (cached) responseCache.delete(requestPath);

  if (!options.signal) {
    const pending = pendingCachedRequests.get(requestPath);
    if (pending) return pending as Promise<T>;
  }

  const request = performApiRequest<T>(requestPath, options).then((payload) => {
    responseCache.set(requestPath, {
      expiresAt: Date.now() + cacheTtl,
      payload,
    });
    return payload;
  });

  if (!options.signal) {
    pendingCachedRequests.set(requestPath, request);
    const clearPending = () => {
      if (pendingCachedRequests.get(requestPath) === request) {
        pendingCachedRequests.delete(requestPath);
      }
    };
    void request.then(clearPending, clearPending);
  }

  return request;
}

/** Làm mới access token (dùng khi focus tab / interval). Không xóa phiên khi server tạm ngắt. */
export async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return { token: null, sessionCleared: false };

  refreshPromise ??= fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (response) => {
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearAuthSession();
          return { token: null, sessionCleared: true };
        }
        return { token: null, sessionCleared: false };
      }

      const tokens = payload as RefreshResponse | null;
      if (!tokens?.access_token) {
        clearAuthSession();
        return { token: null, sessionCleared: true };
      }

      const storage = getAuthStorage();
      storage?.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
      return { token: tokens.access_token, sessionCleared: false };
    })
    .catch(() => {
      return { token: null, sessionCleared: false };
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
